/** 上架/下架领域层：online 前置校验（有版本 + 有启用策略）后 PUT status:1；offline status:4。 */

import { CliError } from '../../core/errors';
import { confirmWrite } from '../../core/tty';
import { withProjectLock } from '../../local/lock';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { unwrapData } from '../../platform/unwrap';
import { assertRemoteResourceOwned, assertRemoteResourceWritable, resolveBoundIdentity } from '../version/gates';

export type ShelfApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};



async function loadInfo(
  resourceId: string,
  apis?: ShelfApis,
): Promise<Record<string, unknown>> {
  const infoApi = apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  return unwrapData(
    await infoApi({
      resourceIdOrName: resourceId,
      isLoadLatestVersionInfo: 1,
      isLoadPolicyInfo: 1,
    }),
  );
}

/** 上架前置门禁：必须已发过版本、至少一条启用策略（对照 Console 上架按钮的校验）。 */
export function validateForOnline(info: Record<string, unknown>): void {
  if (!info.latestVersion) {
    // i18n: cli.online.no_version
    throw new CliError('上架须已有版本', 'ONLINE_NO_VERSION');
  }
  if (!Array.isArray(info.policies)) throw new CliError('平台策略列表无效，无法确认可上架', 'ONLINE_INFO_INVALID');
  if (!info.policies.some((item) => item && typeof item === 'object' && item.status === 1)) {
    // i18n: cli.online.no_policy
    throw new CliError('上架须至少一条启用策略', 'ONLINE_NO_POLICY');
  }
}

type ShelfInput = {
  cwd: string;
  file?: string;
  homeDir?: string;
  apis?: ShelfApis;
  yes?: boolean;
  json?: boolean;
};
export type ShelfResult = { resourceId: string; status: 0 | 1 | 4; changed: boolean };

/** 只读预检和上下架共用：未知状态不能被当成可修改状态。 */
export function assertKnownShelfStatus(info: Record<string, unknown>): void {
  if (![0, 1, 4].includes(info.status as number)) throw new CliError('平台资源状态无效，拒绝修改上下架', 'RESOURCE_STATUS_INVALID');
}

async function changeShelf(input: ShelfInput, desired: 1 | 4): Promise<ShelfResult> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  return withProjectLock(input.cwd, () => changeShelfLocked(input, auth.userId, desired), desired === 1 ? 'online' : 'offline');
}

async function changeShelfLocked(input: ShelfInput, authUserId: number, desired: 1 | 4): Promise<ShelfResult> {
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const info = await loadInfo(identity.resourceId!, input.apis);
  assertRemoteResourceWritable({ info, resourceId: identity.resourceId!, authUserId });
  assertKnownShelfStatus(info);
  if (desired === 1) validateForOnline(info);
  if (info.status === desired || (desired === 4 && info.status === 0)) {
    return { resourceId: identity.resourceId!, status: info.status as 0 | 1 | 4, changed: false };
  }
  const policyNames = desired === 1 ? (info.policies as Record<string, unknown>[])
    .filter((item) => item && typeof item === 'object' && item.status === 1)
    .map((item) => typeof item.policyName === 'string' && item.policyName ? item.policyName : typeof item.policyId === 'string' ? item.policyId : '（策略名称缺失）') : [];
  await confirmWrite(`${desired === 1 ? '上架' : '下架'}资源\n标识：${identity.resourceName ?? identity.resourceId}\n版本：${String(info.latestVersion ?? '无')}${desired === 1 ? `\n启用策略：${policyNames.join('、')}` : ''}`, input.yes, input.json ? process.stderr : undefined);
  const update =
    input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  const unknown = () => new CliError('上下架结果未知；请先核对线上状态，勿重复执行。', 'SHELF_RESULT_UNKNOWN');
  try {
    const response = await update({ resourceId: identity.resourceId, status: desired }) as { ret?: unknown; errCode?: unknown } | null;
    if (!response || typeof response !== 'object' || Array.isArray(response)
      || (response.ret !== undefined && response.ret !== 0) || (response.errCode !== undefined && response.errCode !== 0)) throw unknown();
  } catch { throw unknown(); }
  let after: Record<string, unknown>;
  try { after = await loadInfo(identity.resourceId!, input.apis); }
  catch { throw unknown(); }
  try {
    assertRemoteResourceOwned({ info: after, resourceId: identity.resourceId!, authUserId });
    if (after.status !== desired || after.isFrozen === true) throw new Error('Shelf mismatch');
  } catch { throw new CliError('上下架写入后状态读回不一致；请先核对线上状态，勿重复执行。', 'SHELF_VERIFY_FAILED'); }
  return { resourceId: identity.resourceId!, status: desired, changed: true };
}

/** 上架：版本及策略门禁不能被yes或幂等分支绕过。 */
export async function onlineResource(input: ShelfInput): Promise<ShelfResult> {
  return changeShelf(input, 1);
}

/** 下架：status0/4保留原状态；真正写入只用4，不要求策略。 */
export async function offlineResource(input: ShelfInput): Promise<ShelfResult> {
  return changeShelf(input, 4);
}
