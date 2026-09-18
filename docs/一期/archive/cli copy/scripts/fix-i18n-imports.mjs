#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src');
const re =
  /import \{\r?\nimport \{ cliError \} from '([^']+)';\r?\nimport \{ I18N_KEYS \} from '([^']+)';\r?\n/g;

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
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes('import {\nimport { cliError') && !content.includes('import {\r\nimport { cliError'))
    continue;
  const next = content.replace(
    re,
    (_m, cliPath, bundledPath) =>
      `import { cliError } from '${cliPath}';\nimport { I18N_KEYS } from '${bundledPath}';\nimport {\n`,
  );
  if (next !== content) {
    fs.writeFileSync(file, next);
    fixed++;
    console.log('fixed', path.relative(srcRoot, file));
  }
}
console.log(`Done: ${fixed} files`);
