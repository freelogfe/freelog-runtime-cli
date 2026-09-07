import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 编码守卫：仓库文本文件不允许出现 U+FEFF（BOM/零宽字符）。
// Windows 下部分写入路径会插入 U+FEFF，轻则 git diff 噪音，重则 JSON 解析、
// PowerShell 显示乱码。发现违规后运行 `node test/strip-bom.mjs` 清理。
const TEXT_EXTS = new Set([
  '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.md', '.txt',
  '.vue', '.html', '.css', '.scss', '.yml', '.yaml',
]);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.pnpm']);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function listTextFiles(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) listTextFiles(p, out);
    else if (TEXT_EXTS.has(path.extname(name))) out.push(p);
  }
  return out;
}

describe('编码守卫', () => {
  it('文本文件不含 U+FEFF', () => {
    const offenders = listTextFiles(repoRoot).filter((p) =>
      fs.readFileSync(p, 'utf8').includes('\uFEFF'),
    );
    const shown = offenders.map((p) => path.relative(repoRoot, p)).slice(0, 20);
    expect(shown, `以下文件含 U+FEFF，运行 node test/strip-bom.mjs 清理：\n${shown.join('\n')}`).toEqual([]);
  });
});
