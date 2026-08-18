#!/usr/bin/env node
/**
 * 对抗性子集：幂等、路径边界、报告阶段（CHAOS-*）。
 * 用法：node scripts/verify-chaos.mjs [--env dev]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHarness, testPhoto } from './lib/verify-harness.mjs';

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

const h = createHarness(env);
const { pass, fail, runCli, parseJson, loginPrimary, copyUniqueFile, summarize, assertCliBuilt } = h;

console.log(`\n=== Chaos 子集验证 (env=${env}) ===\n`);
assertCliBuilt();

if (!fs.existsSync(testPhoto)) {
  console.error('缺少 test/fixtures/media/sample-image.png');
  process.exit(1);
}

loginPrimary();

// CHAOS-01 同版本、同完整发布意图二次 publish：作为断线恢复幂等成功
try {
  const ts = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-chaos-dup-'));
  copyUniqueFile(testPhoto, path.join(work, 'photo.png'), ts);
  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name chaos-dup-${ts} --title "Dup" --yes --json`,
    { cwd: work },
  );
  parseJson(runCli('create --yes --json', { cwd: work }));
  runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: work });
  const first = parseJson(runCli('publish --yes --json', { cwd: work }));
  const second = parseJson(runCli('publish --yes --json', { cwd: work }));
  if (
    second.ok &&
    second.version === first.version &&
    second.fileSha1 === first.fileSha1 &&
    second.stages?.platformWrite === 'reused'
  ) {
    pass('CHAOS-01 二次 publish 同版本同意图', '幂等恢复且未重复平台写入');
  } else {
    fail('CHAOS-01 二次 publish 同版本同意图', JSON.stringify(second).slice(0, 240));
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('CHAOS-01 二次 publish', e.stderr?.toString()?.slice(0, 200) || e.message);
}

// CHAOS-02 中文目录 + 空格文件名
try {
  const ts = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-chaos-path-'));
  const cnDir = path.join(work, '测试目录', 'sub dir');
  fs.mkdirSync(cnDir, { recursive: true });
  const spacedFile = path.join(cnDir, 'sample image 测试.png');
  copyUniqueFile(testPhoto, spacedFile, ts);
  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name chaos-path-${ts} --title "Path" --yes --json`,
    { cwd: work },
  );
  parseJson(runCli('create --yes --json', { cwd: work }));
  const ver = parseJson(
    runCli(`version set --version 1.0.0 --file "${spacedFile}" --yes --json`, { cwd: work }),
  );
  if (ver.ok !== false && ver.version?.filePath) {
    pass('CHAOS-02 中文/空格路径 version set', ver.version.filePath);
  } else {
    fail('CHAOS-02 中文/空格路径', JSON.stringify(ver).slice(0, 200));
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('CHAOS-02 中文/空格路径', e.stderr?.toString()?.slice(0, 300) || e.message);
}

// CHAOS-03 kill 模拟：报告 remote_succeeded_local_pending 后删子目录，resume 补写 + 阶段字段
try {
  const ts = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-chaos-resume-'));
  const dir = path.join(work, 'photos');
  fs.mkdirSync(dir, { recursive: true });
  copyUniqueFile(testPhoto, path.join(dir, 'a.png'), ts);
  const first = parseJson(
    runCli(`resource import-dir "${dir}" --resource-type RT005001 --yes --json`, { cwd: work }),
  );
  if (!first.reportFile || !first.created?.length) {
    fail('CHAOS-03 resume 半写', '首次 import 无 report/created');
  } else {
    const report = JSON.parse(fs.readFileSync(first.reportFile, 'utf8'));
    const item = report.items?.[0];
    const subdir = first.created[0]?.subdir;
    item.result = 'remote_succeeded_local_pending';
    item.stage = 'remote-created';
    item.resourceId = first.created[0].resourceId;
    item.resourceName = first.created[0].resourceName;
    fs.writeFileSync(first.reportFile, JSON.stringify(report, null, 2), 'utf8');
    const subPath = path.join(dir, subdir);
    if (fs.existsSync(subPath)) fs.rmSync(subPath, { recursive: true, force: true });
    const resumed = parseJson(
      runCli(`resource import-dir --resume "${first.reportFile}" --yes --json`, { cwd: work }),
    );
    const manifestPath = path.join(subPath, 'freelog.manifest.json');
    const reportAfter = JSON.parse(fs.readFileSync(first.reportFile, 'utf8'));
    const stageOk = reportAfter.items?.[0]?.stage === 'completed' || reportAfter.items?.[0]?.result === 'passed';
    if (resumed.ok !== false && fs.existsSync(manifestPath) && stageOk) {
      pass('CHAOS-03 resume 半写恢复', subdir);
    } else {
      fail('CHAOS-03 resume 半写恢复', JSON.stringify(resumed).slice(0, 200));
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('CHAOS-03 resume 半写', e.stderr?.toString()?.slice(0, 300) || e.message);
}

// CHAOS-04 batch 报告必填字段（S13 风格完整性）
try {
  const ts = Date.now();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-chaos-report-'));
  const dir = path.join(work, 'two');
  fs.mkdirSync(dir, { recursive: true });
  copyUniqueFile(testPhoto, path.join(dir, 'a.png'), `${ts}a`);
  copyUniqueFile(testPhoto, path.join(dir, 'b.png'), `${ts}b`);
  const out = parseJson(
    runCli(`resource import-dir "${dir}" --resource-type RT005001 --yes --json`, { cwd: work }),
  );
  if (!out.reportFile) {
    fail('CHAOS-04 报告完整性', '无 reportFile');
  } else {
    const report = JSON.parse(fs.readFileSync(out.reportFile, 'utf8'));
    const required = ['schemaVersion', 'runId', 'env', 'input', 'config', 'items', 'summary', 'startedAt'];
    const missing = required.filter((key) => report[key] === undefined);
    if (!missing.length && report.items?.length === 2) {
      pass('CHAOS-04 报告必填字段', `runId=${report.runId}`);
    } else {
      fail('CHAOS-04 报告必填字段', `缺 ${missing.join(',')}`);
    }
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('CHAOS-04 报告完整性', e.message);
}

process.exit(summarize('CHAOS 汇总') ? 1 : 0);
