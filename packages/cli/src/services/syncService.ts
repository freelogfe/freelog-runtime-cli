import { consola } from 'consola';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import {
  loadResourceProject,
  listingFingerprint,
  loadState,
  savePlatformResourceState,
  saveResourceProject,
  saveVersionProject,
  tryLoadVersionProject,
} from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import type { ResourceProject, VersionProject } from '../config/project.js';
import { fingerprint, type ResourceVersionDraftData } from '../adapters/versionDraftAdapter.js';

export interface PlatformResourceInfo {
  resourceId: string;
  resourceName?: string;
  resourceType?: string[];
  resourceTypeCode?: string;
  resourceTitle?: string;
  intro?: string;
  coverImages?: string[];
  tags?: string[];
  userId?: number | string;
  username?: string;
  latestVersion?: string;
  status?: number;
  policies?: Array<{ policyId?: string; policyName?: string; status?: number }>;
  updateDate?: string;
}

export interface PlatformVersionDraft {
  exists: boolean;
  updateDate?: string;
  version?: string;
  fingerprint?: string;
  raw?: unknown;
}

export async function fetchResourceInfo(resourceIdOrName: string): Promise<PlatformResourceInfo> {
  const envelope = await FServiceAPI.Resource.info({
    resourceIdOrName,
    isLoadPolicyInfo: 1,
    isLoadLatestVersionInfo: 1,
  });
  const data = unwrapData<PlatformResourceInfo>(envelope);
  if (!data?.resourceId && !(data as { resourceID?: string })?.resourceID) {
    throw new CliError('平台未返回资源信息', { code: 1, details: data });
  }
  const anyData = data as PlatformResourceInfo & { resourceID?: string };
  return {
    ...data,
    resourceId: data.resourceId || anyData.resourceID || resourceIdOrName,
  };
}

/** 兼容旧调用；status 已直连 lookRemoteVersionDraft */
export async function fetchVersionDraft(resourceId: string): Promise<PlatformVersionDraft> {
  try {
    const envelope = await FServiceAPI.Resource.lookDraft({ resourceId });
    const data = unwrapData<Record<string, unknown> | null>(envelope);
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return { exists: false };
    }

    const draftData = (data.draftData ?? data) as ResourceVersionDraftData;
    const hasShape =
      data.draftData !== undefined ||
      draftData.versionInput !== undefined ||
      draftData.selectedFileInfo !== undefined ||
      draftData.descriptionEditorInput !== undefined ||
      Array.isArray(draftData.directDependencies);

    if (!hasShape && !data.updateDate) {
      return { exists: false };
    }

    return {
      exists: true,
      updateDate: (data.updateDate || data.updateDateTime || data.modifyDate) as string | undefined,
      version: draftData.versionInput,
      fingerprint: fingerprint(draftData),
      raw: data,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (/404|不存在|not\s*found|无草稿/i.test(msg)) {
      return { exists: false };
    }
    throw error;
  }
}

function applyOwnerToResource(local: ResourceProject, info: PlatformResourceInfo): ResourceProject {
  return {
    ...local,
    resourceId: info.resourceId || local.resourceId,
    resourceName: info.resourceName || local.resourceName,
    resourceType: info.resourceType || local.resourceType,
    resourceTypeCode: info.resourceTypeCode || local.resourceTypeCode,
    resourceTitle: info.resourceTitle || local.resourceTitle,
    intro: info.intro ?? local.intro,
    coverImages: info.coverImages ?? local.coverImages,
    tags: info.tags ?? local.tags,
    userId: info.userId,
    username: info.username,
  };
}

function applyPlatformFactsToResource(local: ResourceProject, info: PlatformResourceInfo): ResourceProject {
  return {
    ...local,
    resourceId: info.resourceId || local.resourceId,
    resourceName: info.resourceName || local.resourceName,
    resourceType: info.resourceType || local.resourceType,
    resourceTypeCode: info.resourceTypeCode || local.resourceTypeCode,
    userId: info.userId,
    username: info.username,
    status: info.status,
    latestVersion: info.latestVersion,
    policies: info.policies || local.policies,
  };
}

function listingDrifted(local: ResourceProject, info: PlatformResourceInfo): boolean {
  const norm = (v: unknown) => JSON.stringify(v ?? null);
  return (
    (local.resourceTitle !== undefined &&
      info.resourceTitle !== undefined &&
      local.resourceTitle !== info.resourceTitle) ||
    (local.intro !== undefined && info.intro !== undefined && local.intro !== info.intro) ||
    (local.tags !== undefined && info.tags !== undefined && norm(local.tags) !== norm(info.tags)) ||
    (local.coverImages !== undefined &&
      info.coverImages !== undefined &&
      norm(local.coverImages) !== norm(info.coverImages))
  );
}

export function assertApplyListingAllowed(opts: {
  local: ResourceProject;
  info: PlatformResourceInfo;
  cwd?: string;
  force?: boolean;
  collection?: boolean;
}): void {
  if (opts.force) return;
  const subject = opts.collection ? 'collection' : 'resource';
  const state = loadState(opts.cwd, subject).data;
  const baseline = state.sync.listingFingerprint;
  const localChangedSinceBaseline = baseline
    ? listingFingerprint(opts.local) !== baseline
    : listingDrifted(opts.local, opts.info);
  const platformChangedSinceBaseline = baseline
    ? listingFingerprint(opts.info) !== baseline
    : listingDrifted(opts.local, opts.info);
  if (localChangedSinceBaseline && platformChangedSinceBaseline) {
    throw new CliError('平台 listing 与本地 manifest.resource 均有变更', {
      code: 3,
      hint: opts.collection
        ? '先手动合并，或确认采用平台 listing 后重试：freelog-cli pull --collection --apply-listing --force'
        : '先手动合并，或确认采用平台 listing 后重试：freelog-cli pull --apply-listing --force',
    });
  }
}

export interface EnsureOwnerResult {
  auth: ReturnType<typeof requireAuth>;
  resource: ResourceProject;
  info: PlatformResourceInfo;
  version?: VersionProject;
}

export async function ensureOwner(opts: {
  cwd?: string;
  allowCreateWithoutId?: boolean;
}): Promise<EnsureOwnerResult> {
  const auth = requireAuth();
  const { data: resource } = loadResourceProject(opts.cwd);
  const resourceId = resource.resourceId?.trim();

  if (!resourceId) {
    if (opts.allowCreateWithoutId) {
      return {
        auth,
        resource,
        info: { resourceId: '' },
      };
    }
    throw new CliError('本地无 resourceId，请先 create 或 pull', {
      code: 4,
      hint: '新目录先执行 freelog-cli init <name> --resource-type <code>，再执行 freelog-cli create',
    });
  }

  const info = await fetchResourceInfo(resourceId);
  const platformUserId = Number(info.userId);
  const authUserId = Number(auth.userId);
  if (!Number.isFinite(platformUserId) || !Number.isFinite(authUserId)) {
    throw new CliError('无法比对 Owner（缺少 userId）', { code: 2, hint: '重新 login' });
  }
  if (platformUserId !== authUserId) {
    throw new CliError(
      `资源属于 ${info.username || platformUserId}，当前登录为 ${auth.username || authUserId}`,
      { code: 2, hint: '切换账号或更换目录' },
    );
  }

  const nextResource = applyPlatformFactsToResource(resource, info);
  if (info.username && resource.username && info.username !== resource.username) {
    consola.warn(`username 已以平台为准更新: ${resource.username} → ${info.username}`);
  }
  savePlatformResourceState(nextResource, opts.cwd);

  let version: VersionProject | undefined;
  const versionLoaded = tryLoadVersionProject(opts.cwd);
  if (versionLoaded) {
    version = {
      ...versionLoaded.data,
      resourceId: info.resourceId,
      resourceName: info.resourceName || versionLoaded.data.resourceName,
      resourceTypeCode: info.resourceTypeCode || versionLoaded.data.resourceTypeCode,
      userId: info.userId,
      username: info.username,
    };
  }

  return { auth, resource: nextResource, info, version };
}

export async function ensureSynced(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  owner?: EnsureOwnerResult;
}): Promise<EnsureOwnerResult> {
  const owner = opts.owner || (await ensureOwner({ cwd: opts.cwd }));
  if (!owner.info.resourceId) return owner;

  const drifted = listingDrifted(owner.resource, owner.info);

  if (drifted) {
    if (opts.noAutoPull) {
      throw new CliError('本地与平台资源信息不一致', {
        code: 3,
        hint: 'freelog-cli pull 或去掉 --no-auto-pull',
      });
    }
    const pulled = await pullResourceToLocal({ cwd: opts.cwd });
    return {
      ...owner,
      resource: pulled.resource,
      info: pulled.info,
      version: pulled.version,
    };
  }

  return owner;
}

export async function pullResourceToLocal(opts: {
  cwd?: string;
  /** 若提供，写入本地 version 意图为该版本（不覆盖 filePath） */
  version?: string;
  applyListing?: boolean;
  force?: boolean;
}): Promise<{
  resource: ResourceProject;
  version?: VersionProject;
  info: PlatformResourceInfo;
}> {
  const auth = requireAuth();
  const { data: resource } = loadResourceProject(opts.cwd);
  const id = resource.resourceId?.trim() || resource.resourceName;
  if (!id) {
    throw new CliError('无法 pull：缺少 resourceId / resourceName', { code: 4 });
  }
  const info = await fetchResourceInfo(id);
  const authUserId = Number(auth.userId);
  const platformUserId = Number(info.userId);
  if (Number.isFinite(authUserId) && Number.isFinite(platformUserId) && authUserId !== platformUserId) {
    throw new CliError('无权 pull 他人资源到本地写缓存（Owner 不符）', { code: 2 });
  }

  const nextResource = opts.applyListing
    ? applyOwnerToResource(resource, info)
    : applyPlatformFactsToResource(resource, info);
  if (opts.applyListing) {
    assertApplyListingAllowed({ local: resource, info, cwd: opts.cwd, force: opts.force });
    saveResourceProject(nextResource, opts.cwd);
  } else {
    savePlatformResourceState(nextResource, opts.cwd);
  }

  let version: VersionProject | undefined;
  const versionLoaded = tryLoadVersionProject(opts.cwd);
  const targetVersion = opts.version || versionLoaded?.data.version || info.latestVersion;
  if (versionLoaded) {
    version = {
      ...versionLoaded.data,
      resourceId: info.resourceId,
      resourceName: info.resourceName || versionLoaded.data.resourceName,
      resourceTypeCode: info.resourceTypeCode || versionLoaded.data.resourceTypeCode,
      userId: info.userId,
      username: info.username,
      version: opts.version || versionLoaded.data.version,
    };
    if (opts.version) {
      saveVersionProject(version, opts.cwd);
    }
  } else if (targetVersion) {
    version = {
      resourceId: info.resourceId,
      resourceName: info.resourceName,
      resourceTypeCode: info.resourceTypeCode,
      version: targetVersion,
      filePath: 'dist',
      userId: info.userId,
      username: info.username,
    };
    if (opts.version) {
      saveVersionProject(version, opts.cwd);
    }
  }

  return { resource: nextResource, version, info };
}

/** 供单测：Owner 比较用 Number 对齐 */
export function ownersMatch(
  authUserId: number | string | undefined,
  platformUserId: number | string | undefined,
): boolean {
  const a = Number(authUserId);
  const b = Number(platformUserId);
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}
