import { getCurrentAuth } from '../core/auth.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { FUtil } from '../platform/index.js';
import { pollFilesSha1Info, type HandleFilePropertiesResult } from './fileProperty/index.js';

export type ParsedMetaRow = {
  sha1: string;
  metaAnalyzeStatus: 0 | 1 | 2 | 3;
  fileSize: number;
  metaInfoArray: Array<{
    insertMode: 1 | 2;
    key: string;
    name: string;
    remark: string;
    value: number | string | null;
    valueDisplay: string;
    valueUnit: string;
  }>;
};

function normalizeMetaInfoArray(
  rows: ParsedMetaRow['metaInfoArray'] | undefined,
): ParsedMetaRow['metaInfoArray'] {
  return [...(rows || [])]
    .map((row) => ({
      insertMode: row.insertMode,
      key: String(row.key),
      name: String(row.name ?? ''),
      remark: String(row.remark ?? ''),
      value: row.value,
      valueDisplay: String(row.valueDisplay ?? ''),
      valueUnit: String(row.valueUnit ?? ''),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function metaInfoArraysEqual(
  a: ParsedMetaRow['metaInfoArray'] | undefined,
  b: ParsedMetaRow['metaInfoArray'] | undefined,
): boolean {
  return JSON.stringify(normalizeMetaInfoArray(a)) === JSON.stringify(normalizeMetaInfoArray(b));
}

function isTerminalStatus(status: number): boolean {
  return status === 2 || status === 3;
}

function buildSseUrl(sha1: string[], resourceTypeCode: string): string {
  const base = FUtil.Format.completeUrlByDomain('api');
  const params = new URLSearchParams({
    sha1: sha1.join(','),
    resourceTypeCode,
  });
  return `${base}/v2/storages/files/listSSE/info?${params.toString()}`;
}

function buildAuthHeaders(): Record<string, string> {
  const auth = getCurrentAuth();
  if (!auth) {
    throw cliError(I18N_KEYS.meta_sse_login_required, {
      code: 2,
      hint: 'freelog-cli login',
    });
  }
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (auth.cookie) headers.Cookie = auth.cookie;
  const authorization =
    auth.authorization || (auth.token ? `Bearer ${auth.token}` : undefined);
  if (authorization) headers.Authorization = authorization;
  return headers;
}

/** Console PropertyParser SSE（Node fetch 读 stream） */
export async function pollFilesSha1InfoViaSse(opts: {
  sha1: string[];
  resourceTypeCode: string;
  timeoutMs?: number;
}): Promise<{ error: string; result: ParsedMetaRow[] }> {
  if (!opts.sha1.length) return { error: '', result: [] };

  const url = buildSseUrl(opts.sha1, opts.resourceTypeCode);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);

  try {
    const response = await fetch(url, {
      headers: buildAuthHeaders(),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { error: `SSE HTTP ${response.status}`, result: [] };
    }

    const latestBySha1 = new Map<string, ParsedMetaRow>();
    const reader = response.body?.getReader();
    if (!reader) {
      return { error: 'SSE body 不可读', result: [] };
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n');
      buffer = chunks.pop() || '';
      for (const line of chunks) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try {
          const row = JSON.parse(payload) as ParsedMetaRow;
          if (row?.sha1) latestBySha1.set(row.sha1, row);
        } catch {
          // 忽略非 JSON 行
        }
      }
    }

    const result = opts.sha1
      .map((sha1) => latestBySha1.get(sha1))
      .filter((row): row is ParsedMetaRow => Boolean(row));

    const missing = opts.sha1.filter((sha1) => !latestBySha1.has(sha1));
    if (missing.length) {
      return { error: `SSE 未收到 sha1: ${missing.join(',')}`, result };
    }

    const pending = result.filter((row) => !isTerminalStatus(row.metaAnalyzeStatus));
    if (pending.length) {
      return {
        error: `SSE 解析未完成: ${pending.map((r) => `${r.sha1}:${r.metaAnalyzeStatus}`).join(',')}`,
        result,
      };
    }

    return { error: '', result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `SSE 请求失败: ${message}`, result: [] };
  } finally {
    clearTimeout(timeout);
  }
}

export type MetaApiParityDiff = {
  sha1: string;
  restStatus: number;
  sseStatus: number;
  metaEqual: boolean;
};

/** 同 sha1：REST 轮询 vs Console SSE 最终 metaInfoArray 对比 */
export async function compareFileMetaRestAndSse(opts: {
  sha1: string[];
  resourceTypeCode: string;
  delayMs?: number;
  sseTimeoutMs?: number;
}): Promise<{ ok: boolean; diffs: MetaApiParityDiff[]; error?: string }> {
  const [rest, sse] = await Promise.all([
    pollFilesSha1Info({
      sha1: opts.sha1,
      resourceTypeCode: opts.resourceTypeCode,
      delayMs: opts.delayMs,
    }),
    pollFilesSha1InfoViaSse({
      sha1: opts.sha1,
      resourceTypeCode: opts.resourceTypeCode,
      timeoutMs: opts.sseTimeoutMs,
    }),
  ]);

  if (rest.error) return { ok: false, diffs: [], error: `REST: ${rest.error}` };
  if (sse.error) return { ok: false, diffs: [], error: `SSE: ${sse.error}` };

  const restMap = new Map(rest.result.map((row) => [row.sha1, row]));
  const sseMap = new Map(sse.result.map((row) => [row.sha1, row]));
  const diffs: MetaApiParityDiff[] = [];

  for (const sha1 of opts.sha1) {
    const restRow = restMap.get(sha1);
    const sseRow = sseMap.get(sha1);
    if (!restRow || !sseRow) {
      return { ok: false, diffs: [], error: `缺少 sha1 ${sha1} 的 REST/SSE 结果` };
    }
    const metaEqual = metaInfoArraysEqual(restRow.metaInfoArray, sseRow.metaInfoArray);
    diffs.push({
      sha1,
      restStatus: restRow.metaAnalyzeStatus,
      sseStatus: sseRow.metaAnalyzeStatus,
      metaEqual,
    });
  }

  return { ok: diffs.every((d) => d.metaEqual), diffs };
}

export type { HandleFilePropertiesResult };
