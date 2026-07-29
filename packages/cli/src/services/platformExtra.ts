import { ofetch } from 'ofetch';
import { CliError } from '../core/errors.js';
import { getApiBaseURL } from '../core/env.js';
import { getCurrentAuth } from '../core/auth.js';
import { unwrapData, type PlatformEnvelope } from '../platform/index.js';

/** npm tools-lib 0.2.5 缺少 Rss.*；用与 storageUpload 相同的 ofetch + Bearer */

async function rawApi<T>(opts: {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): Promise<T> {
  const auth = getCurrentAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (auth?.token) {
    headers.Authorization = auth.authorization || `Bearer ${auth.token}`;
  }

  const response = await ofetch.raw<PlatformEnvelope<T>>(opts.path, {
    baseURL: getApiBaseURL(),
    method: opts.method,
    headers,
    query: opts.query,
    body: opts.body,
    timeout: 60_000,
    ignoreResponseError: true,
  });

  if (response.status === 401) {
    throw new CliError('未登录或凭证已过期', { code: 2, hint: 'freelog-cli login' });
  }

  const result = (response._data ?? {}) as PlatformEnvelope<T>;
  if (typeof result !== 'object' || result === null) {
    if (response.ok) return result as T;
    throw new CliError(`HTTP ${response.status}`, { code: 1 });
  }

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

  return unwrapData<T>(result);
}

export async function rssSendVerificationCode(opts: {
  feedUrl: string;
  resourceId: string;
}) {
  return rawApi<unknown>({
    method: 'POST',
    path: '/v2/rss/bindings/sendVerificationCode',
    body: { feedUrl: opts.feedUrl, resourceId: opts.resourceId },
  });
}

export async function rssBindFeed(opts: {
  resourceId: string;
  feedUrl: string;
  verificationCode: string;
  pubStartDate?: string;
  pubEndDate?: string;
}) {
  const body: Record<string, unknown> = {
    feedUrl: opts.feedUrl,
    verificationCode: opts.verificationCode,
  };
  if (opts.pubStartDate) body.pubStartDate = opts.pubStartDate;
  if (opts.pubEndDate) body.pubEndDate = opts.pubEndDate;

  return rawApi<unknown>({
    method: 'POST',
    path: `/v2/resources/rss/${opts.resourceId}/bindFeed`,
    body,
  });
}

export async function rssSyncBinding(opts: { resourceId: string }) {
  return rawApi<unknown>({
    method: 'PUT',
    path: `/v2/rss/bindings/${opts.resourceId}/sync`,
    body: { resourceId: opts.resourceId },
  });
}

export async function rssGetSyncProgress(opts: { resourceId: string }) {
  return rawApi<unknown>({
    method: 'GET',
    path: `/v2/rss/bindings/${opts.resourceId}/progress`,
    query: { resourceId: opts.resourceId },
  });
}
