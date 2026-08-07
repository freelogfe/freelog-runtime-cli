import semver from 'semver';
import { tryLoadCollectionProject } from '../../../config/project.js';
import { cliError } from '../../../i18n/cliError.js';
import { I18N_KEYS } from '../../../i18n/bundled.js';
import { assertSemverLike } from '../../validation.js';

/** 纯版本比较：新版本须 > latest（latest 无效时跳过 gt） */
export function assertVersionGreaterThanLatest(version: string, latestVersion?: string): void {
  assertSemverLike(version);
  if (!latestVersion || !semver.valid(latestVersion) || !semver.valid(version)) return;
  if (!semver.gt(version, latestVersion)) {
    throw cliError(I18N_KEYS.freelog_versioning, {
      code: 4,
      hint: `当前意图 ${version}`,
    });
  }
}

/** Console versionCreator：合集目录不能走单品 publish */
export function assertPublishNotCollectionCwd(cwd?: string): void {
  if (tryLoadCollectionProject(cwd)) {
    throw cliError(I18N_KEYS.create_new_version_error_unknowsubject, { code: 4 });
  }
}

/** publish 前 version / filePath 门禁（可单测） */
export function assertPublishVersionReady(versionCfg: { version?: string; filePath?: string }): void {
  if (!versionCfg.version) {
    throw cliError(I18N_KEYS.manifest_version_missing, {
      code: 4,
      hint: 'freelog-cli version set --version <版本号> 或 publish --bump',
    });
  }
  if (!versionCfg.filePath) {
    throw cliError(I18N_KEYS.manifest_filepath_missing, { code: 4 });
  }
}
