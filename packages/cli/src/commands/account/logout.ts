import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { resolveCwd } from '../../domain/account/login';
import { logoutAccount } from '../../domain/account/logout';

export function createLogoutCommand(): Command {
  const command = addSharedOptions(new Command('logout'));
  command
    .description(
      // i18n: cli.command.logout.description
      '登出',
    )
    .option(
      '--global',
      // i18n: cli.command.logout.global
      '清除全局凭据',
    )
    .action((options: { global?: boolean; cwd?: string }) => {
      logoutAccount({
        cwd: resolveCwd(options.cwd),
        global: options.global,
      });
    });
  return command;
}
