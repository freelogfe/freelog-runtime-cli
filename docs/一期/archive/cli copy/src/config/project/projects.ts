import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  createResourceManifest,
  loadManifest,
  loadProjectSnapshot,
  loadState,
  saveProjectSnapshot,
  saveState,
  statePath,
  tryLoadManifest,
  tryLoadProjectSnapshot,
  withProjectWriteLock,
} from './store.js';
import {
  applyPlatformResourceState,
  applyResourceProject,
  listingFingerprint,
  shortName,
  toCollectionProject,
  toResourceProject,
  toVersionProject,
} from './mapping.js';
import { assertProjectRevision, attachProjectRevision } from './revision.js';
export { listingFingerprint, shortName } from './mapping.js';
export { mergeProjectPatch } from './revision.js';
import type {
  CollectionProject,
  FreelogState,
  ProjectSubject,
  ResourceProject,
  RuntimeVersion,
  VersionProject,
} from './types.js';

/**
 * manifest/state 与业务 Project DTO 的唯一映射层。
 * manifest 保存用户意图，state 保存平台事实。普通保存校验完整快照 revision；平台写已确认
 * 时也只能在校验 resourceId/owner 后最小合并平台事实，不能覆盖并发产生的新本地意图。
 */
export interface SavePlatformFactsOptions {
  /** 仅在平台副作用已确认发生后使用；只把平台拥有的字段合并到最新 state。 */
  remoteWriteConfirmed?: boolean;
}

/**
 * remoteWriteConfirmed 只能跳过“本地快照是否过期”的 revision 检查，不能跳过资源归属检查。
 * 平台已经产生副作用时，当前目录若已被重新绑定，宁可报告本地待人工对账，也绝不能把远端事实
 * 写回新资源的 state。
 */
function assertPlatformBinding(data: ResourceProject, state: FreelogState): void {
  const currentResourceId = state.resource.resourceId?.trim();
  const incomingResourceId = data.resourceId?.trim();
  if (!currentResourceId || !incomingResourceId || currentResourceId !== incomingResourceId) {
    throw cliError(I18N_KEYS.project_revision_conflict, {
      code: 3,
      details: { currentResourceId, incomingResourceId },
      hint: '平台写入已完成，但当前目录已绑定到另一资源；请保留现场并人工核对',
    });
  }
  const currentOwner = state.resource.owner?.userId;
  const incomingOwner = data.userId;
  if (
    currentOwner !== null &&
    currentOwner !== undefined &&
    incomingOwner !== undefined &&
    String(currentOwner) !== String(incomingOwner)
  ) {
    throw cliError(I18N_KEYS.project_revision_conflict, {
      code: 3,
      details: { currentOwner, incomingOwner },
      hint: '平台写入已完成，但当前目录 owner 已变化；请保留现场并人工核对',
    });
  }
}

/**
 * 普通本地意图保存：必须匹配完整 revision，随后一次性提交 manifest/state。不要用它记录已确认的
 * 平台写结果；后者应调用 savePlatformResourceState 并显式传 remoteWriteConfirmed。
 */
export function persistResourceProject(
  data: ResourceProject,
  cwd?: string,
  subject: ProjectSubject = 'resource',
): string {
  return withProjectWriteLock(cwd, () => {
    const loaded = tryLoadManifest(cwd);
    const manifest =
      loaded?.data ||
      createResourceManifest({
        subject,
        resourceName: shortName(data.resourceName, data.resourceTitle || 'resource'),
        resourceTypeCode: data.resourceTypeCode || '',
        resourceTypeName: data.resourceTypeName,
        resourceTitle: data.resourceTitle || shortName(data.resourceName, 'resource'),
      });
    const state = loadState(cwd, subject).data;
    assertProjectRevision(data, manifest, state);
    applyResourceProject(manifest, state, data, subject);
    const file = saveProjectSnapshot(manifest, state, cwd);
    attachProjectRevision(data, manifest, state);
    return file;
  });
}

/** 读取资源工程的 manifest 意图与 state 事实并映射为 ResourceProject；subject 不匹配时明确失败。 */
export function loadResourceProject(cwd?: string): { path: string; data: ResourceProject } {
  const { manifestPath: file, manifest, state } = loadProjectSnapshot(cwd);
  if (manifest.subject !== 'resource') {
    throw cliError(I18N_KEYS.not_single_resource_manifest, { code: 4 });
  }
  return {
    path: file,
    data: attachProjectRevision(toResourceProject(manifest, state), manifest, state),
  };
}

/** 可选读取资源工程；目录没有 manifest 或 manifest 属于合集时返回 null，不吞掉损坏文件错误。 */
export function tryLoadResourceProject(cwd?: string): { path: string; data: ResourceProject } | null {
  const loaded = tryLoadProjectSnapshot(cwd);
  if (!loaded || loaded.manifest.subject !== 'resource') return null;
  return {
    path: loaded.manifestPath,
    data: attachProjectRevision(
      toResourceProject(loaded.manifest, loaded.state),
      loaded.manifest,
      loaded.state,
    ),
  };
}

/** 保存资源本地意图；完整 revision 与 manifest/state 成对事务由 persistResourceProject 承担。 */
export function saveResourceProject(data: ResourceProject, cwd?: string): string {
  return persistResourceProject(data, cwd, 'resource');
}

/**
 * 平台事实回写入口。远端尚未确认时仍按完整 revision 防止陈旧 DTO 覆盖本地意图；确认成功后只允许
 * 更新 state 拥有的事实字段，并通过 assertPlatformBinding 防止跨资源写入。
 */
export function savePlatformResourceState(
  data: ResourceProject,
  cwd?: string,
  subject: ProjectSubject = 'resource',
  options: SavePlatformFactsOptions = {},
): string {
  return withProjectWriteLock(cwd, () => {
    const state = loadState(cwd, subject).data;
    const manifest = loadManifest(cwd).data;
    if (options.remoteWriteConfirmed) assertPlatformBinding(data, state);
    else assertProjectRevision(data, manifest, state);
    applyPlatformResourceState(state, data, subject);
    state.sync = {
      ...state.sync,
      lastPulledAt: new Date().toISOString(),
      listingFingerprint: listingFingerprint(data),
      platformUpdateDate:
        (data as { updateDate?: string }).updateDate ?? state.sync.platformUpdateDate ?? null,
    };
    saveState(state, cwd);
    attachProjectRevision(data, manifest, state);
    return statePath(cwd);
  });
}

/** `saveResourceProject` 的语义别名，保留给初始化/批量写入调用方使用。 */
export function writeResourceProject(data: ResourceProject, cwd?: string): string {
  return saveResourceProject(data, cwd);
}

/** 创建尚未绑定平台的资源 DTO；只构造内存模板，不创建文件、不调用平台。 */
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

/** 读取资源工程中的版本意图和已发布事实；合集 manifest 不能通过此入口伪装成资源版本。 */
export function loadVersionProject(cwd?: string): { path: string; data: VersionProject } {
  const { manifestPath: file, manifest, state } = loadProjectSnapshot(cwd);
  if (manifest.subject !== 'resource') {
    throw cliError(I18N_KEYS.not_single_resource_manifest, { code: 4 });
  }
  return {
    path: file,
    data: attachProjectRevision(toVersionProject(manifest, state), manifest, state),
  };
}

/** 可选读取资源版本工程；仅“没有该 subject”返回 null，schema/环境/状态损坏继续抛错。 */
export function tryLoadVersionProject(cwd?: string): { path: string; data: VersionProject } | null {
  const loaded = tryLoadProjectSnapshot(cwd);
  if (!loaded || loaded.manifest.subject !== 'resource') return null;
  return {
    path: loaded.manifestPath,
    data: attachProjectRevision(
      toVersionProject(loaded.manifest, loaded.state),
      loaded.manifest,
      loaded.state,
    ),
  };
}

/** 保存版本意图并同步维护 state.version；修改版本/产物输入会清除旧发布事实，避免假装仍已发布。 */
export function saveVersionProject(data: VersionProject, cwd?: string): string {
  return withProjectWriteLock(cwd, () => {
    const { data: manifest } = loadManifest(cwd);
    if (manifest.subject !== 'resource') {
      throw cliError(I18N_KEYS.not_single_resource_manifest, { code: 4 });
    }
    const state = loadState(cwd, 'resource').data;
    assertProjectRevision(data, manifest, state);
    const previousVersion = manifest.version?.version;
    const previousFilePath = manifest.version?.filePath;
    const previousArtifactMode = manifest.version?.artifactMode;
    const published = data.published === true;
    const reuseIntent =
      data.reusePlatformFile === true || (!data.filePath?.trim() && !!data.fileSha1?.trim());
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
      reusePlatformFile: data.reusePlatformFile || undefined,
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
      resourceTypeCode:
        data.resourceTypeCode || state.resource.resourceTypeCode || manifest.resource.typeCode,
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
          : reuseIntent
            ? data.fileSha1 ?? null
            : changedPublishInput
              ? null
              : data.fileSha1 !== undefined
                ? data.fileSha1
                : state.version.fileSha1 ?? null,
      filename:
        published
          ? data.filename
          : reuseIntent
            ? data.filename ?? null
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
    const file = saveProjectSnapshot(manifest, state, cwd);
    attachProjectRevision(data, manifest, state);
    return file;
  });
}

/** `saveVersionProject` 的语义别名，供批量/初始化写入使用。 */
export function writeVersionProject(data: VersionProject, cwd?: string): string {
  return saveVersionProject(data, cwd);
}

/** 创建版本 DTO 模板；不会写 manifest，调用方需在明确选择工程目录后再保存。 */
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

/** 读取合集工程的本地意图与平台事实；resource manifest 通过此入口会明确失败。 */
export function loadCollectionProject(cwd?: string): { path: string; data: CollectionProject } {
  const { manifestPath: file, manifest, state } = loadProjectSnapshot(cwd);
  if (manifest.subject !== 'collection') {
    throw cliError(I18N_KEYS.not_collection_manifest, { code: 4 });
  }
  return {
    path: file,
    data: attachProjectRevision(toCollectionProject(manifest, state), manifest, state),
  };
}

/** 可选读取合集工程；只把“没有合集 manifest”表示为 null，不隐藏损坏或环境不匹配。 */
export function tryLoadCollectionProject(
  cwd?: string,
): { path: string; data: CollectionProject } | null {
  const loaded = tryLoadProjectSnapshot(cwd);
  if (!loaded || loaded.manifest.subject !== 'collection') return null;
  return {
    path: loaded.manifestPath,
    data: attachProjectRevision(
      toCollectionProject(loaded.manifest, loaded.state),
      loaded.manifest,
      loaded.state,
    ),
  };
}

/** 合集平台写确认后的事实回写，同时更新目录草稿、collect-rules 和 RSS 状态。 */
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
  options: SavePlatformFactsOptions = {},
): string {
  return withProjectWriteLock(cwd, () => {
    const state = loadState(cwd, 'collection').data;
    const manifest = loadManifest(cwd).data;
    if (options.remoteWriteConfirmed) assertPlatformBinding(data, state);
    else assertProjectRevision(data, manifest, state);
    applyPlatformResourceState(state, data, 'collection');
    state.sync = {
      ...state.sync,
      lastPulledAt: new Date().toISOString(),
      listingFingerprint: listingFingerprint(data),
      platformUpdateDate:
        (data as { updateDate?: string }).updateDate ?? state.sync.platformUpdateDate ?? null,
    };
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
        updates.collectRules === undefined
          ? state.collection.collectRules ?? null
          : updates.collectRules,
      rss: updates.rss === undefined ? state.collection.rss ?? null : updates.rss,
    };
    saveState(state, cwd);
    attachProjectRevision(data, manifest, state);
    return statePath(cwd);
  });
}

/** 保存合集本地意图与合集专属 manifest/state 字段；平台事实写入应走 savePlatformCollectionState。 */
export function saveCollectionProject(data: CollectionProject, cwd?: string): string {
  return withProjectWriteLock(cwd, () => {
    const loaded = tryLoadManifest(cwd);
    const manifest =
      loaded?.data ||
      createResourceManifest({
        subject: 'collection',
        resourceName: shortName(data.resourceName, data.resourceTitle || 'collection'),
        resourceTypeCode: data.resourceTypeCode || '',
        resourceTypeName: data.resourceTypeName,
        resourceTitle: data.resourceTitle || shortName(data.resourceName, 'collection'),
      });
    const state = loadState(cwd, 'collection').data;
    assertProjectRevision(data, manifest, state);
    applyResourceProject(manifest, state, data, 'collection');
    manifest.collection = {
      ...(manifest.collection || {}),
      version: data.version || manifest.collection?.version || '1.0.0',
      description: data.description ?? manifest.collection?.description ?? '',
      display: data.display || manifest.collection?.display || {},
      items: manifest.collection?.items || [],
      collectRules: data.collectRules ?? manifest.collection?.collectRules ?? null,
      rssFeedUrl: data.rssFeedUrl || manifest.collection?.rssFeedUrl,
      dependencies: data.dependencies || manifest.collection?.dependencies || [],
      baseUpcastResources: data.baseUpcastResources || manifest.collection?.baseUpcastResources || [],
      authExcludedItems: data.authExcludedItems || manifest.collection?.authExcludedItems || [],
      inputAttrs: data.inputAttrs || manifest.collection?.inputAttrs || [],
      customPropertyDescriptors:
        data.customPropertyDescriptors || manifest.collection?.customPropertyDescriptors || [],
    };
    state.collection = {
      ...state.collection,
      catalogueDraft: data.catalogueItems || state.collection.catalogueDraft || [],
      catalogueProperty: data.display || state.collection.catalogueProperty || {},
      collectRules: data.collectRules ?? state.collection.collectRules,
      rss: data.rssFeedUrl ? { feedUrl: data.rssFeedUrl } : state.collection.rss,
      draftSync: data.draftSync === undefined ? state.collection.draftSync ?? null : data.draftSync,
    };
    const file = saveProjectSnapshot(manifest, state, cwd);
    attachProjectRevision(data, manifest, state);
    return file;
  });
}

/** `saveCollectionProject` 的语义别名，供合集初始化和批处理使用。 */
export function writeCollectionProject(data: CollectionProject, cwd?: string): string {
  return saveCollectionProject(data, cwd);
}

/** 创建尚未绑定平台的合集 DTO；只返回内存模板，不落盘。 */
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
