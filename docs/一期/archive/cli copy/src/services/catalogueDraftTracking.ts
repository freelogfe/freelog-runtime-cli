import { createHash } from 'node:crypto';

export type CatalogueDraftRow = {
  itemId?: string;
  itemTitle?: string;
  sortId?: number;
  resourceId?: string;
  mountResourceInfo?: { resourceId?: string };
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function trimStr(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

/** 目录草稿指纹（≅ Console collectionItemsChanged 判据：itemId/标题/排序/挂载资源） */
export function normalizeCatalogueDraftRows(items: unknown[]): CatalogueDraftRow[] {
  return items
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const item = row as CatalogueDraftRow;
      const itemId = trimStr(item.itemId);
      if (!itemId) return null;
      const mountResourceId = trimStr(item.mountResourceInfo?.resourceId || item.resourceId);
      return {
        itemId,
        itemTitle: trimStr(item.itemTitle),
        sortId: Number.isFinite(Number(item.sortId)) ? Number(item.sortId) : 0,
        resourceId: mountResourceId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => {
      const bySort = a.sortId - b.sortId;
      if (bySort !== 0) return bySort;
      return a.itemId.localeCompare(b.itemId);
    });
}

export function fingerprintCatalogueDraft(items: unknown[]): string {
  const canonical = normalizeCatalogueDraftRows(items);
  return createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

/**
 * Console: isMergeCatalogueDraft = collectionItemsChanged ? 1 : 0
 * CLI：对比上次发版后的目录指纹与当前草稿指纹。
 */
export function resolveMergeCatalogueDraft(opts: {
  currentItems: unknown[];
  publishedFingerprint?: string | null;
}): 0 | 1 {
  const currentFingerprint = fingerprintCatalogueDraft(opts.currentItems);
  const published = trimStr(opts.publishedFingerprint);
  if (!published) {
    return normalizeCatalogueDraftRows(opts.currentItems).length > 0 ? 1 : 0;
  }
  return currentFingerprint === published ? 0 : 1;
}
