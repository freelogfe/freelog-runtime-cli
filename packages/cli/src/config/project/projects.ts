import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  createResourceManifest,
  loadManifest,
  loadState,
  manifestPath,
  saveManifest,
  saveState,
  statePath,
  tryLoadManifest,
} from './store.js';
import type {
  CollectionProject,
  FreelogManifest,
  FreelogState,
  ProjectSubject,
  ResourceProject,
  RuntimeVersion,
  VersionProject,
} from './types.js';

export function shortName(name: string | undefined, fallback: string): string {
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

export function listingFingerprint(
  data: Pick<ResourceProject, 'resourceTitle' | 'intro' | 'coverImages' | 'tags'>,
): string {
  return JSON.stringify({
    title: data.resourceTitle ?? null,
    intro: data.intro ?? null,
    coverImages: data.coverImages ?? [],
    tags: data.tags ?? [],
  });
}

export function toResourceProject(manifest: FreelogManifest, state: FreelogState): ResourceProject {
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

export function toVersionProject(manifest: FreelogManifest, state: FreelogState): VersionProject {
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
    artifactMode: version.artifactMode,
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

export function toCollectionProject(manifest: FreelogManifest, state: FreelogState): CollectionProject {
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

export function persistResourceProject(
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
    throw cliError(I18N_KEYS.not_single_resource_manifest, { code: 4 });
  }
  const state = loadState(cwd, manifest.subject).data;
  return { path: file, data: toResourceProject(manifest, state) };
}

export function tryLoadResourceProject(cwd?: string): { path: string; data: ResourceProject } | null {
  const loaded = tryLoadManifest(cwd);
  if (!loaded || loaded.data.subject !== 'resource') return null;
  return { path: loaded.path, data: toResourceProject(loaded.data, loadState(cwd, 'resource').data) };
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

export function writeResourceProject(data: ResourceProject, cwd?: string): string {
  return saveResourceProject(data, cwd);
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

export function loadVersionProject(cwd?: string): { path: string; data: VersionProject } {
  const { path: file, data: manifest } = loadManifest(cwd);
  if (manifest.subject !== 'resource') {
    throw cliError(I18N_KEYS.not_single_resource_manifest, { code: 4 });
  }
  return { path: file, data: toVersionProject(manifest, loadState(cwd, 'resource').data) };
}

export function tryLoadVersionProject(cwd?: string): { path: string; data: VersionProject } | null {
  const loaded = tryLoadManifest(cwd);
  if (!loaded || loaded.data.subject !== 'resource') return null;
  return { path: loaded.path, data: toVersionProject(loaded.data, loadState(cwd, 'resource').data) };
}

export function saveVersionProject(data: VersionProject, cwd?: string): string {
  const { data: manifest } = loadManifest(cwd);
  if (manifest.subject !== 'resource') {
    throw cliError(I18N_KEYS.not_single_resource_manifest, { code: 4 });
  }
  const state = loadState(cwd, 'resource').data;
  const previousVersion = manifest.version?.version;
  const previousFilePath = manifest.version?.filePath;
  const previousArtifactMode = manifest.version?.artifactMode;
  const published = data.published === true;
  const changedPublishInput =
    (previousVersion !== undefined && data.version !== previousVersion) ||
    (previousFilePath !== undefined && data.filePath !== previousFilePath) ||
    (previousArtifactMode !== undefined && data.artifactMode !== previousArtifactMode);
  manifest.version = {
    ...(manifest.version || { version: '1.0.0', filePath: 'dist' }),
    version: data.version,
    description: data.description ?? '',
    videoCover: data.videoCover || undefined,
    filePath: data.filePath,
    artifactMode: data.artifactMode,
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
      published
        ? data.fileSha1
        : changedPublishInput
          ? null
          : data.fileSha1 !== undefined
            ? data.fileSha1
          : state.version.fileSha1 ?? null,
    filename:
      published
        ? data.filename
        : changedPublishInput
          ? null
          : data.filename !== undefined
            ? data.filename
          : state.version.filename ?? null,
    lastPublishedVersionId:
      published
        ? data.versionId
        : changedPublishInput
          ? null
          : data.versionId !== undefined
            ? data.versionId
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

export function writeVersionProject(data: VersionProject, cwd?: string): string {
  return saveVersionProject(data, cwd);
}

export function createVersionManifestTemplate(opts: {
  resourceName: string;
  resourceTypeCode?: string;
  resourceTypeName?: string;
  version: string;
  filePath: string;
  artifactMode?: 'file' | 'directory-zip';
  runtimeVersion?: RuntimeVersion;
}): VersionProject {
  return {
    resourceName: opts.resourceName,
    resourceTypeCode: opts.resourceTypeCode || '',
    version: opts.version,
    description: '',
    videoCover: undefined,
    filePath: opts.filePath,
    artifactMode: opts.artifactMode,
    runtimeVersion: opts.runtimeVersion,
    dependencies: [],
    baseUpcastResources: [],
    authExcludedItems: [],
    inputAttrs: [],
    customPropertyDescriptors: [],
    draftSync: null,
  };
}

export function loadCollectionProject(cwd?: string): { path: string; data: CollectionProject } {
  const { path: file, data: manifest } = loadManifest(cwd);
  if (manifest.subject !== 'collection') {
    throw cliError(I18N_KEYS.not_collection_manifest, { code: 4 });
  }
  return { path: file, data: toCollectionProject(manifest, loadState(cwd, 'collection').data) };
}

export function tryLoadCollectionProject(cwd?: string): { path: string; data: CollectionProject } | null {
  const loaded = tryLoadManifest(cwd);
  if (!loaded || loaded.data.subject !== 'collection') return null;
  return { path: loaded.path, data: toCollectionProject(loaded.data, loadState(cwd, 'collection').data) };
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

export function writeCollectionProject(data: CollectionProject, cwd?: string): string {
  return saveCollectionProject(data, cwd);
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
