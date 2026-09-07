import os from 'node:os';
import path from 'node:path';
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
import { FServiceAPI } from '../../platform/api';
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

function unwrapLoginData(result: unknown): {
  userId: number;
  loginName: string;
  token: string;
} {
  const envelope = result as {
    data?: Record<string, unknown>;
    userId?: number;
    username?: string;
    token?: string;
    authorization?: string;
    jwtType?: string;
    tokenSn?: string;
    msg?: string;
    errCode?: number;
  };
  const data = envelope.data ?? envelope;
  const userId = data.userId;
  const loginName = data.username;
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
  if (typeof userId !== 'number' || typeof loginName !== 'string' || !token) {
    // i18n: cli.login.response_invalid
    throw new CliError(
      envelope.msg ? String(envelope.msg) : '登录失败：平台未返回凭据',
      'LOGIN_FAILED',
    );
  }
  return { userId, loginName, token };
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

  const loginApi = input.loginApi ?? ((params) => FServiceAPI.User.login(params));
  const result = await loginApi({ loginName, password });
  const parsed = unwrapLoginData(result);
  const auth: StoredAuth = {
    env,
    userId: parsed.userId,
    loginName: parsed.loginName,
    token: parsed.token,
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
