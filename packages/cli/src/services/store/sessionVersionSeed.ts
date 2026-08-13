import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { ProjectStore } from './types.js';

/** 会话 dep 改 Store 前须有「下一版」version 块（≅ Console versionCreator.versionInput）。 */
export function ensureSessionVersionIntent(store: ProjectStore, targetVersion?: string): void {
  if (store.mode() !== 'session') return;
  if (store.tryLoadVersion()?.version?.trim()) return;
  const version = targetVersion?.trim();
  if (!version) {
    throw cliError(I18N_KEYS.session_dep_target_version_required, {
      code: 4,
      hint: '传 --target-version <semver>，或先执行 resource publish --session 写入 version 意图',
    });
  }
  store.saveVersion({ version, filePath: '' });
}
