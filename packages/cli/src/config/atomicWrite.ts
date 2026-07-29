import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

/** 原子写：临时文件 → rename */
export function atomicWriteFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${randomBytes(4).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}
