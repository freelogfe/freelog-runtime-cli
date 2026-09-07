/** 全局旗标定义：--env / --yes / --cwd / --json / --file。所有命令共用，勿在子命令重复声明。 */

import { Command } from 'commander';
import { notImplemented } from './notImplemented';

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
    .option(
      '--file <path>',
      // i18n: cli.flag.file
      '指定身份文件',
    );
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
