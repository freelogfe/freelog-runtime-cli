import { consola } from 'consola';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import {
  loadResourceConfig,
  saveResourceConfig,
  saveVersionConfig,
  tryLoadVersionConfig,
} from '../config/read.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import type { ResourceShell, VersionShell } from '../config/writeShell.js';

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
  // 延迟 require 形状：由调用方 prefer draftService，避免 sync↔draft 静态环
  const draftMod = await import('./draftService.js');
  const remote = await draftMod.lookRemoteVersionDraft(resourceId);
  if (!remote.exists || !remote.draftData) {
    return { exists: false };
  }
  const { fingerprint } = await import('../adapters/versionDraftAdapter.js');
  return {
    exists: true,
    updateDate: remote.updateDate,
    version: remote.draftData.versionInput,
    fingerprint: fingerprint(remote.draftData),
    raw: remote.raw,
  };
}

function applyOwnerToResource(local: ResourceShell, info: PlatformResourceInfo): ResourceShell {
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

function listingDrifted(local: ResourceShell, info: PlatformResourceInfo): boolean {
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

export interface EnsureOwnerResult {
  auth: ReturnType<typeof requireAuth>;
  resource: ResourceShell;
  info: PlatformResourceInfo;
  version?: VersionShell;
}

export async function ensureOwner(opts: {
  cwd?: string;
  allowCreateWithoutId?: boolean;
}): Promise<EnsureOwnerResult> {
  const auth = requireAuth();
  const { data: resource } = loadResourceConfig(opts.cwd);
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
      hint: 'freelog-cli create --type <code> --title …',
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

  const nextResource = applyOwnerToResource(resource, info);
  if (info.username && resource.username && info.username !== resource.username) {
    consola.warn(`username 已以平台为准更新: ${resource.username} → ${info.username}`);
  }
  saveResourceConfig(nextResource, opts.cwd);

  let version: VersionShell | undefined;
  const versionLoaded = tryLoadVersionConfig(opts.cwd);
  if (versionLoaded) {
    version = {
      ...versionLoaded.data,
      resourceId: info.resourceId,
      userId: info.userId,
      username: info.username,
    };
    saveVersionConfig(version, opts.cwd);
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
}): Promise<{
  resource: ResourceShell;
  version?: VersionShell;
  info: PlatformResourceInfo;
}> {
  const auth = requireAuth();
  const { data: resource } = loadResourceConfig(opts.cwd);
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

  const nextResource = applyOwnerToResource(resource, info);
  saveResourceConfig(nextResource, opts.cwd);

  let version: VersionShell | undefined;
  const versionLoaded = tryLoadVersionConfig(opts.cwd);
  const targetVersion = opts.version || versionLoaded?.data.version || info.latestVersion;
  if (versionLoaded) {
    version = {
      ...versionLoaded.data,
      resourceId: info.resourceId,
      resourceName: info.resourceName || versionLoaded.data.resourceName,
      userId: info.userId,
      username: info.username,
      version: opts.version || versionLoaded.data.version,
    };
    saveVersionConfig(version, opts.cwd);
  } else if (targetVersion) {
    version = {
      resourceId: info.resourceId,
      resourceName: info.resourceName,
      version: targetVersion,
      filePath: 'dist',
      userId: info.userId,
      username: info.username,
    };
    saveVersionConfig(version, opts.cwd);
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
