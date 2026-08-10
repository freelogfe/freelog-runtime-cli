#!/usr/bin/env node
/**
 * batchSignContracts manifest 透传 + 单品 publish 默认不传（dev）。
 * 用法：pnpm verify:batch
 */
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

function assertOk(label, cond, detail) {
  if (cond) {
    console.log(`✔ ${label}${detail ? `: ${detail}` : ''}`);
    return true;
  }
  console.error(`✘ ${label}${detail ? `: ${detail}` : ''}`);
  return false;
}

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== batchSign smoke (env=${env}) ===\n`);
runCli(verificationLoginArgs());

let ok = true;
const ts = Date.now();
const photoSrc = path.resolve(cliRoot, '../../test/abcdef.png');

try {
  const batchProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-batch-sign-'));
  const photo = path.join(batchProj, 'p.png');
  fs.copyFileSync(photoSrc, photo);
  fs.appendFileSync(photo, String(ts));
  runCli(
    `init . --scaffold none --resource-type RT005001 --resource-name batchp${ts} --title "Batch Sign" --yes --json`,
    { cwd: batchProj },
  );
  parseJson(runCli('create --yes --json', { cwd: batchProj }));
  runCli('version set --version 1.0.0 --file p.png --yes --json', { cwd: batchProj });
  const manifestPath = path.join(batchProj, 'freelog.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version.batchSignContracts = [
    { resourceId: '000000000000000000000001', policyIds: ['000000000000000000000002'] },
  ];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: batchProj }));
  ok =
    assertOk(
      'manifest batchSignContracts → dry-run 透传',
      dry.createVersionParams?.batchSignContracts?.length === 1,
      dry.createVersionParams?.batchSignContracts?.[0]?.resourceId?.slice(0, 8),
    ) && ok;
  fs.rmSync(batchProj, { recursive: true, force: true });

  const solo = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-solo-sign-'));
  const soloPhoto = path.join(solo, 'p.png');
  fs.copyFileSync(photoSrc, soloPhoto);
  fs.appendFileSync(soloPhoto, `solo${ts}`);
  runCli(
    `init . --scaffold none --resource-type RT005001 --resource-name solop${ts} --title "Solo" --yes --json`,
    { cwd: solo },
  );
  parseJson(runCli('create --yes --json', { cwd: solo }));
  runCli('version set --version 1.0.0 --file p.png --yes --json', { cwd: solo });
  const soloDry = parseJson(runCli('publish --dry-run --yes --json', { cwd: solo }));
  ok =
    assertOk(
      '单品 publish 默认不传 batchSignContracts',
      soloDry.createVersionParams?.batchSignContracts === undefined,
      '未携带',
    ) && ok;
  fs.rmSync(solo, { recursive: true, force: true });
} catch (error) {
  ok = false;
  console.error('✘ 异常', error.stderr?.toString()?.slice(0, 500) || error.message);
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
