import { requireAuth } from '../core/auth.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';

export interface ResourceSearchHit {
  resourceId: string;
  resourceName: string;
  resourceTitle?: string;
  resourceTypeCode?: string;
  status?: number;
  latestVersion?: string | null;
}

function recordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

/**
 * 精确查询只有在平台明确返回“资源不存在”时才允许转为关键词搜索。
 * 鉴权、限流、断网等错误不能被搜索结果掩盖，否则用户会误以为账号下没有资源。
 */
function isExplicitResourceNotFound(error: unknown): boolean {
  const details = recordValue(error, 'details');
  const statuses = [
    recordValue(error, 'status'),
    recordValue(error, 'statusCode'),
    recordValue(recordValue(error, 'response'), 'status'),
    recordValue(recordValue(error, 'response'), 'statusCode'),
    recordValue(details, 'status'),
    recordValue(details, 'statusCode'),
  ];
  if (statuses.some((status) => Number(status) === 404)) return true;

  const message = error instanceof Error ? error.message : String(error);
  return /(?:^|\D)404(?:\D|$)|\bnot[ -]?found\b|资源不存在/i.test(message);
}

export async function searchResources(opts: {
  query: string;
  limit?: number;
}): Promise<ResourceSearchHit[]> {
  requireAuth();
  const q = opts.query.trim();
  if (!q) return [];

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

  // 精确查询命中时直接返回；只有明确未命中时继续执行关键词列表查询。
  try {
    const envelope = await FServiceAPI.Resource.info({
      resourceIdOrName: q,
      isLoadLatestVersionInfo: 1,
    });
    const one = unwrapData<Record<string, unknown>>(envelope);
    if (one && typeof one === 'object' && one.resourceId) {
      return [mapHit(one)];
    }
    throw cliError(I18N_KEYS.resource_exact_query_invalid, {
      code: 1,
      details: envelope,
    });
  } catch (error) {
    if (!isExplicitResourceNotFound(error)) throw error;
  }

  const listEnvelope = await FServiceAPI.Resource.list({
    keywords: q,
    isSelf: 1,
    limit,
    isLoadLatestVersionInfo: 1,
  });
  const rows = unwrapData<unknown>(listEnvelope);
  const list = Array.isArray(rows) ? rows : [];
  return list
    .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    .map(mapHit);
}

function mapHit(row: Record<string, unknown>): ResourceSearchHit {
  return {
    resourceId: String(row.resourceId || ''),
    resourceName: String(row.resourceName || ''),
    resourceTitle: row.resourceTitle != null ? String(row.resourceTitle) : undefined,
    resourceTypeCode: row.resourceTypeCode != null ? String(row.resourceTypeCode) : undefined,
    status: row.status != null ? Number(row.status) : undefined,
    latestVersion:
      row.latestVersion != null ? String(row.latestVersion) : (row.latestVersion as null | undefined),
  };
}
