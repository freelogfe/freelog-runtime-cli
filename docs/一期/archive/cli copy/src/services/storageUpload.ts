import fs from 'node:fs';
import path from 'node:path';
import { File } from 'node:buffer';
import { FServiceAPI, getSHA1Hash, unwrapData } from '../platform/index.js';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';

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

/** 只读检查：dry-run 可用它判断属性解析是否具备平台文件前提。 */
export async function fileExistsOnPlatform(sha1: string): Promise<boolean> {
  const existEnv = await FServiceAPI.Storage.fileIsExist({ sha1 });
  return fileAlreadyExists(unwrapData(existEnv));
}

/** sha1 不存在则 multipart 上传（≅ Console Storage 链） */
export async function uploadFileIfNeeded(
  absolutePath: string,
  sha1: string,
): Promise<'uploaded' | 'reused'> {
  assertExplicitEnvForWriteOperation();
  if (await fileExistsOnPlatform(sha1)) return 'reused';

  const buf = fs.readFileSync(absolutePath);
  const file = new File([buf], path.basename(absolutePath));
  await FServiceAPI.Storage.uploadFile({ file }, {
    timeout: 300_000,
  });
  return 'uploaded';
}

/** 命令层使用的文件准备入口：计算 SHA1 并确保文件已进入平台存储。 */
export async function prepareLocalFileForPlatform(absolutePath: string): Promise<string> {
  const sha1 = await getSHA1Hash(absolutePath);
  await uploadFileIfNeeded(absolutePath, sha1);
  return sha1;
}
