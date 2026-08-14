#!/usr/bin/env node
/**
 * L3-H 真实 dev 集成（无 TTY，走 session/studio 同源服务）。
 * 用法：pnpm build && node scripts/verify-l3h-automated.mjs [--env dev] [--report <path>]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationAccount } from './lib/verification-credentials.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main() {
  const env = readOption('--env') || 'dev';
  if (env !== 'dev') {
    console.error('✘ L3-H 自动化只允许写入 dev 环境');
    process.exit(4);
  }
  const reportPath = readOption('--report');

  if (!fs.existsSync(cliBin)) {
    console.error('dist/bin/index.js 不存在，请先 pnpm build');
    process.exit(1);
  }

  let credSource = 'unknown';
  try {
    const account = verificationAccount('primary');
    credSource = account.source;
  } catch (error) {
    console.error(`✘ 缺少 dev 凭据：${error.message}`);
    process.exit(1);
  }

  console.log(`\n=== L3-H real dev integration (cred=${credSource}) ===\n`);

  let vitestOut = '';
  let status = 1;
  try {
    vitestOut = execSync(
      'pnpm exec vitest run --config vitest.l3h.config.ts',
      { cwd: cliRoot, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, FREELOG_DEV: '1' } },
    );
    status = 0;
    console.log(vitestOut);
  } catch (error) {
    vitestOut = `${error.stdout || ''}\n${error.stderr || ''}`.trim();
    console.error(vitestOut.slice(-2000));
    status = error.status ?? 1;
  }

  const plainVitestOut = vitestOut.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
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
    date: new Date().toISOString().slice(0, 10),
    status: status === 0 ? 'pass' : 'fail',
    credSource,
    passed: passed ? Number(passed[1]) : 0,
    skipped: skipped ? Number(skipped[1]) : 0,
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
    console.log(`\n✔ L3-H integration OK (${summary.passed} passed, ${summary.skipped} skipped)`);
  } else {
    console.error('\n✘ L3-H integration failed');
  }
  process.exit(status);
}

main();
