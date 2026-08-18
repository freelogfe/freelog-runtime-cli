import fs from 'node:fs';
import path from 'node:path';
import type {
  AuthExcludedItem,
  BaseUpcastResource,
  BatchSignContract,
  CustomPropertyDescriptor,
  VersionDependency,
} from '../../config/project.js';
import { ensureProjectGitignore, writeResourceProject, writeVersionProject, tryLoadResourceProject, tryLoadVersionProject } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, getSHA1Hash, unwrapData } from '../../platform/index.js';
import { uploadFileIfNeeded } from '../storageUpload.js';
import {
  inheritDataFromVersionConfig,
  resolveCreateVersionPropertiesFromFile,
} from '../fileProperty/index.js';
import { assertLeafResourceTypeCode } from '../typeService.js';
import { assertLocalFileAllowedByType, isAutoGenerateCoverEnabled } from '../resourceTypeCapabilities.js';
import { resolveCoverImageUrl } from '../coverUpload.js';
import { generateCoverUrlFromSha1 } from '../coverGenerateService.js';
import { assertSha1PublishAllowed } from '../shared/guards/index.js';
import { resolveCreateApiResourceTypeName } from '../resourceName.js';
import {
  buildCreateVersionParams,
  diffReleasedVersionIntent,
} from '../resource/createVersionParams.js';
import { loadFreelogIgnorePatterns, filterIgnoredFiles } from '../freelogIgnore.js';
import { loadPoliciesFromFile, readBatchConfig, resolveConfigPath } from './config.js';
import type { FromDirCreatedItem, PreparedFile } from './types.js';

const CONFIG_RE = /^freelog\..*\.config/i;

function sanitizeBasename(name: string): string {
  const base = path.parse(name).name || 'file';
  const cleaned = base
    .replace(/[\\/:*?"<>|\s@$#]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || 'file';
}

/** Console creatorBatch：文件名推导 name 先截 50 字，再 generateResourceNames；显式 name 仍受 60 字 HARD 限制。 */
export function resolveInitialBatchResourceName(explicitName: string | undefined, safeDir: string): string {
  const trimmed = explicitName?.trim();
  if (trimmed) return trimmed.slice(0, 60);
  return safeDir.slice(0, 50);
}

function listFlatFiles(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw cliError(I18N_KEYS.directory_not_found, { code: 4 });
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (CONFIG_RE.test(ent.name)) continue;
    files.push(path.join(dir, ent.name));
  }
  files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  const patterns = loadFreelogIgnorePatterns(dir);
  const filtered = filterIgnoredFiles(files, patterns);
  if (filtered.length === 0) {
    throw cliError(I18N_KEYS.no_flat_files_in_dir, {
      code: 4,
      hint: patterns.length ? '检查 .freelogignore 是否排除了全部文件' : undefined,
    });
  }
  return filtered;
}

export function resolveUniqueSubdir(parent: string, safeName: string): string {
  let candidate = path.join(parent, safeName);
  if (!fs.existsSync(candidate)) return candidate;
  let i = 2;
  while (fs.existsSync(path.join(parent, `${safeName}_${i}`))) i += 1;
  return path.join(parent, `${safeName}_${i}`);
}

/** 同目录重跑 import-dir：已存在相同 SHA1 的子目录则复用，避免重复 create */
export function resolveExistingImportBySha1(
  parent: string,
  item: PreparedFile,
): FromDirCreatedItem | null {
  if (!fs.existsSync(parent)) return null;
  for (const name of fs.readdirSync(parent)) {
    const subdir = path.join(parent, name);
    try {
      if (!fs.statSync(subdir).isDirectory()) continue;
      const resource = tryLoadResourceProject(subdir);
      const version = tryLoadVersionProject(subdir);
      if (!resource?.data.resourceId || !version?.data.fileSha1) continue;
      if (version.data.fileSha1 !== item.sha1) continue;
      return {
        subdir: path.relative(parent, subdir) || name,
        resourceId: resource.data.resourceId,
        resourceName: resource.data.resourceName || item.name,
        resourceTitle: resource.data.resourceTitle || item.resourceTitle,
        itemTitle: item.itemTitle,
        authExcludedItems: version.data.authExcludedItems,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export function writeItemConfigs(opts: {
  subdir: string;
  sourceFile: string;
  resourceId: string;
  resourceName: string;
  resourceTypeCode: string;
  resourceTypeName?: string;
  resourceTitle: string;
  fileSha1: string;
  filename: string;
  version: string;
  description: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  versionId?: string;
  userId?: number | string;
  username?: string;
}) {
  fs.mkdirSync(opts.subdir, { recursive: true });
  const destName = path.basename(opts.sourceFile);
  const destFile = path.join(opts.subdir, destName);
  if (path.resolve(opts.sourceFile) !== path.resolve(destFile)) {
    fs.copyFileSync(opts.sourceFile, destFile);
  }

  writeResourceProject(
    {
      resourceId: opts.resourceId,
      resourceName: opts.resourceName,
      resourceType: [],
      resourceTypeCode: opts.resourceTypeCode,
      resourceTypeName: opts.resourceTypeName,
      resourceTitle: opts.resourceTitle,
      intro: opts.intro,
      coverImages: opts.coverImages,
      tags: opts.tags,
      userId: opts.userId,
      username: opts.username,
    },
    opts.subdir,
  );
  writeVersionProject(
    {
      resourceId: opts.resourceId,
      resourceName: opts.resourceName,
      resourceTypeCode: opts.resourceTypeCode,
      version: opts.version,
      filePath: destName,
      fileSha1: opts.fileSha1,
      filename: opts.filename,
      description: opts.description,
      versionId: opts.versionId,
      published: true,
      userId: opts.userId,
      username: opts.username,
      dependencies: opts.dependencies,
      baseUpcastResources: opts.baseUpcastResources,
      authExcludedItems: opts.authExcludedItems,
      inputAttrs: opts.inputAttrs,
      customPropertyDescriptors: opts.customPropertyDescriptors,
    },
    opts.subdir,
  );
  ensureProjectGitignore(opts.subdir);
}

export function normalizeBatchSignContracts(
  entries: BatchSignContract[] | undefined,
): Array<{ resourceId: string; policyIds: string[]; subjectType?: string }> | undefined {
  if (!entries?.length) return undefined;
  return entries.map((entry) => ({
    resourceId: entry.resourceId,
    policyIds: entry.policyIds,
    ...(entry.subjectType ? { subjectType: entry.subjectType } : {}),
  }));
}

export async function prepareFiles(opts: {
  dir: string;
  typeCode?: string;
  resourceTypeName?: string;
  titlePrefix?: string;
  username: string;
  cwd?: string;
  configFile?: string;
}): Promise<PreparedFile[]> {
  const configPath = resolveConfigPath(opts.cwd, opts.dir, opts.configFile);
  const config = configPath ? readBatchConfig(configPath) : null;
  const configBaseDir = configPath ? path.dirname(configPath) : opts.dir;
  const defaults = config?.defaults || {};
  const defaultPolicies =
    defaults.policies || loadPoliciesFromFile(configBaseDir, defaults.policyFile);
  const rows = config
    ? config.items.map((item) => ({
        absolutePath: path.resolve(configBaseDir, item.filePath),
        item,
      }))
    : listFlatFiles(opts.dir).map((absolutePath) => ({ absolutePath, item: null }));
  const prepared: PreparedFile[] = [];

  for (const { absolutePath, item } of rows) {
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      throw cliError(I18N_KEYS.batch_file_not_found, { code: 4 });
    }
    const filename = path.basename(absolutePath);
    const sha1 = await getSHA1Hash(absolutePath);
    await assertSha1PublishAllowed(sha1);
    await uploadFileIfNeeded(absolutePath, sha1);
    const safeDir = sanitizeBasename(filename);
    const resourceTypeCode = item?.resourceTypeCode || defaults.resourceTypeCode || opts.typeCode;
    if (!resourceTypeCode?.trim()) {
      throw cliError(I18N_KEYS.batch_missing_resource_type, {
        code: 4,
        hint: '传 --resource-type，或在 freelog.batch.json 的 defaults.resourceTypeCode / item.resourceTypeCode 中声明',
      });
    }
    const typeInfo = await assertLeafResourceTypeCode(resourceTypeCode);
    const name = resolveInitialBatchResourceName(item?.name, safeDir);
    const resourceTitle = (
      item?.resourceTitle ||
      `${opts.titlePrefix || ''}${path.parse(filename).name}`
    ).slice(0, 100);
    assertLocalFileAllowedByType({
      typeInfo,
      filePath: absolutePath,
      filename,
    });
    const coverImagesInput = item?.coverImages ?? defaults.coverImages;
    let coverImages = coverImagesInput
      ? await Promise.all(coverImagesInput.map((cover) => resolveCoverImageUrl(cover, configBaseDir)))
      : undefined;
    if (!coverImages?.length && isAutoGenerateCoverEnabled(typeInfo)) {
      const generatedCover = await generateCoverUrlFromSha1(sha1);
      if (generatedCover) coverImages = [generatedCover];
    }
    const policies =
      item?.policies ||
      loadPoliciesFromFile(configBaseDir, item?.policyFile) ||
      defaultPolicies;
    const manifestAttrs = {
      inputAttrs: item?.inputAttrs ?? defaults.inputAttrs ?? [],
      customPropertyDescriptors:
        item?.customPropertyDescriptors ?? defaults.customPropertyDescriptors ?? [],
    };
    const resolvedProperties = await resolveCreateVersionPropertiesFromFile({
      sha1,
      resourceTypeCode,
      inheritData: inheritDataFromVersionConfig(manifestAttrs),
    });
    prepared.push({
      absolutePath,
      filename,
      sha1,
      name,
      resourceTitle,
      resourceTypeCode,
      resourceTypeName: item?.resourceTypeName || defaults.resourceTypeName || opts.resourceTypeName,
      safeDir,
      version: item?.version || defaults.version || '1.0.0',
      description: item?.description ?? defaults.description ?? '',
      intro: item?.intro ?? defaults.intro,
      coverImages,
      tags: item?.tags ?? defaults.tags,
      policies,
      dependencies: item?.dependencies ?? defaults.dependencies ?? [],
      baseUpcastResources: item?.baseUpcastResources ?? defaults.baseUpcastResources ?? [],
      authExcludedItems: item?.authExcludedItems ?? defaults.authExcludedItems ?? [],
      batchSignContracts: item?.batchSignContracts ?? defaults.batchSignContracts ?? [],
      inputAttrs: resolvedProperties.inputAttrs,
      customPropertyDescriptors: resolvedProperties.customPropertyDescriptors,
      itemTitle: item?.itemTitle,
    });
  }
  return prepared;
}

function getRecordValue<T = unknown>(value: unknown, key: string): T | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return (value as Record<string, T>)[key];
}

function normalizeGeneratedResourceNames(data: unknown, expectedCount: number): string[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(getRecordValue<unknown[]>(data, 'dataList'))
      ? getRecordValue<unknown[]>(data, 'dataList')!
      : null;
  if (!rows || rows.length !== expectedCount) {
    throw cliError(I18N_KEYS.generate_names_response_invalid, { code: 1, details: data });
  }
  return rows.map((row) => {
    const next =
      getRecordValue<string>(row, 'newResourceName') ||
      getRecordValue<string>(row, 'resourceName') ||
      getRecordValue<string>(row, 'name');
    if (!next) {
      throw cliError(I18N_KEYS.generate_names_missing_name, {
        code: 1,
        details: row,
      });
    }
    return next;
  });
}

export async function applyGeneratedResourceNames(prepared: PreparedFile[]): Promise<PreparedFile[]> {
  const envelope = await FServiceAPI.Resource.generateResourceNames({
    resourceNames: prepared.map((p) => p.name),
  });
  const names = normalizeGeneratedResourceNames(unwrapData(envelope), prepared.length);
  return prepared.map((item, index) => ({
    ...item,
    name: names[index] || item.name,
  }));
}

export async function createOneResource(
  item: PreparedFile,
  onResourceCreated?: (created: { resourceId: string; resourceName: string }) => void,
): Promise<{ resourceId: string; resourceName: string; versionId?: string }> {
  const createEnv = await FServiceAPI.Resource.create({
    name: item.name,
    resourceTypeCode: item.resourceTypeCode,
    resourceTypeName: resolveCreateApiResourceTypeName(item.resourceTypeCode, {
      manifest: item.resourceTypeName,
    }),
    resourceTitle: item.resourceTitle,
    intro: item.intro,
    coverImages: item.coverImages,
    tags: item.tags,
    policies: item.policies,
  } as Parameters<typeof FServiceAPI.Resource.create>[0]);
  const created = unwrapData<{ resourceId?: string; resourceName?: string }>(createEnv);
  if (!created?.resourceId) {
    throw cliError(I18N_KEYS.batch_create_failed, { code: 1, details: created });
  }
  onResourceCreated?.({
    resourceId: created.resourceId,
    resourceName: created.resourceName || item.name,
  });
  const versionEnv = await FServiceAPI.Resource.createVersion(
    buildCreateVersionParams({
      resourceId: created.resourceId,
      versionCfg: {
        version: item.version,
        filePath: item.absolutePath,
        description: item.description,
        dependencies: item.dependencies,
        baseUpcastResources: item.baseUpcastResources,
        authExcludedItems: item.authExcludedItems,
        batchSignContracts: item.batchSignContracts,
        inputAttrs: item.inputAttrs,
        customPropertyDescriptors: item.customPropertyDescriptors,
      },
      fileSha1: item.sha1,
      filename: item.filename,
    }),
  );
  const versionData = unwrapData<{ versionId?: string }>(versionEnv);
  return {
    resourceId: created.resourceId,
    resourceName: created.resourceName || item.name,
    versionId: versionData?.versionId,
  };
}

function isDuplicateVersionError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /版本.*已存在|version.*exist/i.test(msg);
}

async function findExistingVersionAfterCreateBatch(
  item: PreparedFile,
  resourceId: string,
): Promise<{ versionId?: string } | null> {
  const listEnv = await FServiceAPI.Resource.getVersionListByResourceID({
    resourceId,
  } as Parameters<typeof FServiceAPI.Resource.getVersionListByResourceID>[0]);
  const list = unwrapData<Array<{ version?: string; versionId?: string }> | { dataList?: Array<{ version?: string; versionId?: string }> }>(
    listEnv,
  );
  const rows = Array.isArray(list)
    ? list
    : Array.isArray((list as { dataList?: unknown[] })?.dataList)
      ? (list as { dataList: Array<{ version?: string; versionId?: string }> }).dataList
      : [];
  const existing = rows.find((row) => row.version === item.version);
  if (!existing) return null;

  const versionEnv = await FServiceAPI.Resource.resourceVersionInfo1({
    resourceId,
    version: item.version,
  } as Parameters<typeof FServiceAPI.Resource.resourceVersionInfo1>[0]);
  const remote = unwrapData<Record<string, unknown>>(versionEnv);
  if (!remote || typeof remote !== 'object') {
    throw cliError('平台返回的既有版本详情为空，无法安全恢复批量发布', {
      code: 1,
      details: { error: 'BATCH_VERSION_DETAIL_UNAVAILABLE', resourceId, version: item.version },
      hint: '稍后重试；在详情可读前 CLI 不会按版本号直接恢复',
    });
  }
  const expected = buildCreateVersionParams({
    resourceId,
    versionCfg: {
      version: item.version,
      filePath: item.absolutePath,
      description: item.description,
      dependencies: item.dependencies,
      baseUpcastResources: item.baseUpcastResources,
      authExcludedItems: item.authExcludedItems,
      batchSignContracts: item.batchSignContracts,
      inputAttrs: item.inputAttrs,
      customPropertyDescriptors: item.customPropertyDescriptors,
    },
    fileSha1: item.sha1,
    filename: item.filename,
  });
  const conflicts = diffReleasedVersionIntent(remote, expected);
  if (conflicts.length) {
    throw cliError('批量恢复发现同版本的不可变发布意图不一致，已停止自动重试', {
      code: 3,
      details: {
        error: 'BATCH_VERSION_INTENT_CONFLICT',
        resourceId,
        version: item.version,
        conflictingFields: conflicts,
      },
      hint: '请在 Console 核对该版本，修正批量配置或使用新的版本号；CLI 不会覆盖已发布版本',
    });
  }
  return {
    versionId:
      (remote.versionId as string | undefined) || existing.versionId,
  };
}

export async function inspectVersionAfterCreateBatch(
  item: PreparedFile,
  resourceId: string,
): Promise<{ versionId?: string } | null> {
  return findExistingVersionAfterCreateBatch(item, resourceId);
}

export async function ensureVersionAfterCreateBatch(
  item: PreparedFile,
  resourceId: string,
): Promise<{ versionId?: string }> {
  const existing = await findExistingVersionAfterCreateBatch(item, resourceId);
  if (existing) return existing;

  try {
    const versionEnv = await FServiceAPI.Resource.createVersion(
      buildCreateVersionParams({
        resourceId,
        versionCfg: {
          version: item.version,
          filePath: item.absolutePath,
          description: item.description,
          dependencies: item.dependencies,
          baseUpcastResources: item.baseUpcastResources,
          authExcludedItems: item.authExcludedItems,
          batchSignContracts: item.batchSignContracts,
          inputAttrs: item.inputAttrs,
          customPropertyDescriptors: item.customPropertyDescriptors,
        },
        fileSha1: item.sha1,
        filename: item.filename,
      }),
    );
    const versionData = unwrapData<{ versionId?: string }>(versionEnv);
    return { versionId: versionData?.versionId };
  } catch (error) {
    if (isDuplicateVersionError(error)) return {};
    throw error;
  }
}
