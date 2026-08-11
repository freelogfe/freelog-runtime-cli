#!/usr/bin/env node
/**
 * authExcludedItems 存在时 import-dir 跳过 createBatch，走单条 create + createVersion（#30）。
 * 使用真实 dep 资源 + policyId，确保 API 接受 authExcluded 声明。
 *
 * 用法：pnpm verify:single-create [--env dev]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationLoginArgs } from './lib/verification-credentials.mjs';
import { parseCliJson } from './lib/cli-json.mjs';

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

function copyUniqueFile(src, dest, tag) {
  fs.copyFileSync(src, dest);
  fs.appendFileSync(dest, String(tag));
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

console.log(`\n=== authExcluded import-dir single-create path (env=${env}) ===\n`);
runCli(verificationLoginArgs());

let ok = true;
let depWork;
let workBase;
const ts = Date.now();
const photoSrc = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  depWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-auth-dep-'));
  const depDir = path.join(depWork, 'dep');
  fs.mkdirSync(depDir, { recursive: true });
  copyUniqueFile(photoSrc, path.join(depDir, 'dep.png'), `${ts}dep`);
  fs.writeFileSync(
    path.join(depDir, 'freelog.batch.json'),
    `${JSON.stringify(
      {
        defaults: { resourceTypeCode: 'RT005001', policies: [FREE_POLICY], version: '1.0.0' },
        items: [{ filePath: 'dep.png', resourceTitle: `dep ${ts}` }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const depImp = parseJson(runCli(`resource import-dir "${depDir}" --yes --json`, { cwd: depWork }));
  const depRow = depImp.created?.[0];
  ok =
    assertOk('dep 资源创建', depImp.ok && depRow?.resourceId, depRow?.resourceId) && ok;
  const depProj = path.join(depDir, depRow.subdir);
  const policyList = parseJson(runCli('policy list --json', { cwd: depProj }));
  const policyId = policyList.policies?.[0]?.policyId;
  ok = assertOk('dep 策略可读', Boolean(policyId), policyId) && ok;

  workBase = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-single-create-'));
  const mediaDir = path.join(workBase, 'photos');
  fs.mkdirSync(mediaDir, { recursive: true });
  copyUniqueFile(photoSrc, path.join(mediaDir, 'plain.png'), `${ts}a`);
  copyUniqueFile(photoSrc, path.join(mediaDir, 'auth-ex.png'), `${ts}b`);

  fs.writeFileSync(
    path.join(mediaDir, 'freelog.batch.json'),
    `${JSON.stringify(
      {
        defaults: {
          resourceTypeCode: 'RT005001',
          policies: [FREE_POLICY],
          version: '1.0.0',
        },
        items: [
          { filePath: 'plain.png', resourceTitle: `plain ${ts}` },
          {
            filePath: 'auth-ex.png',
            resourceTitle: `auth-ex ${ts}`,
            dependencies: [{ resourceId: depRow.resourceId, versionRange: '^1.0.0' }],
            authExcludedItems: [
              {
                resourceId: depRow.resourceId,
                excludedType: 'policyId',
                excludedValue: policyId,
              },
            ],
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const imp = parseJson(runCli(`resource import-dir "${mediaDir}" --yes --json`, { cwd: workBase }));

  ok =
    assertOk('import-dir 成功', imp.ok === true, `created=${imp.created?.length} failures=${imp.failures?.length}`) &&
    ok;
  ok = assertOk('两项均创建', imp.created?.length === 2, `got ${imp.created?.length}`) && ok;
  ok = assertOk('无失败项', (imp.failures?.length || 0) === 0, JSON.stringify(imp.failures || [])) && ok;

  const authItem = imp.created?.find((row) => (row.authExcludedItems || []).length > 0);
  ok =
    assertOk(
      'authExcluded 项走单条 create 成功',
      Boolean(authItem?.resourceId),
      authItem?.resourceId,
    ) && ok;
} catch (error) {
  ok = false;
  const detail =
    error.stdout?.toString()?.slice(0, 500) ||
    error.stderr?.toString()?.slice(0, 500) ||
    error.message;
  console.error('✘ single-create path', detail);
} finally {
  if (depWork) fs.rmSync(depWork, { recursive: true, force: true });
  if (workBase) fs.rmSync(workBase, { recursive: true, force: true });
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
