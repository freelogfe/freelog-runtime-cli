import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 注释守卫：src 下每个导出函数必须有紧邻的头注释（/** ... */ 或 //）。
// 规范见 docs/一期/产品方案/开发/02-技术选型.md §2（用户可见文案还要带 // i18n: key）。
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');

function listTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) listTsFiles(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** 函数声明行的上一行非空内容是否是注释（/** 块的收尾行以 * 开头，也算）。 */
function hasDocAbove(lines: readonly string[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    return line.startsWith('/**') || line.startsWith('*') || line.startsWith('//');
  }
  return false;
}

describe('注释守卫', () => {
  it('每个导出函数都有头注释', () => {
    const offenders: string[] = [];
    for (const p of listTsFiles(SRC)) {
      const rel = path.relative(SRC, p).replaceAll('\\', '/');
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((line, i) => {
        if (/^export (async )?function \w+/.test(line) && !hasDocAbove(lines, i)) {
          const name = line.match(/function (\w+)/)?.[1] ?? '?';
          offenders.push(`${rel}:${i + 1} ${name}`);
        }
      });
    }
    expect(offenders, `以下导出函数缺头注释：\n${offenders.join('\n')}`).toEqual([]);
  });
});
