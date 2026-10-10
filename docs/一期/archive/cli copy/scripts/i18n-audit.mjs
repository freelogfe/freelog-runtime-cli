#!/usr/bin/env node
/**
 * Scan packages/cli/src for CliError with hardcoded Chinese (user-visible i18n debt).
 * Exit 1 if any found (for CI gate after full migration).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, '../src');

const CHINESE_IN_STRING = /[\u4e00-\u9fff]/;
const CLI_ERROR_PATTERN = /throw\s+new\s+CliError\s*\(\s*[`'"]([^`'"]*)/g;
const CLI_ERROR_TEMPLATE = /throw\s+new\s+CliError\s*\(\s*`([^`]*)/g;

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const hits = [];

for (const file of walk(srcRoot)) {
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('CliError')) continue;
    const m = line.match(/CliError\s*\(\s*[`'"]([^`'"]*)/) ?? line.match(/CliError\s*\(\s*`([^`]*)`/);
    if (m && CHINESE_IN_STRING.test(m[1])) {
      hits.push({ file: rel, line: i + 1, snippet: m[1].slice(0, 80) });
    }
  }
}

if (hits.length === 0) {
  console.log('i18n-audit: OK — no CliError with hardcoded Chinese in src/');
  process.exit(0);
}

console.error(`i18n-audit: ${hits.length} CliError(s) with hardcoded Chinese:\n`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.line}  ${h.snippet}`);
}
process.exit(1);
