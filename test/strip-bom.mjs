#!/usr/bin/env node
/* 一次性：清理仓库文本文件中的 U+FEFF（BOM/零宽字符），报告 U+FFFD 乱码 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTS = new Set(['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.vue', '.html', '.css', '.scss', '.yml', '.yaml']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.pnpm']);

const files = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXTS.has(path.extname(name))) files.push(p);
  }
})(repoRoot);

const bomFiles = [];
const replacementFiles = [];
for (const p of files) {
  const buf = fs.readFileSync(p);
  if (!buf.includes(0xef, 0) || true) {
    const s = buf.toString('utf8');
    const hasBom = s.includes('\uFEFF');
    const hasReplacement = s.includes('\uFFFD');
    if (hasReplacement) replacementFiles.push(p);
    if (hasBom) {
      bomFiles.push(p);
      fs.writeFileSync(p, s.replaceAll('\uFEFF', ''), 'utf8');
    }
  }
}

console.log(`扫描文本文件 ${files.length} 个`);
console.log(`清理 U+FEFF：${bomFiles.length} 个文件`);
for (const p of bomFiles) console.log('  -', path.relative(repoRoot, p));
console.log(`U+FFFD 乱码：${replacementFiles.length} 个文件`);
for (const p of replacementFiles) console.log('  -', path.relative(repoRoot, p));
