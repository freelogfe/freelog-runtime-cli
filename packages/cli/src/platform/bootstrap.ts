import { FUtil } from './tools-lib.js';
import { getCliEnv } from '../core/env.js';
import { getCurrentAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';

let bootstrapped = false;

export interface PlatformEnvelope<T = unknown> {
  ret?: number;
  errCode?: number;
  errcode?: number;
  msg?: string;
  data?: T;
}

/** 配置 tools-lib Node adapter：环境、Bearer 和 CLI 风格鉴权错误。 */
export function installToolsLibForNode(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  FUtil.configurePlatform({
    getEnv: () => {
      const env = getCliEnv();
      if (env === 'production') return 'prod';
      return env;
    },
    getAuthorization: () => {
      const auth = getCurrentAuth();
      return auth?.authorization || (auth?.token ? `Bearer ${auth.token}` : undefined);
    },
    getUserId: () => {
      const auth = getCurrentAuth();
      return Number(auth?.userId || -1);
    },
    onAuthError: ({ kind, result }) => {
      throw new CliError(kind === 'unauthorized' ? '未登录或凭证已过期' : '账号状态异常', {
        code: kind === 'unauthorized' ? 2 : 4,
        hint: kind === 'unauthorized' ? 'freelog-cli login' : undefined,
        details: result,
      });
    },
    onApiError: ({ errCode, result }) => {
      const msg =
        result && typeof result === 'object' && 'msg' in result
          ? String((result as { msg?: unknown }).msg || 'API 请求失败')
          : 'API 请求失败';
      throw new CliError(msg, {
        code: errCode === 30 ? 2 : 4,
        hint: errCode === 30 ? 'freelog-cli login' : undefined,
        details: result,
      });
    },
  });
}

export function assertToolsLibBootstrapped(): void {
  if (!bootstrapped) {
    throw new CliError('未初始化 @freelog/tools-lib（缺少 installToolsLibForNode）', { code: 1 });
  }
}

/** 解包 { data }（与 Console `const { data } = await FServiceAPI…` 一致） */
export function unwrapData<T>(envelope: PlatformEnvelope<T> | T): T {
  if (
    envelope !== null &&
    typeof envelope === 'object' &&
    'data' in (envelope as object) &&
    ('errCode' in (envelope as object) ||
      'errcode' in (envelope as object) ||
      'ret' in (envelope as object) ||
      'msg' in (envelope as object))
  ) {
    return (envelope as PlatformEnvelope<T>).data as T;
  }
  return envelope as T;
}
