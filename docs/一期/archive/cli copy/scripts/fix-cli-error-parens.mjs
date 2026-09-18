#!/usr/bin/env node
/** Fix cliError missing closing paren: `};` -> `});` when preceded by cliError call */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

let fixed = 0;
for (const file of walk(srcRoot)) {
  let content = fs.readFileSync(file, 'utf8');
  const next = content.replace(/throw cliError\(((?:[^{}]|\{[^{}]*\})*)\};/g, 'throw cliError($1});');
  if (next !== content) {
    fs.writeFileSync(file, next);
    fixed++;
  }
}
console.log(`Fixed ${fixed} files`);
