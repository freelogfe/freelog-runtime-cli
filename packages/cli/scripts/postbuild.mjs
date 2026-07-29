import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/bin/index.js');
if (!fs.existsSync(bin)) {
  console.error('postbuild: missing', bin);
  process.exit(1);
}
const src = fs.readFileSync(bin, 'utf8');
if (!src.startsWith('#!')) {
  fs.writeFileSync(bin, `#!/usr/bin/env node\n${src}`);
}
fs.chmodSync(bin, 0o755);
