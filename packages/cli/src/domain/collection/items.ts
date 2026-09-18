/** 合集手工目录：读取和添加服务端草稿；不发布、不修改来源资源。 */

import { CliError } from '../../core/errors';
import { confirmWrite, isInteractive, selectQuestion } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionItem = {
  itemId: string;
  resourceId: string;
  itemTitle: string;
  resourceName?: string;
  resourceTitle?: string;
  sortId?: number;
};

export type CollectionItemApis = CollectionTargetApis & {
  getDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  addDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  batchContracts?: (params: Record<string, unknown>) => Promise<unknown>;
  signContracts?: (params: Record<string, unknown>) => Promise<unknown>;
  getRules?: (params: Record<string, unknown>) => Promise<unknown>;
  renameDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  removeDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  moveDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  reorderDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
  getDraftAuth?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): unknown {
  return (result as { data?: unknown }).data ?? result;
}

async function assertManualWritable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>, apis?: CollectionItemApis): Promise<void> {
  if (Number(target.info.status) === 2) throw new CliError('冻结合集不能修改目录草稿', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) {
    throw new CliError('RSS 合集不能手工修改目录', 'COLLECTION_RSS_READONLY');
  }
  const getRules = apis?.getRules ?? ((params) => FServiceAPI.Resource.getCollectionCollectRules(params as never));
  const rules = unwrapData(await getRules({ resourceId: target.resourceId }));
  if (rules && typeof rules === 'object' && Number((rules as Record<string, unknown>).status) === 1) {
    throw new CliError('自动收录开启时不能手工修改目录', 'COLLECTION_AUTO_COLLECTING');
  }
}

function extractItems(result: unknown): CollectionItem[] {
  const data = unwrapData(result);
  const values = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as { dataList?: unknown; list?: unknown; items?: unknown }).dataList
        ?? (data as { list?: unknown }).list
        ?? (data as { items?: unknown }).items)
      : undefined;
  if (!Array.isArray(values)) throw new CliError('平台目录草稿返回格式无法识别', 'COLLECTION_ITEMS_RESPONSE_INVALID');
  return values.map((value) => {
    const item = value as Record<string, unknown>;
    const mounted = item.mountResourceInfo && typeof item.mountResourceInfo === 'object' ? item.mountResourceInfo as Record<string, unknown> : {};
    const itemId = String(item.itemId ?? item.id ?? '');
    const resourceId = String(item.resourceId ?? item.resourceID ?? mounted.resourceId ?? mounted.resourceID ?? '');
    if (!itemId || !resourceId) throw new CliError(`平台目录草稿缺少 itemId 或 resourceId（收到字段：${Object.keys(item).join('、') || '无'}）`, 'COLLECTION_ITEMS_RESPONSE_INVALID');
    return {
      itemId,
      resourceId,
      itemTitle: String(item.itemTitle ?? item.resourceTitle ?? mounted.resourceTitle ?? ''),
      ...(typeof (item.resourceName ?? mounted.resourceName) === 'string' ? { resourceName: String(item.resourceName ?? mounted.resourceName) } : {}),
      ...(typeof (item.resourceTitle ?? mounted.resourceTitle) === 'string' ? { resourceTitle: String(item.resourceTitle ?? mounted.resourceTitle) } : {}),
      ...(Number.isFinite(Number(item.sortId)) ? { sortId: Number(item.sortId) } : {}),
    };
  });
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
  const pageSize = 100;
  const all: CollectionItem[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const page = extractItems(await getDraftItems({
      resourceId: target.resourceId,
      skip,
      limit: pageSize,
      ...(input.search?.trim() ? { keywords: input.search.trim() } : {}),
      // 服务端目录列表的 sortField 白名单为 createDate、sortId。明确按 sortId
      // 读取，避免依赖未文档化的默认排序，也不能把 reorder 的字段回传给列表。
      sortField: input.sortField ?? 'sortId',
      sortType: input.sortType ?? 1,
      isLoadLatestVersionInfo: 1,
    }));
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

/** 按稳定 itemId 修改服务端目录草稿的展示标题并读回确认。 */
export async function renameCollectionDraftItem(input: {
  cwd: string; selector?: string; itemId: string; title: string; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new CliError('单品标题不能为空', 'COLLECTION_ITEM_TITLE_REQUIRED');
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const items = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  if (!items.some((item) => item.itemId === input.itemId)) throw new CliError('目录草稿中不存在该 itemId', 'COLLECTION_ITEM_NOT_FOUND');
  await confirmWrite(`修改单品标题\n${input.itemId} → ${title}`, input.yes);
  const rename = input.apis?.renameDraftItems ?? ((params) => FServiceAPI.Resource.updateCollectionItemsInfo_Draft(params as never));
  await rename({ resourceId: target.resourceId, data: [{ itemId: input.itemId, itemTitle: title }] });
  const after = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  if (after.find((item) => item.itemId === input.itemId)?.itemTitle !== title) throw new CliError('单品标题写入结果无法确认', 'COLLECTION_ITEM_RESULT_UNKNOWN');
}

/** 按稳定 itemId 从服务端目录草稿移除单品并读回确认。 */
export async function removeCollectionDraftItems(input: {
  cwd: string; selector?: string; itemIds: string[]; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<void> {
  const ids = [...new Set(input.itemIds)];
  if (ids.length === 0) throw new CliError('请提供至少一个 itemId', 'COLLECTION_ITEM_REQUIRED');
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const before = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  if (ids.some((id) => !before.some((item) => item.itemId === id))) throw new CliError('目录草稿中存在找不到的 itemId', 'COLLECTION_ITEM_NOT_FOUND');
  await confirmWrite(`从目录草稿移除 ${ids.length} 个单品\n${ids.join('\n')}`, input.yes);
  const remove = input.apis?.removeDraftItems ?? ((params) => FServiceAPI.Resource.deleteCollectionItems_Draft(params as never));
  await remove({ resourceId: target.resourceId, removeCollectionItemIds: ids });
  const after = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  if (ids.some((id) => after.some((item) => item.itemId === id))) throw new CliError('单品移除结果无法确认', 'COLLECTION_ITEM_RESULT_UNKNOWN');
}

/** 将单品移到指定 itemId 之前或之后，并按 sortId 全量读回验证相对位置。 */
export async function moveCollectionDraftItem(input: {
  cwd: string; selector?: string; itemId: string; before?: string; after?: string; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<void> {
  if (Boolean(input.before) === Boolean(input.after)) throw new CliError('必须且只能提供 --before 或 --after', 'COLLECTION_ITEM_MOVE_TARGET');
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
  await confirmWrite(`移动单品 ${moving.itemId} 到 ${input.before ? '之前' : '之后'} ${anchor.itemId}`, input.yes);
  const move = input.apis?.moveDraftItems ?? ((params) => FServiceAPI.Resource.setCollectionItemsSortID_Draft(params as never));
  await move({ resourceId: target.resourceId, data: { itemIds: [moving.itemId], targetSortId } });
  const after = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}`, sortField: 'sortId', sortType: 1 });
  const movingIndex = after.findIndex((item) => item.itemId === moving.itemId);
  const anchorIndex = after.findIndex((item) => item.itemId === anchor.itemId);
  const movedToExpectedSide = input.before ? movingIndex < anchorIndex : movingIndex > anchorIndex;
  if (movingIndex < 0 || anchorIndex < 0 || !movedToExpectedSide) {
    throw new CliError('单品移动结果无法确认', 'COLLECTION_ITEM_RESULT_UNKNOWN');
  }
}

/** 以平台支持字段重排目录草稿，并返回按所选顺序读回的全量目录。 */
export async function sortCollectionDraftItems(input: {
  cwd: string; selector?: string; by: 'added' | 'title' | 'resource-updated'; direction: 'asc' | 'desc'; yes?: boolean; homeDir?: string; apis?: CollectionItemApis;
}): Promise<CollectionItem[]> {
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const reorderSortField: 'createDate' | 'itemTitle' | 'resourceUpdateDate' = ({
    added: 'createDate', title: 'itemTitle', 'resource-updated': 'resourceUpdateDate',
  } as const)[input.by];
  await confirmWrite(`按${input.by} ${input.direction}重新排序目录草稿`, input.yes);
  const reorder = input.apis?.reorderDraftItems ?? ((params) => FServiceAPI.Resource.reorderCollectionItems_Draft(params as never));
  await reorder({ resourceId: target.resourceId, sortField: reorderSortField, sortType: input.direction === 'asc' ? 1 : -1 });
  return listCollectionDraftItems({
    ...input,
    selector: `id:${target.resourceId}`,
    // reorder 已将结果固化为手工 sortId；列表端只能按该字段读回验证。
    sortField: 'sortId',
    sortType: 1,
  });
}

/** 读取指定目录单品的授权状态；该操作不修改授权或目录。 */
export async function collectionDraftAuthStatus(input: {
  cwd: string; selector?: string; itemIds: string[]; homeDir?: string; apis?: CollectionItemApis;
}): Promise<Array<{ itemId: string; isAuth: boolean }>> {
  const target = await resolveCollectionTarget(input);
  const ids = [...new Set(input.itemIds)];
  if (ids.length === 0) throw new CliError('请提供至少一个 itemId', 'COLLECTION_ITEM_REQUIRED');
  const getAuth = input.apis?.getDraftAuth ?? ((params) => FServiceAPI.Resource.getCollectionItemsAuth_Draft(params as never));
  const data = unwrapData(await getAuth({ resourceId: target.resourceId, itemIds: ids.join(',') }));
  if (!Array.isArray(data)) throw new CliError('平台单品授权状态返回格式无法识别', 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID');
  return data.map((value) => {
    const item = value as Record<string, unknown>;
    const itemId = String(item.itemId ?? '');
    if (!itemId || typeof item.isAuth !== 'boolean') throw new CliError('平台单品授权状态缺少字段', 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID');
    return { itemId, isAuth: item.isAuth };
  });
}

function isResourceSubject(subjectType: unknown): boolean {
  const values = Array.isArray(subjectType) ? subjectType : [subjectType];
  return values.some((value) => Number(value) === 1);
}

/**
 * 添加已上架的本人单资源到目录草稿。带上游授权时按用户显式策略签约并读回
 * contractId；不能用 policyId 或空 authExcludedItems 冒充。
 */
export async function addCollectionDraftItems(input: {
  cwd: string;
  selector?: string;
  sources: string[];
  yes?: boolean;
  /** 上游资源 ID → 用户明确选择的启用策略 ID；不允许按“第一条”猜。 */
  policyBySubject?: Readonly<Record<string, string>>;
  homeDir?: string;
  apis?: CollectionItemApis;
}): Promise<{ added: string[]; unchanged: string[] }> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  if (input.sources.length === 0) throw new CliError('请提供至少一个线上单资源 id: 或 name:', 'COLLECTION_ITEM_SOURCE_REQUIRED');
  const target = await resolveCollectionTarget(input);
  await assertManualWritable(target, input.apis);
  const draft = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  const existing = new Set(draft.map((item) => item.resourceId));
  const uniqueSources = [...new Set(input.sources.map((source) => source.replace(/^(id:|name:)/, '')))].filter(Boolean);
  const info = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const candidates: Array<{ resourceId: string; title: string; upcasts: string[] }> = [];
  const unchanged: string[] = [];
  for (const source of uniqueSources) {
    const remote = unwrapData(await info({ resourceIdOrName: source, isLoadLatestVersionInfo: 1 })) as Record<string, unknown>;
    const resourceId = String(remote.resourceId ?? '');
    const owner = Number(remote.userId ?? remote.ownerId ?? remote.creatorId);
    if (!resourceId || !isResourceSubject(remote.subjectType) || owner !== auth.userId || Number(remote.status) !== 1 || !remote.latestVersion) {
      throw new CliError(`单品 ${source} 必须是当前账号已上架且已有版本的单资源`, 'COLLECTION_ITEM_SOURCE_INVALID');
    }
    if (existing.has(resourceId)) { unchanged.push(resourceId); continue; }
    const upcasts = (Array.isArray(remote.baseUpcastResources) ? remote.baseUpcastResources : [])
      .map((item) => String((item as Record<string, unknown>).resourceId ?? ''))
      .filter(Boolean);
    candidates.push({ resourceId, title: String(remote.resourceTitle ?? remote.title ?? ''), upcasts });
  }
  if (candidates.length === 0) return { added: [], unchanged };
  const upstreamIds = [...new Set(candidates.flatMap((item) => item.upcasts))];
  let contracts: Array<{ contractId: string; subjectId: string }> = [];
  if (upstreamIds.length > 0) {
    const batchContracts = input.apis?.batchContracts
      ?? ((params) => FServiceAPI.Contract.batchContracts(params as never));
    const current = unwrapData(await batchContracts({
      licenseeId: target.resourceId, subjectIds: upstreamIds.join(','), contractStatus: 0,
    }));
    if (!Array.isArray(current)) throw new CliError('平台合同查询返回格式无法识别', 'COLLECTION_CONTRACT_RESPONSE_INVALID');
    contracts = current.flatMap((value) => {
      const item = value as Record<string, unknown>;
      const contractId = String(item.contractId ?? '');
      const subjectId = String(item.subjectId ?? '');
      return contractId && subjectId ? [{ contractId, subjectId }] : [];
    });
    const covered = new Set(contracts.map((item) => item.subjectId));
    const missing = upstreamIds.filter((resourceId) => !covered.has(resourceId));
    if (missing.length > 0) {
      const subjects: Array<{ subjectId: string; policyId: string; subjectType: 1 }> = [];
      for (const subjectId of missing) {
        const upstream = unwrapData(await info({ resourceIdOrName: subjectId, isLoadPolicyInfo: 1 })) as Record<string, unknown>;
        const policies = Array.isArray(upstream.policies) ? upstream.policies as Record<string, unknown>[] : [];
        const active = policies.filter((policy) => Number(policy.status) === 1 && typeof policy.policyId === 'string');
        let policyId = input.policyBySubject?.[subjectId];
        if (!policyId) {
          if (!isInteractive()) throw new CliError(`上游资源 ${subjectId} 未获授权；请显式提供其策略`, 'COLLECTION_ITEM_POLICY_REQUIRED');
          if (active.length === 0) throw new CliError(`上游资源 ${subjectId} 没有可签策略`, 'COLLECTION_ITEM_POLICY_REQUIRED');
          policyId = await selectQuestion(`选择上游资源 ${subjectId} 的授权策略`, active.map((policy) => ({
            name: `${String(policy.policyName ?? '未命名策略')} (${String(policy.policyId)})`, value: String(policy.policyId),
          })));
        }
        if (!active.some((policy) => String(policy.policyId) === policyId)) {
          throw new CliError(`策略 ${policyId} 不是上游资源 ${subjectId} 的启用策略`, 'COLLECTION_ITEM_POLICY_INVALID');
        }
        subjects.push({ subjectId, policyId, subjectType: 1 });
      }
      const signContracts = input.apis?.signContracts
        ?? ((params) => FServiceAPI.Contract.batchCreateContracts(params as never));
      await signContracts({ subjects, subjectType: 1, licenseeId: target.resourceId, licenseeIdentityType: 1 });
      const afterSign = unwrapData(await batchContracts({
        licenseeId: target.resourceId, subjectIds: upstreamIds.join(','), contractStatus: 0,
      }));
      if (!Array.isArray(afterSign)) throw new CliError('平台合同查询返回格式无法识别', 'COLLECTION_CONTRACT_RESPONSE_INVALID');
      contracts = afterSign.flatMap((value) => {
        const item = value as Record<string, unknown>;
        const contractId = String(item.contractId ?? '');
        const subjectId = String(item.subjectId ?? '');
        return contractId && subjectId ? [{ contractId, subjectId }] : [];
      });
      if (missing.some((subjectId) => !contracts.some((contract) => contract.subjectId === subjectId))) {
        throw new CliError('签约结果无法读回确认，未写入目录草稿', 'COLLECTION_CONTRACT_RESULT_UNKNOWN');
      }
    }
  }
  await confirmWrite(`添加 ${candidates.length} 个单品到合集目录草稿\n${candidates.map((item) => `- ${item.resourceId} ${item.title}`).join('\n')}`, input.yes);
  const addDraftItems = input.apis?.addDraftItems
    ?? ((params) => FServiceAPI.Resource.addResourceItems_Draft(params as never));
  await addDraftItems({
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
  const after = await listCollectionDraftItems({ ...input, selector: `id:${target.resourceId}` });
  const afterIds = new Set(after.map((item) => item.resourceId));
  const missing = candidates.filter((item) => !afterIds.has(item.resourceId));
  if (missing.length > 0) throw new CliError(`目录写入结果无法确认：${missing.map((item) => item.resourceId).join('、')}`, 'COLLECTION_ITEM_RESULT_UNKNOWN');
  return { added: candidates.map((item) => item.resourceId), unchanged };
}
