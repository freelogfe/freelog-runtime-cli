/** 合集线上目标解析：身份可来自本地合集缓存，也可直接指定线上 id/name。 */

import { CliError } from '../../core/errors';
import { isInteractive, selectQuestion } from '../../core/tty';
import { listCollectionIdentities, readCollectionIdentity } from '../../local/identity';
import type { CollectionIdentityRecord } from '../../local/types';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';

export type CollectionTargetApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  listCollections?: (params: Record<string, unknown>) => Promise<unknown>;
};

export type ResolvedCollectionTarget = {
  resourceId: string;
  resourceName: string;
  title: string;
  typeCode: string;
  local?: CollectionIdentityRecord;
  info: Record<string, unknown>;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function dataObject(result: unknown, code: string): Record<string, unknown> {
  if (!record(result) || result.ret !== 0 || result.errCode !== 0 || !record(result.data)) {
    throw new CliError('平台合集响应不是完整的成功对象', code);
  }
  return result.data;
}

type Selector = { kind: 'id' | 'name'; value: string } | { kind: 'file'; n: number };

function parseSelector(selector: string): Selector {
  if (selector.startsWith('file:')) {
    const match = /^file:([1-9]\d*)\.json$/.exec(selector);
    if (match && Number.isSafeInteger(Number(match[1]))) return { kind: 'file', n: Number(match[1]) };
  } else {
    const kind = selector.startsWith('name:') || (!selector.includes(':') && selector.includes('/')) ? 'name' : 'id';
    const value = selector.replace(/^(id:|name:)/, '');
    if (kind === 'name' ? /^[^\s/:]+\/[^\s/:]+$/.test(value) : /^[a-zA-Z0-9_.-]+$/.test(value)) return { kind, value };
  }
  throw new CliError('合集选择器无效；请使用 id:、完整 name: 或 file:N.json', 'COLLECTION_SELECTOR_INVALID');
}

/** 列表只提供候选；选定后仍须按精确ID重读。缓存页只存于本次调用。 */
async function chooseOnline(userId: number, apis?: CollectionTargetApis): Promise<string> {
  const list = apis?.listCollections ?? ((params) => FServiceAPI.Resource.list(params as never));
  const pages = new Map<number, Record<string, unknown>[]>();
  const ids = new Set<string>();
  let total: number | undefined;
  let page = 0;
  for (;;) {
    if (!pages.has(page)) {
      const data = dataObject(await list({ skip: page * 100, limit: 100, isSelf: 1, subjectType: 4 }), 'COLLECTION_LIST_INVALID');
      if (data.skip !== page * 100 || data.limit !== 100 || !Number.isSafeInteger(data.totalItem) || Number(data.totalItem) < 0
        || (total !== undefined && data.totalItem !== total) || !Array.isArray(data.dataList)
        || data.dataList.length !== Math.min(100, Math.max(0, Number(data.totalItem) - page * 100))) {
        throw new CliError('平台合集分页不完整或列表已变化，请重新选择', 'COLLECTION_LIST_INVALID');
      }
      const rows: Record<string, unknown>[] = [];
      for (const row of data.dataList) {
        if (!record(row) || typeof row.resourceId !== 'string' || !row.resourceId.trim()
          || typeof row.resourceName !== 'string' || !row.resourceName.trim() || row.userId !== userId || ids.has(row.resourceId)) {
          throw new CliError('平台合集列表含无效或重复身份', 'COLLECTION_LIST_INVALID');
        }
        ids.add(row.resourceId);
        rows.push(row);
      }
      total = Number(data.totalItem);
      pages.set(page, rows);
    }
    if (total === 0) throw new CliError('当前账号没有线上合集，请先 collection create', 'COLLECTION_LIST_EMPTY');
    const rows = pages.get(page)!;
    const choices = rows.map((row) => ({ name: `${typeof row.resourceTitle === 'string' ? row.resourceTitle : ''} — ${row.resourceName} (${row.resourceId})`, value: `id:${row.resourceId}` }));
    if (page > 0) choices.push({ name: '上一页', value: 'previous' });
    if ((page + 1) * 100 < total!) choices.push({ name: '下一页', value: 'next' });
    choices.push({ name: '取消', value: 'cancel' });
    const choice = await selectQuestion(`选择本人合集（第${page + 1}/${Math.ceil(total! / 100)}页）`, choices, process.stderr);
    if (!choices.some((item) => item.value === choice)) throw new CliError('未选择有效合集', 'COLLECTION_SELECTOR_INVALID');
    if (choice === 'cancel') throw new CliError('已取消选择合集', 'COLLECTION_SELECTION_CANCELLED');
    if (choice === 'next') { page += 1; continue; }
    if (choice === 'previous') { page -= 1; continue; }
    return choice;
  }
}

/** 本地身份只是锚点；详情信封、精确身份、当前归属与类型均须重新核验。 */
export async function resolveCollectionTarget(input: {
  cwd: string;
  selector?: string;
  homeDir?: string;
  apis?: CollectionTargetApis;
}): Promise<ResolvedCollectionTarget> {
  const env = assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  let local: CollectionIdentityRecord | undefined;
  let selector = input.selector === undefined ? undefined : parseSelector(input.selector);
  const localCollections = listCollectionIdentities(input.cwd);
  for (const key of ['resourceId', 'resourceName'] as const) {
    const seen = new Set<string>();
    for (const identity of localCollections) {
      const value = identity[key];
      if (!value) continue;
      if (seen.has(value)) throw new CliError('本地合集身份的ID或完整标识重复，请先备份并处理冲突', 'COLLECTION_IDENTITY_CONFLICT');
      seen.add(value);
    }
  }
  if (!selector) {
    if (localCollections.length === 1) local = localCollections[0];
    else {
      if (!isInteractive()) throw new CliError('非交互调用请用 --resource id:、完整 name: 或 file:N.json 指定合集', 'COLLECTION_SELECTOR_REQUIRED');
      selector = parseSelector(await chooseOnline(auth.userId, input.apis));
    }
  }
  if (selector?.kind === 'file') local = readCollectionIdentity(input.cwd, selector.n);
  else if (selector) local = localCollections.find((identity) => selector.kind === 'id'
    ? identity.resourceId === selector.value : identity.resourceName === selector.value);
  if (local && (local.env ?? 'prod') !== env) throw new CliError('同一合集不能跨环境复用本地身份', 'COLLECTION_ENV_MISMATCH');
  if (local && (!local.resourceId || !local.resourceName)) throw new CliError('本地合集身份未绑定', 'COLLECTION_INFO_INVALID');
  const resourceIdOrName = local?.resourceId ?? (selector?.kind !== 'file' ? selector?.value : undefined);
  if (!resourceIdOrName) throw new CliError('合集选择器无效', 'COLLECTION_SELECTOR_INVALID');
  if (getEnv() !== env) throw new CliError('选择期间环境已变化，请重新执行', 'COLLECTION_ENV_MISMATCH');
  const info = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const remote = dataObject(await info({ resourceIdOrName, isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }), 'COLLECTION_INFO_INVALID');
  const { resourceId, resourceName, resourceTypeCode: typeCode, userId: owner, status } = remote;
  if (typeof resourceId !== 'string' || !resourceId.trim() || typeof resourceName !== 'string' || !resourceName.trim()
    || typeof typeCode !== 'string' || !typeCode.trim() || typeof owner !== 'number' || !Number.isSafeInteger(owner)
    || typeof status !== 'number' || ![0, 1, 2, 4].includes(status)) {
    throw new CliError('平台合集详情缺少有效身份或状态字段', 'COLLECTION_INFO_INVALID');
  }
  const subjectTypes = Array.isArray(remote.subjectType) ? remote.subjectType : [remote.subjectType];
  if (!subjectTypes.includes(4)) {
    throw new CliError('目标不是可维护的合集', 'COLLECTION_TARGET_INVALID');
  }
  if ((local && (resourceId !== local.resourceId || resourceName !== local.resourceName || typeCode !== local.typeCode))
    || (!local && selector?.kind === 'id' && resourceId !== selector.value)
    || (selector?.kind === 'name' && resourceName !== selector.value)) {
    throw new CliError('平台详情与选中的合集身份不一致，已停止', 'COLLECTION_IDENTITY_MISMATCH');
  }
  if (owner !== auth.userId) throw new CliError('只能管理当前账号的合集', 'COLLECTION_NOT_OWNER');
  return {
    resourceId,
    resourceName,
    title: typeof remote.resourceTitle === 'string' ? remote.resourceTitle : '',
    typeCode,
    ...(local ? { local } : {}),
    info: remote,
  };
}
