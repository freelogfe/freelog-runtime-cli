import fs from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from '../atomicWrite.js';
import { getCliEnv } from '../../core/env.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { FreelogManifest, FreelogState, ProjectSubject, RuntimeVersion } from './types.js';

export function resolveCwd(cwd?: string): string {
  return path.resolve(cwd || process.cwd());
}

export function manifestPath(cwd?: string): string {
  return path.join(resolveCwd(cwd), 'freelog.manifest.json');
}

export function statePath(cwd?: string): string {
  return path.join(resolveCwd(cwd), '.freelog', 'state.json');
}

export function findProjectPath(cwd?: string): string | null {
  const file = manifestPath(cwd);
  return fs.existsSync(file) ? file : null;
}

export function findProjectFilePath(_kind: ProjectSubject | 'version', cwd?: string): string | null {
  return findProjectPath(cwd);
}

export function projectKindLabel(_kind: ProjectSubject | 'version'): string {
  return 'freelog.manifest.json';
}

export function ensureProjectGitignore(cwd?: string): void {
  const file = path.join(resolveCwd(cwd), '.gitignore');
  const required = ['.freelog/state.json', '.freelog/cache/', '.freelog/tmp/'];
  const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = existing.split(/\r?\n/);
  const missing = required.filter((line) => !lines.includes(line));
  if (!missing.length) return;
  const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
  atomicWriteFile(file, `${existing}${prefix}${missing.join('\n')}\n`);
}

function readJsonFile<T>(file: string, _label: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    throw cliError(I18N_KEYS.label_not_valid_json, { code: 4, cause: error });
  }
}

function writeJsonFile(file: string, data: unknown): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function assertPlainObject(value: unknown, _label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw cliError(I18N_KEYS.label_format_invalid, { code: 4 });
  }
}

function normalizeSubject(value: unknown): ProjectSubject {
  if (value === 'resource' || value === 'collection') return value;
  throw cliError(I18N_KEYS.manifest_subject_invalid, { code: 4 });
}

function normalizeManifest(raw: unknown): FreelogManifest {
  assertPlainObject(raw, 'freelog.manifest.json');
  const subject = normalizeSubject(raw.subject);
  assertPlainObject(raw.identity, 'manifest.identity');
  assertPlainObject(raw.resource, 'manifest.resource');
  const identityName = String(raw.identity.name || '').trim();
  const typeCode = String(raw.resource.typeCode || '').trim();
  const typeName =
    raw.resource.typeName === undefined ? undefined : String(raw.resource.typeName || '').trim();
  const title = String(raw.resource.title || identityName || '').trim();
  if (!identityName) throw cliError(I18N_KEYS.manifest_identity_name_required, { code: 4 });
  if (!typeCode) throw cliError(I18N_KEYS.manifest_type_code_required, { code: 4 });
  if (!title) throw cliError(I18N_KEYS.manifest_title_required, { code: 4 });

  return {
    ...(raw as unknown as FreelogManifest),
    schemaVersion: 1,
    subject,
    identity: { ...(raw.identity as FreelogManifest['identity']), name: identityName },
    resource: {
      ...(raw.resource as FreelogManifest['resource']),
      typeCode,
      typeName,
      title,
      intro: typeof raw.resource.intro === 'string' ? raw.resource.intro : '',
      tags: Array.isArray(raw.resource.tags) ? raw.resource.tags.map(String) : [],
      coverImages: Array.isArray(raw.resource.coverImages)
        ? raw.resource.coverImages.map(String)
        : [],
    },
    version:
      raw.version === null
        ? null
        : {
            ...((raw.version || {}) as NonNullable<FreelogManifest['version']>),
            version: String((raw.version as { version?: unknown } | undefined)?.version || '1.0.0'),
            filePath: (() => {
              const rawFilePath = (raw.version as { filePath?: unknown } | undefined)?.filePath;
              if (rawFilePath === '') return '';
              return String(rawFilePath || 'dist');
            })(),
            videoCover:
              (raw.version as { videoCover?: unknown } | undefined)?.videoCover === undefined
                ? undefined
                : String((raw.version as { videoCover?: unknown }).videoCover || '').trim(),
          },
    collection:
      raw.collection === undefined
        ? subject === 'collection'
          ? {}
          : null
        : (raw.collection as FreelogManifest['collection']),
  };
}

export function loadManifest(cwd?: string): { path: string; data: FreelogManifest } {
  const file = manifestPath(cwd);
  if (!fs.existsSync(file)) {
    throw cliError(I18N_KEYS.manifest_not_found, {
      code: 4,
      hint: '先执行 freelog-cli init，或传 --cwd 到资源目录',
    });
  }
  return { path: file, data: normalizeManifest(readJsonFile(file, 'freelog.manifest.json')) };
}

export function tryLoadManifest(cwd?: string): { path: string; data: FreelogManifest } | null {
  const file = manifestPath(cwd);
  if (!fs.existsSync(file)) return null;
  return { path: file, data: normalizeManifest(readJsonFile(file, 'freelog.manifest.json')) };
}

export function saveManifest(data: FreelogManifest, cwd?: string): string {
  return writeJsonFile(manifestPath(cwd), normalizeManifest(data));
}

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
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createEmptyState(subject);
  const state = raw as Partial<FreelogState>;
  if (state.env && state.env !== getCliEnv()) {
    throw cliError(I18N_KEYS.project_state_env_mismatch, {
      code: 2,
      details: { stateEnv: state.env, currentEnv: getCliEnv() },
      hint: `当前命令使用 ${getCliEnv()}，该目录 state 属于 ${state.env}；请切换 --env 或重新初始化/清理 .freelog/state.json`,
    });
  }
  return {
    ...createEmptyState(subject),
    ...state,
    schemaVersion: 1,
    resource: { ...createEmptyState(subject).resource, ...(state.resource || {}) },
    version: { ...createEmptyState(subject).version, ...(state.version || {}) },
    collection: { ...createEmptyState(subject).collection, ...(state.collection || {}) },
    sync: { ...createEmptyState(subject).sync, ...(state.sync || {}) },
  };
}

export function loadState(cwd?: string, subject?: ProjectSubject): { path: string; data: FreelogState } {
  const manifest = subject ? null : tryLoadManifest(cwd);
  const actualSubject = subject || manifest?.data.subject || 'resource';
  const file = statePath(cwd);
  if (!fs.existsSync(file)) return { path: file, data: createEmptyState(actualSubject) };
  return { path: file, data: normalizeState(readJsonFile(file, '.freelog/state.json'), actualSubject) };
}

export function saveState(data: FreelogState, cwd?: string): string {
  const normalized = normalizeState(data, data.resource.subjectType === 4 ? 'collection' : 'resource');
  normalized.env = normalized.env || getCliEnv();
  return writeJsonFile(statePath(cwd), normalized);
}
