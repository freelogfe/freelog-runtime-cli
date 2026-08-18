#!/usr/bin/env node
/**
 * L3-H 证据分两层：构建产物 CLI 冒烟 + 无 TTY 的 session/studio 源码服务真实 dev 集成。
 * 用法：pnpm build && node scripts/verify-l3h-automated.mjs [--env dev] [--report <path>]
 * 仅验证打包入口：追加 --packaged-only（不会读取凭据或写远端）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationAccount } from './lib/verification-credentials.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const vitestBin = path.join(cliRoot, 'node_modules', 'vitest', 'vitest.mjs');
const packageJson = JSON.parse(fs.readFileSync(path.join(cliRoot, 'package.json'), 'utf8'));

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function verifyPackagedCli() {
  const isolatedCwd = fs.mkdtempSync(path.join(cliRoot, '.l3h-packaged-smoke-'));
  const isolatedAuth = path.join(isolatedCwd, '.freelog-auth');
  const childEnv = {
    ...process.env,
    FREELOG_DEV: '1',
    FREELOG_AUTH_PATH_GLOBAL: isolatedAuth,
  };
  const run = (args) =>
    execFileSync(process.execPath, [cliBin, ...args], {
      cwd: isolatedCwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    });

  try {
    const versionOutput = stripAnsi(run(['--version'])).trim();
    if (!versionOutput.includes(packageJson.version)) {
      throw new Error(`dist CLI 版本异常：期望 ${packageJson.version}，实际 ${versionOutput}`);
    }
    const helpOutput = run(['--help']);
    if (!helpOutput.includes('freelog-cli') || !helpOutput.includes('resource')) {
      throw new Error('dist CLI help/command registry 输出异常');
    }
    const completionOutput = run(['completion', 'bash']);
    if (!completionOutput.includes('complete -F _freelog_cli freelog-cli')) {
      throw new Error('dist CLI completion 子命令输出异常');
    }
    const statusOutput = run(['status', '--json', '--env', 'dev']);
    const statusEnvelope = JSON.parse(statusOutput.trim());
    if (
      statusEnvelope.schemaVersion !== 1 ||
      statusEnvelope.ok !== true ||
      statusEnvelope.command !== 'status' ||
      statusEnvelope.meta?.env !== 'dev'
    ) {
      throw new Error('dist CLI status JSON envelope 不符合契约');
    }
    return {
      status: 'pass',
      version: packageJson.version,
      probes: ['--version', '--help', 'completion bash', 'status --json --env dev'],
    };
  } finally {
    fs.rmSync(isolatedCwd, { recursive: true, force: true });
  }
}

function main() {
  const env = readOption('--env') || 'dev';
  const packagedOnly = process.argv.includes('--packaged-only');
  if (env !== 'dev') {
    console.error('✘ L3-H 自动化只允许写入 dev 环境');
    process.exit(4);
  }
  const reportPath = readOption('--report');

  if (!fs.existsSync(cliBin)) {
    console.error('dist/bin/index.js 不存在，请先 pnpm build');
    process.exit(1);
  }

  let packagedCli;
  try {
    packagedCli = verifyPackagedCli();
    console.log(`✔ packaged CLI smoke (${packagedCli.probes.join(', ')})`);
  } catch (error) {
    console.error(`✘ packaged CLI smoke failed: ${error.message}`);
    process.exit(1);
  }
  if (packagedOnly) {
    console.log(`L3H_RESULT=${JSON.stringify({ schemaVersion: 1, status: 'pass', packagedCli })}`);
    return;
  }

  let credSource = 'unknown';
  try {
    const account = verificationAccount('primary');
    if (account.source === 'session') {
      throw new Error('L3-H 真实集成需要可重新登录的账号密码，现有落盘会话不足以执行');
    }
    credSource = account.source;
  } catch (error) {
    console.error(`✘ 缺少 dev 凭据：${error.message}`);
    process.exit(1);
  }

  console.log(`\n=== L3-H real dev integration (cred=${credSource}) ===\n`);

  let vitestOut = '';
  let status = 1;
  try {
    vitestOut = execFileSync(
      process.execPath,
      [vitestBin, 'run', '--config', 'vitest.l3h.config.ts'],
      { cwd: cliRoot, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, FREELOG_DEV: '1' } },
    );
    status = 0;
    console.log(vitestOut);
  } catch (error) {
    vitestOut = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
    console.error(vitestOut.slice(-2000));
    status = error.status ?? 1;
  }

  const plainVitestOut = stripAnsi(vitestOut);
  const passed = /Tests\s+(\d+) passed/.exec(plainVitestOut);
  const skipped = /(\d+) skipped/.exec(plainVitestOut);
  const remoteArtifactsMatch = /L3H_REMOTE_ARTIFACTS=(\[[^\r\n]+\])/.exec(plainVitestOut);
  let remoteArtifacts = [];
  if (remoteArtifactsMatch) {
    try {
      remoteArtifacts = JSON.parse(remoteArtifactsMatch[1]).map((row) => ({
        scenario: row.scenario,
        resourceId: row.resourceId,
        versionId: row.versionId,
      }));
    } catch {
      remoteArtifacts = [];
    }
  }
  const summary = {
    schemaVersion: 1,
    date: new Date().toISOString().slice(0, 10),
    status: status === 0 ? 'pass' : 'fail',
    credSource,
    packagedCli,
    sourceServiceIntegration: {
      status: status === 0 ? 'pass' : 'fail',
      passed: passed ? Number(passed[1]) : 0,
      skipped: skipped ? Number(skipped[1]) : 0,
    },
    remoteArtifacts,
  };
  if (reportPath) {
    const resolvedReportPath = path.resolve(reportPath);
    fs.mkdirSync(path.dirname(resolvedReportPath), { recursive: true });
    fs.writeFileSync(resolvedReportPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(`L3-H JSON evidence: ${resolvedReportPath}`);
  }
  console.log(`L3H_RESULT=${JSON.stringify(summary)}`);

  if (status === 0) {
    console.log(
      `\n✔ L3-H integration OK (packaged CLI smoke + ${summary.sourceServiceIntegration.passed} source-service passed, ${summary.sourceServiceIntegration.skipped} skipped)`,
    );
  } else {
    console.error('\n✘ L3-H integration failed');
  }
  process.exit(status);
}

main();
