/** 合集发行后的只读观察：更新日志与本合集作为授权方的合同。 */

import { CliError } from '../../core/errors';
import { confirmQuestion, isInteractive } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionReadonlyApis = CollectionTargetApis & {
  getLogs?: (params: Record<string, unknown>) => Promise<unknown>;
  getContracts?: (params: Record<string, unknown>) => Promise<unknown>;
  getContract?: (params: Record<string, unknown>) => Promise<unknown>;
};

export type CollectionReadPage = { rows: Record<string, unknown>[]; skip: number; limit: number; totalItem: number; hasNext: boolean };
type Input = { cwd: string; selector?: string; homeDir?: string; apis?: CollectionReadonlyApis };
type ListOptions = { limit?: number; order?: 'asc' | 'desc'; all?: boolean; yes?: boolean; nextPage?: (page: CollectionReadPage) => Promise<boolean> };
const MAX_PAGES = 100, MAX_ROWS = 10000;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && !/[\s,\p{Cc}\p{Cf}]/u.test(value);
const successful = (value: unknown): value is Record<string, unknown> => record(value) && value.ret === 0 && value.errCode === 0;

function readLimit(options: ListOptions): number {
  const limit = options.limit ?? 100;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new CliError('--limit 必须是 1 到 100 的整数', 'COLLECTION_READ_LIMIT_INVALID');
  if (options.order !== undefined && options.order !== 'asc' && options.order !== 'desc') throw new CliError('--order 仅支持 asc 或 desc', 'COLLECTION_READ_ORDER_INVALID');
  return limit;
}
function tooLarge(): never { throw new CliError('只读查询最多100页且10000条；请缩小筛选范围或调整--limit，未输出完整列表', 'COLLECTION_READ_TOO_LARGE'); }
async function confirmAll(options: ListOptions, name: string): Promise<void> {
  if (!options.all || options.yes) return;
  if (!isInteractive()) throw new CliError('读取全部分页请明确提供 --all --yes', 'COLLECTION_READ_ALL_NEED_YES');
  if (!await confirmQuestion(`读取 ${JSON.stringify(name)} 全部分页（最多100页且10000条）？`, false)) throw new CliError('已取消读取全部分页', 'COLLECTION_READ_CANCELLED');
}

function validLog(row: Record<string, unknown>, targetId: string): boolean {
  return row.resourceId === targetId && (row.logId === undefined || id(row.logId))
    && typeof row.createDate === 'string' && Array.isArray(row.operations)
    && row.operations.every((operation) => record(operation) && typeof operation.operationType === 'string'
      && Array.isArray(operation.operationItems) && operation.operationItems.every(record));
}
function validContract(row: Record<string, unknown>, targetId: string): boolean {
  return id(row.contractId) && row.licensorId === targetId && row.subjectId === targetId && row.subjectType === 1 && id(row.policyId)
    && (id(row.licenseeId) || typeof row.licenseeId === 'number' && Number.isSafeInteger(row.licenseeId))
    && Number.isSafeInteger(row.status) && Number.isSafeInteger(row.authStatus)
    && typeof row.createDate === 'string' && (row.updateDate === undefined || typeof row.updateDate === 'string');
}

/** 私有读取器也用于详情的有界归属查找；不是可绕过all确认的公共开关。 */
async function readPages(options: ListOptions & {
  fetch: (skip: number, limit: number) => Promise<unknown>; responseError: string;
  validRow: (row: Record<string, unknown>) => boolean; stableId: (row: Record<string, unknown>) => string | undefined;
}): Promise<Record<string, unknown>[]> {
  const limit = readLimit(options), result: Record<string, unknown>[] = [], seen = new Set<string>();
  let total: number | undefined;
  for (let pages = 0, skip = 0; ; pages += 1, skip += limit) {
    if (pages >= MAX_PAGES || result.length >= MAX_ROWS) tooLarge();
    const response = await options.fetch(skip, limit);
    const invalid = () => new CliError('平台分页响应不完整或格式无效，未确认完整列表', options.responseError);
    if (!successful(response) || !record(response.data)) throw invalid();
    const data = response.data;
    if (data.skip !== skip || data.limit !== limit || typeof data.totalItem !== 'number' || !Number.isSafeInteger(data.totalItem) || data.totalItem < skip
      || total !== undefined && total !== data.totalItem || !Array.isArray(data.dataList)
      || data.dataList.length !== Math.min(limit, data.totalItem - skip)) throw invalid();
    total = data.totalItem;
    if (options.all && (total > MAX_ROWS || Math.ceil(total / limit) > MAX_PAGES)) tooLarge();
    for (const row of data.dataList) {
      if (!record(row) || !options.validRow(row)) throw invalid();
      const key = options.stableId(row);
      if (key !== undefined) { if (seen.has(key)) throw invalid(); seen.add(key); }
    }
    if (result.length + data.dataList.length > MAX_ROWS) tooLarge();
    const rows = data.dataList as Record<string, unknown>[];
    result.push(...rows);
    const page = { rows, skip, limit, totalItem: total, hasNext: skip + rows.length < total };
    const next = options.all || (options.nextPage ? await options.nextPage(page) : false);
    if (!page.hasNext || !next) return result;
  }
}

function contractsRequest(apis?: CollectionReadonlyApis) {
  return apis?.getContracts ?? ((params: Record<string, unknown>) => FServiceAPI.Contract.contracts(params as never));
}
function contractPages(targetId: string, options: ListOptions, request: (params: Record<string, unknown>) => Promise<unknown>, filter: Record<string, unknown> = {}) {
  return readPages({ ...options, responseError: 'COLLECTION_CONTRACT_LIST_RESPONSE_INVALID', validRow: (row) => validContract(row, targetId), stableId: (row) => row.contractId as string,
    fetch: (skip, limit) => request({ identityType: 1, licensorId: targetId, subjectType: 1, skip, limit, order: options.order ?? 'desc', ...filter }) });
}

/** 读取合集更新日志；观察操作不依赖合集是否已上架、冻结或 RSS。 */
export async function listCollectionUpdateLogs(input: Input & ListOptions): Promise<Record<string, unknown>[]> {
  readLimit(input);
  const target = await resolveCollectionTarget(input);
  await confirmAll(input, target.resourceName);
  const getLogs = input.apis?.getLogs
    ?? ((params) => FServiceAPI.Resource.getCollectionUpdateLogs(params as never));
  return readPages({
    ...input,
    responseError: 'COLLECTION_LOG_RESPONSE_INVALID',
    validRow: (row) => validLog(row, target.resourceId),
    stableId: (row) => id(row.logId) ? row.logId : undefined,
    fetch: (skip, limit) => getLogs({ resourceId: target.resourceId, skip, limit, sortType: input.order === 'asc' ? 1 : -1 }),
  });
}

/** 读取本合集作为授权方的授权合约，不能混入合集作为被授权方的上游合同。 */
export async function listCollectionContracts(input: Input & ListOptions & { status?: 0 | 1 | 2; search?: string }): Promise<Record<string, unknown>[]> {
  readLimit(input);
  if (input.status !== undefined && ![0, 1, 2].includes(input.status)) throw new CliError('合同状态筛选无效', 'COLLECTION_CONTRACT_STATUS_INVALID');
  const target = await resolveCollectionTarget(input);
  await confirmAll(input, target.resourceName);
  return contractPages(target.resourceId, input, contractsRequest(input.apis), {
    ...(input.status === undefined ? {} : { status: input.status }), ...(input.search?.trim() ? { keywords: input.search.trim() } : {}),
  });
}

/** 合同详情必须先以本合集作为授权方的列表核验归属，不能接受任意猜测 ID。 */
export async function getCollectionContract(input: Input & { contractId: string }): Promise<Record<string, unknown>> {
  const contractId = input.contractId.trim();
  if (!contractId) throw new CliError('请提供 contractId', 'COLLECTION_CONTRACT_ID_REQUIRED');
  if (!id(contractId)) throw new CliError('contractId不能含空白或控制字符', 'COLLECTION_CONTRACT_ID_INVALID');
  const target = await resolveCollectionTarget(input);
  let found = false;
  await contractPages(target.resourceId, { nextPage: async (page) => { found = page.rows.some((row) => row.contractId === contractId); return !found; } }, contractsRequest(input.apis));
  if (!found) throw new CliError('该合同不属于当前合集的授权合约', 'COLLECTION_CONTRACT_NOT_FOUND');
  const getContract = input.apis?.getContract
    ?? ((params) => FServiceAPI.Contract.contractDetails(params as never));
  const response = await getContract({ contractId, isLoadPolicyInfo: 1 });
  if (!successful(response) || !record(response.data) || response.data.contractId !== contractId || !validContract(response.data, target.resourceId)) {
    throw new CliError('平台合同详情身份、归属或响应无效', 'COLLECTION_CONTRACT_RESPONSE_INVALID');
  }
  return response.data;
}
