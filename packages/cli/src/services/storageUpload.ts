import fs from 'node:fs';
import path from 'node:path';
import { ofetch } from 'ofetch';
import { CliError } from '../core/errors.js';
import { getApiBaseURL } from '../core/env.js';
import { getCurrentAuth } from '../core/auth.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';

/** sha1 不存在则 multipart 上传（≅ Console Storage 链） */
export async function uploadFileIfNeeded(absolutePath: string, sha1: string): Promise<void> {
  const existEnv = await FServiceAPI.Storage.fileIsExist({ sha1 });
  const exist = unwrapData<boolean | { isExisting?: boolean }>(existEnv);
  const exists =
    exist === true ||
    (typeof exist === 'object' && exist !== null && (exist as { isExisting?: boolean }).isExisting);

  if (exists) return;

  const auth = getCurrentAuth();
  const buf = fs.readFileSync(absolutePath);
  const blob = new Blob([buf]);
  const form = new FormData();
  form.append('file', blob, path.basename(absolutePath));

  const headers: Record<string, string> = {};
  if (auth?.token) {
    headers.Authorization = auth.authorization || `Bearer ${auth.token}`;
  }

  const response = await ofetch.raw('/v2/storages/files/upload', {
    baseURL: getApiBaseURL(),
    method: 'POST',
    headers,
    body: form,
    timeout: 300_000,
    ignoreResponseError: true,
  });

  const result = response._data as { errCode?: number; msg?: string; data?: unknown };
  if (response.status === 401) {
    throw new CliError('未登录或凭证已过期', { code: 2, hint: 'freelog-cli login' });
  }
  if (result?.errCode !== undefined && result.errCode !== 0) {
    throw new CliError(result.msg || '上传失败', { code: 1, details: result });
  }
}
