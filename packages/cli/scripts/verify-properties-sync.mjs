#!/usr/bin/env node
/**
 * C 层 collection properties sync：CLI dry-run + Console 源码契约。
 * 真源：collectionManager version_syncAllProperties（仅 authExcludedItems + customPropertyDescriptors）
 *
 * 用法：pnpm verify:properties-sync [--env dev]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatContractErrors,
  validateSyncPropertiesContract,
} from './lib/console-source-contract.mjs';
import {
  formatUpdateCollectionDiff,
  normalizeUpdateCollectionBody,
  diffUpdateCollectionBodies,
} from './lib/update-collection-diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const fixturesDir = path.join(cliRoot, 'test/fixtures');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const useBrowserGolden = process.argv.includes('--browser-golden');

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

function writePolicyFile(filePath) {
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      policyName: '免费',
      policyText: 'for public\r\n\r\ninitial[active]:\r\nterminate\r\n',
      status: 1,
    }),
    'utf8',
  );
}

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== collection properties sync parity (env=${env}) ===\n`);
runCli('login --login-name freelog-test11 --password freelog-test1111 --yes');

let ok = true;
let workBase;
const ts = Date.now();

try {
  workBase = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-props-sync-'));
  const album = `album-props-${ts}`;
  runCli(
    `init ${album} --scaffold collection --resource-type RT003006 --resource-name coll-props-${ts} --title "Props Sync ${ts}" --yes --json`,
    { cwd: workBase },
  );
  const proj = path.join(workBase, album);
  const itemPolicyPath = path.join(proj, 'policy.free.json');
  writePolicyFile(itemPolicyPath);

  parseJson(runCli('collection create --yes --json', { cwd: proj }));

  const manifestPath = path.join(proj, 'freelog.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.collection = manifest.collection || {};
  manifest.collection.authExcludedItems = [
    {
      resourceId: '507f1f77bcf86cd799439011',
      excludedType: 'contractId',
      excludedValue: '507f191e810c19729de860ea',
    },
  ];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const dry = parseJson(runCli('collection properties sync --dry-run --yes --json', { cwd: proj }));
  const cliBody = dry.updateCollectionParams || {};

  ok =
    assertOk(
      'dry-run 返回 updateCollectionParams',
      dry.ok && cliBody.authExcludedItems?.length === 1,
      `authExcluded=${cliBody.authExcludedItems?.length}`,
    ) && ok;

  const contractErrors = validateSyncPropertiesContract(cliBody);
  ok =
    assertOk(
      '符合 Console version_syncAllProperties 契约',
      contractErrors.length === 0,
      contractErrors.length ? formatContractErrors(contractErrors) : '字段约定 OK',
    ) && ok;

  ok =
    assertOk(
      'customPropertyDescriptors 为空数组（RT003006 不支持自定义属性）',
      Array.isArray(cliBody.customPropertyDescriptors) && cliBody.customPropertyDescriptors.length === 0,
      `len=${cliBody.customPropertyDescriptors?.length}`,
    ) && ok;

  if (useBrowserGolden) {
    const goldenPath = path.join(fixturesDir, 'console-updateCollection-properties-sync.json');
    if (fs.existsSync(goldenPath)) {
      const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
      const mismatches = diffUpdateCollectionBodies(golden, cliBody);
      ok =
        assertOk(
          '浏览器金样 spot check（可选）',
          mismatches.length === 0,
          mismatches.length ? formatUpdateCollectionDiff(mismatches) : '一致',
        ) && ok;
    }
  }
} catch (error) {
  ok = false;
  console.error('✘ properties sync', error.stderr?.toString()?.slice(0, 400) || error.message);
} finally {
  if (workBase) fs.rmSync(workBase, { recursive: true, force: true });
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===`);
if (!useBrowserGolden) {
  console.log('i 主验证：CLI dry-run + Console 源码契约；浏览器金样请加 --browser-golden\n');
}
process.exit(ok ? 0 : 1);
