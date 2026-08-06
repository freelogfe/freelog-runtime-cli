import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import { ensureProjectGitignore, writeResourceProject, writeVersionProject } from '../config/project.js';
import type {
  AuthExcludedItem,
  BaseUpcastResource,
  BatchSignContract,
  CustomPropertyDescriptor,
  ManifestPolicy,
  VersionDependency,
} from '../config/project.js';
import { FServiceAPI, getSHA1Hash, unwrapData } from '../platform/index.js';
import { uploadFileIfNeeded } from './storageUpload.js';
import {
  inheritDataFromVersionConfig,
  resolveCreateVersionPropertiesFromFile,
} from './filePropertyService.js';
import { assertResourceTypeCode } from './typeService.js';
import {
  assertLocalFileAllowedByType,
  isCreateBatchSupported,
} from './resourceTypeCapabilities.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import { generateCoverUrlFromSha1, isImageFilename } from './coverGenerateService.js';
import { parsePolicyFile } from './policyService.js';
import { resolveCreateApiResourceTypeName } from './resourceName.js';

const CREATE_BATCH_CHUNK_SIZE = 20;
const CONFIG_RE = /^freelog\..*\.config/i;

export interface FromDirCreatedItem {
  subdir: string;
  resourceId: string;
  resourceName: string;
  resourceTitle: string;
  itemTitle?: string;
  authExcludedItems?: AuthExcludedItem[];
}

export type CreateBatchResultItem = {
  resourceId?: string;
  resourceName?: string;
  name?: string;
};

function sanitizeBasename(name: string): string {
  const base = path.parse(name).name || 'file';
  const cleaned = base
    .replace(/[\\/:*?"<>|\s@$#]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return cleaned || 'file';
}

function listFlatFiles(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new CliError(`目录不存在: ${dir}`, { code: 4 });
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (CONFIG_RE.test(ent.name)) continue;
    files.push(path.join(dir, ent.name));
  }
  files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
  if (files.length === 0) {
    throw new CliError('目录内无可用扁平文件', { code: 4 });
  }
  return files;
}

function resolveUniqueSubdir(parent: string, safeName: string): string {
  let candidate = path.join(parent, safeName);
  if (!fs.existsSync(candidate)) return candidate;
  let i = 2;
  while (fs.existsSync(path.join(parent, `${safeName}_${i}`))) i += 1;
  return path.join(parent, `${safeName}_${i}`);
}

function writeItemConfigs(opts: {
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

interface PreparedFile {
  absolutePath: string;
  filename: string;
  sha1: string;
  name: string;
  resourceTitle: string;
  resourceTypeCode: string;
  resourceTypeName?: string;
  safeDir: string;
  version: string;
  description: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  policies?: ManifestPolicy[];
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  itemTitle?: string;
}

export interface BatchResourceConfigDefaults {
  resourceTypeCode?: string;
  resourceTypeName?: string;
  version?: string;
  description?: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  policies?: ManifestPolicy[];
  policyFile?: string;
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
}

export interface BatchResourceConfigItem extends BatchResourceConfigDefaults {
  filePath: string;
  name?: string;
  resourceTitle?: string;
  itemTitle?: string;
  skip?: boolean;
}

export interface BatchResourceConfig {
  defaults?: BatchResourceConfigDefaults;
  items: BatchResourceConfigItem[];
}

async function prepareFiles(opts: {
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
      throw new CliError(`批量文件不存在或不是文件: ${absolutePath}`, { code: 4 });
    }
    const filename = path.basename(absolutePath);
    const sha1 = await getSHA1Hash(absolutePath);
    await uploadFileIfNeeded(absolutePath, sha1);
    const safeDir = sanitizeBasename(filename);
    const resourceTypeCode = item?.resourceTypeCode || defaults.resourceTypeCode || opts.typeCode;
    if (!resourceTypeCode?.trim()) {
      throw new CliError('批量导入缺少 resourceTypeCode', {
        code: 4,
        hint: '传 --resource-type，或在 freelog.batch.json 的 defaults.resourceTypeCode / item.resourceTypeCode 中声明',
      });
    }
    const typeInfo = await assertResourceTypeCode(resourceTypeCode);
    const name = (item?.name || safeDir).slice(0, 60);
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
    if (!coverImages?.length && isImageFilename(filename)) {
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

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError(`${label} 必须是对象`, { code: 4 });
  }
  return value as Record<string, unknown>;
}

function toStringList(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new CliError(`${label} 必须是字符串数组`, { code: 4 });
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function toPolicyList(value: unknown, label: string): ManifestPolicy[] | undefined {
  if (value === undefined) return undefined;
  const rows = Array.isArray(value) ? value : [value];
  return rows.map((row, index) => {
    const item = asObject(row, `${label}[${index}]`);
    const policyName = String(item.policyName || '').trim();
    const policyText = String(item.policyText || '');
    if (!policyName || !policyText) {
      throw new CliError(`${label}[${index}] 缺少 policyName/policyText`, { code: 4 });
    }
    const status = item.status === undefined ? 1 : Number(item.status);
    if (status !== 0 && status !== 1) {
      throw new CliError(`${label}[${index}].status 只能是 0 或 1`, { code: 4 });
    }
    return { policyName, policyText, status: status as 0 | 1 };
  });
}

function normalizeBatchSignContracts(
  entries: BatchSignContract[] | undefined,
): Array<{ resourceId: string; policyIds: string[]; subjectType?: string }> | undefined {
  if (!entries?.length) return undefined;
  return entries.map((entry) => ({
    resourceId: entry.resourceId,
    policyIds: entry.policyIds,
    ...(entry.subjectType ? { subjectType: entry.subjectType } : {}),
  }));
}

function normalizeBatchSignContractsFromRaw(value: unknown, label: string): BatchSignContract[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new CliError(`${label} 必须是数组`, { code: 4 });
  return value.map((row, index) => {
    const item = asObject(row, `${label}[${index}]`);
    const resourceId = String(item.resourceId || '').trim();
    const policyIds = toStringList(item.policyIds, `${label}[${index}].policyIds`);
    if (!resourceId || !policyIds?.length) {
      throw new CliError(`${label}[${index}] 需要 resourceId 与 policyIds`, { code: 4 });
    }
    return {
      resourceId,
      policyIds,
      subjectType: item.subjectType === undefined ? undefined : String(item.subjectType),
    };
  });
}

function normalizeConfigDefaults(
  value: unknown,
  label: string,
): BatchResourceConfigDefaults {
  if (value === undefined) return {};
  const raw = asObject(value, label);
  return {
    resourceTypeCode:
      raw.resourceTypeCode === undefined ? undefined : String(raw.resourceTypeCode).trim(),
    resourceTypeName:
      raw.resourceTypeName === undefined ? undefined : String(raw.resourceTypeName).trim(),
    version: raw.version === undefined ? undefined : String(raw.version).trim(),
    description: raw.description === undefined ? undefined : String(raw.description),
    intro: raw.intro === undefined ? undefined : String(raw.intro),
    coverImages: toStringList(raw.coverImages, `${label}.coverImages`),
    tags: toStringList(raw.tags, `${label}.tags`),
    policies: toPolicyList(raw.policies, `${label}.policies`),
    policyFile: raw.policyFile === undefined ? undefined : String(raw.policyFile).trim(),
    dependencies: Array.isArray(raw.dependencies)
      ? (raw.dependencies as VersionDependency[])
      : undefined,
    baseUpcastResources: Array.isArray(raw.baseUpcastResources)
      ? (raw.baseUpcastResources as BaseUpcastResource[])
      : undefined,
    authExcludedItems: Array.isArray(raw.authExcludedItems)
      ? (raw.authExcludedItems as AuthExcludedItem[])
      : undefined,
    batchSignContracts: normalizeBatchSignContractsFromRaw(raw.batchSignContracts, `${label}.batchSignContracts`),
    inputAttrs: Array.isArray(raw.inputAttrs)
      ? (raw.inputAttrs as Array<{ key: string; value: string | number | boolean }>)
      : undefined,
    customPropertyDescriptors: Array.isArray(raw.customPropertyDescriptors)
      ? (raw.customPropertyDescriptors as CustomPropertyDescriptor[])
      : undefined,
  };
}

function normalizeConfigItem(value: unknown, index: number): BatchResourceConfigItem {
  const raw = asObject(value, `items[${index}]`);
  const defaults = normalizeConfigDefaults(raw, `items[${index}]`);
  const filePath = String(raw.filePath || '').trim();
  if (!filePath) throw new CliError(`items[${index}].filePath 必填`, { code: 4 });
  return {
    ...defaults,
    filePath,
    name: raw.name === undefined ? undefined : String(raw.name).trim(),
    resourceTitle: raw.resourceTitle === undefined ? undefined : String(raw.resourceTitle).trim(),
    itemTitle: raw.itemTitle === undefined ? undefined : String(raw.itemTitle).trim(),
    skip: Boolean(raw.skip),
  };
}

export function parseBatchConfig(raw: unknown): BatchResourceConfig {
  const root = asObject(raw, 'batch config');
  if (!Array.isArray(root.items)) {
    throw new CliError('batch config.items 必须是数组', { code: 4 });
  }
  const items = root.items
    .map((item, index) => normalizeConfigItem(item, index))
    .filter((item) => !item.skip);
  if (!items.length) {
    throw new CliError('batch config.items 没有可导入项目', { code: 4 });
  }
  return {
    defaults: normalizeConfigDefaults(root.defaults, 'defaults'),
    items,
  };
}

function readBatchConfig(configFile: string): BatchResourceConfig {
  if (!fs.existsSync(configFile)) {
    throw new CliError(`批量配置不存在: ${configFile}`, { code: 4 });
  }
  const rawText = fs.readFileSync(configFile, 'utf8');
  let raw: unknown;
  try {
    raw = /\.(ya?ml)$/i.test(configFile) ? YAML.parse(rawText) : JSON.parse(rawText);
  } catch (error) {
    throw new CliError('批量配置必须是合法 JSON/YAML', { code: 4, cause: error });
  }
  return parseBatchConfig(raw);
}

function resolveConfigPath(cwd: string | undefined, dir: string, configFile?: string): string | undefined {
  if (!configFile?.trim()) {
    const json = path.join(dir, 'freelog.batch.json');
    const yaml = path.join(dir, 'freelog.batch.yaml');
    if (fs.existsSync(json)) return json;
    if (fs.existsSync(yaml)) return yaml;
    return undefined;
  }
  const fromCwd = path.resolve(resolveCwd(cwd), configFile);
  if (fs.existsSync(fromCwd)) return fromCwd;
  return path.resolve(dir, configFile);
}

function loadPoliciesFromFile(configBaseDir: string, policyFile?: string): ManifestPolicy[] | undefined {
  if (!policyFile) return undefined;
  return parsePolicyFile(path.resolve(configBaseDir, policyFile));
}

function extractArrayItems(data: unknown): CreateBatchResultItem[] | null {
  if (Array.isArray(data)) return data as CreateBatchResultItem[];
  const dataList = getRecordValue<CreateBatchResultItem[]>(data, 'dataList');
  if (Array.isArray(dataList)) return dataList;
  const resources = getRecordValue<CreateBatchResultItem[]>(data, 'resources');
  if (Array.isArray(resources)) return resources;
  return null;
}

export function normalizeCreateBatchResults(
  data: unknown,
  resourceNames: string[],
): CreateBatchResultItem[] {
  const arrayItems = extractArrayItems(data);
  if (arrayItems) return arrayItems;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new CliError('createBatch 响应格式异常', { code: 1, details: data });
  }

  const record = data as Record<string, unknown>;
  const hasConsoleShape = resourceNames.some((name) =>
    Object.prototype.hasOwnProperty.call(record, name),
  );
  if (!hasConsoleShape) {
    throw new CliError('createBatch 响应格式异常', { code: 1, details: data });
  }

  return resourceNames.map((name) => {
    const item = record[name];
    const payload = getRecordValue<CreateBatchResultItem | null>(item, 'data');
    if (payload && typeof payload === 'object') {
      return {
        name,
        ...payload,
      };
    }
    return { name };
  });
}

function normalizeGeneratedResourceNames(data: unknown, expectedCount: number): string[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(getRecordValue<unknown[]>(data, 'dataList'))
      ? getRecordValue<unknown[]>(data, 'dataList')!
      : null;
  if (!rows || rows.length !== expectedCount) {
    throw new CliError('generateResourceNames 响应格式异常', { code: 1, details: data });
  }
  return rows.map((row) => {
    const next =
      getRecordValue<string>(row, 'newResourceName') ||
      getRecordValue<string>(row, 'resourceName') ||
      getRecordValue<string>(row, 'name');
    if (!next) {
      throw new CliError('generateResourceNames 响应缺少 newResourceName', {
        code: 1,
        details: row,
      });
    }
    return next;
  });
}

async function applyGeneratedResourceNames(prepared: PreparedFile[]): Promise<PreparedFile[]> {
  const envelope = await FServiceAPI.Resource.generateResourceNames({
    resourceNames: prepared.map((p) => p.name),
  });
  const names = normalizeGeneratedResourceNames(unwrapData(envelope), prepared.length);
  return prepared.map((item, index) => ({
    ...item,
    name: names[index] || item.name,
  }));
}

async function createOneFallback(
  item: PreparedFile,
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
    throw new CliError(`create 失败: ${item.filename}`, { code: 1, details: created });
  }
  const versionEnv = await FServiceAPI.Resource.createVersion({
    resourceId: created.resourceId,
    version: item.version,
    fileSha1: item.sha1,
    filename: item.filename,
    description: item.description,
    dependencies: item.dependencies || [],
    baseUpcastResources: item.baseUpcastResources || [],
    authExcludedItems: item.authExcludedItems || [],
    batchSignContracts: normalizeBatchSignContracts(item.batchSignContracts),
    inputAttrs: item.inputAttrs,
    customPropertyDescriptors: item.customPropertyDescriptors,
  } as Parameters<typeof FServiceAPI.Resource.createVersion>[0]);
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

async function resourceHasVersion(resourceId: string, version: string): Promise<boolean> {
  const listEnv = await FServiceAPI.Resource.getVersionListByResourceID({
    resourceId,
  } as Parameters<typeof FServiceAPI.Resource.getVersionListByResourceID>[0]);
  const list = unwrapData<Array<{ version?: string }> | { dataList?: Array<{ version?: string }> }>(
    listEnv,
  );
  const rows = Array.isArray(list)
    ? list
    : Array.isArray((list as { dataList?: unknown[] })?.dataList)
      ? (list as { dataList: Array<{ version?: string }> }).dataList
      : [];
  return rows.some((row) => row.version === version);
}

async function ensureVersionAfterCreateBatch(
  item: PreparedFile,
  resourceId: string,
): Promise<{ versionId?: string }> {
  try {
    if (await resourceHasVersion(resourceId, item.version)) return {};
  } catch {
    // 版本列表只是优化查询；创建版本本身仍是最终确认点。
  }

  try {
    const versionEnv = await FServiceAPI.Resource.createVersion({
      resourceId,
      version: item.version,
      fileSha1: item.sha1,
      filename: item.filename,
      description: item.description,
      dependencies: item.dependencies || [],
      baseUpcastResources: item.baseUpcastResources || [],
      authExcludedItems: item.authExcludedItems || [],
      batchSignContracts: normalizeBatchSignContracts(item.batchSignContracts),
      inputAttrs: item.inputAttrs,
      customPropertyDescriptors: item.customPropertyDescriptors,
    } as Parameters<typeof FServiceAPI.Resource.createVersion>[0]);
    const versionData = unwrapData<{ versionId?: string }>(versionEnv);
    return { versionId: versionData?.versionId };
  } catch (error) {
    if (isDuplicateVersionError(error)) return {};
    throw error;
  }
}

export function shouldFallbackCreateBatch(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    /createBatch.*not.*function/i.test(msg) ||
    /not\s*found|404|method\s*not\s*allowed|405/i.test(msg) ||
    /\/v2\/resources\/createBatch/i.test(msg)
  );
}

export async function createFromDir(opts: {
  dir: string;
  typeCode?: string;
  resourceTypeName?: string;
  titlePrefix?: string;
  configFile?: string;
  cwd?: string;
  yes?: boolean;
}): Promise<FromDirCreatedItem[]> {
  const auth = requireAuth();
  if (!auth.username) {
    throw new CliError('登录信息缺少 username', { code: 2, hint: '重新 login' });
  }
  const parent = path.resolve(opts.dir || opts.cwd || resolveCwd());
  const prepared = await applyGeneratedResourceNames(
    await prepareFiles({
      dir: parent,
      typeCode: opts.typeCode,
      resourceTypeName: opts.resourceTypeName,
      titlePrefix: opts.titlePrefix,
      username: auth.username,
      cwd: opts.cwd,
      configFile: opts.configFile,
    }),
  );

  const created: FromDirCreatedItem[] = [];
  const failures: Array<{ file: string; error: string }> = [];
  const batchResults = new Map<PreparedFile, CreateBatchResultItem>();

  const groups = new Map<string, PreparedFile[]>();
  for (const item of prepared) {
    const key = `${item.resourceTypeCode}\u0000${item.resourceTypeName || ''}`;
    const rows = groups.get(key) || [];
    rows.push(item);
    groups.set(key, rows);
  }

  for (const rows of groups.values()) {
    const typeInfo = await assertResourceTypeCode(rows[0]!.resourceTypeCode);
    if (!isCreateBatchSupported(typeInfo)) continue;
    const batchable = rows.filter((item) => !(item.authExcludedItems || []).length);
    if (!batchable.length) continue;

    for (let offset = 0; offset < batchable.length; offset += CREATE_BATCH_CHUNK_SIZE) {
      const chunk = batchable.slice(offset, offset + CREATE_BATCH_CHUNK_SIZE);
      try {
        const envelope = await FServiceAPI.Resource.createBatch({
          resourceTypeCode: chunk[0]!.resourceTypeCode,
          resourceTypeName: resolveCreateApiResourceTypeName(chunk[0]!.resourceTypeCode, {
            manifest: chunk[0]!.resourceTypeName,
          }),
          createResourceObjects: chunk.map((p) => ({
            name: p.name,
            resourceTitle: p.resourceTitle,
            intro: p.intro,
            coverImages: p.coverImages,
            tags: p.tags,
            policies: p.policies,
            version: p.version,
            fileSha1: p.sha1,
            filename: p.filename,
            description: p.description,
            dependencies: p.dependencies,
            baseUpcastResources: p.baseUpcastResources,
            inputAttrs: p.inputAttrs,
            customPropertyDescriptors: p.customPropertyDescriptors,
            batchSignContracts: normalizeBatchSignContracts(p.batchSignContracts),
          })),
        } as Parameters<typeof FServiceAPI.Resource.createBatch>[0]);
        const rowsData = normalizeCreateBatchResults(
          unwrapData(envelope),
          chunk.map((p) => p.name),
        );
        chunk.forEach((item, index) => batchResults.set(item, rowsData[index]!));
      } catch (error) {
        if (error instanceof CliError && error.code === 2) throw error;
        if (!shouldFallbackCreateBatch(error)) throw error;
        // 本批次降级为逐个 create + createVersion；其它批次仍可继续批量。
      }
    }
  }

  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i]!;
    try {
      let resourceId: string | undefined;
      let resourceName: string | undefined;
      let versionId: string | undefined;

      if (batchResults.has(item)) {
        const row = batchResults.get(item);
        resourceId = row?.resourceId;
        resourceName = row?.resourceName || row?.name || item.name;
        if (!resourceId) {
          throw new CliError(`createBatch 未返回第 ${i + 1} 项 resourceId`, {
            code: 1,
            details: row,
          });
        }
        const versionMeta = await ensureVersionAfterCreateBatch(item, resourceId);
        versionId = versionMeta.versionId;
      } else {
        const one = await createOneFallback(item);
        resourceId = one.resourceId;
        resourceName = one.resourceName;
        versionId = one.versionId;
      }

      const subdir = resolveUniqueSubdir(parent, item.safeDir);
      writeItemConfigs({
        subdir,
        sourceFile: item.absolutePath,
        resourceId,
        resourceName: resourceName || item.name,
        resourceTypeCode: item.resourceTypeCode,
        resourceTypeName: item.resourceTypeName,
        resourceTitle: item.resourceTitle,
        fileSha1: item.sha1,
        filename: item.filename,
        version: item.version,
        description: item.description,
        intro: item.intro,
        coverImages: item.coverImages,
        tags: item.tags,
        dependencies: item.dependencies,
        baseUpcastResources: item.baseUpcastResources,
        authExcludedItems: item.authExcludedItems,
        inputAttrs: item.inputAttrs,
        customPropertyDescriptors: item.customPropertyDescriptors,
        versionId,
        userId: auth.userId,
        username: auth.username,
      });
      created.push({
        subdir: path.relative(parent, subdir) || path.basename(subdir),
        resourceId,
        resourceName: resourceName || item.name,
        resourceTitle: item.resourceTitle,
        itemTitle: item.itemTitle,
        authExcludedItems: item.authExcludedItems,
      });
    } catch (error) {
      failures.push({
        file: item.filename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failures.length > 0) {
    throw new CliError(
      `resource import-dir 部分失败（成功 ${created.length}/${prepared.length}）`,
      {
        code: 4,
        details: { created, failures },
        hint: '成功项已写入子目录 manifest/state；失败项可单独 create/publish',
      },
    );
  }

  return created;
}
