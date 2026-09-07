/** `logout` 命令：只删本地凭据（先工作区后全局），不调平台注销。 */

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
    .action(function (this: Command, options: { global?: boolean; cwd?: string }) {
      const shared = (this as Command).optsWithGlobals() as typeof options & { yes?: boolean; cwd?: string; env?: string; json?: boolean; file?: string };
      logoutAccount({
        cwd: resolveCwd(shared.cwd ?? options.cwd),
        global: options.global,
      });
    });
  return command;
}
