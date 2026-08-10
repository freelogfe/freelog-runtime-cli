#!/usr/bin/env node
/** REST vs SSE meta parity。用法：pnpm verify:meta */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationLoginArgs } from './lib/verification-credentials.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

function runCli(args, opts = {}) {
  return execSync(`node "${cliBin}" ${args} --env ${env}`, {
    cwd: opts.cwd || cliRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, FREELOG_DEV: '1', ...(opts.env || {}) },
  });
}

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  return JSON.parse(stdout.slice(start));
}

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== meta API parity (env=${env}) ===\n`);
runCli(verificationLoginArgs());

const ts = Date.now();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-meta-'));
const photo = path.join(dir, 'photo.png');
fs.copyFileSync(path.resolve(cliRoot, '../../test/abcdef.png'), photo);
fs.appendFileSync(photo, String(ts));

try {
  const out = parseJson(
    runCli('meta compare --file photo.png --resource-type RT005001 --yes --json', { cwd: dir }),
  );
  if (out.ok) {
    console.log('✔ REST/SSE metaInfoArray 一致');
    process.exit(0);
  }
  console.error('✘ REST/SSE meta 不一致', JSON.stringify(out).slice(0, 400));
  process.exit(1);
} catch (error) {
  console.error('✘', error.stderr?.toString()?.slice(0, 400) || error.message);
  process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
