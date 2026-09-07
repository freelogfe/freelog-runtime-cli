/**
 * 登录领域层：调 tools-lib passport 登录，捕获平台下发的 Cookie（dev 会话 = authInfo + uid），
 * AES-256-GCM 加密写 .freelog/auth（或 --global 写 ~/.freelog-auth）。
 * 凭据只绑一个环境：auth.env 与本次 --env 对不上直接失败，禁止静默换号。
 */

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

type LoginBody = {
  userId?: number;
  username?: string;
  token?: string;
  authorization?: string;
  jwtType?: string;
  tokenSn?: string;
};

type LoginEnvelope = {
  ret?: number;
  errCode?: number;
  errcode?: number;
  msg?: string;
  data?: LoginBody;
};

type LoginCredentials = {
  userId: number;
  loginName: string;
  token: string;
  cookie?: string;
};

function tokenFromBody(body: LoginBody): string | undefined {
  if (typeof body.authorization === 'string' && body.authorization) {
    return body.authorization;
  }
  const raw =
    (typeof body.token === 'string' && body.token) ||
    (typeof body.authorization === 'string' && body.authorization) ||
    (typeof body.tokenSn === 'string' && body.tokenSn);
  if (!raw) {
    return undefined;
  }
  return typeof body.jwtType === 'string' && body.jwtType
    ? `${body.jwtType} ${raw}`
    : raw;
}

function unwrapLoginEnvelope(envelope: LoginEnvelope): LoginCredentials {
  const body = envelope.data ?? {};
  const token = tokenFromBody(body);
  if (
    typeof body.userId !== 'number' ||
    typeof body.username !== 'string' ||
    !token
  ) {
    // i18n: cli.login.response_invalid
    throw new CliError(
      envelope.msg ? String(envelope.msg) : '登录失败：平台未返回凭据',
      'LOGIN_FAILED',
    );
  }
  return { userId: body.userId, loginName: body.username, token };
}

/**
 * dev 环境登录态在 Set-Cookie（authInfo + uid），响应体只有 tokenSn。
 * 测试注入的 loginApi 走同一信封形状，只是拿不到 Set-Cookie。
 */
async function loginWithInjectedApi(
  loginApi: LoginApi,
  loginName: string,
  password: string,
): Promise<LoginCredentials> {
  const result = await loginApi({ loginName, password });
  return unwrapLoginEnvelope((result ?? {}) as LoginEnvelope);
}

async function loginWithPlatformApi(
  loginName: string,
  password: string,
): Promise<LoginCredentials> {
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
    // i18n: cli.login.unparseable_response
    throw new CliError('登录失败：平台响应无法解析', 'LOGIN_FAILED');
  }
  const credentials = unwrapLoginEnvelope(envelope);
  return {
    ...credentials,
    cookie: cookieHeaderFromSetCookie(response.headers),
  };
}

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

function readLoginName(input: LoginAccountInput): string {
  const loginName = input.loginName?.trim();
  if (!loginName) {
    // i18n: cli.login.name_required
    throw new CliError('请提供 --login-name', 'LOGIN_NAME_REQUIRED');
  }
  return loginName;
}

async function readPassword(input: LoginAccountInput): Promise<string> {
  if (input.passwordStdin) {
    if (!input.yes) {
      // i18n: cli.login.password_stdin_requires_yes
      throw new CliError('--password-stdin 必须同时使用 --yes', 'LOGIN_PASSWORD_STDIN');
    }
    const password = await readPasswordStdin();
    if (password) {
      return password;
    }
    // i18n: cli.login.password_required
    throw new CliError('请提供密码', 'LOGIN_PASSWORD_REQUIRED');
  }
  if (input.password) {
    return input.password;
  }
  // i18n: cli.login.password_required
  throw new CliError('请提供密码', 'LOGIN_PASSWORD_REQUIRED');
}

function resolveAuthFilePath(input: LoginAccountInput): string {
  return input.global
    ? globalAuthPath(input.homeDir ?? os.homedir())
    : workspaceAuthPath(input.cwd);
}

/** 登录并把凭据落盘（global → ~/.freelog-auth，否则工程 .freelog/auth）；密码只走参数或 --password-stdin。 */
export async function loginAccount(input: LoginAccountInput): Promise<StoredAuth> {
  const env: FreelogEnv = assertPlatformAllowed(getEnv());
  const loginName = readLoginName(input);
  const password = await readPassword(input);

  const credentials = input.loginApi
    ? await loginWithInjectedApi(input.loginApi, loginName, password)
    : await loginWithPlatformApi(loginName, password);

  const auth: StoredAuth = {
    env,
    userId: credentials.userId,
    loginName: credentials.loginName,
    token: credentials.token,
    ...(credentials.cookie ? { cookie: credentials.cookie } : {}),
  };
  writeAuth(resolveAuthFilePath(input), auth);
  return auth;
}

/** 取当前登录态；没登录或凭据 env 与本次 --env 不符都直接报错（需要登录态的命令开头调用）。 */
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

/** 归一 cwd：显式 --cwd 优先，否则用凭据搜索根（preAction 设定）。 */
export function resolveCwd(cwd?: string): string {
  if (cwd) {
    return path.resolve(cwd);
  }
  return path.resolve(getAuthSearchCwd());
}
