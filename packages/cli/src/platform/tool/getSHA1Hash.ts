import { access, readFile } from 'node:fs/promises';
import { CliError } from '../../core/errors.js';
import { FUtil } from '../tools-lib.js';

/**
 * 路径入参 → SHA-1 小写 hex；算法实现收敛到 tools-lib Node adapter。
 */
export async function getSHA1Hash(filePath: string): Promise<string> {
  try {
    await access(filePath);
  } catch {
    throw new CliError(`文件不存在: ${filePath}`, { code: 4 });
  }
  try {
    return await FUtil.Tool.getSHA1Hash(await readFile(filePath));
  } catch (error) {
    throw new CliError(
      `计算 SHA1 失败: ${error instanceof Error ? error.message : String(error)}`,
      { code: 1, cause: error },
    );
  }
}

export async function getSHA1HashFromBuffer(buf: Uint8Array): Promise<string> {
  return FUtil.Tool.getSHA1Hash(buf);
}
