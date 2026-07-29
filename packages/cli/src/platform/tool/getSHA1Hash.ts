import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { CliError } from '../../core/errors.js';

/**
 * ≅ FUtil.Tool.getSHA1Hash(File)
 * Node：路径入参 → SHA-1 小写 hex（与 Web Crypto SHA-1 同算法同结果）
 */
export async function getSHA1Hash(filePath: string): Promise<string> {
  try {
    await access(filePath);
  } catch {
    throw new CliError(`文件不存在: ${filePath}`, { code: 4 });
  }

  return new Promise((resolve, reject) => {
    const hash = createHash('sha1');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', (err) =>
      reject(new CliError(`计算 SHA1 失败: ${err.message}`, { code: 1, cause: err })),
    );
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export async function getSHA1HashFromBuffer(buf: Uint8Array): Promise<string> {
  return createHash('sha1').update(buf).digest('hex');
}
