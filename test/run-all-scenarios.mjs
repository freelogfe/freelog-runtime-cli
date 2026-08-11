#!/usr/bin/env node
/**
 * dev API 全场景验证。稳定素材统一放在 test/fixtures/，运行产物写入 .freelog/。
 *
 * 用法（仓根或 test 目录）：
 *   node test/run-all-scenarios.mjs [--env dev] [--skip-build]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliRoot = path.join(repoRoot, 'packages', 'cli');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');

const fixtures = [
  ['sample-image.png', path.join(testRoot, 'fixtures', 'media', 'sample-image.png')],
  ['sample-cover.png', path.join(testRoot, 'fixtures', 'media', 'sample-cover.png')],
  ['sample-video.mp4', path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4')],
  ['theme-artifact', path.join(testRoot, 'fixtures', 'theme-artifact')],
  ['free policy', path.join(testRoot, 'fixtures', 'policies', 'free.json')],
];

const parityScripts = [
  'verify-console-parity.mjs',
  'verify-collection-parity.mjs',
  'verify-collection-attrs.mjs',
  'verify-properties-sync.mjs',
  'verify-single-create.mjs',
  'verify-create-batch.mjs',
  'verify-cover-parity.mjs',
  'verify-batch-parity.mjs',
  'verify-payload-parity.mjs',
  'verify-meta-api.mjs',
];

const reportPath = path.join(os.tmpdir(), 'freelog-runtime-cli-verification', 'latest.txt');
const startedAt = new Date().toISOString();
const lines = [];

function log(line) {
  console.log(line);
  lines.push(line);
}

function run(label, cmd, cwd = cliRoot) {
  log(`\n>>> ${label}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: process.env });
  log(`<<< ${label} OK`);
}

log('=== test/ 全场景真实验证 ===');
log(`时间: ${startedAt}`);
log(`环境: ${env}`);
log(`test 目录: ${testRoot}`);
log(`运行报告: ${reportPath}`);

log('\n--- 素材检查 ---');
let missing = 0;
for (const [name, file] of fixtures) {
  const ok = fs.existsSync(file);
  log(`${ok ? '✔' : '✘'} ${name}`);
  if (!ok) missing += 1;
}
if (missing) {
  log(`\n缺少 ${missing} 个素材，部分场景可能失败。`);
}

try {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  if (!skipBuild) {
    run('build CLI', 'pnpm build', cliRoot);
  } else {
    log('\n>>> 跳过 build (--skip-build)');
  }

  run('verify:scenarios (S1–S14)', `node ./scripts/verify-scenarios.mjs --env ${env}`, cliRoot);

  log('\n=== verify:parity 子项 ===');
  for (const script of parityScripts) {
    run(`parity: ${script}`, `node ./scripts/${script} --env ${env}`, cliRoot);
  }

  log('\n=== 全部通过 ===');
  fs.writeFileSync(
    reportPath,
    `${lines.join('\n')}\n\n结果: PASS\n完成: ${new Date().toISOString()}\n`,
    'utf8',
  );
} catch (error) {
  lines.push(`\n=== 失败 ===\n${error instanceof Error ? error.message : String(error)}`);
  fs.writeFileSync(
    reportPath,
    `${lines.join('\n')}\n\n结果: FAIL\n完成: ${new Date().toISOString()}\n`,
    'utf8',
  );
  process.exit(1);
}
