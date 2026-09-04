import fs from 'node:fs';
import path from 'node:path';
import { File } from 'node:buffer';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { resolveCwd } from '../config/project.js';

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif']);

export function looksLikeRemoteCoverUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function readImageDimensions(buf: Buffer, ext: string): { width: number; height: number } | null {
  const lower = ext.toLowerCase();
  if (lower === '.png') {
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
      throw cliError(I18N_KEYS.png_dimensions_unreadable, { code: 4 });
    }
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (lower === '.gif') {
    if (buf.length < 10 || buf.toString('ascii', 0, 3) !== 'GIF') {
      throw cliError(I18N_KEYS.gif_dimensions_unreadable, { code: 4 });
    }
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  if (lower === '.jpg' || lower === '.jpeg') {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      if (marker === 0xc0 || marker === 0xc2) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      const len = buf.readUInt16BE(i + 2);
      i += 2 + len;
    }
    throw cliError(I18N_KEYS.jpeg_dimensions_unreadable, { code: 4 });
  }
  throw cliError(I18N_KEYS.unsupported_cover_format, { code: 4, params: { ext } });
}

/** GIF89a：统计 0x21 0xf9 Graphic Control Extension，>1 视为动画 */
export function isAnimatedGif(buf: Buffer): boolean {
  if (buf.length < 6 || buf.toString('ascii', 0, 3) !== 'GIF') return false;
  let count = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x21 && buf[i + 1] === 0xf9) count++;
    if (count > 1) return true;
  }
  return false;
}

export function assertLocalCoverFile(absolutePath: string): void {
  if (!fs.existsSync(absolutePath)) {
    throw cliError(I18N_KEYS.cli_cover_file_missing, {
      code: 4,
      params: { path: absolutePath },
    });
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw cliError(I18N_KEYS.cli_cover_not_file, {
      code: 4,
      params: { path: absolutePath },
    });
  }
  if (stat.size > COVER_MAX_BYTES) {
    throw cliError(I18N_KEYS.limit_resource_image_size, { code: 4 });
  }
  const ext = path.extname(absolutePath).toLowerCase();
  if (!COVER_EXT.has(ext)) {
    throw cliError(I18N_KEYS.cli_cover_format_unsupported, {
      code: 4,
      hint: '使用 .jpg/.jpeg/.png/.gif',
    });
  }

  const buf = fs.readFileSync(absolutePath);
  if (ext === '.gif' && isAnimatedGif(buf)) {
    throw cliError(I18N_KEYS.cli_cover_gif_no_animation, { code: 4 });
  }
}

/** 本地路径 → uploadImage → URL；已是 http(s) 则原样返回 */
export async function resolveCoverImageUrl(cover: string, cwd?: string): Promise<string> {
  const trimmed = cover.trim();
  if (!trimmed) throw cliError(I18N_KEYS.cli_cover_empty, { code: 4 });
  if (looksLikeRemoteCoverUrl(trimmed)) return trimmed;

  const absolute = path.resolve(resolveCwd(cwd), trimmed);
  assertLocalCoverFile(absolute);
  assertExplicitEnvForWriteOperation();

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
    throw cliError(I18N_KEYS.cli_cover_upload_no_url, { code: 1, details: result });
  }
  return url;
}
