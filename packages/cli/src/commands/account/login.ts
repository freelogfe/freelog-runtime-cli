import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { loginAccount, resolveCwd } from '../../domain/account/login';

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
    .action(async (options: {
      global?: boolean;
      loginName?: string;
      passwordStdin?: boolean;
      yes?: boolean;
      cwd?: string;
    }) => {
      await loginAccount({
        cwd: resolveCwd(options.cwd),
        global: options.global,
        loginName: options.loginName,
        passwordStdin: options.passwordStdin,
        yes: options.yes,
      });
    });
  return command;
}
