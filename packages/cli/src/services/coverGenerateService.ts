import { FServiceAPI } from '../platform/index.js';

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
