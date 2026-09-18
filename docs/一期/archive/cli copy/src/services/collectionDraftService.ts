import { consola } from 'consola';
import { FServiceAPI } from '../platform/index.js';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';
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
import { assertRssManagedContentEditable } from './collection/rssContract.js';
import { collectionStoreFromCwd } from './store/index.js';

export async function collectionDraftPush(opts: {
  cwd?: string;
  force?: boolean;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertRssManagedContentEditable(ctx.info, '推送合集发版草稿');
  const resourceId = ctx.collection.resourceId!;
  const store = collectionStoreFromCwd(opts.cwd);
  const config = store.load();
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

  store.savePatch(
    { draftSync: buildCollectionDraftSync(localDraft, updateDate, !skippedPost) },
    {
      expectedResourceId: resourceId,
      expected: { draftSync: config.draftSync },
    },
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
  assertRssManagedContentEditable(ctx.info, '拉取合集发版草稿');
  const resourceId = ctx.collection.resourceId!;
  const remote = await lookRemoteVersionDraft(resourceId);
  if (!remote.exists || !remote.draftData) {
    throw cliError(I18N_KEYS.no_platform_collection_draft, { code: 4, hint: 'draft push --collection' });
  }
  const store = collectionStoreFromCwd(opts.cwd);
  const config = store.load();
  const applied = applyCollectionDraft(config, remote.draftData as CollectionVersionDraftData);
  applied.draftSync = buildCollectionDraftSync(
    remote.draftData as CollectionVersionDraftData,
    remote.updateDate,
    false,
  );
  store.savePatch(
    {
      version: applied.version,
      description: applied.description,
      catalogueItems: applied.catalogueItems,
      display: applied.display,
      dependencies: applied.dependencies,
      baseUpcastResources: applied.baseUpcastResources,
      authExcludedItems: applied.authExcludedItems,
      inputAttrs: applied.inputAttrs,
      customPropertyDescriptors: applied.customPropertyDescriptors,
      draftSync: applied.draftSync,
    },
    {
      expectedResourceId: resourceId,
      expected: {
        version: config.version,
        description: config.description,
        catalogueItems: config.catalogueItems,
        display: config.display,
        dependencies: config.dependencies,
        baseUpcastResources: config.baseUpcastResources,
        authExcludedItems: config.authExcludedItems,
        inputAttrs: config.inputAttrs,
        customPropertyDescriptors: config.customPropertyDescriptors,
        draftSync: config.draftSync,
      },
    },
  );
  return {
    resourceId,
    fingerprint: applied.draftSync!.lastFingerprint,
    version: applied.version,
  };
}

export async function collectionDraftDiscard(opts: { cwd?: string }) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  assertRssManagedContentEditable(ctx.info, '删除合集发版草稿');
  const resourceId = ctx.collection.resourceId!;
  const before = await lookRemoteVersionDraft(resourceId);
  try {
    await FServiceAPI.Resource.deleteResourceDraft({ resourceId });
  } catch (error) {
    if (before.exists) throw error;
    consola.warn('平台无合集发版草稿或删除已完成');
  }
  const store = collectionStoreFromCwd(opts.cwd);
  const data = store.load();
  store.savePatch({ draftSync: null }, {
    expectedResourceId: resourceId,
    expected: { draftSync: data.draftSync },
  });
  return { resourceId, existed: before.exists };
}
