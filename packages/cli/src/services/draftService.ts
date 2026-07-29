import { consola } from 'consola';
import { CliError } from '../core/errors.js';
import { loadVersionConfig, saveVersionConfig } from '../config/read.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import type { VersionShell } from '../config/writeShell.js';
import {
  applyDraftToVersionConfig,
  buildDraftSync,
  decideDraftPush,
  fingerprint,
  toDraftData,
  type ResourceVersionDraftData,
} from '../adapters/versionDraftAdapter.js';
import { ensureOwner, ensureSynced } from './syncService.js';
import { uploadFileIfNeeded } from './storageUpload.js';
import { cleanupTempFile, processFileForPublish } from './processFile.js';

export interface RemoteVersionDraft {
  exists: boolean;
  resourceId?: string;
  updateDate?: string;
  draftData?: ResourceVersionDraftData;
  raw?: unknown;
}

export async function lookRemoteVersionDraft(resourceId: string): Promise<RemoteVersionDraft> {
  try {
    const envelope = await FServiceAPI.Resource.lookDraft({ resourceId });
    const data = unwrapData<Record<string, unknown> | null>(envelope);
    if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
      return { exists: false };
    }
    const draftData = (data.draftData ?? data) as ResourceVersionDraftData;
    // 平台偶发把整包当 data；无 versionInput 且无 draftData 字段则视为无草稿
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
      resourceId: (data.resourceId as string) || resourceId,
      updateDate: (data.updateDate || data.updateDateTime || data.modifyDate) as string | undefined,
      draftData: (data.draftData as ResourceVersionDraftData) || draftData,
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

async function maybeUploadForDraft(
  config: VersionShell,
  cwd: string | undefined,
  upload: boolean,
  resourceName: string,
  resourceType?: string | string[],
  resourceTypeCode?: string,
): Promise<VersionShell> {
  if (!upload) return config;
  if (!config.filePath?.trim()) {
    consola.warn('--upload 已指定但 version.config 无 filePath，跳过上传');
    return config;
  }
  const processed = await processFileForPublish({
    versionConfig: config,
    resourceName,
    resourceType: resourceType ?? config.resourceType,
    resourceTypeCode,
    cwd,
  });
  try {
    await uploadFileIfNeeded(processed.filePath, processed.fileSha1);
    return {
      ...config,
      fileSha1: processed.fileSha1,
      filename: processed.filename,
    };
  } finally {
    if (processed.isTempFile) cleanupTempFile(processed.filePath);
  }
}

export async function draftPush(opts: {
  cwd?: string;
  force?: boolean;
  upload?: boolean;
  noAutoPull?: boolean;
}): Promise<{
  resourceId: string;
  fingerprint: string;
  reason: string;
  skippedPost: boolean;
}> {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  let { data: config } = loadVersionConfig(opts.cwd);

  config = await maybeUploadForDraft(
    config,
    opts.cwd,
    Boolean(opts.upload),
    ctx.resource.resourceName || config.resourceName || 'resource',
    ctx.resource.resourceType || config.resourceType,
    ctx.resource.resourceTypeCode,
  );

  const localDraft = toDraftData(config);
  const localFp = fingerprint(localDraft);
  const remoteLook = await lookRemoteVersionDraft(resourceId);
  const remote =
    remoteLook.exists && remoteLook.draftData
      ? { draftData: remoteLook.draftData, updateDate: remoteLook.updateDate }
      : null;

  const decision = decideDraftPush({
    localFp,
    remote,
    sync: config.draftSync,
    force: opts.force,
  });

  if (decision.action === 'conflict') {
    throw new CliError(
      decision.reason === 'remote-exists-without-sync'
        ? '远端已有发版草稿，且与本地不一致'
        : decision.reason === 'both-dirty'
          ? '本地与平台发版草稿均有变更'
          : '平台发版草稿已更新',
      {
        code: 3,
        details: { error: 'DRAFT_CONFLICT', reason: decision.reason },
        hint: decision.hint,
      },
    );
  }

  let skippedPost = false;
  let updateDate = remoteLook.updateDate;

  if (decision.reason === 'aligned') {
    skippedPost = true;
  } else {
    const saveEnv = await FServiceAPI.Resource.saveVersionsDraft({
      resourceId,
      draftData: localDraft,
    });
    const saved = unwrapData<Record<string, unknown>>(saveEnv);
    updateDate =
      (saved?.updateDate as string | undefined) ||
      (saved?.updateDateTime as string | undefined) ||
      new Date().toISOString();
  }

  // 再 look 一次拿平台 updateDate（若 save 未回）
  if (!skippedPost) {
    const after = await lookRemoteVersionDraft(resourceId);
    if (after.updateDate) updateDate = after.updateDate;
  }

  const next: VersionShell = {
    ...config,
    resourceId,
    userId: ctx.resource.userId,
    username: ctx.resource.username,
    draftSync: buildDraftSync(localDraft, updateDate, !skippedPost),
  };
  // aligned：保留/刷新 fingerprint，补 lastRemoteUpdateDate
  if (skippedPost && next.draftSync) {
    next.draftSync = {
      ...next.draftSync,
      lastRemoteUpdateDate: updateDate || next.draftSync.lastRemoteUpdateDate,
    };
  }

  saveVersionConfig(next, opts.cwd);
  return {
    resourceId,
    fingerprint: localFp,
    reason: decision.reason,
    skippedPost,
  };
}

export async function draftPull(opts: {
  cwd?: string;
  noAutoPull?: boolean;
}): Promise<{
  resourceId: string;
  fingerprint: string;
  updateDate?: string;
  version: string;
}> {
  const ctx = await ensureOwner({ cwd: opts.cwd });
  const resourceId = ctx.resource.resourceId!;
  const remote = await lookRemoteVersionDraft(resourceId);
  if (!remote.exists || !remote.draftData) {
    throw new CliError('无平台发版草稿', {
      code: 4,
      hint: '先 freelog-cli draft push，或在 Console 打开发版页',
    });
  }

  const { data: config } = loadVersionConfig(opts.cwd);
  const filePath = config.filePath;
  const applied = applyDraftToVersionConfig(config, remote.draftData);
  applied.filePath = filePath;
  applied.resourceId = config.resourceId || resourceId;
  applied.userId = config.userId ?? ctx.resource.userId;
  applied.username = config.username ?? ctx.resource.username;
  applied.resourceName = config.resourceName;
  applied.resourceType = config.resourceType;
  applied.draftSync = buildDraftSync(remote.draftData, remote.updateDate, false);

  saveVersionConfig(applied, opts.cwd);
  return {
    resourceId,
    fingerprint: applied.draftSync!.lastFingerprint,
    updateDate: remote.updateDate,
    version: applied.version,
  };
}

export async function draftDiscard(opts: {
  cwd?: string;
}): Promise<{ resourceId: string; existed: boolean }> {
  const ctx = await ensureOwner({ cwd: opts.cwd });
  const resourceId = ctx.resource.resourceId!;
  const before = await lookRemoteVersionDraft(resourceId);

  try {
    await FServiceAPI.Resource.deleteResourceDraft({ resourceId });
  } catch (error) {
    if (before.exists) throw error;
    // 无草稿时 DELETE 失败 → 幂等成功
    consola.warn('平台无发版草稿或删除已完成');
  }

  const loaded = loadVersionConfig(opts.cwd);
  const next: VersionShell = { ...loaded.data, draftSync: undefined };
  delete next.draftSync;
  saveVersionConfig(next, opts.cwd);

  return { resourceId, existed: before.exists };
}
