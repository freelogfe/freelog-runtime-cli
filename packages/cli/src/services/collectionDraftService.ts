import { consola } from 'consola';
import { CliError } from '../core/errors.js';
import { loadCollectionProject, saveCollectionProject } from '../config/project.js';
import { FServiceAPI } from '../platform/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  applyCollectionDraft,
  buildCollectionDraftSync,
  fingerprintCollectionDraft,
  toCollectionDraftData,
  type CollectionVersionDraftData,
} from '../adapters/collectionVersionDraftAdapter.js';
import { ensureCollectionSynced, ensureCollectionOwner } from './collection/index.js';
import { lookRemoteVersionDraft } from './draftService.js';

export async function collectionDraftPush(opts: {
  cwd?: string;
  force?: boolean;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.collection.resourceId!;
  const { data: config } = loadCollectionProject(opts.cwd);
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
        throw cliError(I18N_KEYS.collection_draft_remote_conflict, {
          code: 3,
          details: { error: 'DRAFT_CONFLICT', reason: 'remote-exists-without-sync' },
          hint: 'freelog-cli draft pull --collection 或 draft push --collection --force',
        });
      }
      const localDirty = localFp !== sync.lastFingerprint;
      const remoteDirty = remoteFp !== sync.lastFingerprint;
      if (localDirty && remoteDirty) {
        throw cliError(I18N_KEYS.collection_draft_both_changed, {
          code: 3,
          details: { error: 'DRAFT_CONFLICT', reason: 'both-dirty' },
          hint: 'draft pull --collection 或 --force',
        });
      }
      if (!localDirty && remoteDirty) {
        throw cliError(I18N_KEYS.collection_draft_platform_updated, {
          code: 3,
          details: { error: 'DRAFT_CONFLICT', reason: 'remote-dirty' },
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

  saveCollectionProject(
    {
      ...config,
      resourceId,
      userId: ctx.collection.userId,
      username: ctx.collection.username,
      draftSync: buildCollectionDraftSync(localDraft, updateDate, !skippedPost),
    },
    opts.cwd,
  );

  const reason = skippedPost
    ? 'aligned'
    : opts.force
      ? 'force'
      : remoteDraft
        ? 'fast-forward'
        : 'no-remote';
  return { resourceId, fingerprint: localFp, skippedPost, reason };
}

export async function collectionDraftPull(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const resourceId = ctx.collection.resourceId!;
  const remote = await lookRemoteVersionDraft(resourceId);
  if (!remote.exists || !remote.draftData) {
    throw cliError(I18N_KEYS.no_platform_collection_draft, { code: 4, hint: 'draft push --collection' });
  }
  const { data: config } = loadCollectionProject(opts.cwd);
  const applied = applyCollectionDraft(config, remote.draftData as CollectionVersionDraftData);
  applied.draftSync = buildCollectionDraftSync(
    remote.draftData as CollectionVersionDraftData,
    remote.updateDate,
    false,
  );
  saveCollectionProject(applied, opts.cwd);
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
  const { data } = loadCollectionProject(opts.cwd);
  const next = { ...data, draftSync: null };
  saveCollectionProject(next, opts.cwd);
  return { resourceId, existed: before.exists };
}
