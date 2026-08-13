import { execSync } from 'node:child_process';

import { resolveCwd, tryLoadCollectionProject, loadVersionProject, saveVersionProject } from '../config/project.js';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { cliError } from '../i18n/cliError.js';
import { collectionPublish } from './collection/index.js';
import { collectionVersionSet } from './collection/maintenance.js';
import { readLatestGitCommitMessage } from './gitChangelog.js';
import { onlineResource } from './onlineService.js';
import { ensureSyncedReadOnly, publishVersion } from './resource/publishVersion.js';
import { ensureSynced } from './sync/index.js';
import { projectStoreFromCwd } from './store/projectStore.js';
import { validateProject } from './validateService.js';
import { computeManifestBumpVersion, type BumpLevel } from './versionBumpService.js';

export interface ReleaseResult {
  validated: boolean;
  validatedAfterBuild?: boolean;
  built: boolean;
  buildPlanned?: boolean;
  bumped?: string;
  changelogFromGit?: string;
  published?: Awaited<ReturnType<typeof publishVersion>> | Awaited<ReturnType<typeof collectionPublish>>;
  online?: Awaited<ReturnType<typeof onlineResource>>;
  subject: 'resource' | 'collection';
}

function parseBumpArg(bump: boolean | string | undefined): BumpLevel | false {
  if (!bump) return false;
  if (bump === true) return 'patch';
  const raw = String(bump).toLowerCase();
  if (raw === 'patch' || raw === 'minor' || raw === 'major') return raw;
  throw cliError(I18N_KEYS.bump_level_invalid, { code: 4 });
}

function runBuildCommand(cwd: string, cmd: string): void {
  execSync(cmd, { cwd, stdio: 'inherit' });
}

async function applyChangelogFromGit(
  cwd: string,
  isCollection: boolean,
  dryRun = false,
): Promise<string | undefined> {
  const message = readLatestGitCommitMessage(cwd);
  if (!message) return undefined;
  if (dryRun) return message;

  if (isCollection) {
    await collectionVersionSet({ cwd, description: message });
  } else {
    const { data } = loadVersionProject(cwd);
    saveVersionProject({ ...data, description: message }, cwd);
  }
  return message;
}

export async function releaseProject(opts: {
  cwd?: string;
  bump?: boolean | string;
  'build-cmd'?: string;
  online?: boolean;
  skipValidate?: boolean;
  dryRun?: boolean;
  noAutoPull?: boolean;
  yes?: boolean;
  debug?: boolean;
  changelogFromGit?: boolean;
}): Promise<ReleaseResult> {
  if (!opts.dryRun) assertExplicitEnvForWriteOperation();

  const cwd = resolveCwd(opts.cwd);
  const store = projectStoreFromCwd(cwd);
  const isCollection = Boolean(tryLoadCollectionProject(cwd));
  const result: ReleaseResult = {
    validated: false,
    built: false,
    subject: isCollection ? 'collection' : 'resource',
  };
  let plannedVersion: string | undefined;
  let plannedDescription: string | undefined;

  // 先形成 bump 后的目标版本，并用它做预检；校验通过前不写 manifest。
  const bumpLevel = parseBumpArg(opts.bump);
  if (bumpLevel && isCollection) {
    throw cliError(I18N_KEYS.collection_fixed_version, {
      code: 4,
      hint: '合集固定版本，release 不支持 --bump；可用 collection version set --description',
    });
  }
  if (bumpLevel) {
    const ctx = opts.dryRun
      ? await ensureSyncedReadOnly({ store })
      : await ensureSynced({ store, noAutoPull: opts.noAutoPull });
    const { data } = loadVersionProject(cwd);
    plannedVersion = computeManifestBumpVersion({
      currentVersion: data.version || ctx.info.latestVersion || '1.0.0',
      latestPlatform: ctx.info.latestVersion,
      level: bumpLevel,
    });
    result.bumped = plannedVersion;
  }

  // release 先完成 publish；online 动态门禁在 publish 成功后由 onlineResource 执行。
  const validateTarget = 'publish' as const;
  if (!opts.skipValidate) {
    const validation = await validateProject({
      cwd,
      target: validateTarget,
      skipArtifactChecks: Boolean(opts['build-cmd']),
      versionOverride: plannedVersion,
    });
    if (!validation.ok) {
      throw cliError(I18N_KEYS.release_preflight_failed, {
        code: 4,
        hint: `freelog-cli validate --for ${validateTarget} 查看详情`,
        details: { checks: validation.checks.filter((check) => check.level === 'error') },
      });
    }
    result.validated = true;
  }

  if (opts['build-cmd']) {
    if (opts.dryRun) {
      result.buildPlanned = true;
    } else {
      runBuildCommand(cwd, opts['build-cmd']);
      result.built = true;
      if (!opts.skipValidate) {
        const validation = await validateProject({
          cwd,
          target: validateTarget,
          versionOverride: plannedVersion,
        });
        if (!validation.ok) {
          throw cliError(I18N_KEYS.release_preflight_failed, {
            code: 4,
            hint: `build 已完成，但产物校验失败；运行 freelog-cli validate --for ${validateTarget} 查看详情`,
            details: { checks: validation.checks.filter((check) => check.level === 'error') },
          });
        }
        result.validatedAfterBuild = true;
      }
    }
  }

  if (bumpLevel && plannedVersion && !opts.dryRun) {
    const { data } = loadVersionProject(cwd);
    saveVersionProject({ ...data, version: plannedVersion }, cwd);
  }

  if (opts.changelogFromGit) {
    result.changelogFromGit = await applyChangelogFromGit(cwd, isCollection, opts.dryRun);
    if (opts.dryRun && !isCollection) plannedDescription = result.changelogFromGit;
  }

  if (isCollection) {
    result.published = await collectionPublish({
      cwd,
      noAutoPull: opts.noAutoPull,
      dryRun: opts.dryRun,
    });
  } else {
    result.published = await publishVersion({
      store,
      noAutoPull: opts.noAutoPull,
      bump: false,
      dryRun: opts.dryRun,
      debug: opts.debug,
      versionOverride: plannedVersion,
      descriptionOverride: plannedDescription,
    });
  }

  if (opts.online && !opts.dryRun) {
    result.online = await onlineResource({ store, noAutoPull: opts.noAutoPull });
  }

  return result;
}
