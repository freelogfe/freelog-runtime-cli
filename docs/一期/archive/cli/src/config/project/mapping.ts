import type {
  CollectionProject,
  FreelogManifest,
  FreelogState,
  ProjectSubject,
  ResourceProject,
  VersionProject,
} from './types.js';

/**
 * manifest/state 与业务 DTO 的无 I/O 映射。
 *
 * 这里不读取文件、不申请锁；持久化编排由 projects.ts 负责。把映射放在单独模块，是为了让
 * resource/version/collection 的字段归属可以独立审阅和单测，而不把它和事务代码混在一起。
 */

/**
 * 将平台可能带命名空间的名称压成 manifest.identity.name 使用的短名。
 * 这是纯函数：不会调用 API，也不会把结果写回工程；调用方决定何时持久化。
 */
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

/**
 * 为资源展示意图生成稳定指纹。
 * 指纹只覆盖 title/intro/coverImages/tags，用于判断 Console 展示字段是否发生漂移，
 * 不包含 resourceId、status、latestVersion 等平台事实。
 */
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

/** 将 manifest 中的用户展示意图与 state 中的平台事实组合成资源 DTO，不产生 I/O。 */
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

/** 将版本发布意图和平台发布事实组合成版本 DTO；state 优先提供 resource/version 标识。 */
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
    reusePlatformFile: version.reusePlatformFile,
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

/** 组合合集 DTO；合集展示/发行意图优先取 manifest，旧 state 字段仅作兼容回退。 */
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

/** 将平台资源事实写入 state；不会覆盖 manifest 中的用户 listing 意图。 */
export function applyPlatformResourceState(
  state: FreelogState,
  data: ResourceProject,
  subject: ProjectSubject,
): void {
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
}

/** 将资源 DTO 拆回 manifest 意图与 state 事实两条边界，供 pull/bind 等同步路径使用。 */
export function applyResourceProject(
  manifest: FreelogManifest,
  state: FreelogState,
  data: ResourceProject,
  subject: ProjectSubject,
): void {
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
  applyPlatformResourceState(state, data, subject);
  state.resource.resourceTypeCode =
    data.resourceTypeCode || state.resource.resourceTypeCode || manifest.resource.typeCode;
  state.resource.resourceTypeName =
    data.resourceTypeName || state.resource.resourceTypeName || manifest.resource.typeName || null;
}
