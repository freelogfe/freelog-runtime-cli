/** 目录添加的读DTO：分组来自服务端，目录回读只核验，不能反推新增成功。 */
import { CliError } from '../../core/errors';
import type { CollectionCatalogueItem } from './catalogue';

export type CollectionItemAddResult = {
  added: string[];
  unchanged: string[];
  failed: Array<{ resourceId: string; reason: string }>;
};

/** POST已经可能发生；不暴露原始响应/异常，也不引导直接重发。 */
export function collectionItemAddUnknown(): CliError {
  return new CliError('目录添加结果无法确认；请先用 collection item list 及网页核对实际结果，勿直接重复执行。', 'COLLECTION_ITEM_RESULT_UNKNOWN');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 完整成功信封中的三个数组必须是本次POST来源ID的精确分区。 */
export function parseCollectionItemAddResult(response: unknown, requested: readonly string[]): {
  added: Set<string>; ignored: Map<string, string>; failed: Map<string, string>;
} {
  if (!record(response) || response.ret !== 0 || response.errCode !== 0 || !record(response.data)) throw collectionItemAddUnknown();
  const { addSuccessfulItems, addFailedItems, ignoreItems } = response.data;
  if (!Array.isArray(addSuccessfulItems) || !Array.isArray(addFailedItems) || !Array.isArray(ignoreItems)) throw collectionItemAddUnknown();
  const expected = new Set(requested), seen = new Set<string>();
  const added = new Set<string>(), ignored = new Map<string, string>(), failed = new Map<string, string>();
  for (const [kind, rows] of [['added', addSuccessfulItems], ['failed', addFailedItems], ['ignored', ignoreItems]] as const) {
    for (const row of rows) {
      if (!record(row) || typeof row.resourceId !== 'string' || !expected.has(row.resourceId) || seen.has(row.resourceId)) throw collectionItemAddUnknown();
      seen.add(row.resourceId);
      if (kind === 'failed') {
        if (typeof row.reason !== 'string') throw collectionItemAddUnknown();
        failed.set(row.resourceId, row.reason);
      } else {
        if (typeof row.itemTitle !== 'string') throw collectionItemAddUnknown();
        if (kind === 'added') added.add(row.resourceId);
        else {
          if (typeof row.itemId !== 'string' || !row.itemId.trim() || /[\s\p{Cc}\p{Cf}]/u.test(row.itemId)) throw collectionItemAddUnknown();
          ignored.set(row.resourceId, row.itemId);
        }
      }
    }
  }
  if (seen.size !== expected.size) throw collectionItemAddUnknown();
  return { added, ignored, failed };
}

/** 同一来源重复出现或任一分组与回读矛盾，整批未知，不猜并发写入的归属。 */
export function reconcileCollectionItemAddResult(
  groups: ReturnType<typeof parseCollectionItemAddResult>, requested: readonly string[],
  after: readonly CollectionCatalogueItem[], unchanged: readonly string[], sourceOrder: readonly string[],
): CollectionItemAddResult {
  const bySource = new Map<string, CollectionCatalogueItem[]>();
  for (const item of after) bySource.set(item.resourceId, [...(bySource.get(item.resourceId) ?? []), item]);
  for (const id of requested) {
    const matches = bySource.get(id) ?? [];
    if (groups.failed.has(id) ? matches.length !== 0 : matches.length !== 1) throw collectionItemAddUnknown();
    if (groups.ignored.has(id) && matches[0]?.itemId !== groups.ignored.get(id)) throw collectionItemAddUnknown();
  }
  return {
    added: requested.filter((id) => groups.added.has(id)),
    unchanged: sourceOrder.filter((id) => unchanged.includes(id) || groups.ignored.has(id)),
    failed: requested.filter((id) => groups.failed.has(id)).map((resourceId) => ({ resourceId, reason: groups.failed.get(resourceId)! })),
  };
}

/** 失败原因是数据而非终端指令；JSON转义C0后补齐C1/方向及分隔控制。 */
export function collectionItemAddSummary(result: CollectionItemAddResult): string {
  const summary = `已添加：${result.added.join('、') || '无'}；未变更：${result.unchanged.join('、') || '无'}`;
  if (!result.failed.length) return summary;
  const failures = result.failed.map(({ resourceId, reason }) => `${resourceId} ${JSON.stringify(reason || '平台未提供失败原因')
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)}`);
  return `${summary}；失败：${failures.join('、')}`;
}
