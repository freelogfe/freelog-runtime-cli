import fs from 'node:fs';
import path from 'node:path';
import { File } from 'node:buffer';
import { CliError } from '../core/errors.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
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

  const buf = fs.readFileSync(absolute);
  const file = new File([buf], path.basename(absolute), {
    type:
      path.extname(absolute).toLowerCase() === '.png'
        ? 'image/png'
        : path.extname(absolute).toLowerCase() === '.gif'
          ? 'image/gif'
          : 'image/jpeg',
  });
  const result = await FServiceAPI.Storage.uploadImage({ file }, {
    timeout: 120_000,
  });
  const data = unwrapData<string | { url?: string; fileUrl?: string }>(result);
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
