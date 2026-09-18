import * as p from '@clack/prompts';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { resolveCwd } from '../config/project.js';
import { cliReadCommandArgs } from '../core/cliArgs.js';
import { applyCommandFlags, handleCommandError, writeJsonSuccess } from '../core/command.js';
import { getCliEnv, setCliEnv } from '../core/env.js';
import { isInteractive } from '../core/tty.js';
import { cliError } from '../i18n/cliError.js';
import { runBatchImportWizard } from '../services/batchImportWizard.js';
import { runCollectionShell } from '../services/interactive/collectionShell.js';
import { runProjectShell } from '../services/interactive/projectShell.js';
import { runSessionShell } from '../services/interactive/sessionShell.js';
import { runStudioShell } from '../services/interactive/studioShell.js';
import { buildProjectStatus } from '../services/statusService.js';
import { buildStartGuide, type StartTask } from '../services/startGuide.js';

function printTask(task: StartTask): void {
  consola.info(`${task.label}`);
  consola.info(`  ${task.description}`);
  for (const command of task.nextCommands) {
    consola.info(`  ${command}`);
  }
}

function printGuide(guide: ReturnType<typeof buildStartGuide>): void {
  consola.info(`环境: ${guide.summary.environment}`);
  consola.info(`登录: ${guide.summary.loggedIn ? '已登录' : '未登录'}`);
  if (guide.summary.resourceId) consola.info(`当前资源: ${guide.summary.resourceId}`);
  if (guide.summary.collectionId) consola.info(`当前合集: ${guide.summary.collectionId}`);
  consola.info('');
  const recommended = guide.tasks.find((task) => task.id === guide.recommendedTaskId);
  if (recommended) {
    consola.success(`建议先做：${recommended.label}`);
    printTask(recommended);
  }
  consola.info('');
  consola.info('其它入口：');
  for (const task of guide.tasks.filter((item) => item.id !== guide.recommendedTaskId)) {
    consola.info(`- ${task.label}: ${task.nextCommands[0]}`);
  }
}

async function selectTask(guide: ReturnType<typeof buildStartGuide>): Promise<StartTask | null> {
  const selected = await p.select({
    message: '你要做什么？',
    initialValue: guide.recommendedTaskId,
    options: guide.tasks.map((task) => ({
      value: task.id,
      label: task.label,
      hint: task.description,
    })),
  });
  if (p.isCancel(selected)) return null;
  return guide.tasks.find((task) => task.id === selected) ?? null;
}

async function confirmEnterSessionForNewPublish(): Promise<boolean> {
  const mode = await p.select({
    message: '发布新资源的启动方式',
    options: [
      {
        value: 'session',
        label: '进入 session 连续首发/发版',
        hint: '不写 manifest，适合马上完成一次发行；之后可导出工程',
      },
      {
        value: 'commands',
        label: '查看本地工程命令',
        hint: '适合主题/插件/package 模板工程',
      },
    ],
  });
  if (p.isCancel(mode)) return false;
  return mode === 'session';
}

async function runSessionOrStudio(): Promise<void> {
  const mode = await p.select({
    message: '选择临时工作模式',
    options: [
      { value: 'session', label: 'session：一次会话完成维护，不落盘' },
      { value: 'studio', label: 'studio：多账号工作区，子工程落盘' },
    ],
  });
  if (p.isCancel(mode)) return;
  if (mode === 'studio') {
    await runStudioShell();
    return;
  }
  await runSessionShell();
}

async function executeInteractiveTask(
  task: StartTask,
  cwd: string,
  guide: ReturnType<typeof buildStartGuide>,
): Promise<boolean> {
  switch (task.id) {
    case 'publish-new':
      if (await confirmEnterSessionForNewPublish()) {
        consola.info('进入 session 后，资源选择处选「新建首发」，再进入「发新版」。');
        await runSessionShell();
        return true;
      }
      return false;
    case 'update-local':
      if (!guide.summary.hasResourceProject && !guide.summary.hasVersionIntent) return false;
      await runProjectShell(cwd);
      return true;
    case 'collection':
      if (!guide.summary.hasCollectionProject) return false;
      await runCollectionShell(cwd);
      return true;
    case 'maintain-online':
    case 'policy-online':
      consola.info('进入 session 后，可按 resourceId/search 选择线上资源，再维护策略、依赖和上下架。');
      await runSessionShell();
      return true;
    case 'batch-import':
      await runBatchImportWizard({ cwd });
      return true;
    case 'session-studio':
      await runSessionOrStudio();
      return true;
    default:
      return false;
  }
}

async function ensureInteractiveStartEnv(): Promise<void> {
  if (!isInteractive() || getCliEnv() !== 'production') return;
  const env = await p.select({
    message: '选择运行环境',
    options: [
      { value: 'dev', label: 'dev 开发环境' },
      { value: 'test', label: 'test 测试环境' },
    ],
  });
  if (p.isCancel(env)) throw cliError('已取消 start', { code: 4 });
  setCliEnv(env);
}

export const startCommand = defineCommand({
  meta: {
    name: 'start',
    description: '按产品目标进入 CLI 主向导：发布、维护、批量、合集、策略、session/studio',
  },
  args: cliReadCommandArgs,
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await ensureInteractiveStartEnv();
      const status = await buildProjectStatus(resolveCwd(args.cwd));
      const guide = buildStartGuide(status);
      if (args.json) {
        writeJsonSuccess('start', guide);
        return;
      }
      if (!isInteractive()) {
        printGuide(guide);
        return;
      }
      consola.info('Freelog CLI');
      const selected = await selectTask(guide);
      if (!selected) return;
      const executed = await executeInteractiveTask(selected, resolveCwd(args.cwd), guide);
      if (executed) return;
      printTask(selected);
      consola.info('');
      consola.info('提示：该分支是显式命令路径；如需连续交互，可选择 session，或进入已创建工程后再次运行 start。');
    } catch (error) {
      handleCommandError(error, args.json, 'start');
    }
  },
});
