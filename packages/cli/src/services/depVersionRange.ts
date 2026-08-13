import { FServiceAPI, unwrapData } from '../platform/index.js';

type BatchInfoResourceRow = {
  resourceId?: string;
  latestVersion?: string | null;
};

function parseBatchInfoRows(
  batchData: BatchInfoResourceRow[] | { dataList?: BatchInfoResourceRow[] } | null | undefined,
): BatchInfoResourceRow[] {
  if (Array.isArray(batchData)) return batchData;
  if (Array.isArray(batchData?.dataList)) return batchData.dataList;
  return [];
}

/** 解析 dep add 默认 versionRange：显式传入优先；否则 ^latestVersion；无 latest 回退 *。 */
export async function resolveDefaultDepVersionRange(opts: {
  resourceId: string;
  versionRange?: string;
}): Promise<string> {
  if (opts.versionRange?.trim()) return opts.versionRange.trim();

  try {
    const batchEnvelope = await FServiceAPI.Resource.batchInfo({
      resourceIds: opts.resourceId.trim(),
      isLoadLatestVersionInfo: 1,
    } as Parameters<typeof FServiceAPI.Resource.batchInfo>[0]);
    const batchData = unwrapData<
      BatchInfoResourceRow[] | { dataList?: BatchInfoResourceRow[] }
    >(batchEnvelope);
    const rows = parseBatchInfoRows(batchData);
    const latestVersion = rows
      .map((row) => row.latestVersion?.trim())
      .find((version) => Boolean(version));
    if (latestVersion) return `^${latestVersion}`;
  } catch {
    // batchInfo 失败不阻断 dep add
  }

  return '*';
}
