/** stdin 读密码（不回显）。login 只认 --password-stdin 这一条入口。 */

import { stdin } from 'node:process';

/** 从 stdin 读整段密码并去掉结尾换行；只被 `--password-stdin` 使用，不走终端回显。 */
export async function readPasswordStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}
