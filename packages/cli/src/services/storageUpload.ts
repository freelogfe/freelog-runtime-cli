import fs from 'node:fs';
import path from 'node:path';
import { File } from 'node:buffer';
import { FServiceAPI, unwrapData } from '../platform/index.js';

export function fileAlreadyExists(payload: unknown): boolean {
  if (payload === true) return true;
  if (Array.isArray(payload)) {
    return payload.some((item) => fileAlreadyExists(item));
  }
  return (
    typeof payload === 'object' &&
    payload !== null &&
    Boolean((payload as { isExisting?: boolean }).isExisting)
  );
}

/** sha1 不存在则 multipart 上传（≅ Console Storage 链） */
export async function uploadFileIfNeeded(absolutePath: string, sha1: string): Promise<void> {
  const existEnv = await FServiceAPI.Storage.fileIsExist({ sha1 });
  const exists = fileAlreadyExists(unwrapData(existEnv));

  if (exists) return;

  const buf = fs.readFileSync(absolutePath);
  const file = new File([buf], path.basename(absolutePath));
  await FServiceAPI.Storage.uploadFile({ file }, {
    timeout: 300_000,
  });
}
