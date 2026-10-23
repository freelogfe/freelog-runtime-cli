/** 全量读取已发布或草稿目录；由调用方注入对应 SDK 请求，不接触账号。 */
import { createHash } from 'node:crypto';
import { CliError } from '../../core/errors';

export type CollectionCatalogueItem = {
  itemId: string;
  resourceId: string;
  itemTitle: string;
  sortId: number;
  resourceName?: string;
  resourceTitle?: string;
};

export type CollectionCatalogueReadOptions = {
  keywords?: string;
  sortField?: 'createDate' | 'sortId';
  sortType?: 1 | -1;
  isLoadLatestVersionInfo?: 1;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new CliError('平台目录响应不完整或格式无效，无法核验完整目录。', 'COLLECTION_ITEMS_RESPONSE_INVALID');
}

/** 按平台总数读取全部分页；响应不完整、分页漂移或单品重复时拒绝核验。 */
export async function readCollectionCatalogue(resourceId: string, request: (params: Record<string, unknown>) => Promise<unknown>, options: CollectionCatalogueReadOptions = {}): Promise<CollectionCatalogueItem[]> {
  const all: CollectionCatalogueItem[] = [];
  const itemIds = new Set<string>();
  let total: number | undefined;
  for (let skip = 0; ; skip += 100) {
    const response = await request({
      resourceId, skip, limit: 100,
      sortField: options.sortField ?? 'sortId', sortType: options.sortType ?? 1,
      ...(options.keywords?.trim() ? { keywords: options.keywords.trim() } : {}),
      ...(options.isLoadLatestVersionInfo === 1 ? { isLoadLatestVersionInfo: 1 } : {}),
    });
    if (!isRecord(response) || response.ret !== 0 || response.errCode !== 0 || !isRecord(response.data)) invalidResponse();
    const data = response.data;
    if (data.skip !== skip || data.limit !== 100
      || typeof data.totalItem !== 'number' || !Number.isSafeInteger(data.totalItem) || data.totalItem < 0
      || (total !== undefined && data.totalItem !== total)
      || !Array.isArray(data.dataList)) invalidResponse();
    total = data.totalItem;
    if (data.dataList.length !== Math.min(100, total - skip)) invalidResponse();
    for (const raw of data.dataList) {
      if (!isRecord(raw)
        || typeof raw.itemId !== 'string' || !raw.itemId.trim()
        || typeof raw.itemTitle !== 'string'
        || typeof raw.sortId !== 'number' || !Number.isFinite(raw.sortId)
        || !isRecord(raw.mountResourceInfo)
        || typeof raw.mountResourceInfo.resourceId !== 'string' || !raw.mountResourceInfo.resourceId.trim()
        || itemIds.has(raw.itemId)) invalidResponse();
      itemIds.add(raw.itemId);
      all.push({
        itemId: raw.itemId, resourceId: raw.mountResourceInfo.resourceId, itemTitle: raw.itemTitle, sortId: raw.sortId,
        ...(typeof raw.mountResourceInfo.resourceName === 'string' ? { resourceName: raw.mountResourceInfo.resourceName } : {}),
        ...(typeof raw.mountResourceInfo.resourceTitle === 'string' ? { resourceTitle: raw.mountResourceInfo.resourceTitle } : {}),
      });
    }
    if (all.length === total) return all;
  }
}

/** 固定字段顺序生成完整目录摘要，保留单品顺序用于发布前后比对。 */
export function collectionCatalogueFingerprint(items: readonly CollectionCatalogueItem[]): string {
  const normalized = items.map(({ itemId, resourceId, itemTitle, sortId }) => ({ itemId, resourceId, itemTitle, sortId }));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
