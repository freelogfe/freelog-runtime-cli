/** 合集发行后的只读观察：更新日志与本合集作为授权方的合同。 */

import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionReadonlyApis = CollectionTargetApis & {
  getLogs?: (params: Record<string, unknown>) => Promise<unknown>;
  getContracts?: (params: Record<string, unknown>) => Promise<unknown>;
  getContract?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): unknown {
  return (result as { data?: unknown }).data ?? result;
}

function pageData(value: unknown, errorCode: string): Record<string, unknown>[] {
  const data = unwrapData(value);
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? ((data as { dataList?: unknown; list?: unknown; items?: unknown }).dataList
        ?? (data as { list?: unknown }).list
        ?? (data as { items?: unknown }).items)
      : undefined;
  if (!Array.isArray(list)) throw new CliError('平台分页响应格式无法识别', errorCode);
  return list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

function validLimit(limit: number | undefined): number {
  const value = limit ?? 100;
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new CliError('--limit 必须是 1 到 100 的整数', 'COLLECTION_READ_LIMIT_INVALID');
  }
  return value;
}

async function readPages(input: {
  limit?: number;
  all?: boolean;
  fetch: (skip: number, limit: number) => Promise<unknown>;
  responseError: string;
}): Promise<Record<string, unknown>[]> {
  const limit = validLimit(input.limit);
  const first = pageData(await input.fetch(0, limit), input.responseError);
  if (!input.all) return first;
  const result = [...first];
  for (let skip = limit; first.length === limit && result.length >= skip; skip += limit) {
    const page = pageData(await input.fetch(skip, limit), input.responseError);
    result.push(...page);
    if (page.length < limit) break;
  }
  return result;
}

/** 读取合集更新日志；观察操作不依赖合集是否已上架、冻结或 RSS。 */
export async function listCollectionUpdateLogs(input: {
  cwd: string;
  selector?: string;
  limit?: number;
  order?: 'asc' | 'desc';
  all?: boolean;
  homeDir?: string;
  apis?: CollectionReadonlyApis;
}): Promise<Record<string, unknown>[]> {
  const target = await resolveCollectionTarget(input);
  const getLogs = input.apis?.getLogs
    ?? ((params) => FServiceAPI.Resource.getCollectionUpdateLogs(params as never));
  return readPages({
    limit: input.limit,
    all: input.all,
    responseError: 'COLLECTION_LOG_RESPONSE_INVALID',
    fetch: (skip, limit) => getLogs({ resourceId: target.resourceId, skip, limit, sortType: input.order === 'asc' ? 1 : -1 }),
  });
}

/** 读取本合集作为授权方的授权合约，不能混入合集作为被授权方的上游合同。 */
export async function listCollectionContracts(input: {
  cwd: string;
  selector?: string;
  status?: 0 | 1 | 2;
  search?: string;
  limit?: number;
  order?: 'asc' | 'desc';
  all?: boolean;
  homeDir?: string;
  apis?: CollectionReadonlyApis;
}): Promise<Record<string, unknown>[]> {
  const target = await resolveCollectionTarget(input);
  const getContracts = input.apis?.getContracts
    ?? ((params) => FServiceAPI.Contract.contracts(params as never));
  return readPages({
    limit: input.limit,
    all: input.all,
    responseError: 'COLLECTION_CONTRACT_LIST_RESPONSE_INVALID',
    fetch: (skip, limit) => getContracts({
      identityType: 1,
      licensorId: target.resourceId,
      subjectType: 1,
      skip,
      limit,
      order: input.order ?? 'desc',
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.search?.trim() ? { keywords: input.search.trim() } : {}),
    }),
  });
}

/** 合同详情必须先以本合集作为授权方的列表核验归属，不能接受任意猜测 ID。 */
export async function getCollectionContract(input: {
  cwd: string;
  selector?: string;
  contractId: string;
  homeDir?: string;
  apis?: CollectionReadonlyApis;
}): Promise<Record<string, unknown>> {
  const contractId = input.contractId.trim();
  if (!contractId) throw new CliError('请提供 contractId', 'COLLECTION_CONTRACT_ID_REQUIRED');
  const own = await listCollectionContracts({
    cwd: input.cwd,
    selector: input.selector,
    homeDir: input.homeDir,
    all: true,
    apis: input.apis,
  });
  if (!own.some((item) => String(item.contractId ?? item.id ?? '') === contractId)) {
    throw new CliError('该合同不属于当前合集的授权合约', 'COLLECTION_CONTRACT_NOT_FOUND');
  }
  const getContract = input.apis?.getContract
    ?? ((params) => FServiceAPI.Contract.contractDetails(params as never));
  const detail = unwrapData(await getContract({ contractId, isLoadPolicyInfo: 1 }));
  if (!detail || typeof detail !== 'object') throw new CliError('平台合同详情响应格式无法识别', 'COLLECTION_CONTRACT_RESPONSE_INVALID');
  return detail as Record<string, unknown>;
}
