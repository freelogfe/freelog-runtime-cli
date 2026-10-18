#!/usr/bin/env node
/**
 * dev 资源池实测：用资源池目标验证依赖声明写稿（primary only）。
 * 资源池中的既有资源只读；脚本只创建、操作并下架自己的临时资源壳。
 * 产物全部落在系统临时目录，不写回 test/。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveCliBin } from './acceptance/cli-bin.mjs';
import { matchesCommandResult } from './acceptance/protocol.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { readPrivateJson } from './acceptance/read-private-json.mjs';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = resolveCliBin(repoRoot);
const poolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
const env = 'dev';

const reportPath = path.join(os.tmpdir(), 'freelog-runtime-cli-verification', 'resource-pool.txt');
const lines = [];
const secrets = [];
const redact = (value) => redactEvidence(value, secrets);

function log(line) {
  const safe = redact(line);
  console.log(safe);
  lines.push(safe);
}

function runCli(args, { cwd, input, expectErr } = {}) {
  const res = spawnSync(process.execPath, [cliBin, ...args, '--env', env], {
    cwd: cwd ?? repoRoot,
    input,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const out = (res.stdout ?? '').trim();
  const err = (res.stderr ?? '').trim();
  const ok = matchesCommandResult(res, expectErr, err);
  log(`${ok ? '✔' : '✘'} ${args.join(' ')} (exit ${res.status})`);
  if (out) log(`  out: ${redact(out).slice(0, 900).replaceAll('\n', ' | ')}`);
  if (err) log(`  err: ${redact(err).slice(0, 900).replaceAll('\n', ' | ')}`);
  return { ok, out, err };
}

function must(label, res) {
  if (!res.ok) {
    throw new Error(`${label} 失败`);
  }
  return res;
}

async function main() {
  log('=== 资源池实测（依赖 / 属性 / 可选项） ===');
  log(`时间: ${new Date().toISOString()}`);

  const pool = JSON.parse(fs.readFileSync(poolPath, 'utf8'));
  log(`资源池条目: ${pool.resources.length}`);
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-pool-'));
  log(`临时工程: ${projectDir}`);

  const target = pool.resources.find((resource) => typeof resource.resourceId === 'string');
  if (!target) throw new Error('资源池没有带 resourceId 的依赖目标');
  log(`选作依赖的资源池目标: ${target.resourceName}`);

  // 1. login（primary）
  const cred = readPrivateJson(path.join(testRoot, '.freelog-test-credentials.local.json'));
  secrets.push(cred.primary?.password);
  must('login', runCli(['login', '--login-name', cred.primary.loginName, '--password-stdin', '--yes'], {
    cwd: projectDir,
    input: `${cred.primary.password}\n`,
  }));

  let completed = false;
  try {
    // 2. 自己的临时普通资源：建壳、建首版稿；绝不 bind 或改动资源池对象。
    fs.copyFileSync(path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4'), path.join(projectDir, 'sample-video.mp4'));
    const stamp = Date.now().toString(36);
    must('init 临时资源', runCli(['init', '.', '--type', 'RT006003', '--artifact', 'sample-video.mp4', '--yes'], { cwd: projectDir }));
    must('create 临时资源壳', runCli(['create', '--title', `pool-${stamp}`, '--name', `pool-${stamp}`, '--yes'], { cwd: projectDir }));
    must('create-version --prepare', runCli(['create-version', '--prepare', '--yes'], { cwd: projectDir }));

    // 3. 只声明依赖，不传策略或触发签约。
    must('dep add（依赖声明）', runCli(['version', 'dep', 'add', target.resourceId, '--range', '^1.0.0', '--yes'], {
      cwd: projectDir,
    }));
    must('dep list', runCli(['version', 'dep', 'list'], { cwd: projectDir }));
    must('discard 临时工作稿', runCli(['version', 'draft', 'discard', '--yes'], { cwd: projectDir }));

    log('\n=== 资源池实测完成 ===');
    log(`报告: ${reportPath}`);
    const summary = lines.join('\n');
    fs.writeFileSync(reportPath, `${summary}\n\n结果: PASS\n`, 'utf8');
    completed = true;
  } finally {
    cleanupWorkspace(projectDir, { success: completed, prefixes: ['freelog-pool-'], log, beforeRemove() {
      const identityPath = path.join(projectDir, '.freelog', '1.json');
      if (fs.existsSync(identityPath) && JSON.parse(fs.readFileSync(identityPath, 'utf8')).resourceId) {
        must('offline 收尾', runCli(['offline', '--yes'], { cwd: projectDir }));
      }
    } });
  }
}

main().catch((error) => {
  lines.push(redact(`\n=== 失败 ===\n${error instanceof Error ? error.stack ?? error.message : String(error)}`));
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: FAIL\n`, 'utf8');
  console.error(redact(error instanceof Error ? error.stack ?? error.message : String(error)));
  process.exit(1);
});
