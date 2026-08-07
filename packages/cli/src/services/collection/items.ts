import fs from 'node:fs';
import path from 'node:path';
import { resolveCwd } from '../../config/project.js';
import {
  loadResourceProject,
  tryLoadResourceProject,
  tryLoadVersionProject,
  type AuthExcludedItem,
} from '../../config/project.js';
import { requireAuth } from '../../core/auth.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { fetchResourceInfo, ownersMatch } from '../sync/index.js';
import { createFromDir, type FromDirCreatedItem } from '../batch/index.js';
import { policyApplyFromFile } from '../policyService.js';
import { assertCollectionItemAddCount } from '../shared/guards/index.js';
import { ensureCollectionSynced } from './owner.js';
import {
  looksLikePath,
  onlineImportedChild,
  parseAuthExcludedItemsFile,
  refreshCollectionDraftState,
  assertChildCollectionReady,
} from './internal.js';

export async function itemAdd(opts: {
  target: string;
  title?: string;
  authExcludedFile?: string;
  cwd?: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const collectionId = ctx.collection.resourceId!;
  let resourceId = opts.target.trim();
  let itemTitle = opts.title;

  let authExcludedItems: AuthExcludedItem[] = [];

  if (looksLikePath(opts.target)) {
    const itemCwd = path.resolve(resolveCwd(opts.cwd), opts.target);
    authExcludedItems = tryLoadVersionProject(itemCwd)?.data.authExcludedItems || [];
    const loaded = tryLoadResourceProject(itemCwd) || loadResourceProject(itemCwd);
    const auth = requireAuth();
    if (!ownersMatch(auth.userId, loaded.data.userId)) {
      if (loaded.data.resourceId) {
        const info = await fetchResourceInfo(loaded.data.resourceId);
        if (!ownersMatch(auth.userId, info.userId)) {
          throw cliError(I18N_KEYS.path_resource_not_owned, { code: 2 });
        }
      } else {
        throw cliError(I18N_KEYS.path_resource_invalid, { code: 4 });
      }
    }
    if (!loaded.data.resourceId) {
      throw cliError(I18N_KEYS.path_dir_missing_resource_id, { code: 4 });
    }
    resourceId = loaded.data.resourceId;
    itemTitle = itemTitle || loaded.data.resourceTitle;
  }

  if (opts.authExcludedFile?.trim()) {
    authExcludedItems = parseAuthExcludedItemsFile(opts.authExcludedFile, opts.cwd);
  }

  assertCollectionItemAddCount(1);

  await assertChildCollectionReady(resourceId, looksLikePath(opts.target) ? opts.target : undefined);

  const envelope = await FServiceAPI.Resource.addResourceItems_Draft({
    resourceId: collectionId,
    addCollectionItems: [{ resourceId, itemTitle, authExcludedItems }],
    isPublish: 0,
  } as Parameters<typeof FServiceAPI.Resource.addResourceItems_Draft>[0]);
  assertAddCollectionItemsResult(envelope, 1);

  await refreshCollectionDraftState(ctx.collection, opts.cwd);
  return { collectionId, resourceId, itemTitle };
}

export async function itemImportDir(opts: {
  dir: string;
  resourceTypeCode?: string;
  resourceTypeName?: string;
  titlePrefix?: string;
  configFile?: string;
  itemPolicyFile?: string;
  cwd?: string;
  yes?: boolean;
  noAutoPull?: boolean;
  strictBatchLimit?: boolean;
}): Promise<{ collectionId: string; created: FromDirCreatedItem[] }> {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const collectionId = ctx.collection.resourceId!;
  const sourceDir = path.resolve(resolveCwd(opts.cwd), opts.dir);
  const created = await createFromDir({
    dir: sourceDir,
    typeCode: opts.resourceTypeCode,
    resourceTypeName: opts.resourceTypeName,
    titlePrefix: opts.titlePrefix,
    configFile: opts.configFile,
    cwd: opts.cwd,
    yes: opts.yes,
    strictBatchLimit: opts.strictBatchLimit,
  });

  if (created.length) {
    const staged: FromDirCreatedItem[] = [];

    // 阶段 1：全部为子项 apply policy 并校验上架门禁（尚未 online）
    for (const item of created) {
      const childCwd = path.join(sourceDir, item.subdir);
      if (opts.itemPolicyFile?.trim()) {
        await policyApplyFromFile({
          cwd: childCwd,
          fromFile: opts.itemPolicyFile,
        });
      }
      await assertChildCollectionReady(item.resourceId, childCwd);
      staged.push(item);
    }

    // 阶段 2：全部通过门禁后再逐个 online，避免前序项 orphaned 上架
    for (let i = 0; i < staged.length; i += 1) {
      const item = staged[i]!;
      const childCwd = path.join(sourceDir, item.subdir);
      try {
        await onlineImportedChild(childCwd);
      } catch (error) {
        throw cliError(I18N_KEYS.collection_import_partial_online, {
          code: 4,
          params: { index: i + 1, total: staged.length },
          details: {
            failedResourceId: item.resourceId,
            alreadyProcessed: staged.slice(0, i).map((x) => x.resourceId),
          },
          cause: error,
          hint: '前序子资源可能已上架但未写入合集目录草稿，请 Console 核对或 offline 后重试',
        });
      }
    }

    assertCollectionItemAddCount(staged.length);

    const envelope = await FServiceAPI.Resource.addResourceItems_Draft({
      resourceId: collectionId,
      addCollectionItems: staged.map((item) => ({
        resourceId: item.resourceId,
        itemTitle: item.itemTitle || item.resourceTitle || item.resourceName,
        authExcludedItems: item.authExcludedItems || [],
      })),
      isPublish: 0,
    } as Parameters<typeof FServiceAPI.Resource.addResourceItems_Draft>[0]);
    assertAddCollectionItemsResult(envelope, staged.length);
    await refreshCollectionDraftState(ctx.collection, opts.cwd);
  }

  return { collectionId, created };
}

export function assertAddCollectionItemsResult(envelope: unknown, expectedCount: number): void {
  type AddCollectionItemsResult = {
    addSuccessfulItems?: unknown[];
    addFailedItems?: Array<{ itemName?: string; resourceId?: string; reason?: string }>;
    ignoreItems?: unknown[];
  };
  const unwrapped = unwrapData<AddCollectionItemsResult | { data?: AddCollectionItemsResult }>(
    envelope as AddCollectionItemsResult | { data?: AddCollectionItemsResult },
  );
  const data =
    unwrapped &&
    typeof unwrapped === 'object' &&
    'data' in unwrapped &&
    unwrapped.data &&
    typeof unwrapped.data === 'object'
      ? unwrapped.data
      : (unwrapped as AddCollectionItemsResult);
  const failed = Array.isArray(data?.addFailedItems) ? data.addFailedItems : [];
  const successful = Array.isArray(data?.addSuccessfulItems) ? data.addSuccessfulItems : [];
  const ignored = Array.isArray(data?.ignoreItems) ? data.ignoreItems : [];
  const hasExplicitCounters =
    Array.isArray(data?.addSuccessfulItems) ||
    Array.isArray(data?.addFailedItems) ||
    Array.isArray(data?.ignoreItems);
  if (
    failed.length > 0 ||
    ignored.length > 0 ||
    (hasExplicitCounters && successful.length < expectedCount)
  ) {
    throw cliError(I18N_KEYS.partial_items_not_added_to_draft, {
      code: 4,
      details: data,
      hint: '确认子资源已发布、已添加启用策略并上架后重试 collection item add',
    });
  }
}

export async function itemRemove(opts: {
  itemIds: string[];
  cwd?: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.itemIds.length) throw cliError(I18N_KEYS.missing_item_id, { code: 4 });
  await FServiceAPI.Resource.deleteCollectionItems_Draft({
    resourceId: ctx.collection.resourceId!,
    removeCollectionItemIds: opts.itemIds,
  } as Parameters<typeof FServiceAPI.Resource.deleteCollectionItems_Draft>[0]);
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
}

export async function itemUpdate(opts: {
  itemId: string;
  title: string;
  cwd?: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.itemId) throw cliError(I18N_KEYS.missing_item_id, { code: 4 });
  if (!opts.title?.trim()) throw cliError(I18N_KEYS.missing_title_flag, { code: 4 });
  await FServiceAPI.Resource.updateCollectionItemsInfo_Draft({
    resourceId: ctx.collection.resourceId!,
    data: [{ itemId: opts.itemId, itemTitle: opts.title.trim() }],
  } as Parameters<typeof FServiceAPI.Resource.updateCollectionItemsInfo_Draft>[0]);
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
}

export async function itemReorder(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  sortField?: 'createDate' | 'itemTitle' | 'sortId' | 'resourceUpdateDate';
  sortType?: 1 | -1;
  orderFile?: string;
  itemIds?: string[];
  targetSortId?: number;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.collection.resourceId!;

  if (opts.orderFile || opts.itemIds?.length) {
    let itemIds = opts.itemIds || [];
    if (opts.orderFile) {
      const file = path.resolve(resolveCwd(opts.cwd), opts.orderFile);
      if (!fs.existsSync(file)) throw cliError(I18N_KEYS.order_file_not_found, { code: 4 });
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
        if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) {
          throw new Error('need string[]');
        }
        itemIds = raw as string[];
      } catch (error) {
        throw cliError(I18N_KEYS.order_file_must_be_string_array, { code: 4, cause: error });
      }
    }
    await FServiceAPI.Resource.setCollectionItemsSortID_Draft({
      resourceId,
      data: {
        itemIds,
        targetSortId: opts.targetSortId ?? 1,
      },
    } as Parameters<typeof FServiceAPI.Resource.setCollectionItemsSortID_Draft>[0]);
    await refreshCollectionDraftState(ctx.collection, opts.cwd);
    return { mode: 'manual' as const, itemIds };
  }

  if (!opts.sortField) {
    throw cliError(I18N_KEYS.order_or_sort_required, { code: 4 });
  }
  await FServiceAPI.Resource.reorderCollectionItems_Draft({
    resourceId,
    sortField: opts.sortField,
    sortType: opts.sortType ?? 1,
  } as Parameters<typeof FServiceAPI.Resource.reorderCollectionItems_Draft>[0]);
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
  return { mode: 'auto' as const, sortField: opts.sortField, sortType: opts.sortType ?? 1 };
}
