import { consola } from 'consola';
import { requireAuth } from '../../core/auth.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { fingerprintCatalogueDraft } from '../catalogueDraftTracking.js';
import {
  assertApplyListingAllowed,
  applyOwnerToCollection,
  applyPlatformFactsToCollection,
  listingDrifted,
} from '../shared/listing.js';
import { assertOwnerMatch, ownersMatch } from '../shared/owner.js';
import { fetchResourceInfo } from '../shared/platform/index.js';
import { fetchDraftItems } from './internal.js';
import type { EnsureCollectionOwnerResult } from './types.js';
import { collectionStoreFromCwd } from '../store/index.js';

export async function ensureCollectionOwner(opts: {
  cwd?: string;
  allowCreateWithoutId?: boolean;
  readOnly?: boolean;
}): Promise<EnsureCollectionOwnerResult> {
  const auth = requireAuth();
  const store = collectionStoreFromCwd(opts.cwd);
  const collection = store.load();
  const resourceId = collection.resourceId?.trim();

  if (!resourceId) {
    if (opts.allowCreateWithoutId) {
      return { auth, collection, info: { resourceId: '' } };
    }
    throw cliError(I18N_KEYS.no_collection_resource_id, {
      code: 4,
    });
  }

  const info = await fetchResourceInfo(resourceId);
  assertOwnerMatch({
    authUserId: auth.userId,
    authUsername: auth.username,
    platformUserId: info.userId,
    platformUsername: info.username,
    hint: '请切换到该合集的拥有者账号',
  });

  const next = {
    ...applyPlatformFactsToCollection(collection, info),
    rssFeedUrl: info.feedUrl || collection.rssFeedUrl,
  };
  if (info.username && collection.username && info.username !== collection.username) {
    consola.warn(`检测到 username 已变化：${collection.username} → ${info.username}`);
  }
  if (!opts.readOnly) {
    store.savePlatformFacts(next, {
      rss: info.feedUrl ? { feedUrl: info.feedUrl } : undefined,
    });
  }
  return { auth, collection: next, info };
}

export async function pullCollection(opts: {
  cwd?: string;
  applyListing?: boolean;
  force?: boolean;
}) {
  const auth = requireAuth();
  const store = collectionStoreFromCwd(opts.cwd);
  const collection = store.load();
  const id = collection.resourceId?.trim() || collection.resourceName;
  if (!id) {
    throw cliError(I18N_KEYS.collection_pull_missing_id, { code: 4 });
  }
  const info = await fetchResourceInfo(id);
  if (
    Number.isFinite(Number(auth.userId)) &&
    Number.isFinite(Number(info.userId)) &&
    !ownersMatch(auth.userId, info.userId)
  ) {
    throw cliError(I18N_KEYS.collection_pull_owner_denied, { code: 2 });
  }

  const catalogueItems = await fetchDraftItems(info.resourceId);

  const rulesEnv = await FServiceAPI.Resource.getCollectionCollectRules({
    resourceId: info.resourceId,
  } as Parameters<typeof FServiceAPI.Resource.getCollectionCollectRules>[0]);
  const collectRules = unwrapData(rulesEnv);

  const withDraft = { ...collection, catalogueItems, collectRules };
  const next = opts.applyListing
    ? applyOwnerToCollection(withDraft, info)
    : applyPlatformFactsToCollection(withDraft, info);
  if (opts.applyListing) {
    assertApplyListingAllowed({
      local: collection,
      info,
      cwd: opts.cwd,
      force: opts.force,
      collection: true,
    });
    store.save(next);
  } else {
    store.savePlatformFacts(next, {
      catalogueDraft: catalogueItems,
      catalogueProperty: next.display,
      cataloguePublishedFingerprint: fingerprintCatalogueDraft(catalogueItems),
      collectRules,
    });
  }
  return { collection: next, info, catalogueItems, collectRules };
}

export async function ensureCollectionSynced(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  owner?: EnsureCollectionOwnerResult;
  readOnly?: boolean;
}): Promise<EnsureCollectionOwnerResult> {
  const owner =
    opts.owner || (await ensureCollectionOwner({ cwd: opts.cwd, readOnly: opts.readOnly }));
  if (!owner.info.resourceId) return owner;

  if (listingDrifted(owner.collection, owner.info)) {
    if (opts.readOnly) {
      throw cliError(I18N_KEYS.collection_info_mismatch, {
        code: 3,
        hint: '先执行 freelog-cli pull --collection；dry-run 不会自动回写本地状态',
      });
    }
    if (opts.noAutoPull) {
      throw cliError(I18N_KEYS.collection_info_mismatch, {
        code: 3,
        hint: 'freelog-cli pull --collection --apply-listing --no-auto-pull',
      });
    }
    const pulled = await pullCollection({ cwd: opts.cwd });
    return {
      ...owner,
      collection: pulled.collection,
      info: pulled.info,
    };
  }
  return owner;
}
