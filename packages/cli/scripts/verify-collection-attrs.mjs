#!/usr/bin/env node
/**
 * 合集 #32 类型模板 hydrate、#35 item authExcluded、#39 publish inputAttrs 契约。
 * 用法：pnpm verify:collection-attrs [--env dev]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatContractErrors,
  validateUpdateCollectionContract,
} from './lib/console-source-contract.mjs';
import { runVerificationLogin } from './lib/verification-credentials.mjs';
import { parseCliJson } from './lib/cli-json.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const photoSrc = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

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

const FREE_POLICY = {
  policyName: '免费',
  policyText: 'for public\r\n\r\ninitial[active]:\r\nterminate\r\n',
  status: 1,
};

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== collection attrs #32/#35/#39 (env=${env}) ===\n`);
runVerificationLogin(cliBin, env, { cwd: cliRoot });

let ok = true;
let workBase;
const ts = Date.now();

try {
  workBase = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-coll-attrs-'));

  // --- #32: collection create hydrate ---
  const album = `album-attrs-${ts}`;
  runCli(
    `init ${album} --scaffold collection --resource-type RT003006 --resource-name coll-attrs-${ts} --title "Coll Attrs ${ts}" --yes --json`,
    { cwd: workBase },
  );
  const proj = path.join(workBase, album);
  const created = parseJson(runCli('collection create --yes --json', { cwd: proj }));
  ok =
    assertOk(
      '#32 create 后 hydrate inputAttrs 字段存在',
      Array.isArray(created.collection?.inputAttrs),
      `len=${created.collection?.inputAttrs?.length ?? '?'}`,
    ) && ok;

  const manifestPath = path.join(proj, 'freelog.manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.collection = manifest.collection || {};
  manifest.collection.inputAttrs = (manifest.collection.inputAttrs || []).map((a) =>
    a.key === 'intro' ? { ...a, value: `coll-attrs-${ts}` } : a,
  );
  if (!manifest.collection.inputAttrs.some((a) => a.key === 'intro')) {
    manifest.collection.inputAttrs.push({ key: 'intro', value: `coll-attrs-${ts}` });
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // --- dep for #35 ---
  const depDir = path.join(workBase, 'dep');
  fs.mkdirSync(depDir, { recursive: true });
  fs.copyFileSync(photoSrc, path.join(depDir, 'dep.png'));
  fs.appendFileSync(path.join(depDir, 'dep.png'), `${ts}dep`);
  fs.writeFileSync(
    path.join(depDir, 'freelog.batch.json'),
    `${JSON.stringify(
      {
        defaults: { resourceTypeCode: 'RT005001', policies: [FREE_POLICY], version: '1.0.0' },
        items: [{ filePath: 'dep.png' }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const depImp = parseJson(runCli(`resource import-dir "${depDir}" --yes --json`, { cwd: workBase }));
  const depRow = depImp.created?.[0];
  const depProj = path.join(depDir, depRow.subdir);
  const policyList = parseJson(runCli('policy list --json', { cwd: depProj }));
  const policyId = policyList.policies?.[0]?.policyId;

  const itemPolicyPath = path.join(proj, 'policy.free.json');
  fs.writeFileSync(itemPolicyPath, `${JSON.stringify(FREE_POLICY, null, 2)}\n`, 'utf8');
  const mediaDir = path.join(workBase, 'photos');
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.copyFileSync(photoSrc, path.join(mediaDir, 'a.png'));
  fs.appendFileSync(path.join(mediaDir, 'a.png'), `${ts}a`);
  parseJson(
    runCli(
      `collection item import-dir "${mediaDir}" --resource-type RT005001 --item-policy-file "${itemPolicyPath}" --title-prefix "p " --yes --json`,
      { cwd: proj },
    ),
  );

  const authFile = path.join(proj, 'auth-excluded.yaml');
  fs.writeFileSync(
    authFile,
    `- resourceId: ${depRow.resourceId}\n  excludedType: policyId\n  excludedValue: ${policyId}\n`,
    'utf8',
  );
  const added = parseJson(
    runCli(`collection item add ${depRow.resourceId} --auth-excluded-file "${authFile}" --title "dep item" --yes --json`, {
      cwd: proj,
    }),
  );
  ok =
    assertOk('#35 item add + authExcluded', added.ok && added.resourceId, added.resourceId) && ok;

  // --- #39: publish dry-run carries inputAttrs ---
  runCli('collection version set --description "attrs test" --json', { cwd: proj });
  const dry = parseJson(
    runCli('collection publish --dry-run --no-auto-pull --yes --json', { cwd: proj }),
  );
  const body = dry.updateCollectionParams || {};
  ok =
    assertOk(
      '#39 publish dry-run 含 manifest inputAttrs',
      body.inputAttrs?.some((a) => a.key === 'intro' && a.value === `coll-attrs-${ts}`),
      body.inputAttrs?.map((a) => `${a.key}=${a.value}`).join(';'),
    ) && ok;
  const contractErrors = validateUpdateCollectionContract(body, { expectedMerge: 1 });
  ok =
    assertOk(
      '#39 符合 updateCollection 契约',
      contractErrors.length === 0,
      contractErrors.length ? formatContractErrors(contractErrors) : 'OK',
    ) && ok;
} catch (error) {
  ok = false;
  console.error('✘ collection attrs', error.stdout?.toString()?.slice(0, 500) || error.message);
} finally {
  if (workBase) fs.rmSync(workBase, { recursive: true, force: true });
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
