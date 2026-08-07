#!/usr/bin/env node
/**
 * test/ 目录全场景真实验证（dev API + freelog-test11）。
 * 素材：abcdef.png、my-freelog-project、codex-e2e-* 等。
 * 参考录屏：test/屏幕录制 2026-08-07 101434.mp4
 *
 * 用法（仓根或 test 目录）：
 *   node test/run-all-scenarios.mjs [--env dev] [--skip-build]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliRoot = path.join(repoRoot, 'packages', 'cli');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');

const videoRef = path.join(testRoot, '屏幕录制 2026-08-07 101434.mp4');
const fixtures = [
  ['abcdef.png', path.join(testRoot, 'abcdef.png')],
  ['cover-800.png', path.join(testRoot, 'cover-800.png')],
  ['my-freelog-project/dist', path.join(testRoot, 'my-freelog-project', 'dist')],
  [
    'sample-video.mp4',
    path.join(testRoot, 'codex-e2e-video-20260805142911', 'sample-video.mp4'),
  ],
  [
    'clip-1.mp4',
    path.join(testRoot, 'codex-e2e-video-album-files-20260805142938', 'clip-1.mp4'),
  ],
  ['e2e-policy-free.json', path.join(testRoot, 'e2e-policy-free.json')],
];

const parityScripts = [
  'verify-console-parity.mjs',
  'verify-collection-parity.mjs',
  'verify-collection-attrs.mjs',
  'verify-properties-sync.mjs',
  'verify-auth-fallback.mjs',
  'verify-create-batch.mjs',
  'verify-cover-parity.mjs',
  'verify-batch-parity.mjs',
  'verify-payload-parity.mjs',
  'verify-meta-api.mjs',
];

const reportPath = path.join(testRoot, 'verify-report-latest.txt');
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
log(`参考录屏: ${fs.existsSync(videoRef) ? path.basename(videoRef) : '(未找到)'}`);
if (fs.existsSync(videoRef)) {
  log(`录屏大小: ${(fs.statSync(videoRef).size / 1024 / 1024).toFixed(2)} MB`);
}

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
