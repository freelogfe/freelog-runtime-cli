/** 合集线上目标解析：身份可来自本地合集缓存，也可直接指定线上 id/name。 */

import { CliError } from '../../core/errors';
import { listCollectionIdentities, readCollectionIdentity } from '../../local/identity';
import type { CollectionIdentityRecord } from '../../local/types';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';

export type CollectionTargetApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};

export type ResolvedCollectionTarget = {
  resourceId: string;
  resourceName: string;
  title: string;
  typeCode: string;
  local?: CollectionIdentityRecord;
  info: Record<string, unknown>;
};

function unwrapData(result: unknown): Record<string, unknown> {
  const value = result as { data?: Record<string, unknown> };
  return value.data ?? (result as Record<string, unknown>);
}

function subjectContainsCollection(subjectType: unknown): boolean {
  const values = Array.isArray(subjectType) ? subjectType : [subjectType];
  return values.some((value) => Number(value) === 4);
}

function localForSelector(cwd: string, selector: string): CollectionIdentityRecord | undefined {
  if (selector.startsWith('file:')) {
    const name = selector.slice('file:'.length);
    const match = /^([1-9]\d*)\.json$/.exec(name);
    if (!match) throw new CliError(`合集选择器无效：${selector}`, 'COLLECTION_SELECTOR_INVALID');
    return readCollectionIdentity(cwd, Number(match[1]));
  }
  return listCollectionIdentities(cwd).find((identity) => identity.resourceId === selector.replace(/^id:/, '')
    || identity.resourceName === selector.replace(/^name:/, ''));
}

/**
 * 解析并重新校验可维护合集。无选择器时仅在本地恰有一份合集身份时静默使用；
 * 多份或零份时不猜标题，要求指定稳定身份（线上已有合集可用 id:/name:）。
 */
export async function resolveCollectionTarget(input: {
  cwd: string;
  selector?: string;
  homeDir?: string;
  apis?: CollectionTargetApis;
}): Promise<ResolvedCollectionTarget> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  let local: CollectionIdentityRecord | undefined;
  if (input.selector) {
    local = localForSelector(input.cwd, input.selector);
  } else {
    const localCollections = listCollectionIdentities(input.cwd);
    if (localCollections.length === 1) local = localCollections[0];
    if (localCollections.length > 1) {
      throw new CliError('当前工程有多份合集身份；请使用 --resource id:、name: 或 file:N.json 指定合集', 'COLLECTION_SELECTOR_REQUIRED');
    }
    if (localCollections.length === 0) {
      throw new CliError('请用 --resource id:<合集ID> 或 name:<username/name> 指定线上合集，或先 collection bind', 'COLLECTION_SELECTOR_REQUIRED');
    }
  }
  const resourceIdOrName = local?.resourceId ?? input.selector?.replace(/^(id:|name:)/, '');
  if (!resourceIdOrName) throw new CliError('合集选择器无效', 'COLLECTION_SELECTOR_INVALID');
  const info = input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const remote = unwrapData(await info({ resourceIdOrName, isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }));
  const resourceId = typeof remote.resourceId === 'string' ? remote.resourceId : '';
  const owner = Number(remote.userId ?? remote.ownerId ?? remote.creatorId);
  if (!resourceId || !subjectContainsCollection(remote.subjectType)) {
    throw new CliError('目标不是可维护的合集', 'COLLECTION_TARGET_INVALID');
  }
  if (owner !== auth.userId) throw new CliError('只能管理当前账号的合集', 'COLLECTION_NOT_OWNER');
  const resourceName = typeof remote.resourceName === 'string' && remote.resourceName
    ? remote.resourceName
    : local?.resourceName ?? '';
  const typeCode = String(remote.resourceTypeCode ?? (Array.isArray(remote.resourceType) ? remote.resourceType[0] : '') ?? '');
  if (!resourceName || !typeCode) throw new CliError('平台合集详情缺少身份字段', 'COLLECTION_INFO_INVALID');
  return {
    resourceId,
    resourceName,
    title: String(remote.resourceTitle ?? remote.title ?? ''),
    typeCode,
    ...(local ? { local } : {}),
    info: remote,
  };
}
