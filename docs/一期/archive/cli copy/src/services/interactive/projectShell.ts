import * as p from '@clack/prompts';
import { consola } from 'consola';
import { isInteractive } from '../../core/tty.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { createProjectInteractiveContext, type InteractiveContext } from './context.js';
import { isInteractiveCancelled } from './ephemeralLogin.js';
import {
  sessionActionDepMenu,
  sessionActionOnlineMenu,
  sessionActionPolicyMenu,
  sessionActionPublish,
  sessionActionUpdateListing,
  sessionActionVersionEdit,
  showSessionResourceSummary,
} from './sessionActions.js';

function refreshProjectContext(ctx: InteractiveContext): void {
  const resource = ctx.store.loadResource();
  ctx.resourceId = resource.resourceId;
  ctx.resourceTitle = resource.resourceTitle;
}

/**
 * 本地资源工程维护壳：把 start 的“更新当前本地工程”落成连续菜单。
 *
 * 它复用 sessionAction* 的业务动作，但 Store 是 ManifestStateStore；因此用户获得连续体验，
 * 同时仍保留工程模式的 manifest/state/report 持久化与 owner/env 门禁。
 */
export async function runProjectShell(cwd?: string): Promise<void> {
  if (!isInteractive()) {
    throw cliError(I18N_KEYS.session_interactive_tty_required, {
      code: 4,
      hint: '脚本请使用 freelog-cli status/publish/policy/online 等显式命令',
    });
  }

  const ctx = createProjectInteractiveContext(cwd);
  consola.info(`Freelog 本地工程维护：${ctx.activeProjectDir || ctx.store.rootDir()}`);

  let running = true;
  while (running) {
    refreshProjectContext(ctx);
    consola.info(
      ctx.resourceId
        ? `当前资源: ${ctx.resourceTitle || '—'} (${ctx.resourceId})`
        : '当前资源: （尚未创建；可先发新版完成首发）',
    );

    const action = await p.select({
      message: '接下来要做什么？',
      options: [
        { value: 'publish', label: '1. 构建/发行新版本' },
        { value: 'update', label: '2. 改 listing' },
        { value: 'version', label: '3. 改版本说明' },
        { value: 'deps', label: '4. 依赖 / 签约' },
        { value: 'policy', label: '5. 策略' },
        { value: 'online', label: '6. 上架 / 下架' },
        { value: 'view', label: '7. 查看当前资源' },
        { value: 'exit', label: '0. 退出' },
      ],
    });
    if (p.isCancel(action) || action === 'exit') break;

    const needsResource = !['publish', 'exit'].includes(String(action));
    if (needsResource && !ctx.resourceId) {
      consola.warn('当前工程尚未创建线上资源；请先选择「构建/发行新版本」完成首发。');
      continue;
    }

    try {
      switch (action) {
        case 'publish':
          await sessionActionPublish(ctx);
          break;
        case 'update':
          await sessionActionUpdateListing(ctx);
          break;
        case 'version':
          await sessionActionVersionEdit(ctx);
          break;
        case 'deps':
          await sessionActionDepMenu(ctx);
          break;
        case 'policy':
          await sessionActionPolicyMenu(ctx);
          break;
        case 'online':
          await sessionActionOnlineMenu(ctx);
          break;
        case 'view':
          await showSessionResourceSummary(ctx);
          break;
        default:
          break;
      }
    } catch (error) {
      if (isInteractiveCancelled(error)) continue;
      const message = error instanceof Error ? error.message : String(error);
      consola.error(message);
    }
  }

  consola.info('本地工程维护已结束。');
}
