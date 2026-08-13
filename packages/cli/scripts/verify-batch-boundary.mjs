#!/usr/bin/env node
/**
 * 批量边界：>20 分批、strict 限、配置 fingerprint 漂移（BATCH-*）。
 * 用法：node scripts/verify-batch-boundary.mjs [--env dev]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHarness, testPhoto } from './lib/verify-harness.mjs';

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

const h = createHarness(env);
const { pass, skip, fail, runCli, runCliExpectFail, parseJson, loginPrimary, copyUniqueFile, summarize, assertCliBuilt } = h;

console.log(`\n=== 批量边界验证 (env=${env}) ===\n`);
assertCliBuilt();

if (!fs.existsSync(testPhoto)) {
  console.error('缺少 test/fixtures/media/sample-image.png');
  process.exit(1);
}

loginPrimary();

// BATCH-01 21 文件自动分批（应成功且 created >= 21）
try {
  const ts = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-batch-21-'));
  const dir = path.join(work, 'many');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 21; i += 1) {
    copyUniqueFile(testPhoto, path.join(dir, `img-${i}.png`), `${ts}-${i}`);
  }
  const out = parseJson(
    runCli(`resource import-dir "${dir}" --resource-type RT005001 --title-prefix batch21 --yes --json`, {
      cwd: work,
    }),
  );
  const created = out.created?.length || out.data?.created?.length || 0;
  const warnings = out.warnings || [];
  const hasChunkWarn =
    warnings.some((w) => /20|分批|limit|limitation/i.test(String(w))) ||
    String(out.stderr || '').includes('20');
  if (out.ok !== false && created >= 21) {
    pass('BATCH-01 21 文件 import-dir', `${created} 项${hasChunkWarn ? '，含分批提示' : ''}`);
  } else {
    fail('BATCH-01 21 文件 import-dir', JSON.stringify(out).slice(0, 300));
  }
  if (out.reportFile && fs.existsSync(out.reportFile)) {
    const report = JSON.parse(fs.readFileSync(out.reportFile, 'utf8'));
    if (report.items?.length === 21 && report.summary?.passed >= 21) {
      pass('BATCH-01 报告字段完整', `items=${report.items.length}`);
    } else {
      fail('BATCH-01 报告字段完整', JSON.stringify(report.summary || {}).slice(0, 200));
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('BATCH-01 21 文件 import-dir', e.stderr?.toString()?.slice(0, 300) || e.message);
}

// BATCH-02 strict-batch-limit 硬限 21 文件
try {
  const ts = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-batch-strict-'));
  const dir = path.join(work, 'strict');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 21; i += 1) {
    copyUniqueFile(testPhoto, path.join(dir, `s-${i}.png`), `${ts}s${i}`);
  }
  const result = runCliExpectFail(
    `resource import-dir "${dir}" --resource-type RT005001 --strict-batch-limit --yes --json`,
    { cwd: work },
  );
  if (result.failed) {
    pass('BATCH-02 strict-batch-limit 21 文件', 'CLI 拒绝');
  } else {
    fail('BATCH-02 strict-batch-limit 21 文件', '应失败但成功');
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('BATCH-02 strict-batch-limit', e.message);
}

// BATCH-03 修改 freelog.batch.json 后 retry 拒绝
try {
  const ts = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-batch-fp-'));
  const dir = path.join(work, 'fp');
  fs.mkdirSync(dir, { recursive: true });
  copyUniqueFile(testPhoto, path.join(dir, 'a.png'), `${ts}a`);
  const batchPath = path.join(dir, 'freelog.batch.json');
  fs.writeFileSync(
    batchPath,
    JSON.stringify({
      defaults: { resourceTypeCode: 'RT005001', version: '1.0.0' },
      items: [{ filePath: 'a.png', resourceTitle: `fp ${ts}` }],
    }),
    'utf8',
  );
  const first = parseJson(
    runCli(`resource import-dir "${dir}" --resource-type RT005001 --yes --json`, { cwd: work }),
  );
  if (!first.reportFile) {
    fail('BATCH-03 配置漂移 retry', '无 reportFile');
  } else {
    const batch = JSON.parse(fs.readFileSync(batchPath, 'utf8'));
    batch.defaults.version = '2.0.0';
    fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2), 'utf8');
    const report = JSON.parse(fs.readFileSync(first.reportFile, 'utf8'));
    if (report.items?.[0]) {
      report.items[0].result = 'failed';
      report.items[0].error = 'synthetic fail for retry test';
      fs.writeFileSync(first.reportFile, JSON.stringify(report, null, 2), 'utf8');
    }
    const result = runCliExpectFail(`resource import-dir --retry "${first.reportFile}" --yes --json`, {
      cwd: work,
    });
    if (result.failed) {
      pass('BATCH-03 配置 fingerprint 漂移', 'retry 拒绝');
    } else {
      fail('BATCH-03 配置 fingerprint 漂移', '应失败但成功');
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('BATCH-03 配置 fingerprint 漂移', e.stderr?.toString()?.slice(0, 300) || e.message);
}

process.exit(summarize('BATCH 汇总') ? 1 : 0);
