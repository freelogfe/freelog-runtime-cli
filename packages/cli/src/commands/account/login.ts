/** `login` 命令：密码只走 --password-stdin（必须连 --yes），调 domain/account/login。 */

import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { loginAccount, resolveCwd } from '../../domain/account/login';

/** login 命令装配：密码只走 --password-stdin。 */
export function createLoginCommand(): Command {
  const command = addSharedOptions(new Command('login'));
  command
    .description(
      // i18n: cli.command.login.description
      '登录',
    )
    .option(
      '--global',
      // i18n: cli.command.login.global
      '写入全局凭据',
    )
    .option(
      '--login-name <name>',
      // i18n: cli.command.login.login_name
      '登录名',
    )
    .option(
      '--password-stdin',
      // i18n: cli.command.login.password_stdin
      '从标准输入读密码',
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .action(async function (this: Command, options: {
      global?: boolean;
      loginName?: string;
      passwordStdin?: boolean;
      yes?: boolean;
      cwd?: string;
    }) {
      const shared = (this as Command).optsWithGlobals() as typeof options & { yes?: boolean; cwd?: string; env?: string; json?: boolean; file?: string };
      await loginAccount({
        cwd: resolveCwd(shared.cwd ?? options.cwd),
        global: options.global,
        loginName: options.loginName,
        passwordStdin: options.passwordStdin,
        yes: shared.yes ?? options.yes,
      });
    });
  return command;
}
