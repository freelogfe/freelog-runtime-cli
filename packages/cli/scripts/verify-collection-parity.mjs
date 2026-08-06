#!/usr/bin/env node
/**
 * C 层：Console updateCollection ↔ CLI collection publish --dry-run（dev）。
 * 用法：pnpm verify:collection [--env dev] [--case merge1|merge0|all]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diffUpdateCollectionBodies,
  formatUpdateCollectionDiff,
  normalizeUpdateCollectionBody,
} from './lib/update-collection-diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const fixturesDir = path.join(cliRoot, 'test/fixtures');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const caseArgIdx = process.argv.indexOf('--case');
const caseFilter = caseArgIdx >= 0 ? process.argv[caseArgIdx + 1] || 'all' : 'all';

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

function copyUniqueFile(src, dest, tag) {
  fs.copyFileSync(src, dest);
  fs.appendFileSync(dest, String(tag));
}

function setupCollectionProj(ts) {
  const workBase = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-coll-parity-'));
  const album = `album-${ts}`;
  runCli(
    `init ${album} --scaffold collection --resource-type RT003006 --resource-name coll-parity-${ts} --title "Coll Parity ${ts}" --yes --json`,
    { cwd: workBase },
  );
  const proj = path.join(workBase, album);
  const itemPolicyPath = path.join(proj, 'policy.free.json');
  writePolicyFile(itemPolicyPath);
  parseJson(runCli('collection create --yes --json', { cwd: proj }));
  const mediaDir = path.join(workBase, 'photos');
  fs.mkdirSync(mediaDir, { recursive: true });
  const photoSrc = path.resolve(cliRoot, '../../test/abcdef.png');
  copyUniqueFile(photoSrc, path.join(mediaDir, 'a.png'), `${ts}a`);
  copyUniqueFile(photoSrc, path.join(mediaDir, 'b.png'), `${ts}b`);
  parseJson(
    runCli(
      `collection item import-dir "${mediaDir}" --resource-type RT005001 --item-policy-file "${itemPolicyPath}" --title-prefix "p " --yes --json`,
      { cwd: proj },
    ),
  );
  runCli('collection version set --description "parity v1" --json', { cwd: proj });
  return { workBase, proj };
}

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== Console ↔ CLI updateCollection parity (env=${env}) ===\n`);
runCli('login --login-name freelog-test11 --password freelog-test1111 --yes');

let ok = true;
const cases = caseFilter === 'all' ? ['merge1', 'merge0'] : [caseFilter];

for (const caseName of cases) {
  console.log(`--- ${caseName} ---`);
  const ts = Date.now();
  let workBase;
  try {
    const { proj, workBase: wb } = setupCollectionProj(ts);
    workBase = wb;

    if (caseName === 'merge0') {
      parseJson(runCli('collection publish --yes --json', { cwd: proj }));
      runCli('collection version set --description "no item change" --json', { cwd: proj });
    }

    const dry = parseJson(runCli('collection publish --dry-run --yes --json', { cwd: proj }));
    const cliBody = normalizeUpdateCollectionBody(dry.updateCollectionParams);
    const expectedMerge = caseName === 'merge1' ? 1 : 0;

    ok =
      assertOk(
        `${caseName} isMergeCatalogueDraft`,
        dry.isMergeCatalogueDraft === expectedMerge,
        `got ${dry.isMergeCatalogueDraft}`,
      ) && ok;

    const goldenPath = path.join(fixturesDir, `console-updateCollection-${caseName}.json`);
    if (!fs.existsSync(goldenPath)) {
      throw new Error(`缺少金样 ${goldenPath}`);
    }
    const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
    const mismatches = diffUpdateCollectionBodies(golden, cliBody);
    ok =
      assertOk(
        `${caseName} Console ↔ CLI dry-run`,
        mismatches.length === 0,
        mismatches.length ? formatUpdateCollectionDiff(mismatches) : 'body 一致',
      ) && ok;
  } catch (error) {
    ok = false;
    console.error(`✘ ${caseName}`, error.stderr?.toString()?.slice(0, 400) || error.message);
  } finally {
    if (workBase) fs.rmSync(workBase, { recursive: true, force: true });
  }
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
