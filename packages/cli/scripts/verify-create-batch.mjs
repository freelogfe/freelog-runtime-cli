#!/usr/bin/env node
/**
 * createBatch 每项 inputAttrs 与单品 createVersion 同文件 parity（#28）。
 * 同 png → 单品真实 publish body ↔ import-dir batch 项 version show。
 *
 * 用法：pnpm verify:create-batch [--env dev]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffInputAttrsByValue, formatAttrDiff } from './lib/payload-parity.mjs';
import {
  formatContractErrors,
  validateCreateBatchItemContract,
} from './lib/console-source-contract.mjs';
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

const FREE_POLICY = {
  policyName: '免费',
  policyText: 'for public\r\n\r\ninitial[active]:\r\nterminate\r\n',
  status: 1,
};

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== createBatch 每项属性 parity (env=${env}) ===\n`);
runCli(verificationLoginArgs());

let ok = true;
let soloWork;
let batchWork;
const ts = Date.now();
const photoSrc = path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png');

try {
  const photoBytes = fs.readFileSync(photoSrc);
  const tagged = Buffer.concat([photoBytes, Buffer.from(String(ts))]);

  soloWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-solo-cb-'));
  const soloPhoto = path.join(soloWork, 'photo.png');
  fs.writeFileSync(soloPhoto, tagged);
  runCli(
    `init . --scaffold none --resource-type RT005001 --resource-name solocb${ts} --title "Solo CB ${ts}" --yes --json`,
    { cwd: soloWork },
  );
  parseJson(runCli('create --yes --json', { cwd: soloWork }));
  runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: soloWork });
  const soloDry = parseJson(runCli('publish --dry-run --yes --json', { cwd: soloWork }));
  ok =
    assertOk(
      '单品 dry-run 新文件属性计划',
      soloDry.createVersionParams?.inputAttrs === 'unresolved' &&
        soloDry.unresolved?.includes('createVersionParams.inputAttrs'),
      '未上传时必须显式 unresolved',
    ) && ok;
  const soloPub = parseJson(runCli('publish --yes --debug --json', { cwd: soloWork }));
  const contractErrors = validateCreateBatchItemContract({
    name: 'solo-ref',
    resourceTitle: `Solo CB ${ts}`,
    version: '1.0.0',
    fileSha1: soloPub.createVersionParams?.fileSha1,
    filename: soloPub.createVersionParams?.filename,
    description: soloPub.createVersionParams?.description || '',
    inputAttrs: soloPub.createVersionParams?.inputAttrs,
    customPropertyDescriptors: soloPub.createVersionParams?.customPropertyDescriptors,
  });
  ok =
    assertOk(
      '单品真实 publish 符合 createBatch item 契约',
      contractErrors.length === 0,
      contractErrors.length ? formatContractErrors(contractErrors) : 'OK',
    ) && ok;

  batchWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-batch-cb-'));
  const batchDir = path.join(batchWork, 'photos');
  fs.mkdirSync(batchDir, { recursive: true });
  fs.writeFileSync(path.join(batchDir, 'a.png'), tagged);
  fs.writeFileSync(path.join(batchDir, 'b.png'), Buffer.concat([tagged, Buffer.from('b')]));
  fs.writeFileSync(
    path.join(batchDir, 'freelog.batch.json'),
    `${JSON.stringify(
      {
        defaults: {
          resourceTypeCode: 'RT005001',
          policies: [FREE_POLICY],
          version: '1.0.0',
        },
        items: [{ filePath: 'a.png' }, { filePath: 'b.png' }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const imp = parseJson(runCli(`resource import-dir "${batchDir}" --yes --json`, { cwd: batchWork }));
  ok =
    assertOk('import-dir 批量 2 项', imp.ok && imp.created?.length === 2, `got ${imp.created?.length}`) &&
    ok;

  const refItem = imp.created?.find((row) => row.subdir === 'a' || row.subdir?.startsWith('a'));
  const firstItem = refItem || imp.created?.[0];
  ok = assertOk('batch 首项可读', Boolean(firstItem?.subdir), firstItem?.subdir) && ok;

  if (firstItem?.subdir) {
    const itemDir = path.join(batchDir, firstItem.subdir);
    const shown = parseJson(runCli('version show --version 1.0.0 --yes --json', { cwd: itemDir }));
    const attrDiff = diffInputAttrsByValue(
      soloPub.createVersionParams?.inputAttrs,
      shown.inputAttrs,
    );
    ok =
      assertOk(
        'batch 项 inputAttrs ↔ 单品真实 publish（同文件）',
        attrDiff.length === 0,
        attrDiff.length ? formatAttrDiff(attrDiff) : `${shown.inputAttrs?.length || 0} attrs`,
      ) && ok;
  }

  for (const row of imp.created || []) {
    if (!row.subdir) continue;
    const itemDir = path.join(batchDir, row.subdir);
    const shown = parseJson(runCli('version show --version 1.0.0 --yes --json', { cwd: itemDir }));
    ok =
      assertOk(
        `batch 项 ${row.subdir} 有解析属性`,
        (shown.inputAttrs?.length || 0) >= 1,
        `${shown.inputAttrs?.length || 0} attrs`,
      ) && ok;
  }
} catch (error) {
  ok = false;
  console.error('✘ createBatch', error.stdout?.toString()?.slice(0, 500) || error.message);
} finally {
  if (soloWork) fs.rmSync(soloWork, { recursive: true, force: true });
  if (batchWork) fs.rmSync(batchWork, { recursive: true, force: true });
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
