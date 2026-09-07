/**
 * 版本路由门禁：create-version（无 latest 才行）vs update-version（必须已有 latest）。
 * 错误码 GATE_*；两条发行命令禁止自动改口就是在这里拦的。
 */

import { CliError } from '../../core/errors';
import { readDraft } from '../../local/draft';
import { resolveIdentity } from '../../local/resolve';
import type { IdentityRecord, VersionDraft } from '../../local/types';

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
  return identity;
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
