/** 结果未知的版本提交恢复：只查询精确版本与 SHA；绝不自动重发。 */

import { CliError } from '../../core/errors';
import { draftFilePath, readDraft } from '../../local/draft';
import { readIdentity } from '../../local/identity';
import { pendingOperationFilePath, readPendingOperation } from '../../local/pendingOperation';
import { commitLocalTransaction } from '../../local/transaction';
import { FServiceAPI } from '../../platform/api';
import { unwrapData } from '../../platform/unwrap';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed, getEnv } from '../env';
import { withProjectLock } from '../../local/lock';
import { assertRemoteResourceOwned } from '../version/gates';

export type RecoverApis = {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  resourceVersionInfo1?: (params: Record<string, unknown>) => Promise<unknown>;
};

/**
 * 核验一条未决版本提交。默认不改盘；只有 --apply --yes 且版本 SHA 完全一致时清理本地尾声。
 */
export async function recoverPendingOperation(input: {
  cwd: string;
  apply?: boolean;
  yes?: boolean;
  homeDir?: string;
  apis?: RecoverApis;
}): Promise<string> {
  return withProjectLock(input.cwd, () => recoverPendingOperationLocked(input), 'resource-recover');
}

async function recoverPendingOperationLocked(input: {
  cwd: string;
  apply?: boolean;
  yes?: boolean;
  homeDir?: string;
  apis?: RecoverApis;
}): Promise<string> {
  assertPlatformAllowed();
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const pending = readPendingOperation(input.cwd);
  if (!pending) return '没有结果未知的远端操作';

  const activeEnv = getEnv();
  if (pending.env !== activeEnv) {
    throw new CliError(
      `未决操作属于 ${pending.env} 环境，本次是 ${activeEnv}；请切换 --env 后恢复`,
      'PENDING_OPERATION_ENV_MISMATCH',
    );
  }
  const identity = readIdentity(input.cwd, pending.resourceN);
  if (
    identity.resourceId !== pending.resourceId
    || (identity.env ?? 'prod') !== pending.env
  ) {
    throw new CliError('未决操作与当前 N.json 身份或环境不一致，拒绝猜测清理', 'PENDING_OPERATION_LOCAL_MISMATCH');
  }
  const draft = readDraft(input.cwd, identity.n);
  if (draft?.resourceId && draft.resourceId !== pending.resourceId) {
    throw new CliError('未决操作与当前工作稿不一致，拒绝猜测清理', 'PENDING_OPERATION_LOCAL_MISMATCH');
  }

  const infoApi = input.apis?.info
    ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(await infoApi({ resourceIdOrName: pending.resourceId }));
  assertRemoteResourceOwned({
    info,
    resourceId: pending.resourceId,
    authUserId: auth.userId,
    codes: {
      invalid: 'RECOVER_RESOURCE_INFO_INVALID',
      notOwner: 'RECOVER_NOT_OWNER',
    },
  });

  const versionInfoApi = input.apis?.resourceVersionInfo1
    ?? ((params: Record<string, unknown>) => FServiceAPI.Resource.resourceVersionInfo1(params as never));
  const versionInfo = unwrapData(await versionInfoApi({
    resourceId: pending.resourceId,
    version: pending.version,
  }));
  const remoteSha = typeof versionInfo.fileSha1 === 'string' ? versionInfo.fileSha1 : '';
  if (!remoteSha) {
    if (input.apply) {
      throw new CliError('线上尚未证明目标版本存在，不能应用恢复', 'RECOVER_NOT_CONFIRMED');
    }
    return `未确认：线上不存在 ${pending.resourceId} 的版本 ${pending.version}；已保留工作稿和未决记录，切勿重复提交`;
  }
  if (remoteSha !== pending.fileSha1) {
    if (input.apply) {
      throw new CliError('线上目标版本的文件 SHA 不匹配，不能应用恢复', 'RECOVER_NOT_CONFIRMED');
    }
    return `冲突：线上 ${pending.version} 的文件 SHA 与未决记录不同；已保留工作稿和未决记录，切勿重复提交`;
  }
  if (!input.apply) {
    return `已确认：${pending.resourceId} ${pending.version} 已以相同 SHA 提交。运行 resource recover --apply --yes 清理本地工作稿和未决记录`;
  }
  if (!input.yes) {
    throw new CliError('应用恢复会删除本地工作稿；请使用 resource recover --apply --yes', 'RECOVER_APPLY_NEED_YES');
  }
  commitLocalTransaction(input.cwd, [
    { path: pendingOperationFilePath(input.cwd), content: null },
    { path: draftFilePath(input.cwd, identity.n), content: null },
  ]);
  return `已完成恢复：${pending.resourceId} ${pending.version} 的本地工作稿和未决记录已清理`;
}
