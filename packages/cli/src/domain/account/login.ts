import os from 'node:os';
import path from 'node:path';
import { FUtil } from '../../platform/api';
import { CliError } from '../../core/errors';
import { readPasswordStdin } from '../../core/passwordInput';
import {
  assertAuthEnv,
  getAuthSearchCwd,
  globalAuthPath,
  loadAuth,
  workspaceAuthPath,
  writeAuth,
  type StoredAuth,
} from '../../local/auth';
import { assertPlatformAllowed, getEnv, type FreelogEnv } from '../env';

export type LoginApi = (params: {
  loginName: string;
  password: string;
}) => Promise<unknown>;

export type LoginAccountInput = {
  cwd: string;
  loginName?: string;
  password?: string;
  passwordStdin?: boolean;
  yes?: boolean;
  global?: boolean;
  homeDir?: string;
  loginApi?: LoginApi;
};

type LoginEnvelope = {
  ret?: number;
  errCode?: number;
  errcode?: number;
  msg?: string;
  data?: {
    userId?: number;
    username?: string;
    token?: string;
    authorization?: string;
    jwtType?: string;
    tokenSn?: string;
  };
};

/** dev 环境登录态在 Set-Cookie（authInfo + uid），响应体只有 tokenSn。 */
function cookieHeaderFromSetCookie(headers: Headers): string | undefined {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;
  const values =
    typeof getSetCookie === 'function'
      ? getSetCookie.call(headers)
      : (headers.get('set-cookie') || '')
          .split(/,(?=\s*[^;,]+=)/)
          .map((item) => item.trim())
          .filter(Boolean);
  const pairs = values
    .map((item) => item.split(';')[0]?.trim())
    .filter((item): item is string => Boolean(item));
  return pairs.length ? pairs.join('; ') : undefined;
}

async function requestLogin(
  loginName: string,
  password: string,
): Promise<{ envelope: LoginEnvelope; cookie?: string }> {
  const url = `${FUtil.Format.completeUrlByDomain('api')}/v2/passport/login`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginName, password, isRemember: 1 }),
  });
  let envelope: LoginEnvelope;
  try {
    envelope = (await response.json()) as LoginEnvelope;
  } catch {
    throw new CliError('登录失败：平台响应无法解析', 'LOGIN_FAILED');
  }
  return { envelope, cookie: cookieHeaderFromSetCookie(response.headers) };
}

function unwrapLoginData(
  envelope: LoginEnvelope,
): { userId: number; loginName: string; token: string } {
  const data = envelope.data ?? {};
  const rawToken =
    (typeof data.token === 'string' && data.token) ||
    (typeof data.authorization === 'string' && data.authorization) ||
    (typeof data.tokenSn === 'string' && data.tokenSn);
  const token =
    typeof data.authorization === 'string'
      ? data.authorization
      : typeof data.jwtType === 'string' && rawToken
        ? `${data.jwtType} ${rawToken}`
        : rawToken;
  if (typeof data.userId !== 'number' || typeof data.username !== 'string' || !token) {
    // i18n: cli.login.response_invalid
    throw new CliError(
      envelope.msg ? String(envelope.msg) : '登录失败：平台未返回凭据',
      'LOGIN_FAILED',
    );
  }
  return { userId: data.userId, loginName: data.username, token };
}

async function loginViaApi(input: {
  loginName: string;
  password: string;
  loginApi?: LoginApi;
}): Promise<{ auth: Omit<StoredAuth, 'env'> }> {
  if (input.loginApi) {
    const result = await input.loginApi({
      loginName: input.loginName,
      password: input.password,
    });
    const envelope = (result ?? {}) as LoginEnvelope;
    return { auth: unwrapLoginData(envelope) };
  }
  const { envelope, cookie } = await requestLogin(input.loginName, input.password);
  const parsed = unwrapLoginData(envelope);
  return { auth: { ...parsed, cookie } };
}

export async function loginAccount(input: LoginAccountInput): Promise<StoredAuth> {
  const env: FreelogEnv = assertPlatformAllowed(getEnv());
  const loginName = input.loginName?.trim();
  if (!loginName) {
    // i18n: cli.login.name_required
    throw new CliError('请提供 --login-name', 'LOGIN_NAME_REQUIRED');
  }

  let password = input.password;
  if (input.passwordStdin) {
    if (!input.yes) {
      // i18n: cli.login.password_stdin_requires_yes
      throw new CliError('--password-stdin 必须同时使用 --yes', 'LOGIN_PASSWORD_STDIN');
    }
    password = await readPasswordStdin();
  }
  if (!password) {
    // i18n: cli.login.password_required
    throw new CliError('请提供密码', 'LOGIN_PASSWORD_REQUIRED');
  }

  const { auth: parsed } = await loginViaApi({
    loginName,
    password,
    loginApi: input.loginApi,
  });
  const auth: StoredAuth = {
    env,
    userId: parsed.userId,
    loginName: parsed.loginName,
    token: parsed.token,
    ...(parsed.cookie ? { cookie: parsed.cookie } : {}),
  };

  const filePath = input.global
    ? globalAuthPath(input.homeDir ?? os.homedir())
    : workspaceAuthPath(input.cwd);
  writeAuth(filePath, auth);
  return auth;
}

export function requireAuth(options: {
  cwd: string;
  global?: boolean;
  homeDir?: string;
}): StoredAuth {
  const loaded = loadAuth(options);
  if (!loaded) {
    // i18n: cli.auth.required
    throw new CliError('请先 login', 'AUTH_REQUIRED');
  }
  assertAuthEnv(loaded.auth, getEnv());
  return loaded.auth;
}

export function resolveCwd(cwd?: string): string {
  if (cwd) {
    return path.resolve(cwd);
  }
  return path.resolve(getAuthSearchCwd());
}
