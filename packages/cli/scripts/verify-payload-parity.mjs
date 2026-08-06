#!/usr/bin/env node
/**
 * C 层 payload 深度验证（dev）：dry-run createVersion ↔ 发版后 platform 读回。
 * 用法：pnpm build && node scripts/verify-payload-parity.mjs [--env dev]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffInputAttrsByValue, formatAttrDiff } from './lib/payload-parity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

function runCli(args, opts = {}) {
  const cmd = `node "${cliBin}" ${args} --env ${env}`;
  return execSync(cmd, {
    cwd: opts.cwd || cliRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(`无 JSON: ${stdout.slice(0, 200)}`);
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

console.log(`\n=== payload parity (env=${env}) ===\n`);

runCli('login --login-name freelog-test11 --password freelog-test1111 --yes');

const ts = Date.now();
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-payload-parity-'));
const photo = path.join(proj, 'photo.png');
const testPhoto = path.resolve(cliRoot, '../../test/abcdef.png');
fs.copyFileSync(testPhoto, photo);
fs.appendFileSync(photo, String(ts));

let ok = true;

try {
  runCli(
    `init . --scaffold none --resource-type RT005001 --resource-name parity-${ts} --title "Parity ${ts}" --yes --json`,
    { cwd: proj },
  );
  parseJson(runCli('create --yes --json', { cwd: proj }));
  runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: proj });

  const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: proj }));
  ok =
    assertOk(
      'dry-run 产出 createVersionParams',
      dry.ok && dry.createVersionParams?.fileSha1,
      dry.createVersionParams?.filename,
    ) && ok;

  const pub = parseJson(runCli('publish --yes --json', { cwd: proj }));
  ok = assertOk('publish 成功', pub.ok, pub.version) && ok;

  const shown = parseJson(runCli(`version show --version ${pub.version} --yes --json`, { cwd: proj }));
  ok = assertOk('version show 成功', shown.ok) && ok;

  const manifest = JSON.parse(fs.readFileSync(path.join(proj, 'freelog.manifest.json'), 'utf8'));
  const localAttrs = manifest.version?.inputAttrs || [];

  const manifestDiff = diffInputAttrsByValue(localAttrs, shown.inputAttrs);
  ok =
    assertOk(
      'manifest ↔ 平台 value parity',
      manifestDiff.length === 0,
      manifestDiff.length ? formatAttrDiff(manifestDiff) : `${localAttrs.length} attrs`,
    ) && ok;

  const dryDiff = diffInputAttrsByValue(dry.createVersionParams?.inputAttrs, shown.inputAttrs);
  ok =
    assertOk(
      'dry-run ↔ 平台 value parity',
      dryDiff.length === 0,
      dryDiff.length ? formatAttrDiff(dryDiff) : 'body 一致',
    ) && ok;
} catch (error) {
  ok = false;
  console.error('✘ 异常', error.stderr?.toString()?.slice(0, 400) || error.message);
} finally {
  fs.rmSync(proj, { recursive: true, force: true });
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
