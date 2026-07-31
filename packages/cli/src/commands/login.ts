import * as p from '@clack/prompts';
import { consola } from 'consola';
import { defineCommand } from 'citty';
import { applyGlobalFlags, getCliEnv } from '../core/env.js';
import { CliError, toExitCode } from '../core/errors.js';
import { saveAuth } from '../core/auth.js';
import { isInteractive } from '../core/tty.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';

interface LoginData {
  userId?: number;
  username?: string;
  token?: string;
  authorization?: string;
  jwtType?: string;
}

export const loginCommand = defineCommand({
  meta: { name: 'login', description: '登录 Freelog 账号' },
  args: {
    test: { type: 'boolean', description: '使用测试网 API' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    global: { type: 'boolean', alias: 'g', description: '写入全局凭证' },
    yes: { type: 'boolean', alias: 'y', description: '非交互（需 --login-name/--password）' },
    'login-name': { type: 'string', description: '登录名' },
    password: { type: 'string', description: '密码' },
    json: { type: 'boolean', description: 'JSON 输出' },
  },
  async run({ args }) {
    try {
      applyGlobalFlags(args);
      let loginName = args['login-name'];
      let password = args.password;

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
        throw new CliError('缺少登录名或密码', {
          code: 4,
          hint: 'freelog-cli login --login-name <name> --password <pwd> --yes',
        });
      }

      const envelope = await FServiceAPI.User.login({
        loginName,
        password,
        isRemember: 1,
      });
      const data = unwrapData<LoginData>(envelope);

      const token = data?.token || data?.authorization;
      if (!token) {
        throw new CliError('登录响应缺少 token', { code: 1, details: data });
      }

      saveAuth(
        {
          token,
          authorization:
            data.authorization || (data.jwtType ? `${data.jwtType} ${token}` : undefined),
          userId: data.userId,
          username: data.username || loginName,
          environment: getCliEnv(),
        },
        Boolean(args.global),
      );

      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({ ok: true, username: data.username || loginName, environment: getCliEnv() })}\n`,
        );
      } else {
        consola.success(`已登录 ${data.username || loginName}（${getCliEnv()}）`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export function handleCommandError(error: unknown, json?: boolean): never {
  const code = toExitCode(error);
  const message = error instanceof Error ? error.message : String(error);
  const hint = error instanceof CliError ? error.hint : undefined;
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ ok: false, code, message, hint, details: error instanceof CliError ? error.details : undefined })}\n`,
    );
  } else {
    consola.error(message);
    if (hint) consola.info(`→ ${hint}`);
  }
  process.exit(code);
}
