import fs from 'node:fs';
import path from 'node:path';
import { File } from 'node:buffer';
import { FServiceAPI, unwrapData } from '../platform/index.js';

/** sha1 不存在则 multipart 上传（≅ Console Storage 链） */
export async function uploadFileIfNeeded(absolutePath: string, sha1: string): Promise<void> {
  const existEnv = await FServiceAPI.Storage.fileIsExist({ sha1 });
  const exist = unwrapData<boolean | { isExisting?: boolean }>(existEnv);
  const exists =
    exist === true ||
    (typeof exist === 'object' && exist !== null && (exist as { isExisting?: boolean }).isExisting);

  if (exists) return;

  const buf = fs.readFileSync(absolutePath);
  const file = new File([buf], path.basename(absolutePath));
  await FServiceAPI.Storage.uploadFile({ file }, {
    timeout: 300_000,
  });
}
