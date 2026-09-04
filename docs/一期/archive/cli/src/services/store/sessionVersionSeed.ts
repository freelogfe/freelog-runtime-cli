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
      hint: '传 --target-version <semver>；命令会话不会读取其他进程的 version 意图',
    });
  }
  store.saveVersion({ version, filePath: '' });
}

/** 仅修改本地意图的命令会话必须导出，否则命令退出后结果不可消费。 */
export function assertSessionDependencyIntentExport(
  store: ProjectStore,
  exportProject?: string,
): void {
  if (store.mode() !== 'session' || exportProject?.trim()) return;
  throw cliError(I18N_KEYS.session_dep_export_project_required, {
    code: 4,
    hint: '添加 --export-project <dir> 后进入导出工程 publish；或使用 freelog-cli session 完成内存多步操作',
  });
}
