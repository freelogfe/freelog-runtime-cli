/**
 * commander 装配：程序元信息、全局旗标、子命令注册、preAction 钩子、错误出口。
 * preAction 做两件事：解析 --env 进 applyCliEnv（prod 门禁的地基）；按 --cwd 切换凭据搜索根。
 * 命令名单真源：docs/一期/产品方案/脚手架设计/COMMANDS.md——这里只注册，不写业务规则。
 */

import { Command, CommanderError } from 'commander';
import { addSharedOptions, createSubCommands } from '../commands/index';
import { ResourceSyncBatchFailure, resourceSyncBatchJson } from '../commands/project/resource';
import { CliError, reportCliError } from '../core/errors';
import { resolveCwd } from '../domain/account/login';
import { applyCliEnv } from '../domain/env';
import { setAuthSearchCwd } from '../local/auth';
import { usageDocsPath } from '../core/usageDocs';
import { packageVersion } from '../core/packageVersion';
import { isInteractive, selectQuestion } from '../core/tty';
import { assertCollectionTagMode } from '../domain/collection/tagEditor';
import { readDraft } from '../local/draft';
import { withProjectLock } from '../local/lock';
import { assertNoPendingOperation } from '../local/pendingOperation';
import { validateLocalState } from '../local/resolve';
import type { IdentityRecord } from '../local/types';

/** 组装根程序：挂元信息与全局旗标、preAction 钩子、子命令树；命令名单真源是 COMMANDS.md。 */
export function createProgram(): Command {
  const program = new Command();

  program
    .name('freelog-cli')
    .description(
      // i18n: cli.program.description
      'Freelog 命令行',
    )
    .version(
      packageVersion(),
      '-V, --cli-version',
      // i18n: cli.flag.cli_version
      '打印 CLI 版本',
    )
    .addHelpText('after', `\n使用文档：${usageDocsPath()}\n`);

  addSharedOptions(program);

  program.hook('preAction', async (thisCommand, actionCommand) => {
    const envFlag = findOptionValue(actionCommand ?? thisCommand, 'env');
    applyCliEnv({ flag: typeof envFlag === 'string' ? envFlag : undefined });
    const cwdFlag = findOptionValue(actionCommand ?? thisCommand, 'cwd');
    const cwd = resolveCwd(typeof cwdFlag === 'string' ? cwdFlag : undefined);
    setAuthSearchCwd(cwd);
    const command = actionCommand ?? thisCommand;
    // 新建/接入没有“选已有本地身份”语义，必须在事务前滚和业务调用前拒绝。
    if (command.parent?.name() === 'collection' && ['create', 'bind'].includes(command.name())
      && findOptionValue(command, 'resource') !== undefined) {
      throw new CliError(`collection ${command.name()} 不接受 --resource；请新建合集或使用 bind 的位置参数指定线上合集`,
        'COLLECTION_RESOURCE_NOT_SUPPORTED');
    }
    if (command.name() === 'update' && command.parent?.name() === 'collection') {
      const tags = findOptionValue(command, 'tag');
      assertCollectionTagMode({
        ...(Array.isArray(tags) && tags.length ? { tags } : {}),
        clearTags: findOptionValue(command, 'clearTags') === true,
        editTags: findOptionValue(command, 'editTags') === true,
        json: findOptionValue(command, 'json') === true,
      });
    }
    // 可选来源不能让非交互/JSON缺参先前滚事务；精确分支，不豁免有来源的add。
    if (command.name() === 'add' && command.parent?.name() === 'item' && command.parent.parent?.name() === 'collection'
      && command.args.length === 0 && (findOptionValue(command, 'json') === true || !isInteractive())) {
      throw new CliError('非交互或JSON调用请明确提供来源单资源 id: 或 name:', 'COLLECTION_ITEM_SOURCE_REQUIRED');
    }
    // 身份选择会读取状态，必须在恢复可信事务之后进行，避免把半提交状态误报成损坏。
    if (!isResourceFreeCommand(command)) {
      withProjectLock(cwd, () => undefined, 'preselect-resource');
    }
    if (!isPendingOperationReadAllowed(command)) {
      // 检查也放进短锁：即使随后另一进程抢锁，真正 POST 前 submitVersion 仍会再检查。
      withProjectLock(cwd, () => assertNoPendingOperation(cwd), 'pending-operation-gate');
    }
    await chooseResourceWhenNeeded(command, cwd);
  });

  for (const command of Object.values(createSubCommands())) {
    program.addCommand(command);
  }

  return program;
}

/** create/bind 自行决定接续未绑定状态还是新建 N.json，不能套用常规身份选择。 */
const RESOURCE_FREE_COMMANDS = new Set(['login', 'logout', 'init', 'template', 'type', 'resource', 'create', 'bind', 'collection']);

/** 结果未知时只允许认证、只读查询和 recovery；其它动作先让用户证明旧请求的结果。 */
const PENDING_OPERATION_READ_COMMANDS = new Set(['login', 'logout', 'template', 'type', 'status', 'show', 'validate', 'list', 'recover']);

function isPendingOperationReadAllowed(command: Command): boolean {
  // 恢复入口自己区分只读/显式apply；通用短锁会提前前滚事务，破坏只读或缺yes拒绝。
  const collectionResume = command.name() === 'resume' && command.parent?.name() === 'publish'
    && command.parent.parent?.name() === 'collection';
  return collectionResume || PENDING_OPERATION_READ_COMMANDS.has(command.name());
}

/** 多身份时在动作前完成 TTY 选择，把结果回填为稳定的 file:N.json 选择器。 */
async function chooseResourceWhenNeeded(command: Command, cwd: string): Promise<void> {
  if (isResourceFreeCommand(command)) return;
  const selector = findOptionValue(command, 'resource');
  if (typeof selector === 'string') return;
  const identities = validateLocalState(cwd);
  if (identities.length <= 1) return;
  const yes = findOptionValue(command, 'yes') === true;
  if (yes || !isInteractive()) {
    throw new CliError(
      `当前工程有多份资源状态；非交互调用请使用 --resource 指定资源。例如：${resourceSelectorExamples(identities)}`,
      'IDENTITY_RESOURCE_REQUIRED',
    );
  }
  const selected = await selectQuestion('请选择资源', [
    ...identities.map((identity) => ({
      name: resourceChoiceLabel(cwd, identity),
      value: `file:${identity.n}.json`,
    })),
    { name: '退出', value: '__cancel__' },
  ], findOptionValue(command, 'json') === true ? process.stderr : undefined);
  if (selected === '__cancel__') {
    throw new CliError('已取消', 'RESOURCE_SELECTION_CANCELLED');
  }
  command.setOptionValue('resource', selected);
}

/** 交互菜单完整展示可用于区分本地状态的信息，工作稿只读不写。 */
function resourceChoiceLabel(cwd: string, identity: IdentityRecord): string {
  const draft = readDraft(cwd, identity.n) ? '有工作稿' : '无工作稿';
  return [
    `${identity.n}.json`,
    `标题=${identity.title ?? '（未同步标题）'}`,
    `标识=${identity.resourceName ?? identity.name ?? '未绑定'}`,
    `ID=${identity.resourceId ?? '未绑定'}`,
    `类型=${identity.typeCode}`,
    `产物=${identity.filePath ?? '未设置'}`,
    draft,
  ].join('  ');
}

/** 非交互拒绝同时给出人的资源字段与 AI/脚本稳定状态文件选择器。 */
function resourceSelectorExamples(identities: readonly IdentityRecord[]): string {
  return identities.map((identity) => {
    const selectors = [
      ...(identity.resourceId ? [`id:${identity.resourceId}`] : []),
      ...(identity.resourceName ? [`name:${identity.resourceName}`] : []),
      `artifact:${identity.filePath}`,
      `file:${identity.n}.json`,
    ];
    return selectors.join(' | ');
  }).join('；');
}

/** 子命令继承顶层 template/type/resource 的无资源属性，不能只看叶子 command.name()。 */
export function isResourceFreeCommand(command: Command): boolean {
  let current: Command | null = command;
  while (current) {
    if (RESOURCE_FREE_COMMANDS.has(current.name())) return true;
    current = current.parent;
  }
  return false;
}

/** 解析执行命令；保留 Commander 出口，其余失败统一安全报告并返回非零退出码。 */
export async function runCli(
  argv: string[],
  options: {
    from?: 'node' | 'user';
    writeOut?: (text: string) => void;
    writeErr?: (text: string) => void;
  } = {},
): Promise<number> {
  const writeOut = options.writeOut ?? ((text) => {
    process.stdout.write(text);
  });
  const writeErr = options.writeErr ?? ((text) => {
    process.stderr.write(text);
  });
  try {
    const program = createProgram();
    program.exitOverride();
    program.configureOutput({ writeOut, writeErr });
    await program.parseAsync(argv, { from: options.from ?? 'user' });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      return error.exitCode;
    }
    if (error instanceof ResourceSyncBatchFailure && argv.includes('--json')) {
      writeOut(`${resourceSyncBatchJson(error.batch)}\n`);
      return 1;
    }
    return reportCliError(error, argv, { writeOut, writeErr });
  }
}

function findOptionValue(command: Command, name: string): unknown {
  let current: Command | null = command;
  while (current) {
    const value = current.getOptionValue(name);
    if (value !== undefined) {
      return value;
    }
    current = current.parent;
  }
  return undefined;
}
