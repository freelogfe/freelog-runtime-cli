import * as p from '@clack/prompts';
import { consola } from 'consola';
import { defineCommand } from 'citty';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { getApiBaseURL, getCliEnv } from '../core/env.js';
import { CliError } from '../core/errors.js';
import { saveAuth } from '../core/auth.js';
import { isInteractive } from '../core/tty.js';
import { unwrapData, type PlatformEnvelope } from '../platform/index.js';

interface LoginData {
  userId?: number;
  username?: string;
  token?: string;
  tokenSn?: string;
  authorization?: string;
  jwtType?: string;
}

function cookieHeaderFromSetCookie(headers: Headers): string | undefined {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const values = typeof getSetCookie === 'function'
    ? getSetCookie.call(headers)
    : (headers.get('set-cookie') || '')
        .split(/,(?=\s*[^;,]+=)/)
        .map((item) => item.trim())
        .filter(Boolean);

  const pairs = values
    .map((item) => item.split(';')[0]?.trim())
    .filter(Boolean);
  return pairs.length ? pairs.join('; ') : undefined;
}

async function loginWithCookie(loginName: string, password: string): Promise<{
  data: LoginData;
  cookie?: string;
}> {
  const response = await fetch(`${getApiBaseURL()}/v2/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginName, password, isRemember: 1 }),
  });
  const envelope = (await response.json()) as PlatformEnvelope<LoginData>;
  const data = unwrapData<LoginData>(envelope);
  return { data, cookie: cookieHeaderFromSetCookie(response.headers) };
}

export const loginCommand = defineCommand({
  meta: { name: 'login', description: '登录 Freelog 账号' },
  args: {
    test: { type: 'boolean', description: '使用测试网 API' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    yes: { type: 'boolean', alias: 'y', description: '非交互（需 --login-name/--password）' },
    'login-name': { type: 'string', description: '登录名' },
    password: { type: 'string', description: '密码' },
    json: { type: 'boolean', description: 'JSON 输出' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
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

      const { data, cookie } = await loginWithCookie(loginName, password);

      const token = data?.token || data?.authorization || data?.tokenSn;
      if (!token && !cookie) {
        throw new CliError('登录响应缺少 token/cookie', { code: 1, details: data });
      }

      saveAuth(
        {
          token: token || cookie!,
          authorization:
            data.authorization || (data.jwtType ? `${data.jwtType} ${token}` : undefined),
          cookie,
          userId: data.userId,
          username: data.username || loginName,
          environment: getCliEnv(),
        },
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
