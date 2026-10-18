/** Only the private credential input boundary: never expose parser excerpts, I/O messages or cause. */
import { readFileSync } from 'node:fs';

export function readPrivateJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
  } catch {
    throw new Error('私有凭据读取或解析失败；内容不进入报告。');
  }
}
