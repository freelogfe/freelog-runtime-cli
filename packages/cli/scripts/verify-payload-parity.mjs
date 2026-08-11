#!/usr/bin/env node
/**
 * C 层 payload 深度验证（dev）：真实 publish body ↔ 发版后 platform 读回；
 * dry-run 单独验证零副作用计划协议。
 * 用法：pnpm build && node scripts/verify-payload-parity.mjs [--env dev]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffInputAttrsByValue, formatAttrDiff } from './lib/payload-parity.mjs';
import { verificationLoginArgs } from './lib/verification-credentials.mjs';
import { parseCliJson } from './lib/cli-json.mjs';

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
  return parseCliJson(stdout);
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

runCli(verificationLoginArgs());

const ts = Date.now();
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-payload-parity-'));
const photo = path.join(proj, 'photo.png');
const testPhoto = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');
fs.copyFileSync(testPhoto, photo);
fs.appendFileSync(photo, String(ts));

let ok = true;

try {
  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name parity-${ts} --title "Parity ${ts}" --yes --json`,
    { cwd: proj },
  );
  parseJson(runCli('create --yes --json', { cwd: proj }));
  runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: proj });

  const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: proj }));
  ok =
    assertOk(
      'dry-run 新文件属性计划',
      dry.ok &&
        dry.createVersionParams?.inputAttrs === 'unresolved' &&
        dry.unresolved?.includes('createVersionParams.inputAttrs'),
      '未上传时明确 unresolved',
    ) && ok;

  const pub = parseJson(runCli('publish --yes --debug --json', { cwd: proj }));
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

  const publishDiff = diffInputAttrsByValue(pub.createVersionParams?.inputAttrs, shown.inputAttrs);
  ok =
    assertOk(
      'publish body ↔ 平台 value parity',
      publishDiff.length === 0,
      publishDiff.length ? formatAttrDiff(publishDiff) : 'body 一致',
    ) && ok;
} catch (error) {
  ok = false;
  console.error('✘ 异常', error.stderr?.toString()?.slice(0, 400) || error.message);
} finally {
  fs.rmSync(proj, { recursive: true, force: true });
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
