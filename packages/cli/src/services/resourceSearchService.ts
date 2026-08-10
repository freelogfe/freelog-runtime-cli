import { requireAuth } from '../core/auth.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';

export interface ResourceSearchHit {
  resourceId: string;
  resourceName: string;
  resourceTitle?: string;
  resourceTypeCode?: string;
  status?: number;
  latestVersion?: string | null;
}

export async function searchResources(opts: {
  query: string;
  limit?: number;
}): Promise<ResourceSearchHit[]> {
  requireAuth();
  const q = opts.query.trim();
  if (!q) return [];

  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);

  // 先尝试精确 info（resourceId 或授权名）
  try {
    const envelope = await FServiceAPI.Resource.info({
      resourceIdOrName: q,
      isLoadLatestVersionInfo: 1,
    });
    const one = unwrapData<Record<string, unknown>>(envelope);
    if (one && typeof one === 'object' && one.resourceId) {
      return [mapHit(one)];
    }
  } catch {
    // fallback list
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
