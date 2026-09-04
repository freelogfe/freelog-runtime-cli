import * as p from '@clack/prompts';
import { consola } from 'consola';
import { defineCommand } from 'citty';
import { applyCommandFlags, handleCommandError, writeJsonSuccess } from '../core/command.js';
import { cliEnvArgs, cliOutputArgs } from '../core/cliArgs.js';
import { getCliEnv } from '../core/env.js';
import { authScopeLabel, saveAuth } from '../core/auth.js';
import { resolveCwd } from '../config/project.js';
import { isInteractive } from '../core/tty.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { fetchLoginAuth, isLoginTokenMissingError } from '../services/auth/loginFlow.js';
import { resolveLoginPassword } from '../core/passwordInput.js';

export const loginCommand = defineCommand({
  meta: { name: 'login', description: '登录 Freelog 账号' },
  args: {
    ...cliEnvArgs,
    ...cliOutputArgs,
    global: { type: 'boolean', alias: 'g', description: '写入全局凭据 ~/.freelog-auth' },
    cwd: { type: 'string', description: '工作区凭据写入目录，默认当前目录' },
    yes: { type: 'boolean', alias: 'y', description: '非交互（需登录名和密码输入）' },
    'login-name': { type: 'string', description: '登录名' },
    password: { type: 'string', description: '密码' },

    'password-stdin': { type: 'boolean', description: '从标准输入读取密码（与 --password 互斥）' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const loginCwd = resolveCwd(args.cwd);
      let loginName = args['login-name'];
      let password = await resolveLoginPassword({
        password: args.password,
        passwordStdin: args['password-stdin'],
      });

      if ((!loginName || !password) && isInteractive(args.yes)) {
        const answers = await p.group({
          loginName: () => p.text({ message: '登录名', defaultValue: loginName }),
          password: () => p.password({ message: '密码' }),
        });
        if (p.isCancel(answers)) {
          consola.info('已取消');
          process.exitCode = 0;
          return;
        }
        loginName = String(answers.loginName);
        password = String(answers.password);
      }

      if (!loginName || !password) {
        throw cliError(I18N_KEYS.missing_login_credentials, {
          code: 4,
          hintKey: I18N_KEYS.login_credentials_hint,
        });
      }

      let auth;
      try {
        auth = await fetchLoginAuth(loginName, password);
      } catch (error) {
        if (isLoginTokenMissingError(error)) {
          throw cliError(I18N_KEYS.login_response_missing_token, { code: 1 });
        }
        throw error;
      }

      const authScope = args.global ? 'global' : 'workspace';
      saveAuth(
        auth,
        authScope === 'global' ? { scope: 'global' } : { scope: 'workspace', cwd: loginCwd },
      );

      if (args.json) {
        writeJsonSuccess('login', {
          username: auth.username || loginName,
          environment: getCliEnv(),
          scope: authScope,
        });
      } else {
        consola.success(
          `已登录 ${auth.username || loginName}（${getCliEnv()}，${authScopeLabel(authScope)}）`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
