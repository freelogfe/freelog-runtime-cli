import fs from 'node:fs';
import path from 'node:path';
import { getCliEnv } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { atomicWriteFile } from './atomicWrite.js';

export type ProjectSubject = 'resource' | 'collection';
export type RuntimeVersion = '0.4' | '0.5';

export interface DraftSyncMeta {
  schemaVersion?: 1;
  lastFingerprint: string;
  lastRemoteUpdateDate?: string;
  lastPushedAt?: string;
  lastPulledAt?: string;
}

export interface VersionDependency {
  resourceId: string;
  resourceName?: string;
  versionRange?: string;
}

export interface BaseUpcastResource {
  resourceId: string;
  resourceName?: string;
}

export interface AuthExcludedItem {
  resourceId: string;
  excludedType: 'contractId' | 'policyId';
  excludedValue: string;
}

export interface BatchSignContract {
  resourceId: string;
  policyIds: string[];
  subjectType?: string;
}

export interface CustomPropertyDescriptor {
  key: string;
  name?: string;
  type: string;
  defaultValue?: string;
  remark?: string;
  candidateItems?: string[];
}

export interface ManifestPolicy {
  policyId?: string;
  policyName: string;
  policyText: string;
  status?: 0 | 1;
}

export interface FreelogManifest {
  $schema?: string;
  schemaVersion: 1;
  subject: ProjectSubject;
  identity: {
    name: string;
  };
  resource: {
    typeCode: string;
    typeName?: string;
    title: string;
    intro?: string;
    tags?: string[];
    coverImages?: string[];
  };
  version?: {
    version: string;
    filePath: string;
    description?: string;
    videoCover?: string;
    runtimeVersion?: RuntimeVersion | null;
    dependencies?: VersionDependency[];
    baseUpcastResources?: BaseUpcastResource[];
    authExcludedItems?: AuthExcludedItem[];
    batchSignContracts?: BatchSignContract[];
    inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
    customPropertyDescriptors?: CustomPropertyDescriptor[];
  } | null;
  policies?: ManifestPolicy[];
  collection?: {
    version?: string;
    description?: string;
    display?: Record<string, string>;
    items?: unknown[];
    collectRules?: unknown;
    rssFeedUrl?: string;
    dependencies?: VersionDependency[];
    baseUpcastResources?: BaseUpcastResource[];
    authExcludedItems?: AuthExcludedItem[];
    inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
    customPropertyDescriptors?: CustomPropertyDescriptor[];
  } | null;
}

export interface FreelogState {
  schemaVersion: 1;
  env?: string | null;
  resource: {
    resourceId?: string | null;
    resourceName?: string | null;
    resourceType?: string[] | null;
    resourceTypeCode?: string | null;
    resourceTypeName?: string | null;
    subjectType?: number | null;
    owner?: {
      userId?: number | string | null;
      username?: string | null;
    } | null;
    status?: number | null;
    latestVersion?: string | null;
    policies?: Array<{ policyId?: string; policyName?: string; status?: number }> | null;
  };
  version: {
    lastPublishedVersion?: string | null;
    lastPublishedVersionId?: string | null;
    fileSha1?: string | null;
    filename?: string | null;
    draftSync?: DraftSyncMeta | null;
  };
  collection: {
    catalogueDraft?: unknown[] | null;
    catalogueProperty?: Record<string, string> | null;
    /** 上次发版后目录草稿指纹；用于 isMergeCatalogueDraft 条件化 */
    cataloguePublishedFingerprint?: string | null;
    collectRules?: unknown;
    rss?: {
      feedUrl?: string | null;
    } | null;
    draftSync?: DraftSyncMeta | null;
  };
  sync: {
    lastPulledAt?: string | null;
    listingFingerprint?: string | null;
    platformUpdateDate?: string | null;
  };
}

export interface ResourceProject {
  resourceId?: string;
  resourceName: string;
  resourceType: string[];
  resourceTypeCode?: string;
  resourceTypeName?: string;
  resourceTitle?: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  userId?: number | string;
  username?: string;
  status?: number;
  latestVersion?: string;
  policies?: Array<{ policyId?: string; policyName?: string; status?: number }>;
}

export interface VersionProject {
  resourceId?: string;
  resourceName?: string;
  resourceType?: string;
  resourceTypeCode?: string;
  userId?: number | string;
  username?: string;
  version: string;
  description?: string;
  videoCover?: string;
  filePath: string;
  fileSha1?: string | null;
  filename?: string | null;
  versionId?: string | null;
  published?: boolean;
  runtimeVersion?: RuntimeVersion;
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  draftSync?: DraftSyncMeta | null;
}

export type CollectionProject = ResourceProject & {
  collectRules?: unknown;
  catalogueItems?: unknown[];
  display?: Record<string, string>;
  rssFeedUrl?: string;
  version?: string;
  description?: string;
  dependencies?: VersionDependency[];
  baseUpcastResources?: BaseUpcastResource[];
  authExcludedItems?: AuthExcludedItem[];
  batchSignContracts?: BatchSignContract[];
  inputAttrs?: Array<{ key: string; value: string | number | boolean }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  draftSync?: DraftSyncMeta | null;
};

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

function readJsonFile<T>(file: string, label: string): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    throw new CliError(`${label} 不是合法 JSON: ${file}`, { code: 4, cause: error });
  }
}

function writeJsonFile(file: string, data: unknown): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CliError(`${label} 格式非法`, { code: 4 });
  }
}

function normalizeSubject(value: unknown): ProjectSubject {
  if (value === 'resource' || value === 'collection') return value;
  throw new CliError('manifest.subject 只能是 resource 或 collection', { code: 4 });
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
  if (!identityName) throw new CliError('manifest.identity.name 必填', { code: 4 });
  if (!typeCode) throw new CliError('manifest.resource.typeCode 必填', { code: 4 });
  if (!title) throw new CliError('manifest.resource.title 必填', { code: 4 });

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
            filePath: String((raw.version as { filePath?: unknown } | undefined)?.filePath || 'dist'),
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
    throw new CliError('项目 state 环境与当前 API 环境不一致', {
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

export function loadManifest(cwd?: string): { path: string; data: FreelogManifest } {
  const file = manifestPath(cwd);
  if (!fs.existsSync(file)) {
    throw new CliError('未找到 freelog.manifest.json', {
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

export function loadState(cwd?: string, subject?: ProjectSubject): { path: string; data: FreelogState } {
  const manifest = subject ? null : tryLoadManifest(cwd);
  const actualSubject = subject || manifest?.data.subject || 'resource';
  const file = statePath(cwd);
  if (!fs.existsSync(file)) return { path: file, data: createEmptyState(actualSubject) };
  return { path: file, data: normalizeState(readJsonFile(file, '.freelog/state.json'), actualSubject) };
}

export function saveManifest(data: FreelogManifest, cwd?: string): string {
  return writeJsonFile(manifestPath(cwd), normalizeManifest(data));
}

export function saveState(data: FreelogState, cwd?: string): string {
  const normalized = normalizeState(data, data.resource.subjectType === 4 ? 'collection' : 'resource');
  normalized.env = normalized.env || getCliEnv();
  return writeJsonFile(statePath(cwd), normalized);
}

function shortName(name: string | undefined, fallback: string): string {
  const raw = (name || fallback).trim();
  const idx = raw.indexOf('/');
  return idx >= 0 ? raw.slice(idx + 1) : raw;
}

function ownerFromState(state: FreelogState): { userId?: number | string; username?: string } {
  return {
    userId: state.resource.owner?.userId ?? undefined,
    username: state.resource.owner?.username ?? undefined,
  };
}

export function listingFingerprint(data: Pick<ResourceProject, 'resourceTitle' | 'intro' | 'coverImages' | 'tags'>): string {
  return JSON.stringify({
    title: data.resourceTitle ?? null,
    intro: data.intro ?? null,
    coverImages: data.coverImages ?? [],
    tags: data.tags ?? [],
  });
}

function toResourceProject(manifest: FreelogManifest, state: FreelogState): ResourceProject {
  const owner = ownerFromState(state);
  return {
    resourceId: state.resource.resourceId ?? undefined,
    resourceName: state.resource.resourceName || manifest.identity.name,
    resourceType: state.resource.resourceType || [],
    resourceTypeCode: state.resource.resourceTypeCode || manifest.resource.typeCode,
    resourceTypeName: state.resource.resourceTypeName || manifest.resource.typeName,
    resourceTitle: manifest.resource.title,
    intro: manifest.resource.intro,
    coverImages: manifest.resource.coverImages,
    tags: manifest.resource.tags,
    userId: owner.userId,
    username: owner.username,
    status: state.resource.status ?? undefined,
    latestVersion: state.resource.latestVersion ?? undefined,
    policies: state.resource.policies || [],
  };
}

function toVersionProject(manifest: FreelogManifest, state: FreelogState): VersionProject {
  const version = manifest.version || {
    version: '1.0.0',
    filePath: 'dist',
  };
  const owner = ownerFromState(state);
  return {
    resourceId: state.resource.resourceId ?? undefined,
    resourceName: state.resource.resourceName ?? undefined,
    resourceType: state.resource.resourceType?.join('/') || undefined,
    resourceTypeCode: state.resource.resourceTypeCode || manifest.resource.typeCode,
    userId: owner.userId,
    username: owner.username,
    version: version.version,
    description: version.description,
    videoCover: version.videoCover || undefined,
    filePath: version.filePath,
    fileSha1: state.version.fileSha1 ?? undefined,
    filename: state.version.filename ?? undefined,
    versionId: state.version.lastPublishedVersionId ?? undefined,
    runtimeVersion: version.runtimeVersion || undefined,
    dependencies: version.dependencies || [],
    baseUpcastResources: version.baseUpcastResources || [],
    authExcludedItems: version.authExcludedItems || [],
    batchSignContracts: version.batchSignContracts || [],
    inputAttrs: version.inputAttrs || [],
    customPropertyDescriptors: version.customPropertyDescriptors || [],
    draftSync: state.version.draftSync || null,
  };
}

function toCollectionProject(manifest: FreelogManifest, state: FreelogState): CollectionProject {
  const base = toResourceProject(manifest, state);
  const collection = manifest.collection || {};
  return {
    ...base,
    catalogueItems: (state.collection.catalogueDraft as unknown[]) || [],
    display: collection.display || state.collection.catalogueProperty || {},
    collectRules: collection.collectRules ?? state.collection.collectRules,
    rssFeedUrl: collection.rssFeedUrl || state.collection.rss?.feedUrl || undefined,
    version: collection.version || manifest.version?.version || '1.0.0',
    description: collection.description || manifest.version?.description || '',
    dependencies: collection.dependencies || [],
    baseUpcastResources: collection.baseUpcastResources || [],
    authExcludedItems: collection.authExcludedItems || [],
    inputAttrs: collection.inputAttrs || [],
    customPropertyDescriptors: collection.customPropertyDescriptors || [],
    draftSync: state.collection.draftSync || null,
  };
}

function persistResourceProject(
  data: ResourceProject,
  cwd?: string,
  subject: ProjectSubject = 'resource',
): string {
  const loaded = tryLoadManifest(cwd);
  const manifest = loaded?.data || createResourceManifest({
    subject,
    resourceName: shortName(data.resourceName, data.resourceTitle || 'resource'),
    resourceTypeCode: data.resourceTypeCode || '',
    resourceTypeName: data.resourceTypeName,
    resourceTitle: data.resourceTitle || shortName(data.resourceName, 'resource'),
  });
  const state = loadState(cwd, subject).data;
  manifest.subject = subject;
  manifest.identity.name = shortName(data.resourceName, manifest.identity.name);
  manifest.resource = {
    ...manifest.resource,
    typeCode: data.resourceTypeCode || manifest.resource.typeCode,
    typeName: data.resourceTypeName || manifest.resource.typeName,
    title: data.resourceTitle || manifest.resource.title,
    intro: data.intro ?? manifest.resource.intro,
    coverImages: data.coverImages ?? manifest.resource.coverImages ?? [],
    tags: data.tags ?? manifest.resource.tags ?? [],
  };
  state.resource = {
    ...state.resource,
    resourceId: data.resourceId || state.resource.resourceId || null,
    resourceName: data.resourceName || state.resource.resourceName || null,
    resourceType: data.resourceType || state.resource.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || state.resource.resourceTypeCode || manifest.resource.typeCode,
    resourceTypeName: data.resourceTypeName || state.resource.resourceTypeName || manifest.resource.typeName || null,
    subjectType: subject === 'collection' ? 4 : state.resource.subjectType ?? null,
    owner:
      data.userId !== undefined || data.username !== undefined
        ? { userId: data.userId ?? null, username: data.username ?? null }
        : state.resource.owner ?? null,
    status: data.status ?? state.resource.status ?? null,
    latestVersion: data.latestVersion ?? state.resource.latestVersion ?? null,
    policies: data.policies ?? state.resource.policies ?? [],
  };
  saveManifest(manifest, cwd);
  saveState(state, cwd);
  return manifestPath(cwd);
}

export function loadResourceProject(cwd?: string): { path: string; data: ResourceProject } {
  const { path: file, data: manifest } = loadManifest(cwd);
  if (manifest.subject !== 'resource') {
    throw new CliError('当前目录不是单品资源 manifest', { code: 4 });
  }
  const state = loadState(cwd, manifest.subject).data;
  return { path: file, data: toResourceProject(manifest, state) };
}

export function tryLoadResourceProject(cwd?: string): { path: string; data: ResourceProject } | null {
  const loaded = tryLoadManifest(cwd);
  if (!loaded || loaded.data.subject !== 'resource') return null;
  return { path: loaded.path, data: toResourceProject(loaded.data, loadState(cwd, 'resource').data) };
}

export function loadVersionProject(cwd?: string): { path: string; data: VersionProject } {
  const { path: file, data: manifest } = loadManifest(cwd);
  if (manifest.subject !== 'resource') {
    throw new CliError('当前目录不是单品资源 manifest', { code: 4 });
  }
  return { path: file, data: toVersionProject(manifest, loadState(cwd, 'resource').data) };
}

export function tryLoadVersionProject(cwd?: string): { path: string; data: VersionProject } | null {
  const loaded = tryLoadManifest(cwd);
  if (!loaded || loaded.data.subject !== 'resource') return null;
  return { path: loaded.path, data: toVersionProject(loaded.data, loadState(cwd, 'resource').data) };
}

export function loadCollectionProject(cwd?: string): { path: string; data: CollectionProject } {
  const { path: file, data: manifest } = loadManifest(cwd);
  if (manifest.subject !== 'collection') {
    throw new CliError('当前目录不是合集 manifest', { code: 4 });
  }
  return { path: file, data: toCollectionProject(manifest, loadState(cwd, 'collection').data) };
}

export function tryLoadCollectionProject(cwd?: string): { path: string; data: CollectionProject } | null {
  const loaded = tryLoadManifest(cwd);
  if (!loaded || loaded.data.subject !== 'collection') return null;
  return { path: loaded.path, data: toCollectionProject(loaded.data, loadState(cwd, 'collection').data) };
}

export function saveResourceProject(data: ResourceProject, cwd?: string): string {
  return persistResourceProject(data, cwd, 'resource');
}

export function savePlatformResourceState(
  data: ResourceProject,
  cwd?: string,
  subject: ProjectSubject = 'resource',
): string {
  const state = loadState(cwd, subject).data;
  state.resource = {
    ...state.resource,
    resourceId: data.resourceId || state.resource.resourceId || null,
    resourceName: data.resourceName || state.resource.resourceName || null,
    resourceType: data.resourceType || state.resource.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || state.resource.resourceTypeCode || null,
    resourceTypeName: data.resourceTypeName || state.resource.resourceTypeName || null,
    subjectType: subject === 'collection' ? 4 : state.resource.subjectType ?? null,
    owner:
      data.userId !== undefined || data.username !== undefined
        ? { userId: data.userId ?? null, username: data.username ?? null }
        : state.resource.owner ?? null,
    status: data.status ?? state.resource.status ?? null,
    latestVersion: data.latestVersion ?? state.resource.latestVersion ?? null,
    policies: data.policies ?? state.resource.policies ?? [],
  };
  state.sync = {
    ...state.sync,
    lastPulledAt: new Date().toISOString(),
    listingFingerprint: listingFingerprint(data),
    platformUpdateDate: (data as { updateDate?: string }).updateDate ?? state.sync.platformUpdateDate ?? null,
  };
  saveState(state, cwd);
  return statePath(cwd);
}

export function saveVersionProject(data: VersionProject, cwd?: string): string {
  const { data: manifest } = loadManifest(cwd);
  if (manifest.subject !== 'resource') {
    throw new CliError('当前目录不是单品资源 manifest', { code: 4 });
  }
  const state = loadState(cwd, 'resource').data;
  const previousVersion = manifest.version?.version;
  const previousFilePath = manifest.version?.filePath;
  const published = data.published === true;
  const changedPublishInput =
    (previousVersion !== undefined && data.version !== previousVersion) ||
    (previousFilePath !== undefined && data.filePath !== previousFilePath);
  manifest.version = {
    ...(manifest.version || { version: '1.0.0', filePath: 'dist' }),
    version: data.version,
    description: data.description ?? '',
    videoCover: data.videoCover || undefined,
    filePath: data.filePath,
    runtimeVersion: data.runtimeVersion ?? null,
    dependencies: data.dependencies || [],
    baseUpcastResources: data.baseUpcastResources || [],
    authExcludedItems: data.authExcludedItems || [],
    batchSignContracts: data.batchSignContracts || [],
    inputAttrs: data.inputAttrs || [],
    customPropertyDescriptors: data.customPropertyDescriptors || [],
  };
  state.resource = {
    ...state.resource,
    resourceId: data.resourceId || state.resource.resourceId || null,
    resourceName: data.resourceName || state.resource.resourceName || null,
    resourceTypeCode: data.resourceTypeCode || state.resource.resourceTypeCode || manifest.resource.typeCode,
    owner:
      data.userId !== undefined || data.username !== undefined
        ? { userId: data.userId ?? null, username: data.username ?? null }
        : state.resource.owner ?? null,
  };
  state.version = {
    ...state.version,
    lastPublishedVersion:
      published
        ? data.version
        : data.versionId !== undefined
        ? data.versionId
          ? data.version
          : null
        : changedPublishInput
          ? null
          : state.version.lastPublishedVersion ?? null,
    fileSha1:
      data.fileSha1 !== undefined
        ? data.fileSha1
        : changedPublishInput
          ? null
          : state.version.fileSha1 ?? null,
    filename:
      data.filename !== undefined
        ? data.filename
        : changedPublishInput
          ? null
          : state.version.filename ?? null,
    lastPublishedVersionId:
      data.versionId !== undefined
        ? data.versionId
        : changedPublishInput
          ? null
          : state.version.lastPublishedVersionId ?? null,
    draftSync: data.draftSync === undefined ? state.version.draftSync ?? null : data.draftSync,
  };
  if (published || (data.versionId !== undefined && data.versionId)) {
    state.resource.latestVersion = data.version;
  }
  saveManifest(manifest, cwd);
  saveState(state, cwd);
  return manifestPath(cwd);
}

export function savePlatformCollectionState(
  data: CollectionProject,
  cwd?: string,
  updates: {
    catalogueDraft?: unknown[] | null;
    catalogueProperty?: Record<string, string> | null;
    cataloguePublishedFingerprint?: string | null;
    collectRules?: unknown;
    rss?: FreelogState['collection']['rss'];
  } = {},
): string {
  savePlatformResourceState(data, cwd, 'collection');
  const state = loadState(cwd, 'collection').data;
  state.collection = {
    ...state.collection,
    catalogueDraft:
      updates.catalogueDraft === undefined
        ? state.collection.catalogueDraft ?? []
        : updates.catalogueDraft,
    catalogueProperty:
      updates.catalogueProperty === undefined
        ? state.collection.catalogueProperty ?? null
        : updates.catalogueProperty,
    cataloguePublishedFingerprint:
      updates.cataloguePublishedFingerprint === undefined
        ? state.collection.cataloguePublishedFingerprint ?? null
        : updates.cataloguePublishedFingerprint,
    collectRules:
      updates.collectRules === undefined ? state.collection.collectRules ?? null : updates.collectRules,
    rss: updates.rss === undefined ? state.collection.rss ?? null : updates.rss,
  };
  saveState(state, cwd);
  return statePath(cwd);
}

export function saveCollectionProject(data: CollectionProject, cwd?: string): string {
  const loaded = tryLoadManifest(cwd);
  const manifest = loaded?.data || createResourceManifest({
    subject: 'collection',
    resourceName: shortName(data.resourceName, data.resourceTitle || 'collection'),
    resourceTypeCode: data.resourceTypeCode || '',
    resourceTypeName: data.resourceTypeName,
    resourceTitle: data.resourceTitle || shortName(data.resourceName, 'collection'),
  });
  const state = loadState(cwd, 'collection').data;
  persistResourceProject(data, cwd, 'collection');
  const latest = loadManifest(cwd).data;
  latest.collection = {
    ...(latest.collection || {}),
    version: data.version || latest.collection?.version || '1.0.0',
    description: data.description ?? latest.collection?.description ?? '',
    display: data.display || latest.collection?.display || {},
    items: latest.collection?.items || [],
    collectRules: data.collectRules ?? latest.collection?.collectRules ?? null,
    rssFeedUrl: data.rssFeedUrl || latest.collection?.rssFeedUrl,
    dependencies: data.dependencies || latest.collection?.dependencies || [],
    baseUpcastResources: data.baseUpcastResources || latest.collection?.baseUpcastResources || [],
    authExcludedItems: data.authExcludedItems || latest.collection?.authExcludedItems || [],
    inputAttrs: data.inputAttrs || latest.collection?.inputAttrs || [],
    customPropertyDescriptors:
      data.customPropertyDescriptors || latest.collection?.customPropertyDescriptors || [],
  };
  const nextState = loadState(cwd, 'collection').data;
  nextState.collection = {
    ...state.collection,
    ...nextState.collection,
    catalogueDraft: data.catalogueItems || nextState.collection.catalogueDraft || [],
    catalogueProperty: data.display || nextState.collection.catalogueProperty || {},
    collectRules: data.collectRules ?? nextState.collection.collectRules,
    rss: data.rssFeedUrl ? { feedUrl: data.rssFeedUrl } : nextState.collection.rss,
    draftSync: data.draftSync === undefined ? nextState.collection.draftSync ?? null : data.draftSync,
  };
  saveManifest(latest, cwd);
  saveState(nextState, cwd);
  return manifestPath(cwd);
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

export function createResourceManifestTemplate(opts: {
  resourceName: string;
  resourceTypeCode?: string;
  resourceTypeName?: string;
  resourceTypeLabels?: string[];
  resourceTitle?: string;
}): ResourceProject {
  return {
    resourceName: opts.resourceName,
    resourceType: opts.resourceTypeLabels?.length ? opts.resourceTypeLabels : [],
    resourceTypeCode: opts.resourceTypeCode || '',
    resourceTypeName: opts.resourceTypeName,
    resourceTitle: opts.resourceTitle || opts.resourceName,
    intro: '',
    coverImages: [],
    tags: [],
  };
}

export function createVersionManifestTemplate(opts: {
  resourceName: string;
  resourceTypeCode?: string;
  resourceTypeName?: string;
  version: string;
  filePath: string;
  runtimeVersion?: RuntimeVersion;
}): VersionProject {
  return {
    resourceName: opts.resourceName,
    resourceTypeCode: opts.resourceTypeCode || '',
    version: opts.version,
    description: '',
    videoCover: undefined,
    filePath: opts.filePath,
    runtimeVersion: opts.runtimeVersion,
    dependencies: [],
    baseUpcastResources: [],
    authExcludedItems: [],
    inputAttrs: [],
    customPropertyDescriptors: [],
    draftSync: null,
  };
}

export function createCollectionManifestTemplate(opts: {
  resourceName: string;
  resourceTypeCode?: string;
  resourceTypeName?: string;
  resourceTitle?: string;
  version: string;
}): CollectionProject {
  return {
    resourceName: opts.resourceName,
    resourceType: [],
    resourceTypeCode: opts.resourceTypeCode || '',
    resourceTypeName: opts.resourceTypeName,
    resourceTitle: opts.resourceTitle || opts.resourceName,
    intro: '',
    coverImages: [],
    tags: [],
    catalogueItems: [],
    display: {},
    version: opts.version,
    description: '',
    dependencies: [],
    baseUpcastResources: [],
    authExcludedItems: [],
    inputAttrs: [],
    customPropertyDescriptors: [],
    draftSync: null,
  };
}

export function writeResourceProject(data: ResourceProject, cwd?: string): string {
  return saveResourceProject(data, cwd);
}

export function writeVersionProject(data: VersionProject, cwd?: string): string {
  return saveVersionProject(data, cwd);
}

export function writeCollectionProject(data: CollectionProject, cwd?: string): string {
  return saveCollectionProject(data, cwd);
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
