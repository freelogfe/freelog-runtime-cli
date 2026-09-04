import semver from 'semver';
import { cliError } from '../../../i18n/cliError.js';
import { I18N_KEYS } from '../../../i18n/bundled.js';
import { collectionStoreFromCwd } from '../../store/index.js';
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

/** Console versionCreator：合集目录不能走独立资源 publish */
export function assertPublishNotCollectionCwd(cwd?: string): void {
  if (collectionStoreFromCwd(cwd).tryLoad()) {
    throw cliError(I18N_KEYS.create_new_version_error_unknowsubject, { code: 4 });
  }
}

/** publish 前 version / filePath 门禁（可单测） */
export function assertPublishVersionReady(versionCfg: {
  version?: string;
  filePath?: string;
  fileSha1?: string | null;
  reusePlatformFile?: boolean;
}): void {
  if (!versionCfg.version) {
    throw cliError(I18N_KEYS.manifest_version_missing, {
      code: 4,
      hint: 'freelog-cli version set --version <版本号> 或 publish --bump',
    });
  }
  const reuse =
    versionCfg.reusePlatformFile === true ||
    (!versionCfg.filePath?.trim() && !!versionCfg.fileSha1?.trim());
  if (!reuse && !versionCfg.filePath?.trim()) {
    throw cliError(I18N_KEYS.manifest_filepath_missing, { code: 4 });
  }
}
