import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { bindResource } from '../../domain/bind/bind';

export function createBindCommand(): Command {
  const command = addSharedOptions(new Command('bind'));
  command
    .description(
      // i18n: cli.command.bind.description
      '把线上身份接到本地',
    )
    .argument(
      '<target>',
      // i18n: cli.command.bind.target
      '资源 id 或 username/name',
    )
    .option(
      '--force',
      // i18n: cli.command.bind.force
      '换绑',
    )
    .action(async (target: string, options: {
      force?: boolean;
      file?: string;
      yes?: boolean;
      cwd?: string;
    }) => {
      await bindResource({
        cwd: resolveCwd(options.cwd),
        target,
        file: options.file,
        force: options.force,
        yes: options.yes,
      });
      console.log('bind 成功，可用 status 查看');
    });
  return command;
}
