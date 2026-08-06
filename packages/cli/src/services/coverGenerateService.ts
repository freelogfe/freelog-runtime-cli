import { getCurrentAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { FServiceAPI, FUtil } from '../platform/index.js';

type ApiEnvelope<T> = {
  ret?: number;
  errCode?: number;
  errcode?: number;
  msg?: string;
  data?: T;
};

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

export function isImageFilename(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return IMAGE_EXT.has(ext);
}

function buildCoverAuthHeaders(): Record<string, string> {
  const auth = getCurrentAuth();
  if (!auth) {
    throw new CliError('未登录，无法请求封面 SSE', { code: 2, hint: 'freelog-cli login' });
  }
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
  };
  if (auth.cookie) headers.Cookie = auth.cookie;
  const authorization =
    auth.authorization || (auth.token ? `Bearer ${auth.token}` : undefined);
  if (authorization) headers.Authorization = authorization;
  return headers;
}

function parseCoverSsePayload(raw: string): { sha1: string; url: string } | undefined {
  try {
    const data = JSON.parse(raw) as { sha1?: string; url?: string };
    if (data.sha1 && data.url?.trim()) return { sha1: data.sha1, url: data.url.trim() };
  } catch {
    /* ignore malformed chunk */
  }
  return undefined;
}

/** Console CoverGenerator.generateCoverPromise 等价（SSE） */
export async function generateCoverUrlsViaSse(
  sha1s: string[],
  timeoutMs = 120_000,
): Promise<string[]> {
  if (!sha1s.length) return [];

  const base = FUtil.Format.completeUrlByDomain('api');
  const url = `${base}/v2/storages/files/generateCoverImageSSE`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const urls: string[] = [];
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: buildCoverAuthHeaders(),
      body: JSON.stringify({ sha1Array: sha1s }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new CliError(`封面 SSE HTTP ${response.status}`, { code: 1 });
    }

    const reader = response.body?.getReader();
    if (!reader) throw new CliError('封面 SSE body 不可读', { code: 1 });

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const row = parseCoverSsePayload(line.slice(5).trim());
          if (row?.url) urls.push(row.url);
        }
      }
    }
    return urls;
  } finally {
    clearTimeout(timeout);
  }
}

/** Console CoverGenerator SSE 的 Node 等价：同步 generateCoverImage API */
export async function generateCoverUrlFromSha1(sha1: string): Promise<string | undefined> {
  const response = (await FServiceAPI.Storage.generateCoverImage({ sha1 })) as ApiEnvelope<
    string | { url?: string; fileUrl?: string; coverUrl?: string }
  >;
  const ret = response.ret ?? 0;
  const errCode = response.errCode ?? response.errcode ?? 0;
  if (ret !== 0 || errCode !== 0) return undefined;

  const data = response.data;
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    const url = data.url || data.fileUrl || data.coverUrl;
    if (url?.trim()) return url.trim();
  }
  return undefined;
}

export async function compareCoverSyncAndSse(sha1: string): Promise<{
  ok: boolean;
  syncUrl?: string;
  sseUrls: string[];
  error?: string;
}> {
  const sseUrls = await generateCoverUrlsViaSse([sha1]);
  const syncUrl = await generateCoverUrlFromSha1(sha1);
  const sseUrl = sseUrls[0];
  if (!syncUrl && !sseUrl) {
    return { ok: false, syncUrl, sseUrls, error: '同步与 SSE 均未返回封面 URL' };
  }
  if (!syncUrl || !sseUrl) {
    return {
      ok: false,
      syncUrl,
      sseUrls,
      error: `仅一侧有 URL（sync=${syncUrl || '(none)'} sse=${sseUrl || '(none)'}）`,
    };
  }
  return { ok: syncUrl === sseUrl, syncUrl, sseUrls };
}
