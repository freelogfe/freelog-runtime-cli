#!/usr/bin/env node
/** generateCoverImage（同步）↔ generateCoverImageSSE 同 sha1 URL 对比。用法：pnpm verify:cover */
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

console.log(`\n=== cover SSE vs sync parity (env=${env}) ===\n`);
runCli(verificationLoginArgs());

const ts = Date.now();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cover-'));
const photo = path.join(dir, 'photo.png');
fs.copyFileSync(path.resolve(cliRoot, '../../test/abcdef.png'), photo);
fs.appendFileSync(photo, String(ts));

try {
  const out = parseJson(
    runCli(`cover compare --file photo.png --yes --json`, { cwd: dir }),
  );
  if (out.ok) {
    console.log(`✔ 同步 API ↔ SSE 封面 URL 一致`);
    if (out.syncUrl) console.log(`  ${out.syncUrl.slice(0, 80)}…`);
    process.exit(0);
  }
  console.error('✘ 封面 URL 不一致', out.error || JSON.stringify(out).slice(0, 300));
  process.exit(1);
} catch (error) {
  console.error('✘', error.stderr?.toString()?.slice(0, 400) || error.message);
  process.exit(1);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
