import { Command } from 'commander';
import { notImplemented } from './notImplemented';

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

export function createLeafCommand(name: string, description: string): Command {
  const command = addSharedOptions(new Command(name));
  command.description(description);
  command.action(notImplemented);
  return command;
}

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
