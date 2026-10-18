/** 未决版本提交恢复：prepared 本地收尾，sending 只查询精确版本与 SHA；绝不自动重发。 */

import { CliError } from '../../core/errors';
import { draftFilePath, readDraftSha256 } from '../../local/draft';
import { readIdentity } from '../../local/identity';
import { pendingOperationFilePath, readPendingOperationSnapshot, type PendingOperation } from '../../local/pendingOperation';
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

/** 核验一条未决版本提交；prepared 只做本地收尾，sending 才按远端 SHA 核验。 */
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
  const marker = readPendingOperationSnapshot(input.cwd);
  if (!marker) return '没有结果未知的远端操作';
  const pending = marker.pending;

  const activeEnv = getEnv();
  if (pending.env !== activeEnv) {
    throw new CliError(
      `未决操作属于 ${pending.env} 环境，本次是 ${activeEnv}；请切换 --env 后恢复`,
      'PENDING_OPERATION_ENV_MISMATCH',
    );
  }
  const identity = assertPendingIdentity(input.cwd, pending);
  if (pending.state === 'prepared') {
    if (!input.apply) {
      return `尚未发送：${pending.resourceId} ${pending.version} 的提交请求尚未允许发出；工作稿已保留。运行 resource recover --apply --yes 仅清理未决记录后可重新提交`;
    }
    if (!input.yes) {
      throw new CliError('应用恢复会清理未决记录；请使用 resource recover --apply --yes', 'RECOVER_APPLY_NEED_YES');
    }
    commitLocalTransaction(input.cwd, [
      { path: pendingOperationFilePath(input.cwd), content: null, expectedBeforeSha256: marker.sha256 },
    ]);
    return `已完成恢复：${pending.resourceId} ${pending.version} 的未决记录已清理，工作稿已保留`;
  }

  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });

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
  const remoteSha = versionInfo && !Array.isArray(versionInfo) && typeof versionInfo.fileSha1 === 'string' ? versionInfo.fileSha1 : '';
  if (!remoteSha) {
    if (input.apply) {
      throw new CliError('线上尚未证明目标版本存在，不能应用恢复', 'RECOVER_NOT_CONFIRMED');
    }
    return `未确认：线上详情尚未证明 ${pending.resourceId} 的版本 ${pending.version} 及文件 SHA；已保留工作稿和未决记录，切勿重复提交`;
  }
  // 文件SHA可跨资源/版本相同；请求目标正确不代表响应属于这次未知提交。
  if (versionInfo.resourceId !== pending.resourceId || versionInfo.version !== pending.version) {
    if (input.apply) {
      throw new CliError('线上版本详情身份缺失或与未决记录不一致，不能应用恢复', 'RECOVER_NOT_CONFIRMED');
    }
    return `冲突：线上版本详情无法证明属于目标资源及版本；已保留工作稿和未决记录，切勿重复提交`;
  }
  if (remoteSha !== pending.fileSha1) {
    if (input.apply) {
      throw new CliError('线上目标版本的文件 SHA 不匹配，不能应用恢复', 'RECOVER_NOT_CONFIRMED');
    }
    return `冲突：线上 ${pending.version} 的文件 SHA 与未决记录不同；已保留工作稿和未决记录，切勿重复提交`;
  }
  // 不解析后来新稿；无效JSON/错配稿也只是保留对象，不影响精确核验旧提交。
  assertPendingIdentity(input.cwd, pending, identity.typeCode);
  const currentSha256 = readDraftSha256(input.cwd, identity.n);
  const removeDraft = pending.schemaVersion === 3 && currentSha256 === pending.draftSha256;
  const retainDraft = currentSha256 !== undefined && !removeDraft;
  if (!input.apply) {
    const disposition = retainDraft ? '工作稿将保留（已变化或旧记录无法证明未变）'
      : removeDraft ? '将清理本次未变工作稿' : '本地已无工作稿';
    return `已确认：${pending.resourceId} ${pending.version} 已以相同 SHA 提交。${disposition}；运行 resource recover --apply --yes 清理本次未决记录`;
  }
  if (!input.yes) {
    throw new CliError('应用恢复会清理本次未决记录；请使用 resource recover --apply --yes', 'RECOVER_APPLY_NEED_YES');
  }
  commitLocalTransaction(input.cwd, [
    ...(removeDraft ? [{ path: draftFilePath(input.cwd, identity.n), content: null, expectedBeforeSha256: currentSha256 }] : []),
    { path: pendingOperationFilePath(input.cwd), content: null, expectedBeforeSha256: marker.sha256 },
  ]);
  if (retainDraft) return `已完成恢复：${pending.resourceId} ${pending.version} 的未决记录已清理，工作稿已保留（已变化或旧记录无法证明未变）；请检查后准备下一版`;
  if (!removeDraft) return `已完成恢复：${pending.resourceId} ${pending.version} 的未决记录已清理，本地已无工作稿`;
  return `已完成恢复：${pending.resourceId} ${pending.version} 的本地工作稿和未决记录已清理`;
}

/** GET前与最后await后使用同一主体门禁；同稿摘要不能替代身份核对。 */
function assertPendingIdentity(cwd: string, pending: PendingOperation, expectedTypeCode?: string) {
  const identity = readIdentity(cwd, pending.resourceN);
  if (identity.resourceId !== pending.resourceId || (identity.env ?? 'prod') !== pending.env
    || expectedTypeCode !== undefined && identity.typeCode !== expectedTypeCode) {
    throw new CliError('未决操作与当前 N.json 身份或环境不一致，拒绝猜测清理', 'PENDING_OPERATION_LOCAL_MISMATCH');
  }
  return identity;
}
