import { execSync } from 'node:child_process';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { resolveCwd, tryLoadCollectionProject, loadVersionProject, saveVersionProject } from '../config/project.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { CliError } from '../core/errors.js';
import { ensureSynced } from './sync/index.js';
import { publishVersion } from './resource/publishVersion.js';
import { onlineResource } from './onlineService.js';
import { validateProject } from './validateService.js';
import { computeManifestBumpVersion, type BumpLevel } from './versionBumpService.js';
import { collectionPublish } from './collection/index.js';
import { collectionVersionSet } from './collection/maintenance.js';
import { readLatestGitCommitMessage } from './gitChangelog.js';

export interface ReleaseResult {
  validated: boolean;
  built: boolean;
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
  throw new CliError('--bump 须为 patch|minor|major', { code: 4 });
}

function runBuildCommand(cwd: string, cmd: string): void {
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}

async function applyChangelogFromGit(cwd: string, isCollection: boolean): Promise<string | undefined> {
  const message = readLatestGitCommitMessage(cwd);
  if (!message) return undefined;
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
  const collectionCfg = tryLoadCollectionProject(cwd);
  const isCollection = Boolean(collectionCfg);
  const result: ReleaseResult = { validated: false, built: false, subject: isCollection ? 'collection' : 'resource' };

  const validateTarget = opts.online ? 'online' : 'publish';

  if (!opts.skipValidate) {
    const validation = await validateProject({
      cwd,
      target: validateTarget,
    });
    if (!validation.ok) {
      throw new CliError('release 预检未通过', {
        code: 4,
        hint: `freelog-cli validate --for ${validateTarget} 查看详情`,
        details: { checks: validation.checks.filter((c) => c.level === 'error') },
      });
    }
    result.validated = true;
  }

  if (opts['build-cmd']) {
    if (opts.dryRun) {
      result.built = true;
    } else {
      runBuildCommand(cwd, opts['build-cmd']);
      result.built = true;
    }
  }

  const bumpLevel = parseBumpArg(opts.bump);
  if (bumpLevel) {
    if (isCollection) {
      throw cliError(I18N_KEYS.collection_fixed_version, {
        code: 4,
        hint: '合集固定版本，release 不支持 --bump；可用 collection version set --description',
      });
    }
    const ctx = await ensureSynced({ cwd, noAutoPull: opts.noAutoPull });
    const { data } = loadVersionProject(cwd);
    const next = computeManifestBumpVersion({
      currentVersion: data.version || ctx.info.latestVersion || '1.0.0',
      latestPlatform: ctx.info.latestVersion,
      level: bumpLevel,
    });
    saveVersionProject({ ...data, version: next }, cwd);
    result.bumped = next;
  }

  if (opts.changelogFromGit) {
    result.changelogFromGit = await applyChangelogFromGit(cwd, isCollection);
  }

  if (isCollection) {
    result.published = await collectionPublish({
      cwd,
      noAutoPull: opts.noAutoPull,
      dryRun: opts.dryRun,
    });
  } else {
    result.published = await publishVersion({
      cwd,
      noAutoPull: opts.noAutoPull,
      bump: false,
      dryRun: opts.dryRun,
      debug: opts.debug,
    });
  }

  if (opts.online && !opts.dryRun) {
    result.online = await onlineResource({ cwd, noAutoPull: opts.noAutoPull });
  }

  return result;
}
