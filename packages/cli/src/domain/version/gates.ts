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

export function resolveBoundIdentity(cwd: string, file?: string): IdentityRecord {
  const identity = resolveIdentity(cwd, file);
  if (!identity.resourceId) {
    // i18n: cli.gates.no_resource_id
    throw new CliError('请先 create 或 bind', 'GATE_NO_RESOURCE');
  }
  return identity;
}

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
