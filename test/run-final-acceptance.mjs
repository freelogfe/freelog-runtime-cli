#!/usr/bin/env node
/** 最终真网验收聚合器：所有已支持功能必须 PASS；环境 / 素材 / 后端能力缺失统一为 BLOCKED（非零）。 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeTty } from './tty-driver.mjs';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');
const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'final-acceptance.txt');
const lines = [];

function log(line) { console.log(line); lines.push(line); }
function finish(result, exitCode) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: ${result}\n`, 'utf8');
  log(`报告: ${reportPath}`);
  process.exit(exitCode);
}

if (env !== 'dev') {
  log('BLOCKED: 最终真网验收只允许 --env dev。');
  finish('BLOCKED', 3);
} else {
  const prerequisites = [
    ['primary 凭据', path.join(testRoot, '.freelog-test-credentials.local.json')],
    ['依赖资源池', path.join(testRoot, '.freelog-test-resource-pool.local.json')],
    ['可选配置类型与产物 fixture', path.join(testRoot, '.freelog-test-optional-config.local.json')],
  ].filter(([, file]) => !existsSync(file));
  const tty = await probeTty(repoRoot);
  const hasTty = tty.available;
  if (prerequisites.length > 0 || !hasTty) {
    for (const [name] of prerequisites) log(`BLOCKED: 缺少${name}。`);
    const optionalFixtureMissing = prerequisites.some(([name]) => name === '可选配置类型与产物 fixture');
    const credentialMissing = prerequisites.some(([name]) => name === 'primary 凭据');
    if (optionalFixtureMissing && !credentialMissing) {
      const discovery = spawnSync(process.execPath, [path.join(testRoot, 'discover-optional-config.mjs'), '--env', env, '--skip-build'], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 180_000,
      });
      const reason = `${discovery.stdout ?? ''}${discovery.stderr ?? ''}`.split(/\r?\n/)
        .find((line) => /^(BLOCKED|READY|FAIL):/.test(line.trim()));
      if (reason) log(`INFO: ${reason.trim()}`);
    }
    if (!hasTty) log(`BLOCKED: node-pty 不可用。${tty.reason}`);
    finish('BLOCKED', 3);
  } else {
    let buildFailed = false;
    if (!skipBuild) {
      const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
        cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
      });
      if (build.status !== 0) {
        log('FAIL: CLI build 失败。');
        buildFailed = true;
      }
    }
    if (buildFailed) {
      finish('FAIL', 1);
    } else {
      const scripts = [
      'run-all-scenarios.mjs',
      'verify-commands.mjs',
      'verify-scenarios.mjs',
      'verify-field-rules.mjs',
      'verify-paid-dep.mjs',
      'run-resource-pool-scenarios.mjs',
      'verify-optional-config.mjs',
      'verify-theme-image-full-lifecycle.mjs',
      'verify-multi-resource-tty.mjs',
      'verify-draft-safety.mjs',
      ];
      let failed = false;
      let blocked = false;
      for (const script of scripts) {
      const result = spawnSync(process.execPath, [path.join(testRoot, script), '--env', env, '--skip-build'], {
        cwd: repoRoot, encoding: 'utf8', timeout: 1_800_000,
      });
      const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
      if (result.status === 0 && !/跳过/.test(output)) {
        log(`PASS: ${script}`);
      } else if (result.status === 3 || /~freelog\.(RelativeTimeEvent|TransactionEvent)/.test(output) || /已获授权，跳过/.test(output)) {
        blocked = true;
        log(`BLOCKED: ${script}；查看其独立报告获取平台或环境原因。`);
      } else {
        failed = true;
        log(`FAIL: ${script}（exit ${result.status}）；查看其独立报告。`);
      }
      }
      finish(failed ? 'FAIL' : blocked ? 'BLOCKED' : 'PASS', failed ? 1 : blocked ? 3 : 0);
    }
  }
}
