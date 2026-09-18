import semver from 'semver';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { assertSemverLike } from './validation.js';

export type BumpLevel = 'patch' | 'minor' | 'major';

/** 基于当前 manifest 版本或平台 latest 计算下一版本（仅改 manifest，不调 API） */
export function computeManifestBumpVersion(opts: {
  currentVersion: string;
  latestPlatform?: string | null;
  level: BumpLevel;
}): string {
  const { currentVersion, latestPlatform, level } = opts;
  assertSemverLike(currentVersion);

  const base = semver.valid(currentVersion)
    ? currentVersion
    : latestPlatform && semver.valid(latestPlatform)
      ? latestPlatform
      : '1.0.0';

  const next = semver.inc(base, level);
  if (!next) {
    throw cliError(I18N_KEYS.bump_version_compute_failed, {
      code: 4,
      params: { version: base },
    });
  }

  if (latestPlatform && semver.valid(latestPlatform) && !semver.gt(next, latestPlatform)) {
    throw cliError(I18N_KEYS.freelog_versioning, {
      code: 4,
      hint: `bump 后 ${next} 须大于平台 latest ${latestPlatform}`,
    });
  }

  return next;
}
