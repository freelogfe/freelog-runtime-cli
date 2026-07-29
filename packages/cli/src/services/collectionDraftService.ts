import { consola } from 'consola';
import { CliError } from '../core/errors.js';
import { loadCollectionConfig, saveCollectionConfig } from '../config/read.js';
import { FServiceAPI } from '../platform/index.js';
import {
  applyCollectionDraft,
  buildCollectionDraftSync,
  fingerprintCollectionDraft,
  toCollectionDraftData,
  type CollectionVersionDraftData,
} from '../adapters/collectionVersionDraftAdapter.js';
import { ensureCollectionSynced, ensureCollectionOwner } from './collectionService.js';
import { lookRemoteVersionDraft } from './draftService.js';

export async function collectionDraftPush(opts: {
  cwd?: string;
  force?: boolean;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.collection.resourceId!;
  const { data: config } = loadCollectionConfig(opts.cwd);
  const localDraft = toCollectionDraftData(config);
  const localFp = fingerprintCollectionDraft(localDraft);

  const remoteLook = await lookRemoteVersionDraft(resourceId);
  const remoteDraft =
    remoteLook.exists && remoteLook.draftData
      ? (remoteLook.draftData as CollectionVersionDraftData)
      : null;

  if (remoteDraft && !opts.force) {
    const remoteFp = fingerprintCollectionDraft(remoteDraft);
    if (localFp !== remoteFp) {
      const sync = config.draftSync;
      if (!sync?.lastFingerprint) {
        throw new CliError('远端已有合集发版草稿，且与本地不一致', {
          code: 3,
          hint: 'freelog-cli draft pull --collection 或 draft push --collection --force',
        });
      }
      const localDirty = localFp !== sync.lastFingerprint;
      const remoteDirty = remoteFp !== sync.lastFingerprint;
      if (localDirty && remoteDirty) {
        throw new CliError('本地与平台合集发版草稿均有变更', {
          code: 3,
          hint: 'draft pull --collection 或 --force',
        });
      }
      if (!localDirty && remoteDirty) {
        throw new CliError('平台合集发版草稿已更新', {
          code: 3,
          hint: 'draft pull --collection 或 --force',
        });
      }
    }
  }

  let skippedPost = false;
  let updateDate = remoteLook.updateDate;
  if (remoteDraft && localFp === fingerprintCollectionDraft(remoteDraft) && !opts.force) {
    skippedPost = true;
  } else {
    await FServiceAPI.Resource.saveVersionsDraft({
      resourceId,
      draftData: localDraft,
    });
    const after = await lookRemoteVersionDraft(resourceId);
    updateDate = after.updateDate || new Date().toISOString();
  }

  saveCollectionConfig(
    {
      ...config,
      resourceId,
      userId: ctx.collection.userId,
      username: ctx.collection.username,
      draftSync: buildCollectionDraftSync(localDraft, updateDate, !skippedPost),
    },
    opts.cwd,
  );

  return { resourceId, fingerprint: localFp, skippedPost, reason: skippedPost ? 'aligned' : 'saved' };
}

export async function collectionDraftPull(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const resourceId = ctx.collection.resourceId!;
  const remote = await lookRemoteVersionDraft(resourceId);
  if (!remote.exists || !remote.draftData) {
    throw new CliError('无平台合集发版草稿', { code: 4, hint: 'draft push --collection' });
  }
  const { data: config } = loadCollectionConfig(opts.cwd);
  const applied = applyCollectionDraft(config, remote.draftData as CollectionVersionDraftData);
  applied.draftSync = buildCollectionDraftSync(
    remote.draftData as CollectionVersionDraftData,
    remote.updateDate,
    false,
  );
  saveCollectionConfig(applied, opts.cwd);
  return {
    resourceId,
    fingerprint: applied.draftSync!.lastFingerprint,
    version: applied.version,
  };
}

export async function collectionDraftDiscard(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const resourceId = ctx.collection.resourceId!;
  const before = await lookRemoteVersionDraft(resourceId);
  try {
    await FServiceAPI.Resource.deleteResourceDraft({ resourceId });
  } catch (error) {
    if (before.exists) throw error;
    consola.warn('平台无合集发版草稿或删除已完成');
  }
  const { data } = loadCollectionConfig(opts.cwd);
  const next = { ...data };
  delete next.draftSync;
  saveCollectionConfig(next, opts.cwd);
  return { resourceId, existed: before.exists };
}
