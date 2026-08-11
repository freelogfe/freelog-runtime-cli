import { access, readFile } from 'node:fs/promises';
import { FUtil } from '../tools-lib.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';

/**
 * 路径入参 → SHA-1 小写 hex；算法实现收敛到 tools-lib Node adapter。
 */
export async function getSHA1Hash(filePath: string): Promise<string> {
  try {
    await access(filePath);
  } catch {
    throw cliError(I18N_KEYS.file_not_found, { code: 4 });
  }
  try {
    return await FUtil.Tool.getSHA1Hash(await readFile(filePath));
  } catch (error) {
    throw cliError(I18N_KEYS.sha1_compute_failed, {
      code: 1,
      params: { error: error instanceof Error ? error.message : String(error) },
      cause: error,
    });
  }
}

export async function getSHA1HashFromBuffer(buf: Uint8Array): Promise<string> {
  return FUtil.Tool.getSHA1Hash(buf);
}
