import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { consola } from 'consola';
import { clearEphemeralAuth, formatAuthContextLine, resolveCurrentAuth } from '../../core/auth.js';
import { isInteractive } from '../../core/tty.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  ensureEphemeralLogin,
  isInteractiveCancelled,
  promptSwitchEphemeralAccount,
} from './ephemeralLogin.js';
import { enterStudioMaintain } from './studioActions.js';
import { studioPublishOneFile, summarizeStudioWorkspace } from './studioPublish.js';
import { reconcileStudioPublish } from './studioRecovery.js';

async function promptStudioReconcile(workspaceRoot: string): Promise<void> {
  const defaultReport = path.join(workspaceRoot, '.freelog', 'reports', 'studio-latest.json');
  const reportPath = await p.text({
    message: 'Studio 报告路径',
    defaultValue: defaultReport,
    validate: (value) => (String(value || '').trim() ? undefined : '必填'),
  });
  if (p.isCancel(reportPath)) return;
  const resolution = await p.select({
    message: 'Console 对账结果',
    options: [
      { value: 'confirmed-not-created', label: '确认平台未创建（允许安全重试）' },
      { value: 'confirmed-created', label: '确认平台已创建（录入 resourceId 后恢复）' },
    ],
  });
  if (p.isCancel(resolution)) return;

  let resourceId: string | undefined;
  if (resolution === 'confirmed-created') {
    const resource = await p.text({
      message: 'Console 中确认的 resourceId',
      validate: (value) => (String(value || '').trim() ? undefined : '必填'),
    });
    if (p.isCancel(resource)) return;
    resourceId = String(resource).trim();
  }

  const report = await reconcileStudioPublish({
    workspaceRoot,
    reportPath: String(reportPath),
    resolution,
    resourceId,
  });
  consola.info(`对账结果已写回报告: ${report.reportPath}`);
}

export async function runStudioShell(): Promise<void> {
  if (!isInteractive()) {
    throw cliError(I18N_KEYS.studio_tty_required, {
      code: 4,
      hint: '同账号批量请用 resource import-dir；临时维护请用 freelog-cli session',
    });
  }

  consola.info('Freelog 多账号工作区（10 · 凭据不落盘，子工程落盘）');
  clearEphemeralAuth();

  try {
    await ensureEphemeralLogin();

    let workspaceRoot = process.cwd();
    const folderPick = await p.text({
      message: '工作文件夹路径',
      defaultValue: workspaceRoot,
      validate: (v) => {
        const resolved = path.resolve(String(v || '').trim() || workspaceRoot);
        if (!fs.existsSync(resolved)) return '路径不存在';
        if (!fs.statSync(resolved).isDirectory()) return '须为目录';
        return undefined;
      },
    });
    if (p.isCancel(folderPick)) return;
    workspaceRoot = path.resolve(String(folderPick));

    let running = true;
    while (running) {
      const resolved = resolveCurrentAuth();
      if (resolved) {
        consola.info(formatAuthContextLine(resolved));
      }
      consola.info(`工作区: ${workspaceRoot}`);

      const action = await p.select({
        message: '接下来要做什么？',
        options: [
          { value: 'publish', label: '1. 从文件夹选文件发行（新建子工程）' },
          { value: 'maintain', label: '2. 进入子工程维护' },
          { value: 'switch', label: '3. 切换账号（重新登录）' },
          { value: 'summary', label: '4. 文件夹概况' },
          { value: 'reconcile', label: '5. 对账/恢复结果未知的发行' },
          { value: 'exit', label: '0. 退出' },
        ],
      });
      if (p.isCancel(action)) break;

      try {
        switch (action) {
          case 'publish':
            await studioPublishOneFile(workspaceRoot);
            break;
          case 'maintain':
            await enterStudioMaintain(workspaceRoot);
            break;
          case 'switch':
            await promptSwitchEphemeralAccount();
            break;
          case 'summary':
            summarizeStudioWorkspace(workspaceRoot);
            break;
          case 'reconcile':
            await promptStudioReconcile(workspaceRoot);
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

    consola.info('studio 已结束。凭据未保存；子工程已保留在磁盘。');
  } catch (error) {
    if (isInteractiveCancelled(error)) return;
    throw error;
  } finally {
    clearEphemeralAuth();
  }
}
