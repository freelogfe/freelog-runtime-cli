#!/usr/bin/env node
/**
 * C 层：Console Network createVersion ↔ CLI dry-run 并排 diff（dev）。
 * 金样来源：Playwright 抓包 Console versionCreator（2026-08-06 RT005001）。
 * 用法：pnpm verify:console [--env dev] [--console-json path]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diffCreateVersionBodies,
  formatCreateVersionDiff,
  normalizeCreateVersionBody,
} from './lib/create-version-diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const goldenFixture = path.join(cliRoot, 'test/fixtures/console-createVersion-RT005001.json');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const consoleJsonIdx = process.argv.indexOf('--console-json');
const consoleJsonPath = consoleJsonIdx >= 0 ? process.argv[consoleJsonIdx + 1] : null;

function runCli(args, opts = {}) {
  return execSync(`node "${cliBin}" ${args} --env ${env}`, {
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

console.log(`\n=== Console ↔ CLI createVersion parity (env=${env}) ===\n`);

runCli('login --login-name freelog-test11 --password freelog-test1111 --yes');

const ts = Date.now();
const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-console-parity-'));
const photo = path.join(proj, 'photo.png');
const testPhoto = path.resolve(cliRoot, '../../test/abcdef.png');
fs.copyFileSync(testPhoto, photo);
fs.appendFileSync(photo, String(ts));

let ok = true;

try {
  runCli(
    `init . --scaffold none --resource-type RT005001 --resource-name paritycv${ts} --title "Parity CV ${ts}" --yes --json`,
    { cwd: proj },
  );
  parseJson(runCli('create --yes --json', { cwd: proj }));
  runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: proj });

  const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: proj }));
  ok =
    assertOk(
      'CLI dry-run 产出 createVersionParams',
      dry.ok && dry.createVersionParams?.fileSha1,
      dry.createVersionParams?.filename,
    ) && ok;

  const cliBody = normalizeCreateVersionBody(dry.createVersionParams);

  ok =
    assertOk(
      'Console 单品不传 batchSignContracts',
      cliBody.batchSignContracts === undefined,
      '未携带',
    ) && ok;

  let consoleBody;
  if (consoleJsonPath) {
    consoleBody = JSON.parse(fs.readFileSync(consoleJsonPath, 'utf8'));
    console.log(`i 使用 --console-json ${consoleJsonPath}`);
  } else if (fs.existsSync(goldenFixture)) {
    consoleBody = JSON.parse(fs.readFileSync(goldenFixture, 'utf8'));
    console.log(`i 使用金样 ${path.relative(cliRoot, goldenFixture)}（Console Network 2026-08-06）`);
    console.log(`i 比对时忽略 fileSha1/filename（每次运行文件内容不同）`);
  } else {
    throw new Error('缺少金样或 --console-json');
  }

  const mismatches = diffCreateVersionBodies(consoleBody, cliBody);
  ok =
    assertOk(
      'Console Network body ↔ CLI dry-run',
      mismatches.length === 0,
      mismatches.length ? formatCreateVersionDiff(mismatches) : `${Object.keys(cliBody).length} 字段一致`,
    ) && ok;
} catch (error) {
  ok = false;
  console.error('✘ 异常', error.stderr?.toString()?.slice(0, 400) || error.message);
} finally {
  fs.rmSync(proj, { recursive: true, force: true });
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
