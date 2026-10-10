/** `login` 命令：TTY 隐藏提问；CI 只允许 --login-name --password-stdin --yes。 */

import { input as askInput, password as askPassword } from '@inquirer/prompts';
import { Command } from 'commander';
import { addSharedOptions } from '../../core/cliArgs';
import { CliError } from '../../core/errors';
import { loginAccount, resolveCwd } from '../../domain/account/login';
import { assertPlatformAllowed } from '../../domain/env';

/** 登录命令装配。 */
export function createLoginCommand(): Command {
  const command = addSharedOptions(new Command('login'));
  command
    .description('登录')
    .option('--global', '写入全局凭据')
    .option('--login-name <name>', '登录名')
    .option('--password-stdin', '从标准输入读密码')
    .action(async function (this: Command, options: {
      global?: boolean;
      loginName?: string;
      passwordStdin?: boolean;
    }) {
      assertPlatformAllowed();
      const shared = (this as Command).optsWithGlobals() as { yes?: boolean; cwd?: string };
      const ci = shared.yes === true;
      if (ci && (!options.loginName || !options.passwordStdin)) {
        throw new CliError('--yes 登录必须同时提供 --login-name 与 --password-stdin', 'LOGIN_YES_FLAGS');
      }
      if (!ci && !process.stdin.isTTY && (!options.loginName || !options.passwordStdin)) {
        throw new CliError('非交互登录请使用 --login-name --password-stdin --yes', 'LOGIN_NON_TTY_FLAGS');
      }
      const loginName = options.loginName ?? await askInput({ message: '登录名' });
      const password = options.passwordStdin ? undefined : await askPassword({ message: '密码' });
      const auth = await loginAccount({
        cwd: resolveCwd(shared.cwd),
        global: options.global,
        loginName,
        password,
        passwordStdin: options.passwordStdin,
        yes: shared.yes,
      });
      console.log(`登录成功：${auth.loginName}`);
    });
  return command;
}
