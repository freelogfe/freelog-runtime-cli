import * as p from '@clack/prompts';
import { consola } from 'consola';
import { clearEphemeralAuth, formatAuthContextLine, resolveCurrentAuth } from '../../core/auth.js';
import { isInteractive } from '../../core/tty.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { createSessionContext } from './context.js';
import {
  ensureEphemeralLogin,
  isInteractiveCancelled,
  promptSwitchEphemeralAccount,
} from './ephemeralLogin.js';
import {
  pickSessionResource,
  sessionActionDepMenu,
  sessionActionExportProject,
  sessionActionOnlineMenu,
  sessionActionPolicyMenu,
  sessionActionPublish,
  sessionActionUpdateListing,
  sessionActionVersionEdit,
  showSessionResourceSummary,
} from './sessionActions.js';

/** 11 · 交互会话：A=1 S=1 */
export async function runSessionShell(): Promise<void> {
  if (!isInteractive()) {
    throw cliError(I18N_KEYS.session_interactive_tty_required, {
      code: 4,
      hint: '脚本请用 xxx --session；多账号落盘请用 freelog-cli studio',
    });
  }

  consola.info('Freelog 交互会话（11 · 凭据与 state 均不落盘）');

  const ctx = createSessionContext();
  clearEphemeralAuth();

  try {
    await ensureEphemeralLogin();
    await pickSessionResource(ctx);

    let running = true;
    while (running) {
      const resolved = resolveCurrentAuth();
      if (resolved) {
        consola.info(formatAuthContextLine(resolved));
      }
      if (ctx.resourceId) {
        consola.info(`当前资源: ${ctx.resourceTitle || '—'} (${ctx.resourceId})`);
      } else {
        consola.info('当前资源: （未选择 / 新建首发）');
      }

      const action = await p.select({
        message: '接下来要做什么？',
        options: [
          { value: 'publish', label: '1. 发新版' },
          { value: 'update', label: '2. 改 listing' },
          { value: 'version', label: '3. 改版本说明' },
          { value: 'deps', label: '4. 依赖 / 签约' },
          { value: 'policy', label: '5. 策略' },
          { value: 'online', label: '6. 上架 / 下架' },
          { value: 'view', label: '7. 查看当前资源' },
          { value: 'export', label: '8. 导出工程' },
          { value: 'resource', label: '9. 切换 / 选择资源' },
          { value: 'switch', label: '10. 切换账号' },
          { value: 'exit', label: '0. 退出' },
        ],
      });
      if (p.isCancel(action)) break;

      const needsResource = !['publish', 'resource', 'switch', 'exit'].includes(String(action));
      if (needsResource && !ctx.resourceId) {
        consola.warn('请先选择资源（菜单 9），或直接用「发新版」新建首发');
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
          case 'export':
            await sessionActionExportProject(ctx);
            break;
          case 'resource':
            await pickSessionResource(ctx);
            break;
          case 'switch':
            await promptSwitchEphemeralAccount();
            if (ctx.resourceId) {
              consola.info(
                '已切换账号。若当前资源属于其他账号，写操作将被拒绝；请用菜单 9 重选资源。',
              );
            }
            break;
          case 'exit':
            running = false;
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

    consola.info('session 已结束。凭据与内存 state 已清空。');
  } catch (error) {
    if (isInteractiveCancelled(error)) return;
    throw error;
  } finally {
    clearEphemeralAuth();
  }
}
