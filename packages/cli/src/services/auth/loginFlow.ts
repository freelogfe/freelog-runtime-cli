import type { AuthInfo } from '../../core/auth.js';
import { getApiBaseURL, getCliEnv } from '../../core/env.js';
import { unwrapData, type PlatformEnvelope } from '../../platform/index.js';

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
  const values =
    typeof getSetCookie === 'function'
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

/** 调用平台 login API，返回可写入 auth 的字段（不负责落盘）。 */
export async function fetchLoginAuth(
  loginName: string,
  password: string,
): Promise<AuthInfo> {
  const response = await fetch(`${getApiBaseURL()}/v2/passport/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ loginName, password, isRemember: 1 }),
  });
  const envelope = (await response.json()) as PlatformEnvelope<LoginData>;
  const data = unwrapData<LoginData>(envelope);
  const cookie = cookieHeaderFromSetCookie(response.headers);
  const token = data?.token || data?.authorization || data?.tokenSn;
  if (!token && !cookie) {
    throw new Error('login_response_missing_token');
  }

  return {
    token: token || cookie!,
    authorization:
      data.authorization || (data.jwtType && token ? `${data.jwtType} ${token}` : undefined),
    cookie,
    userId: data.userId,
    username: data.username || loginName,
    environment: getCliEnv(),
  };
}

export function isLoginTokenMissingError(error: unknown): boolean {
  return error instanceof Error && error.message === 'login_response_missing_token';
}
