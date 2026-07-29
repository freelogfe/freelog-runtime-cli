import fs from 'node:fs';
import path from 'node:path';
import { ofetch } from 'ofetch';
import { CliError } from '../core/errors.js';
import { getApiBaseURL } from '../core/env.js';
import { getCurrentAuth } from '../core/auth.js';
import { resolveCwd } from '../config/paths.js';

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif']);

export function looksLikeRemoteCoverUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function assertLocalCoverFile(absolutePath: string): void {
  if (!fs.existsSync(absolutePath)) {
    throw new CliError(`封面文件不存在: ${absolutePath}`, { code: 4 });
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new CliError(`封面必须是文件: ${absolutePath}`, { code: 4 });
  }
  if (stat.size > COVER_MAX_BYTES) {
    throw new CliError('封面大小不能超过 5MB', { code: 4 });
  }
  const ext = path.extname(absolutePath).toLowerCase();
  if (!COVER_EXT.has(ext)) {
    throw new CliError('封面仅支持 JPEG/PNG/GIF', {
      code: 4,
      hint: '使用 .jpg/.jpeg/.png/.gif',
    });
  }
}

/** 本地路径 → uploadImage → URL；已是 http(s) 则原样返回 */
export async function resolveCoverImageUrl(cover: string, cwd?: string): Promise<string> {
  const trimmed = cover.trim();
  if (!trimmed) throw new CliError('封面不能为空', { code: 4 });
  if (looksLikeRemoteCoverUrl(trimmed)) return trimmed;

  const absolute = path.resolve(resolveCwd(cwd), trimmed);
  assertLocalCoverFile(absolute);

  const auth = getCurrentAuth();
  const buf = fs.readFileSync(absolute);
  const blob = new Blob([buf], {
    type:
      path.extname(absolute).toLowerCase() === '.png'
        ? 'image/png'
        : path.extname(absolute).toLowerCase() === '.gif'
          ? 'image/gif'
          : 'image/jpeg',
  });
  const form = new FormData();
  form.append('file', blob, path.basename(absolute));

  const headers: Record<string, string> = {};
  if (auth?.token) {
    headers.Authorization = auth.authorization || `Bearer ${auth.token}`;
  }

  const response = await ofetch.raw('/v2/storages/files/uploadImage', {
    baseURL: getApiBaseURL(),
    method: 'POST',
    headers,
    body: form,
    timeout: 120_000,
    ignoreResponseError: true,
  });

  const result = response._data as {
    errCode?: number;
    msg?: string;
    data?: string | { url?: string; fileUrl?: string };
  };
  if (response.status === 401) {
    throw new CliError('未登录或凭证已过期', { code: 2, hint: 'freelog-cli login' });
  }
  if (result?.errCode !== undefined && result.errCode !== 0) {
    throw new CliError(result.msg || '封面上传失败', { code: 1, details: result });
  }

  const data = result?.data;
  const url =
    typeof data === 'string'
      ? data
      : data && typeof data === 'object'
        ? data.url || data.fileUrl
        : undefined;
  if (!url) {
    throw new CliError('封面上传响应缺少 URL', { code: 1, details: result });
  }
  return url;
}
