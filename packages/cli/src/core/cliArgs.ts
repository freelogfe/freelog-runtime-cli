/** 全局旗标定义：--env / --yes / --cwd / --json。产物路径只由相关命令的 --artifact 表示。 */

import { Command } from 'commander';
import { notImplemented } from './notImplemented';

export type SharedCommandOptions = {
  env?: string;
  yes?: boolean;
  cwd?: string;
  json?: boolean;
  /** 领域层历史命名，实际承载 `--resource` 身份选择器。 */
  file?: string;
};

/** 给任意 Command 挂全局旗标；命令层不许自己再声明这五个。 */
export function addSharedOptions(command: Command): Command {
  return command
    .option(
      '--env <env>',
      // i18n: cli.flag.env
      '环境',
    )
    .option(
      '--yes',
      // i18n: cli.flag.yes
      '跳过确认',
    )
    .option(
      '--cwd <dir>',
      // i18n: cli.flag.cwd
      '工作目录',
    )
    .option(
      '--json',
      // i18n: cli.flag.json
      '以 JSON 输出',
    )
    .option('--resource <selector>', '选择本地资源状态（N.json、资源 ID、标识符或标题）')
    ;
}

/**
 * 统一读取当前命令及其父命令的共享旗标。命令实现只读这个值，禁止再把
 * `optsWithGlobals()` 的结果复制回局部 options（那会掩盖漏传和类型错误）。
 */
export function readSharedOptions(command: Command): SharedCommandOptions {
  const raw = command.optsWithGlobals() as Record<string, unknown>;
  return {
    ...(typeof raw.env === 'string' ? { env: raw.env } : {}),
    ...(typeof raw.yes === 'boolean' ? { yes: raw.yes } : {}),
    ...(typeof raw.cwd === 'string' ? { cwd: raw.cwd } : {}),
    ...(typeof raw.json === 'boolean' ? { json: raw.json } : {}),
    ...(typeof raw.resource === 'string' ? { file: raw.resource } : {}),
  };
}

/** 造一个只带全局旗标、动作暂为 notImplemented 的独立命令（未实现命令的占位入口）。 */
export function createLeafCommand(name: string, description: string): Command {
  const command = addSharedOptions(new Command(name));
  command.description(description);
  command.action(notImplemented);
  return command;
}

/** 给父命令挂子命令并预置全局旗标，动作暂为 notImplemented。 */
export function addLeafSubcommand(
  parent: Command,
  name: string,
  description: string,
): Command {
  const command = addSharedOptions(parent.command(name));
  command.description(description);
  command.action(notImplemented);
  return command;
}
