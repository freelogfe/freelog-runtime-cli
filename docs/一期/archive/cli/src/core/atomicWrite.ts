/**
 * 原子写盘：先写同目录临时文件再 rename，进程中断不会留下半截的 N.json / 工作稿。
 * 所有本地状态写盘都必须走这里（不准直接 fs.writeFile）。
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function fsyncDirectory(dir: string): void {
  if (process.platform === 'win32') {
    return;
  }
  let fd: number | undefined;
  try {
    fd = fs.openSync(dir, 'r');
    fs.fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EINVAL' && code !== 'ENOTSUP' && code !== 'EISDIR') {
      throw error;
    }
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

/** 同目录临时文件写入后 rename，保证单文件替换原子。 */
export function atomicWriteFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`,
  );
  let fd: number | undefined;
  try {
    fd = fs.openSync(tmp, 'wx');
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, filePath);
    fsyncDirectory(dir);
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
    if (fs.existsSync(tmp)) {
      fs.unlinkSync(tmp);
    }
  }
}
