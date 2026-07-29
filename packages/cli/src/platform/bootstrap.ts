import { FUtil } from './tools-lib.js';
import { syncShimEnv } from './shim-browser.js';
import { ofetch } from 'ofetch';
import { getApiBaseURL, getCliEnv } from '../core/env.js';
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

/** ≅ AxiosRequestConfig 子集（不直接依赖 axios 类型，避免 dts 路径漂移） */
interface RequestConfig {
  method?: string;
  url?: string;
  params?: Record<string, unknown>;
  data?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

type RequestOpts = { noRedirect?: boolean; noErrorAlert?: boolean };

/**
 * patch FUtil.Request → Node Bearer。
 * 业务 API（除签约/支付）一律走 FServiceAPI；对照 Console pages/resource + tools-lib 源码。
 */
export function installToolsLibForNode(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  syncShimEnv(getCliEnv());

  const nodeRequest = async (
    config: RequestConfig,
    _opts: RequestOpts = {},
  ): Promise<PlatformEnvelope> => {
    const auth = getCurrentAuth();
    const headers: Record<string, string> = {
      ...(config.headers as Record<string, string> | undefined),
    };
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth?.token) {
      headers.Authorization = auth.authorization || `Bearer ${auth.token}`;
    }

    const method = (config.method || 'GET').toUpperCase();
    const url = config.url || '/';
    const timeout = typeof config.timeout === 'number' ? config.timeout : 60_000;

    try {
      const response = await ofetch.raw<PlatformEnvelope>(url, {
        baseURL: getApiBaseURL(),
        method: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
        headers,
        query: config.params as Record<string, unknown> | undefined,
        body: config.data as BodyInit | Record<string, unknown> | null | undefined,
        timeout,
        ignoreResponseError: true,
      });

      if (response.status === 401) {
        throw new CliError('未登录或凭证已过期', { code: 2, hint: 'freelog-cli login' });
      }

      const result = (response._data ?? {}) as PlatformEnvelope;
      if (typeof result !== 'object' || result === null) {
        if (response.ok) return { data: result as unknown };
        throw new CliError(`HTTP ${response.status}`, { code: 1 });
      }

      // 与源码 FUtil.Request 一致返回整包；CLI 将非 0 映射为 CliError（不 window 跳转）
      const errCode =
        result.errCode !== undefined
          ? result.errCode
          : result.errcode !== undefined
            ? result.errcode
            : result.ret;

      if (errCode !== undefined && errCode !== 0) {
        throw new CliError(result.msg || 'API 请求失败', {
          code: errCode === 30 ? 2 : 4,
          hint: errCode === 30 ? 'freelog-cli login' : undefined,
          details: result,
        });
      }

      return result;
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(error instanceof Error ? error.message : '网络请求失败', {
        code: 1,
        cause: error,
      });
    }
  };

  (FUtil as { Request: typeof nodeRequest }).Request = nodeRequest;
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
