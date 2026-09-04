import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { resolveCwd } from '../../config/project.js';
import {
  loadResourceProject,
  tryLoadResourceProject,
  tryLoadVersionProject,
  type AuthExcludedItem,
} from '../../config/project.js';
import { requireAuth } from '../../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { CliError } from '../../core/errors.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { fetchResourceInfo, ownersMatch } from '../sync/index.js';
import { createFromDir, type FromDirCreatedItem } from '../batch/index.js';
import { policyApplyFromFile } from '../policyService.js';
import { projectStoreFromCwd } from '../store/projectStore.js';
import { assertCollectionItemTitle } from '../validation.js';
import {
  assertCollectionItemAddCount,
  COLLECTION_ITEM_ADD_LIMIT,
} from '../shared/guards/index.js';
import { ensureCollectionSynced } from './owner.js';
import { assertRssManagedContentEditable } from './rssContract.js';
import {
  looksLikePath,
  onlineImportedChild,
  parseAuthExcludedItemsFile,
  fetchDraftItems,
  refreshCollectionDraftState,
  assertChildCollectionReady,
  assertCollectionItemBaseUpcastReady,
} from './internal.js';

/**
 * 合集目录草稿条目用例。网络错误不等于平台未写入：mutation 异常后先只读对账，只有
 * 证明目标意图已应用才返回成功；对账也失败时返回 REMOTE_OUTCOME_UNKNOWN，并要求用
 * 完全相同参数重试。
 */
export function splitCollectionItemBatches<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += COLLECTION_ITEM_ADD_LIMIT) {
    chunks.push(items.slice(offset, offset + COLLECTION_ITEM_ADD_LIMIT));
  }
  return chunks;
}

async function reconcileUnknownItemMutation(
  operation: string,
  mutationError: unknown,
  checkApplied: () => Promise<boolean>,
): Promise<void> {
  try {
    if (await checkApplied()) return;
  } catch (reconcileError) {
    if (reconcileError instanceof CliError) throw reconcileError;
    throw cliError('合集目录写入结果未知，自动对账也失败；保留当前工程并使用相同参数重试', {
      code: 1,
      cause: mutationError,
      details: {
        error: 'REMOTE_OUTCOME_UNKNOWN',
        operation,
        mutationError: mutationError instanceof Error ? mutationError.message : String(mutationError),
        reconcileError:
          reconcileError instanceof Error ? reconcileError.message : String(reconcileError),
      },
      hint: '不要更换合集或参数；网络恢复后原命令会先读取目录草稿，再决定是否需要写入',
    });
  }
  throw mutationError;
}

function normalizeAuthExcludedItems(items: AuthExcludedItem[] | undefined): AuthExcludedItem[] {
  return [...(items || [])].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function assertExistingItemMatches(
  item: { itemTitle?: string; authExcludedItems?: AuthExcludedItem[] },
  opts: { itemTitle?: string; authExcludedItems: AuthExcludedItem[] },
): void {
  const conflictingFields: string[] = [];
  if (opts.itemTitle !== undefined && item.itemTitle !== opts.itemTitle) {
    conflictingFields.push('itemTitle');
  }
  if (
    !isDeepStrictEqual(
      normalizeAuthExcludedItems(item.authExcludedItems),
      normalizeAuthExcludedItems(opts.authExcludedItems),
    )
  ) {
    conflictingFields.push('authExcludedItems');
  }
  if (!conflictingFields.length) return;
  throw cliError(I18N_KEYS.collection_item_already_exists_conflict, {
    code: 3,
    details: { error: 'COLLECTION_ITEM_INTENT_CONFLICT', conflictingFields },
    hint: '使用 collection item update 明确修改已有条目，或保持原参数重试',
  });
}

/** 添加单个目录项；重复调用先对账，已有条目必须标题/授权排除字段完全一致。 */
export async function addCollectionItemDraftReconciled(opts: {
  collectionId: string;
  resourceId: string;
  itemTitle?: string;
  authExcludedItems: AuthExcludedItem[];
}): Promise<void> {
  const before = await fetchDraftItems(opts.collectionId);
  const existing = before.find((item) => item.resourceId?.trim() === opts.resourceId);
  if (existing) {
    assertExistingItemMatches(existing, opts);
    return;
  }
  try {
    const envelope = await FServiceAPI.Resource.addResourceItems_Draft({
      resourceId: opts.collectionId,
      addCollectionItems: [
        {
          resourceId: opts.resourceId,
          itemTitle: opts.itemTitle,
          authExcludedItems: opts.authExcludedItems,
        },
      ],
      isPublish: 0,
    } as Parameters<typeof FServiceAPI.Resource.addResourceItems_Draft>[0]);
    assertAddCollectionItemsResult(envelope, 1);
  } catch (error) {
    await reconcileUnknownItemMutation('collection-item-add', error, async () => {
      const reconciled = (await fetchDraftItems(opts.collectionId)).find(
        (item) => item.resourceId?.trim() === opts.resourceId,
      );
      if (!reconciled) return false;
      assertExistingItemMatches(reconciled, opts);
      return true;
    });
  }
}

/** CLI `collection item add`：解析 resourceId 或本地子工程，完成草稿写入并刷新本地平台事实。 */
export async function itemAdd(opts: {
  target: string;
  title?: string;
  authExcludedFile?: string;
  cwd?: string;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertRssManagedContentEditable(ctx.info, '添加合集目录项');
  const collectionId = ctx.collection.resourceId!;
  let resourceId = opts.target.trim();
  let itemTitle = opts.title;
  if (itemTitle !== undefined) assertCollectionItemTitle(itemTitle);

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
  await assertCollectionItemBaseUpcastReady(collectionId, [resourceId]);

  await addCollectionItemDraftReconciled({
    collectionId,
    resourceId,
    itemTitle,
    authExcludedItems,
  });

  await refreshCollectionDraftState(ctx.collection, opts.cwd);
  return { collectionId, resourceId, itemTitle };
}

/** CLI `collection item import-dir`：批量创建子资源、执行策略/上架门禁，再分批加入合集草稿。 */
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
  onProgress?: (event: import('../batch/progress.js').BatchImportProgressEvent) => void;
}): Promise<{ collectionId: string; created: FromDirCreatedItem[] }> {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertRssManagedContentEditable(ctx.info, '从目录导入合集目录项');
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
    onProgress: opts.onProgress,
  });

  if (created.length) {
    const staged: FromDirCreatedItem[] = [];

    // 阶段 1：全部为子项 apply policy 并校验上架门禁（尚未 online）
    for (const item of created) {
      const childCwd = path.join(sourceDir, item.subdir);
      if (opts.itemPolicyFile?.trim()) {
        await policyApplyFromFile({
          store: projectStoreFromCwd(childCwd),
          fromFile: opts.itemPolicyFile,
        });
      }
      await assertChildCollectionReady(item.resourceId, childCwd, { requireOnline: false });
      staged.push(item);
    }

    // 阶段 2：所有远端只读授权门禁先通过，再产生 online 副作用。
    await assertCollectionItemBaseUpcastReady(
      collectionId,
      staged.map((item) => item.resourceId),
    );

    // 阶段 3：全部通过门禁后再逐个 online。
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

    // 阶段 4：Console 每次最多选择 100 项；CLI 复现为多个草稿写入批次。
    const existingDraftIds = new Set(
      (await fetchDraftItems(collectionId))
        .map((item) => item.resourceId?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    const pending = staged.filter((item) => !existingDraftIds.has(item.resourceId));
    const chunks = splitCollectionItemBatches(pending);
    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex += 1) {
      const chunk = chunks[batchIndex]!;
      try {
        const envelope = await FServiceAPI.Resource.addResourceItems_Draft({
          resourceId: collectionId,
          addCollectionItems: chunk.map((item) => ({
            resourceId: item.resourceId,
            itemTitle: item.itemTitle || item.resourceTitle || item.resourceName,
            authExcludedItems: item.authExcludedItems || [],
          })),
          isPublish: 0,
        } as Parameters<typeof FServiceAPI.Resource.addResourceItems_Draft>[0]);
        assertAddCollectionItemsResult(envelope, chunk.length);
      } catch (error) {
        let draftResourceIds: string[] = [];
        try {
          draftResourceIds = (await fetchDraftItems(collectionId))
            .map((item) => item.resourceId?.trim())
            .filter((id): id is string => Boolean(id));
        } catch {
          // Preserve the original mutation error; the next run refreshes the draft again.
        }
        throw cliError(I18N_KEYS.collection_import_partial_add, {
          code: 4,
          params: {
            completed: batchIndex * COLLECTION_ITEM_ADD_LIMIT,
            total: pending.length,
          },
          details: {
            collectionId,
            draftResourceIds,
            failedChunkResourceIds: chunk.map((item) => item.resourceId),
          },
          cause: error,
          hint: '保留源目录和子工程，修复平台错误后重跑同一 collection item import-dir；已在草稿中的条目会跳过',
        });
      }
    }
    await refreshCollectionDraftState(ctx.collection, opts.cwd);
  }

  return { collectionId, created };
}

/** 将 Console 批量添加响应中的成功/失败/忽略项转换为 fail-closed 校验。 */
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

/** CLI `collection item remove`：删除前读取草稿，网络异常后用草稿快照确认是否已生效。 */
export async function itemRemove(opts: {
  itemIds: string[];
  cwd?: string;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertRssManagedContentEditable(ctx.info, '移除合集目录项');
  if (!opts.itemIds.length) throw cliError(I18N_KEYS.missing_item_id, { code: 4 });
  const resourceId = ctx.collection.resourceId!;
  const currentIds = new Set((await fetchDraftItems(resourceId)).map((item) => item.itemId));
  const pendingIds = opts.itemIds.filter((itemId) => currentIds.has(itemId));
  if (pendingIds.length) {
    try {
      await FServiceAPI.Resource.deleteCollectionItems_Draft({
        resourceId,
        removeCollectionItemIds: pendingIds,
      } as Parameters<typeof FServiceAPI.Resource.deleteCollectionItems_Draft>[0]);
    } catch (error) {
      await reconcileUnknownItemMutation('collection-item-remove', error, async () => {
        const afterIds = new Set((await fetchDraftItems(resourceId)).map((item) => item.itemId));
        return pendingIds.every((itemId) => !afterIds.has(itemId));
      });
    }
  }
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
}

/** CLI `collection item update`：对标题做同 Console 的约束与幂等对账。 */
export async function itemUpdate(opts: {
  itemId: string;
  title: string;
  cwd?: string;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertRssManagedContentEditable(ctx.info, '修改合集目录项');
  if (!opts.itemId) throw cliError(I18N_KEYS.missing_item_id, { code: 4 });
  assertCollectionItemTitle(opts.title, true);
  const resourceId = ctx.collection.resourceId!;
  const title = opts.title.trim();
  const current = (await fetchDraftItems(resourceId)).find((item) => item.itemId === opts.itemId);
  if (current?.itemTitle !== title) {
    try {
      await FServiceAPI.Resource.updateCollectionItemsInfo_Draft({
        resourceId,
        data: [{ itemId: opts.itemId, itemTitle: title }],
      } as Parameters<typeof FServiceAPI.Resource.updateCollectionItemsInfo_Draft>[0]);
    } catch (error) {
      await reconcileUnknownItemMutation('collection-item-update', error, async () => {
        const after = (await fetchDraftItems(resourceId)).find((item) => item.itemId === opts.itemId);
        return after?.itemTitle === title;
      });
    }
  }
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
}

/** CLI `collection item reorder`：按显式顺序或平台排序字段写入确定性目录顺序。 */
export async function itemReorder(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  sortField?: 'createDate' | 'itemTitle' | 'sortId' | 'resourceUpdateDate';
  sortType?: 1 | -1;
  orderFile?: string;
  itemIds?: string[];
  targetSortId?: number;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertRssManagedContentEditable(ctx.info, '调整合集目录项顺序');
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
