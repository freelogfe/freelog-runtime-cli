/** 合集手工目录：读取和添加服务端草稿；不发布、不修改来源资源。 */

import { CliError } from '../../core/errors';
import { confirmWrite, isInteractive } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { verifyCollectionResourceContracts } from './contracts';
import { readCollectionCatalogue, type CollectionCatalogueItem } from './catalogue';
import { parseCollectionCollectRules } from './collectRules';
import { collectionItemAddUnknown, parseCollectionItemAddResult, reconcileCollectionItemAddResult, type CollectionItemAddResult } from './itemAddResult';
import { collectionItemSourceResponseInvalid, parseCollectionItemSource, parseCollectionItemSources } from './itemSource';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';
import { pickCollectionItemSources, type CollectionItemPickerApis } from './itemPicker';

export type CollectionItem = CollectionCatalogueItem;

export type CollectionItemApis = CollectionTargetApis & CollectionItemPickerApis & {
  getDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  addDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  batchContracts?: (params: Record<string, unknown>) => Promise<unknown>;
  checkItems?: (params: Record<string, unknown>) => Promise<unknown>;
  getRules?: (params: Record<string, unknown>) => Promise<unknown>;
  renameDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  removeDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  moveDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  reorderDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  getDraftAuth?: (params: Record<string, unknown>) => Promise<unknown>;
};

/** 无来源的TTY只读选择；精确返回目标，调用者仍须重新调用add全部实时门禁。 */
export async function selectCollectionItemSources(input: {
  cwd: string; selector?: string; homeDir?: string; json?: boolean; apis?: CollectionItemApis;
}): Promise<{ resourceId: string; sources: string[] }> {
  if (input.json || !isInteractive()) throw new CliError('非交互或JSON调用请明确提供来源单资源 id: 或 name:', 'COLLECTION_ITEM_SOURCE_REQUIRED');
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const catalogue = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  const selected = await pickCollectionItemSources({ userId: auth.userId, existingIds: catalogue.map((r) => r.resourceId), apis: input.apis });
  return { resourceId: target.resourceId, sources: selected.map((value) => `id:${value}`) };
}

async function assertManualWritable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>, apis?: CollectionItemApis): Promise<void> {
  if (Number(target.info.status) === 2) throw new CliError('冻结合集不能修改目录草稿', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) {
    throw new CliError('RSS 合集不能手工修改目录', 'COLLECTION_RSS_READONLY');
  }
  const getRules = apis?.getRules ?? ((params) => FServiceAPI.Resource.getCollectionCollectRules(params as never));
  const rules = parseCollectionCollectRules(await getRules({ resourceId: target.resourceId }));
  if (rules.status === 1) {
    throw new CliError('自动收录开启时不能手工修改目录', 'COLLECTION_AUTO_COLLECTING');
  }
}

/** 全量读取目录草稿，分页任何一页异常都停止，避免用首屏误判重复或发布状态。 */
export async function listCollectionDraftItems(input: {
  cwd: string;
  selector?: string;
  search?: string;
  /** 列表接口实际只接受 createDate/sortId；标题和资源更新时间仅用于 reorder 写接口。 */
  sortField?: 'createDate' | 'sortId';
  sortType?: 1 | -1;
  homeDir?: string;
  apis?: CollectionItemApis;
}): Promise<CollectionItem[]> {
  assertPlatformAllowed();
  const target = await resolveCollectionTarget(input);
  const getDraftItems = input.apis?.getDraftItems
    ?? ((params) => FServiceAPI.Resource.getCollectionItems_Draft(params as never));
  return readCollectionCatalogue(target.resourceId, getDraftItems, {
    keywords: input.search,
    sortField: input.sortField,
    sortType: input.sortType,
    isLoadLatestVersionInfo: 1,
  });
}

type ManualEditInput = { cwd: string; selector?: string; yes?: boolean; homeDir?: string; apis?: CollectionItemApis };

/** 身份不做trim或修复，防止终端注入及把复合输入当作另一个单品。 */
function assertManualItemIds(ids: readonly string[]): void {
  if (ids.some((id) => typeof id !== 'string' || !id || /[\s,\p{Cc}\p{Cf}]/u.test(id))) {
    throw new CliError('itemId不能为空或包含空白、逗号或控制字符', 'COLLECTION_ITEM_ID_INVALID');
  }
}

/** 仅比较目录本身的身份/标题及顺序；来源展示字段和平台重编号不作为目录改写。 */
function editSnapshot(items: readonly CollectionItem[]): string {
  return JSON.stringify(items.map(({ itemId, resourceId, itemTitle }) => ({ itemId, resourceId, itemTitle })));
}

async function confirmManualEdit(input: ManualEditInput, resourceId: string, before: readonly CollectionItem[], preview: string): Promise<void> {
  await confirmWrite(preview, input.yes);
  const target = await resolveCollectionTarget({ ...input, selector: `id:${resourceId}` });
  await assertManualWritable(target, input.apis);
  const current = await listCollectionDraftItems({ ...input, selector: `id:${resourceId}` });
  if (editSnapshot(before) !== editSnapshot(current)) {
    throw new CliError('目录草稿在确认期间发生变化，请重新查看后操作，本次未提交。', 'COLLECTION_ITEM_CATALOGUE_CHANGED');
  }
}

function manualEditUnknown(detail?: string): CliError {
  return new CliError(`目录草稿写入结果无法确认，请先运行 collection item list 核对，不要直接重发。${detail ? ` ${detail}` : ''}`, 'COLLECTION_ITEM_RESULT_UNKNOWN');
}

/** 写请求至多一次；未知信封/异常/坏读回不能被已有目标值或原始HTTP异常伪装成功。 */
async function writeAndReadManualEdit(input: ManualEditInput, resourceId: string, request: (params: Record<string, unknown>) => Promise<unknown>, params: Record<string, unknown>): Promise<CollectionItem[]> {
  try {
    const response = await request(params);
    if (!response || typeof response !== 'object' || Array.isArray(response)
      || !('ret' in response) || response.ret !== 0 || !('errCode' in response) || response.errCode !== 0) throw manualEditUnknown();
    return await listCollectionDraftItems({ ...input, selector: `id:${resourceId}` });
  } catch { throw manualEditUnknown(); }
}

function hasIncreasingSortIds(items: readonly CollectionItem[]): boolean {
  return items.every((item, index) => index === 0 || items[index - 1]!.sortId < item.sortId);
}

/** 按稳定 itemId 修改服务端目录草稿的展示标题并读回确认。 */
export async function renameCollectionDraftItem(input: {
  cwd: string; selector?: string; itemId: string; title: string; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<void> {
  assertManualItemIds([input.itemId]);
  const title = input.title.trim();
  if (!title) throw new CliError('单品标题不能为空', 'COLLECTION_ITEM_TITLE_REQUIRED');
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const items = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  if (!items.some((item) => item.itemId === input.itemId)) throw new CliError('目录草稿中不存在该 itemId', 'COLLECTION_ITEM_NOT_FOUND');
  await confirmManualEdit(input, target.resourceId, items, `修改单品标题\n${input.itemId} → ${quotedItemTitle(title)}`);
  const rename = input.apis?.renameDraftItems ?? ((params) => FServiceAPI.Resource.updateCollectionItemsInfo_Draft(params as never));
  const after = await writeAndReadManualEdit(input, target.resourceId, rename, { resourceId: target.resourceId, data: [{ itemId: input.itemId, itemTitle: title }] });
  const expected = items.map((item) => item.itemId === input.itemId ? { ...item, itemTitle: title } : item);
  if (editSnapshot(expected) !== editSnapshot(after) || !hasIncreasingSortIds(after)) throw manualEditUnknown();
}

/** 按稳定 itemId 从服务端目录草稿移除单品并读回确认。 */
export async function removeCollectionDraftItems(input: {
  cwd: string; selector?: string; itemIds: string[]; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<void> {
  const ids = [...new Set(input.itemIds)];
  if (ids.length === 0) throw new CliError('请提供至少一个 itemId', 'COLLECTION_ITEM_REQUIRED');
  assertManualItemIds(ids);
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const before = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  if (ids.some((id) => !before.some((item) => item.itemId === id))) throw new CliError('目录草稿中存在找不到的 itemId', 'COLLECTION_ITEM_NOT_FOUND');
  await confirmManualEdit(input, target.resourceId, before, `从目录草稿移除 ${ids.length} 个单品\n${ids.join('\n')}`);
  const remove = input.apis?.removeDraftItems ?? ((params) => FServiceAPI.Resource.deleteCollectionItems_Draft(params as never));
  const after = await writeAndReadManualEdit(input, target.resourceId, remove, { resourceId: target.resourceId, removeCollectionItemIds: ids });
  const remaining = new Set(after.map((item) => item.itemId));
  const retained = ids.filter((id) => remaining.has(id));
  if (retained.length) throw manualEditUnknown(`已移除：${ids.filter((id) => !remaining.has(id)).join('、') || '无'}；仍存在：${retained.join('、')}`);
  if (editSnapshot(before.filter((item) => !ids.includes(item.itemId))) !== editSnapshot(after) || !hasIncreasingSortIds(after)) throw manualEditUnknown();
}

/** 将单品移到指定 itemId 之前或之后，并按 sortId 全量读回验证相对位置。 */
export async function moveCollectionDraftItem(input: {
  cwd: string; selector?: string; itemId: string; before?: string; after?: string; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<CollectionItem[]> {
  if (Boolean(input.before) === Boolean(input.after)) throw new CliError('必须且只能提供 --before 或 --after', 'COLLECTION_ITEM_MOVE_TARGET');
  assertManualItemIds([input.itemId, input.before ?? input.after!]);
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const items = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}`, sortField: 'sortId', sortType: 1 });
  const moving = items.find((item) => item.itemId === input.itemId);
  const anchorId = input.before ?? input.after!;
  const anchor = items.find((item) => item.itemId === anchorId);
  if (!moving || !anchor || moving.itemId === anchor.itemId) throw new CliError('移动目标或参照 itemId 无效', 'COLLECTION_ITEM_NOT_FOUND');
  const withoutMoving = items.filter((item) => item.itemId !== moving.itemId);
  const anchorPosition = withoutMoving.findIndex((item) => item.itemId === anchor.itemId);
  const targetSortId = anchorPosition + (input.before ? 1 : 2);
  await confirmManualEdit(input, target.resourceId, items, `移动单品 ${moving.itemId} 到 ${input.before ? '之前' : '之后'} ${anchor.itemId}`);
  const move = input.apis?.moveDraftItems ?? ((params) => FServiceAPI.Resource.setCollectionItemsSortID_Draft(params as never));
  const after = await writeAndReadManualEdit(input, target.resourceId, move, { resourceId: target.resourceId, data: { itemIds: [moving.itemId], targetSortId } });
  const expected = [...withoutMoving];
  expected.splice(targetSortId - 1, 0, moving);
  if (editSnapshot(expected) !== editSnapshot(after) || !hasIncreasingSortIds(after)) throw manualEditUnknown();
  return after;
}

/** 以平台支持字段重排目录草稿，并返回按所选顺序读回的全量目录。 */
export async function sortCollectionDraftItems(input: {
  cwd: string; selector?: string; by: 'added' | 'title' | 'resource-updated'; direction: 'asc' | 'desc'; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<CollectionItem[]> {
  if (!['added', 'title', 'resource-updated'].includes(input.by)) throw new CliError('--by 仅支持 added、title 或 resource-updated', 'COLLECTION_ITEM_SORT_FIELD');
  if (input.direction !== 'asc' && input.direction !== 'desc') throw new CliError('必须且只能提供 --asc 或 --desc', 'COLLECTION_ITEM_SORT_DIRECTION');
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const before = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  const reorderSortField: 'createDate' | 'itemTitle' | 'resourceUpdateDate' = ({
    added: 'createDate', title: 'itemTitle', 'resource-updated': 'resourceUpdateDate',
  } as const)[input.by];
  await confirmManualEdit(input, target.resourceId, before, `按${input.by} ${input.direction}重新排序目录草稿`);
  const reorder = input.apis?.reorderDraftItems ?? ((params) => FServiceAPI.Resource.reorderCollectionItems_Draft(params as never));
  const after = await writeAndReadManualEdit(input, target.resourceId, reorder, { resourceId: target.resourceId, sortField: reorderSortField, sortType: input.direction === 'asc' ? 1 : -1 });
  const canonical = (items: readonly CollectionItem[]) => [...items].sort((a, b) => a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0);
  // 不复刻平台collation；核验完整对象集合，并确认写排序已固化为递增手工sortId。
  if (editSnapshot(canonical(before)) !== editSnapshot(canonical(after)) || !hasIncreasingSortIds(after)) throw manualEditUnknown();
  return after;
}

/** 以本轮完整目录关联来源，严格核验所选授权结果集合；不修改授权或目录。 */
export async function collectionDraftAuthStatus(input: {
  cwd: string; selector?: string; itemIds: string[]; homeDir?: string; apis?: CollectionItemApis;
}): Promise<Array<{ itemId: string; resourceId: string; isAuth: boolean }>> {
  const ids = [...new Set(input.itemIds)];
  if (ids.length === 0) throw new CliError('请提供至少一个 itemId', 'COLLECTION_ITEM_REQUIRED');
  const invalidId = (id: unknown) => typeof id !== 'string' || !id || /[\s,\p{Cc}\p{Cf}]/u.test(id);
  if (ids.some(invalidId)) {
    throw new CliError('itemId不能为空或包含空白、逗号或控制字符', 'COLLECTION_ITEM_ID_INVALID');
  }
  const target = await resolveCollectionTarget(input);
  const getDraftItems = input.apis?.getDraftItems ?? ((params) => FServiceAPI.Resource.getCollectionItems_Draft(params as never));
  const catalogue = await readCollectionCatalogue(target.resourceId, getDraftItems);
  const sources = new Map(catalogue.map((item) => [item.itemId, item.resourceId]));
  if (ids.some((id) => !sources.has(id))) throw new CliError('目录草稿中不存在该 itemId', 'COLLECTION_ITEM_NOT_FOUND');
  if (ids.some((id) => invalidId(sources.get(id)))) throw new CliError('平台目录来源资源ID格式无效', 'COLLECTION_ITEMS_RESPONSE_INVALID');
  const getAuth = input.apis?.getDraftAuth ?? ((params) => FServiceAPI.Resource.getCollectionItemsAuth_Draft(params as never));
  const response = await getAuth({ resourceId: target.resourceId, itemIds: ids.join(',') });
  const invalid = () => new CliError('平台单品授权状态响应不完整或无效', 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID');
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || !('ret' in response) || response.ret !== 0 || !('errCode' in response) || response.errCode !== 0
    || !('data' in response) || !Array.isArray(response.data) || response.data.length !== ids.length) throw invalid();
  const requested = new Set(ids), statuses = new Map<string, boolean>();
  for (const value of response.data) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const item = value as Record<string, unknown>;
    if (typeof item.itemId !== 'string' || !requested.has(item.itemId) || statuses.has(item.itemId) || typeof item.isAuth !== 'boolean') throw invalid();
    statuses.set(item.itemId, item.isAuth);
  }
  return ids.map((itemId) => ({ itemId, resourceId: sources.get(itemId)!, isAuth: statuses.get(itemId)! }));
}

/** 草稿专用存在性核验不是授权查询；不能以缺行/失败响应当作不存在。 */
async function checkCollectionItemExistence(resourceId: string, ids: readonly string[], existing: ReadonlySet<string>, apis?: CollectionItemApis): Promise<void> {
  const invalid = () => new CliError('平台草稿单品判重响应不完整或无效，未提交添加。', 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID');
  const check = apis?.checkItems ?? ((params) => FServiceAPI.Resource.resourceIsExistInItems_Draft(params as never));
  let response: unknown;
  try { response = await check({ resourceId, resourceIds: ids.join(',') }); }
  catch { throw invalid(); }
  if (!response || typeof response !== 'object' || Array.isArray(response)
    || !('ret' in response) || response.ret !== 0 || !('errCode' in response) || response.errCode !== 0
    || !('data' in response) || !Array.isArray(response.data) || response.data.length !== ids.length) throw invalid();
  const expected = new Set(ids), seen = new Map<string, boolean>();
  for (const row of response.data) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.resourceId !== 'string'
      || !expected.has(row.resourceId) || seen.has(row.resourceId) || typeof row.isExists !== 'boolean') throw invalid();
    seen.set(row.resourceId, row.isExists);
  }
  if (ids.some((id) => seen.get(id) !== existing.has(id))) {
    throw new CliError('草稿判重与完整目录读取不一致；请先重新运行 collection item list 核对，再决定是否添加，本次未提交。', 'COLLECTION_ITEM_CATALOGUE_CHANGED');
  }
}

/** 引用展示平台标题，转义终端控制；仅作用于确认文案，不能改写itemTitle。 */
function quotedItemTitle(title: string): string {
  return JSON.stringify(title).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu,
    (char) => char.split('').map((unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
}

/**
 * 添加已上架的本人单资源到目录草稿。带上游授权时只读已有的真实
 * contractId；不能自动签约，也不能用 policyId 或空 authExcludedItems 冒充。
 */
export async function addCollectionDraftItems(input: {
  cwd: string;
  selector?: string;
  sources: string[];
  yes?: boolean;
  homeDir?: string;
  apis?: CollectionItemApis;
}): Promise<CollectionItemAddResult> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  if (input.sources.length === 0) throw new CliError('请提供至少一个线上单资源 id: 或 name:', 'COLLECTION_ITEM_SOURCE_REQUIRED');
  const selectors = parseCollectionItemSources(input.sources);
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const draft = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  const existing = new Set(draft.map((item) => item.resourceId));
  const info = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const candidates: Array<{ resourceId: string; title: string; upcasts: string[] }> = [];
  const unchanged: string[] = [];
  const sourceOrder: string[] = [];
  for (const selector of selectors) {
    let response: unknown;
    try { response = await info({ resourceIdOrName: selector.value, isLoadLatestVersionInfo: 1 }); }
    catch { throw collectionItemSourceResponseInvalid(); }
    const candidate = parseCollectionItemSource(response, selector, auth.userId);
    const { resourceId } = candidate;
    if (!sourceOrder.includes(resourceId)) sourceOrder.push(resourceId);
    if (sourceOrder.length > 100) throw new CliError('一次最多添加100个不同来源资源，请明确拆分后分别执行；本次未提交。', 'COLLECTION_ITEM_LIMIT');
    if (existing.has(resourceId)) { if (!unchanged.includes(resourceId)) unchanged.push(resourceId); continue; }
    // ID与完整名称可指向同一来源，POST及结果分区都只包含一次真实ID。
    if (candidates.some((item) => item.resourceId === resourceId)) continue;
    candidates.push(candidate);
  }
  await checkCollectionItemExistence(target.resourceId, sourceOrder, existing, input.apis);
  if (candidates.length === 0) return { added: [], unchanged, failed: [] };
  const upstreamIds = [...new Set(candidates.flatMap((item) => item.upcasts))];
  let contracts: Array<{ contractId: string; subjectId: string }> = [];
  if (upstreamIds.length > 0) {
    const batchContracts = input.apis?.batchContracts
      ?? ((params) => FServiceAPI.Contract.batchContracts(params as never));
    const current = await verifyCollectionResourceContracts({
      collectionId: target.resourceId,
      subjectIds: upstreamIds,
      batchContracts,
      responseCode: 'COLLECTION_CONTRACT_RESPONSE_INVALID',
    });
    contracts = current.contracts.map(({ contractId, subjectId }) => ({ contractId, subjectId }));
    const covered = current.covered;
    const missing = upstreamIds.filter((resourceId) => !covered.has(resourceId));
    if (missing.length > 0) {
      throw new CliError(
        `单品上游资源缺少当前合集合同，请先到网页端以合集 ${target.resourceId} 身份处理授权/支付后重试：${missing.join('、')}`,
        'COLLECTION_ITEM_BROWSER_AUTH_REQUIRED',
      );
    }
  }
  await confirmWrite(`添加 ${candidates.length} 个单品到合集目录草稿\n${candidates.map((item) => `- ${item.resourceId} ${quotedItemTitle(item.title)}`).join('\n')}`, input.yes);
  const addDraftItems = input.apis?.addDraftItems
    ?? ((params) => FServiceAPI.Resource.addResourceItems_Draft(params as never));
  let response: unknown;
  try {
    response = await addDraftItems({
      resourceId: target.resourceId,
      addCollectionItems: candidates.map((item) => ({
        resourceId: item.resourceId,
        itemTitle: item.title,
        authExcludedItems: contracts
          .filter((contract) => item.upcasts.includes(contract.subjectId))
          .map((contract) => ({ resourceId: contract.subjectId, excludedType: 'contractId', excludedValue: contract.contractId })),
      })),
      isPublish: 0,
    });
  } catch { throw collectionItemAddUnknown(); }
  const requested = candidates.map((item) => item.resourceId);
  const groups = parseCollectionItemAddResult(response, requested);
  try {
    const after = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
    return reconcileCollectionItemAddResult(groups, requested, after, unchanged, sourceOrder);
  } catch { throw collectionItemAddUnknown(); }
}
