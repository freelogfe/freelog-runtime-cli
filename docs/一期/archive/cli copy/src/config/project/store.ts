import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../atomicWrite.js';
import { getCliEnv } from '../../core/env.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  CURRENT_PROJECT_SCHEMA_VERSION,
  migrateManifestDocument,
  migrateStateDocument,
} from './schemaMigration.js';
import type { FreelogManifest, FreelogState, ProjectSubject, RuntimeVersion } from './types.js';
import { withProjectWriteLock, withProjectWriteLockAsync } from './writeLock.js';

/**
 * freelog.manifest.json 与 .freelog/state.json 的磁盘存储层。
 * manifest/state 必须作为一个逻辑快照读取和提交。双文件写入用 project-transaction journal
 * 前滚恢复：先持久化最终目标，再替换两份文件，最后删除日志；所有读取先在同一锁内恢复。
 */
export {
  CURRENT_PROJECT_SCHEMA_VERSION,
  migrateManifestDocument,
  migrateStateDocument,
  withProjectWriteLock,
  withProjectWriteLockAsync,
};

interface ProjectTransactionJournal {
  schemaVersion: 1;
  manifest: string;
  state: string;
}

export interface ProjectSnapshot {
  manifestPath: string;
  statePath: string;
  manifest: FreelogManifest;
  state: FreelogState;
}

/** 将可选 cwd 解析为绝对工程基准目录；不检查目录是否已经初始化。 */
export function resolveCwd(cwd?: string): string {
  return path.resolve(cwd || process.cwd());
}

/** 返回当前 cwd 下 manifest 的规范路径，不执行读取或创建。 */
export function manifestPath(cwd?: string): string {
  return path.join(resolveCwd(cwd), 'freelog.manifest.json');
}

/** 返回当前 cwd 下 state 的规范路径，不执行读取或创建。 */
export function statePath(cwd?: string): string {
  return path.join(resolveCwd(cwd), '.freelog', 'state.json');
}

function projectTransactionPath(cwd?: string): string {
  return path.join(resolveCwd(cwd), '.freelog', 'tmp', 'project-transaction.json');
}

/** 从 cwd 向父目录查找最近的 freelog.manifest.json；找不到时返回 null。 */
export function findProjectPath(cwd?: string): string | null {
  let dir = resolveCwd(cwd);
  while (true) {
    const file = path.join(dir, 'freelog.manifest.json');
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 兼容旧调用方的工程文件查找入口；当前所有 subject 共用 manifest 路径。 */
export function findProjectFilePath(_kind: ProjectSubject | 'version', cwd?: string): string | null {
  return findProjectPath(cwd);
}

/** 返回错误提示中使用的工程文件标签；不会根据 kind 生成不同物理文件。 */
export function projectKindLabel(_kind: ProjectSubject | 'version'): string {
  return 'freelog.manifest.json';
}

/**
 * 在项目 .gitignore 末端重申 state/cache/tmp/凭据规则。
 * 该函数会持项目锁并保留用户其他规则；末端规则用于压过后置 negation，避免敏感文件被重新跟踪。
 */
export function ensureProjectGitignore(cwd?: string): void {
  withProjectWriteLock(cwd, () => {
    const file = path.join(resolveCwd(cwd), '.gitignore');
    const required = [
      '/.freelog/state.json',
      '/.freelog/cache/',
      '/.freelog/tmp/',
      '/.freelog-auth',
    ];
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const managed = new Set(required.flatMap((rule) => [rule, rule.slice(1)]));
    const preserved = existing
      .split(/\r?\n/)
      .filter((line) => !managed.has(line.trim()))
      .join('\n')
      .replace(/\n+$/, '');
    const desired = `${preserved ? `${preserved}\n` : ''}${required.join('\n')}\n`;
    if (desired === existing) return;
    atomicWriteFile(file, desired);
  });
}

function readJsonFile<T>(file: string, label: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    throw cliError(I18N_KEYS.label_not_valid_json, {
      code: 4,
      params: { label, file },
      cause: error,
    });
  }
}

function writeJsonFileUnlocked(file: string, data: unknown): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw cliError(I18N_KEYS.label_format_invalid, { code: 4, params: { label } });
  }
}

function normalizeSubject(value: unknown): ProjectSubject {
  if (value === 'resource' || value === 'collection') return value;
  throw cliError(I18N_KEYS.manifest_subject_invalid, { code: 4 });
}

function normalizeManifest(raw: unknown): FreelogManifest {
  const migrated = migrateManifestDocument(raw);
  const subject = normalizeSubject(migrated.subject);
  assertPlainObject(migrated.identity, 'manifest.identity');
  assertPlainObject(migrated.resource, 'manifest.resource');
  if (migrated.version !== undefined && migrated.version !== null) {
    assertPlainObject(migrated.version, 'manifest.version');
  }
  if (migrated.collection !== undefined && migrated.collection !== null) {
    assertPlainObject(migrated.collection, 'manifest.collection');
  }
  const policies = (() => {
    if (migrated.policies === undefined) return undefined;
    if (!Array.isArray(migrated.policies)) {
      throw cliError(I18N_KEYS.label_format_invalid, {
        code: 4,
        params: { label: 'manifest.policies' },
      });
    }
    return migrated.policies.map((policy, index) => {
      const label = `manifest.policies[${index}]`;
      assertPlainObject(policy, label);
      if ('policyId' in policy) {
        throw cliError(I18N_KEYS.label_format_invalid, {
          code: 4,
          params: { label },
          hint: 'policyId 是平台事实，只能保存在 .freelog/state.json',
        });
      }
      const policyName = typeof policy.policyName === 'string' ? policy.policyName.trim() : '';
      const policyText = typeof policy.policyText === 'string' ? policy.policyText : '';
      const status = policy.status === undefined ? undefined : Number(policy.status);
      if (!policyName || !policyText.trim() || (status !== undefined && status !== 0 && status !== 1)) {
        throw cliError(I18N_KEYS.label_format_invalid, { code: 4, params: { label } });
      }
      return { policyName, policyText, ...(status === undefined ? {} : { status: status as 0 | 1 }) };
    });
  })();
  const identityName = String(migrated.identity.name || '').trim();
  const typeCode = String(migrated.resource.typeCode || '').trim();
  const typeName =
    migrated.resource.typeName === undefined
      ? undefined
      : String(migrated.resource.typeName || '').trim();
  const title = String(migrated.resource.title || identityName || '').trim();
  if (!identityName) throw cliError(I18N_KEYS.manifest_identity_name_required, { code: 4 });
  if (!typeCode) throw cliError(I18N_KEYS.manifest_type_code_required, { code: 4 });
  if (!title) throw cliError(I18N_KEYS.manifest_title_required, { code: 4 });

  return {
    ...(migrated as unknown as FreelogManifest),
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    subject,
    identity: { ...(migrated.identity as FreelogManifest['identity']), name: identityName },
    resource: {
      ...(migrated.resource as FreelogManifest['resource']),
      typeCode,
      typeName,
      title,
      intro: typeof migrated.resource.intro === 'string' ? migrated.resource.intro : '',
      tags: Array.isArray(migrated.resource.tags) ? migrated.resource.tags.map(String) : [],
      coverImages: Array.isArray(migrated.resource.coverImages)
        ? migrated.resource.coverImages.map(String)
        : [],
    },
    policies,
    version:
      migrated.version === null
        ? null
        : {
            ...((migrated.version || {}) as NonNullable<FreelogManifest['version']>),
            version: String(
              (migrated.version as { version?: unknown } | undefined)?.version || '1.0.0',
            ),
            filePath: (() => {
              const rawFilePath = (migrated.version as { filePath?: unknown } | undefined)?.filePath;
              if (rawFilePath === '') return '';
              return String(rawFilePath || 'dist');
            })(),
            videoCover:
              (migrated.version as { videoCover?: unknown } | undefined)?.videoCover === undefined
                ? undefined
                : String((migrated.version as { videoCover?: unknown }).videoCover || '').trim(),
          },
    collection:
      migrated.collection === undefined
        ? subject === 'collection'
          ? {}
          : null
        : (migrated.collection as FreelogManifest['collection']),
  };
}

function loadManifestUnlocked(cwd?: string): { path: string; data: FreelogManifest } {
  const file = manifestPath(cwd);
  if (!fs.existsSync(file)) {
    throw cliError(I18N_KEYS.manifest_not_found, {
      code: 4,
      hint: '先执行 freelog-cli init，或传 --cwd 到资源目录',
    });
  }
  return { path: file, data: normalizeManifest(readJsonFile(file, 'freelog.manifest.json')) };
}

function tryLoadManifestUnlocked(cwd?: string): { path: string; data: FreelogManifest } | null {
  const file = manifestPath(cwd);
  if (!fs.existsSync(file)) return null;
  return { path: file, data: normalizeManifest(readJsonFile(file, 'freelog.manifest.json')) };
}

/** 恢复未完成事务后读取并严格规范化 manifest；文件不存在或 schema 非法会抛 CliError。 */
export function loadManifest(cwd?: string): { path: string; data: FreelogManifest } {
  recoverProjectTransaction(cwd);
  return loadManifestUnlocked(cwd);
}

/** 与 loadManifest 相同，但明确区分“文件不存在”(null)和“文件损坏/非法”(抛错)。 */
export function tryLoadManifest(cwd?: string): { path: string; data: FreelogManifest } | null {
  recoverProjectTransaction(cwd);
  return tryLoadManifestUnlocked(cwd);
}

/** 在项目锁内规范化并原子写入 manifest；成对 manifest/state 提交请使用 saveProjectSnapshot。 */
export function saveManifest(data: FreelogManifest, cwd?: string): string {
  return withProjectWriteLock(cwd, () => {
    recoverProjectTransactionUnlocked(cwd);
    return writeJsonFileUnlocked(manifestPath(cwd), normalizeManifest(data));
  });
}

/** 创建 init 使用的纯内存 manifest 模板；不会创建目录、写文件或绑定平台资源。 */
export function createResourceManifest(opts: {
  subject?: ProjectSubject;
  resourceName: string;
  resourceTypeCode?: string;
  resourceTypeName?: string;
  resourceTitle?: string;
  version?: string;
  filePath?: string;
  runtimeVersion?: RuntimeVersion;
}): FreelogManifest {
  const subject = opts.subject || 'resource';
  return {
    schemaVersion: 1,
    subject,
    identity: { name: opts.resourceName },
    resource: {
      typeCode: opts.resourceTypeCode || '',
      typeName: opts.resourceTypeName,
      title: opts.resourceTitle || opts.resourceName,
      intro: '',
      coverImages: [],
      tags: [],
    },
    version:
      subject === 'resource'
        ? {
            version: opts.version || '1.0.0',
            filePath: opts.filePath || 'dist',
            description: '',
            runtimeVersion: opts.runtimeVersion ?? null,
            dependencies: [],
            baseUpcastResources: [],
            authExcludedItems: [],
            inputAttrs: [],
            customPropertyDescriptors: [],
          }
        : null,
    policies: [],
    collection:
      subject === 'collection'
        ? {
            version: opts.version || '1.0.0',
            description: '',
            display: {},
            items: [],
            dependencies: [],
            baseUpcastResources: [],
            authExcludedItems: [],
            inputAttrs: [],
            customPropertyDescriptors: [],
          }
        : null,
  };
}

/** 创建指定 subject 的空平台事实 state；state 丢失后的恢复仍需显式 bind，不能凭空推断 resourceId。 */
export function createEmptyState(subject: ProjectSubject = 'resource'): FreelogState {
  return {
    schemaVersion: 1,
    env: null,
    resource: {
      resourceId: null,
      resourceName: null,
      resourceType: null,
      resourceTypeCode: null,
      resourceTypeName: null,
      subjectType: subject === 'collection' ? 4 : null,
      owner: null,
      status: null,
      latestVersion: null,
      policies: [],
    },
    version: {
      lastPublishedVersion: null,
      lastPublishedVersionId: null,
      fileSha1: null,
      filename: null,
      draftSync: null,
    },
    collection: {
      catalogueDraft: [],
      catalogueProperty: null,
      collectRules: null,
      rss: null,
      draftSync: null,
    },
    sync: {
      lastPulledAt: null,
      listingFingerprint: null,
      platformUpdateDate: null,
    },
  };
}

function normalizeState(raw: unknown, subject: ProjectSubject): FreelogState {
  const migrated = migrateStateDocument(raw);
  for (const section of ['resource', 'version', 'collection', 'sync'] as const) {
    if (migrated[section] === undefined) continue;
    assertPlainObject(migrated[section], `state.${section}`);
  }
  const state = migrated as unknown as Partial<FreelogState>;
  if (state.env && state.env !== getCliEnv()) {
    throw cliError(I18N_KEYS.project_state_env_mismatch, {
      code: 2,
      details: { stateEnv: state.env, currentEnv: getCliEnv() },
      hint: `当前命令使用 ${getCliEnv()}，该目录 state 属于 ${state.env}；请切换 --env 或重新初始化/清理 .freelog/state.json`,
    });
  }
  const empty = createEmptyState(subject);
  return {
    ...empty,
    ...state,
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION,
    resource: { ...empty.resource, ...(state.resource || {}) },
    version: { ...empty.version, ...(state.version || {}) },
    collection: { ...empty.collection, ...(state.collection || {}) },
    sync: { ...empty.sync, ...(state.sync || {}) },
  };
}

function parseProjectTransaction(file: string): ProjectTransactionJournal {
  const raw = readJsonFile<unknown>(file, '.freelog/tmp/project-transaction.json');
  assertPlainObject(raw, '.freelog/tmp/project-transaction.json');
  if (raw.schemaVersion !== 1 || typeof raw.manifest !== 'string' || typeof raw.state !== 'string') {
    throw cliError(I18N_KEYS.label_format_invalid, {
      code: 4,
      params: { label: '.freelog/tmp/project-transaction.json' },
      hint: '事务日志不完整，请保留文件并人工检查后再处理',
    });
  }
  return raw as unknown as ProjectTransactionJournal;
}

function parseJournalDocument(content: string, label: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw cliError(I18N_KEYS.label_not_valid_json, {
      code: 4,
      params: { label, file: '.freelog/tmp/project-transaction.json' },
      cause: error,
    });
  }
}

/**
 * 仅能在项目写锁内调用。journal 保存的是 manifest/state 的最终目标快照，而不是操作日志；
 * 因而恢复只能前滚到完整的新快照，绝不能尝试猜测或回滚到可能不存在的旧组合。
 */
function recoverProjectTransactionUnlocked(cwd?: string): void {
  const journalPath = projectTransactionPath(cwd);
  if (!fs.existsSync(journalPath)) return;
  const journal = parseProjectTransaction(journalPath);
  const manifest = normalizeManifest(parseJournalDocument(journal.manifest, '事务日志 manifest'));
  const state = normalizeState(
    parseJournalDocument(journal.state, '事务日志 state'),
    manifest.subject,
  );
  atomicWriteFile(manifestPath(cwd), `${JSON.stringify(manifest, null, 2)}\n`);
  atomicWriteFile(statePath(cwd), `${JSON.stringify(state, null, 2)}\n`);
  fs.unlinkSync(journalPath);
}

/** 读取任一文件前，先把中断的 manifest/state 事务前滚到同一目标快照。 */
export function recoverProjectTransaction(cwd?: string): void {
  withProjectWriteLock(cwd, () => recoverProjectTransactionUnlocked(cwd));
}

/** 在排除并发写入的同一锁内读取 manifest/state 成对快照。 */
export function loadProjectSnapshot(cwd?: string): ProjectSnapshot {
  return withProjectWriteLock(cwd, () => {
    recoverProjectTransactionUnlocked(cwd);
    const loaded = loadManifestUnlocked(cwd);
    const stateFile = statePath(cwd);
    const state = fs.existsSync(stateFile)
      ? normalizeState(readJsonFile(stateFile, '.freelog/state.json'), loaded.data.subject)
      : createEmptyState(loaded.data.subject);
    return {
      manifestPath: loaded.path,
      statePath: stateFile,
      manifest: loaded.data,
      state,
    };
  });
}

/** 与 loadProjectSnapshot 相同，但 manifest 不存在时返回 null。 */
export function tryLoadProjectSnapshot(cwd?: string): ProjectSnapshot | null {
  return withProjectWriteLock(cwd, () => {
    recoverProjectTransactionUnlocked(cwd);
    const loaded = tryLoadManifestUnlocked(cwd);
    if (!loaded) return null;
    const stateFile = statePath(cwd);
    const state = fs.existsSync(stateFile)
      ? normalizeState(readJsonFile(stateFile, '.freelog/state.json'), loaded.data.subject)
      : createEmptyState(loaded.data.subject);
    return {
      manifestPath: loaded.path,
      statePath: stateFile,
      manifest: loaded.data,
      state,
    };
  });
}

/**
 * 将 manifest/state 提交为可恢复的一对。顺序必须是“journal → manifest → state → 删除 journal”：
 * journal 中保存两个最终文件的完整内容；两次原子替换都成功前它始终保留。若进程中断，下一次
 * 读取按 journal 的最终目标前滚，而不是猜测回滚点。
 */
export function saveProjectSnapshot(
  manifest: FreelogManifest,
  state: FreelogState,
  cwd?: string,
): string {
  return withProjectWriteLock(cwd, () => {
    recoverProjectTransactionUnlocked(cwd);
    const normalizedManifest = normalizeManifest(manifest);
    state.env = state.env || getCliEnv();
    const normalizedState = normalizeState(state, normalizedManifest.subject);
    const manifestContent = `${JSON.stringify(normalizedManifest, null, 2)}\n`;
    const stateContent = `${JSON.stringify(normalizedState, null, 2)}\n`;
    const journal: ProjectTransactionJournal = {
      schemaVersion: 1,
      manifest: manifestContent,
      state: stateContent,
    };
    const journalPath = projectTransactionPath(cwd);
    atomicWriteFile(journalPath, `${JSON.stringify(journal)}\n`);
    atomicWriteFile(manifestPath(cwd), manifestContent);
    atomicWriteFile(statePath(cwd), stateContent);
    fs.unlinkSync(journalPath);
    return manifestPath(cwd);
  });
}

/** 恢复事务后读取 state；缺文件时返回对应 subject 的空 state，损坏文件仍抛错。 */
export function loadState(cwd?: string, subject?: ProjectSubject): { path: string; data: FreelogState } {
  recoverProjectTransaction(cwd);
  const manifest = subject ? null : tryLoadManifest(cwd);
  const actualSubject = subject || manifest?.data.subject || 'resource';
  const file = statePath(cwd);
  if (!fs.existsSync(file)) return { path: file, data: createEmptyState(actualSubject) };
  return { path: file, data: normalizeState(readJsonFile(file, '.freelog/state.json'), actualSubject) };
}

/** 在项目锁内规范化并原子写入 state；不会修改 manifest。 */
export function saveState(data: FreelogState, cwd?: string): string {
  return withProjectWriteLock(cwd, () => {
    recoverProjectTransactionUnlocked(cwd);
    data.env = data.env || getCliEnv();
    const normalized = normalizeState(data, data.resource.subjectType === 4 ? 'collection' : 'resource');
    return writeJsonFileUnlocked(statePath(cwd), normalized);
  });
}

/** 仅修改 state 的 read-modify-write；整个 mutation 始终持有项目锁。 */
export function updateState(
  cwd: string | undefined,
  subject: ProjectSubject,
  mutate: (state: FreelogState) => void,
): string {
  return withProjectWriteLock(cwd, () => {
    const state = loadState(cwd, subject).data;
    mutate(state);
    return saveState(state, cwd);
  });
}
