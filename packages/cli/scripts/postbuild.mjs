import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/bin/index.js');
if (!fs.existsSync(bin)) {
  console.error('postbuild: missing', bin);
  process.exit(1);
}
const src = fs.readFileSync(bin, 'utf8');
const privateToolsLibImport = /(?:from\s*['"]|import\s*\(\s*['"])@freelog-cli\/tools-lib2(?:\/node)?['"]/.test(src);
if (privateToolsLibImport) {
  console.error('postbuild: private tools-lib must be bundled into the CLI output');
  process.exit(1);
}
const declaration = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/index.d.ts');
const declarationSource = fs.existsSync(declaration) ? fs.readFileSync(declaration, 'utf8') : '';
if (/(?:from\s*['"]|import\s*\(\s*['"])@freelog-cli\/tools-lib2(?:\/node)?['"]/.test(declarationSource)) {
  console.error('postbuild: public CLI declarations must not reference private tools-lib');
  process.exit(1);
}
if (!src.startsWith('#!')) {
  fs.writeFileSync(bin, `#!/usr/bin/env node\n${src}`);
}
fs.chmodSync(bin, 0o755);
