/**
 * 版本路由门禁：create-version（无 latest 才行）vs update-version（必须已有 latest）。
 * 错误码 GATE_*；两条发行命令禁止自动改口就是在这里拦的。
 */

import { CliError } from '../../core/errors';
import { readDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';
import type { IdentityRecord, VersionDraft } from '../../local/types';
import { getEnv } from '../env';

export type VersionIntent = 'create-version' | 'update-version' | 'draft-pull';

export type GateInput = {
  latestVersion?: string;
  draft?: VersionDraft;
  reuseVersion?: string;
};

/** 按意图做路由门禁：create 拒已有 latest/更新稿；update 拒无 latest；pull 拒无 latest。 */
export function evaluateGates(input: GateInput, intent: VersionIntent): void {
  const latest = input.latestVersion;
  const draft = input.draft;
  const source = input.reuseVersion ?? latest;

  if (intent === 'create-version') {
    if (latest) {
      // i18n: cli.gates.create_has_latest
      throw new CliError(
        `这个资源已经有发行版本。线上 latest 是 ${latest}，请用 update-version。`,
        'GATE_USE_UPDATE',
      );
    }
    if (draft?.fromVersion) {
      // i18n: cli.gates.create_update_draft
      throw new CliError(
        '这是更新版本的稿，发行版本不用。',
        'GATE_CREATE_SEES_UPDATE_DRAFT',
      );
    }
    return;
  }

  if (intent === 'update-version') {
    if (!latest) {
      // i18n: cli.gates.update_no_latest
      throw new CliError('还没有发行版本，请先 create-version', 'GATE_USE_CREATE');
    }
    if (draft && !draft.fromVersion && input.reuseVersion === undefined) {
      return;
    }
    if (
      draft?.fromVersion &&
      source &&
      draft.fromVersion !== source
    ) {
      return;
    }
    return;
  }

  if (!latest) {
    // i18n: cli.gates.pull_no_latest
    throw new CliError('还没有发行版本，请先 create-version', 'GATE_USE_CREATE');
  }
}

/** 取已接入平台（有 resourceId）的身份；create/bind 都没做就报 GATE_NO_RESOURCE。 */
export function resolveBoundIdentity(cwd: string, file?: string): IdentityRecord {
  const identity = resolveIdentity(cwd, file);
  if (!identity.resourceId) {
    // i18n: cli.gates.no_resource_id
    throw new CliError('请先 create 或 bind', 'GATE_NO_RESOURCE');
  }
  const identityEnv = identity.env ?? 'prod';
  const activeEnv = getEnv();
  if (identityEnv !== activeEnv) {
    throw new CliError(
      `资源 ${identity.n}.json 属于 ${identityEnv} 环境，本次是 ${activeEnv}；请切换 --env 或选择该环境的资源状态`,
      'RESOURCE_ENV_MISMATCH',
    );
  }
  return identity;
}

/**
 * 线上写入的共同事实门禁。身份文件只说明“曾经绑定过”；真正写平台前必须由
 * 当次详情响应确认目标仍是同一资源、当前登录人仍是 owner 且资源未冻结。
 */
export function assertRemoteResourceWritable(input: {
  info: Record<string, unknown>;
  resourceId: string;
  authUserId: number;
  codes?: {
    invalid?: string;
    notOwner?: string;
    frozen?: string;
  };
}): void {
  const codes = {
    invalid: input.codes?.invalid ?? 'RESOURCE_WRITE_INFO_INVALID',
    notOwner: input.codes?.notOwner ?? 'RESOURCE_NOT_OWNER',
    frozen: input.codes?.frozen ?? 'RESOURCE_FROZEN',
  };
  assertRemoteResourceOwned({
    info: input.info,
    resourceId: input.resourceId,
    authUserId: input.authUserId,
    codes,
  });
  if (input.info.status === 2 || input.info.isFrozen === true) {
    throw new CliError('资源已被冻结，不能修改', codes.frozen);
  }
}

/** 资源详情必须确认目标 ID 和当前 owner；只读核验的恢复流程不需要冻结门禁。 */
export function assertRemoteResourceOwned(input: {
  info: Record<string, unknown>;
  resourceId: string;
  authUserId: number;
  codes?: {
    invalid?: string;
    notOwner?: string;
  };
}): void {
  const codes = {
    invalid: input.codes?.invalid ?? 'RESOURCE_WRITE_INFO_INVALID',
    notOwner: input.codes?.notOwner ?? 'RESOURCE_NOT_OWNER',
  };
  if (input.info.resourceId !== input.resourceId) {
    throw new CliError('平台详情缺少或不匹配 resourceId，拒绝写入', codes.invalid);
  }
  const ownerId = input.info.userId ?? input.info.ownerId ?? input.info.creatorId;
  if (typeof ownerId !== 'number' || !Number.isSafeInteger(ownerId)) {
    throw new CliError('平台详情缺少资源 owner，拒绝写入', codes.invalid);
  }
  if (ownerId !== input.authUserId) {
    throw new CliError('只能修改自己的资源', codes.notOwner);
  }
}

/** 一次拿身份 + 工作稿（update-version 编排的入口）。 */
export function loadLocalDraft(cwd: string, file?: string): {
  identity: IdentityRecord;
  draft?: VersionDraft;
} {
  const identity = resolveIdentity(cwd, file);
  return {
    identity,
    draft: readDraft(cwd, identity.n),
  };
}
