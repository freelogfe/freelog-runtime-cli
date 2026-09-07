#!/usr/bin/env node
/* 一次性：扫缺注释的若干类点（console 中文输出 / 导出函数 / 复杂分支） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(repoRoot, 'packages', 'cli', 'src');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

const consoleHits = {};
const exportedNoDoc = {};
for (const p of walk(SRC)) {
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  const rel = path.relative(repoRoot, p);
  lines.forEach((l, i) => {
    const prev = lines[i - 1] ?? '';
    const prev2 = lines[i - 2] ?? '';
    const hasDocAbove = /\/(\*|\/)/.test(prev.trim()) || /\/(\*|\/)/.test(prev2.trim());
    // 含中文的 console 输出，上面两行都没有注释 → 用户可见文案缺 i18n key 注释
    if (/console\.(log|error|warn)\(/.test(l) && /[\u4e00-\u9fa5]/.test(l) && !hasDocAbove) {
      (consoleHits[rel] ||= []).push(`${i + 1}: ${l.trim().slice(0, 70)}`);
    }
    // 导出 function 无头注释（/** */）
    if (/^export (async )?function /.test(l) && !hasDocAbove) {
      const name = l.match(/function (\w+)/)?.[1] ?? '?';
      (exportedNoDoc[rel] ||= []).push(`${i + 1}: ${name}`);
    }
  });
}

let n = 0;
for (const arr of Object.values(consoleHits)) n += arr.length;
console.log(`== 中文 console 输出缺 i18n 注释：${n}`);
for (const [f, arr] of Object.entries(consoleHits)) {
  console.log(f);
  arr.forEach((x) => console.log('   ' + x));
}
let m = 0;
for (const arr of Object.values(exportedNoDoc)) m += arr.length;
console.log(`\n== 导出函数缺头注释：${m}`);
for (const [f, arr] of Object.entries(exportedNoDoc)) {
  console.log(f);
  arr.forEach((x) => console.log('   ' + x));
}
