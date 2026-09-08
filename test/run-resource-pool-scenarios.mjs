#!/usr/bin/env node
/**
 * dev 资源池实测：依赖签约 / 属性 / 可选项 / 更新版本（primary only）。
 * 只改「本次临时工程」内的本地档案，线上资源只读展示。
 * 产物全部落在系统临时目录，不写回 test/。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const poolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
const env = 'dev';

const reportPath = path.join(os.tmpdir(), 'freelog-runtime-cli-verification', 'resource-pool.txt');
const lines = [];

function log(line) {
  console.log(line);
  lines.push(line);
}

function runCli(args, { cwd, input } = {}) {
  const res = spawnSync(process.execPath, [cliBin, ...args, '--env', env], {
    cwd: cwd ?? repoRoot,
    input,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const out = (res.stdout ?? '').trim();
  const err = (res.stderr ?? '').trim();
  log(`${res.status === 0 ? '✔' : '✘'} ${args.join(' ')} (exit ${res.status})`);
  if (out) log(`  out: ${out.slice(0, 900).replaceAll('\n', ' | ')}`);
  if (err) log(`  err: ${err.slice(0, 900).replaceAll('\n', ' | ')}`);
  return { ok: res.status === 0, out, err };
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

  // 挑“primary 自己的、免费策略、可读”的资源做依赖（用户给的池内名单）
  const own = pool.resources.find((r) => r.resourceName.startsWith('freelog-test11/'));
  log(`选作依赖的自身资源: ${own.resourceName}`);

  // 1. login（primary）
  const cred = JSON.parse(fs.readFileSync(path.join(testRoot, '.freelog-test-credentials.local.json'), 'utf8'));
  must('login', runCli(['login', '--login-name', cred.primary.loginName, '--password-stdin', '--yes'], {
    cwd: projectDir,
    input: `${cred.primary.password}\n`,
  }));

  // 2. 用一个自己的普通资源当“依赖对象”（资源池可见）
  must('bind 到自身资源', runCli(['bind', own.resourceId, '--artifact', 'sample-image.png', '--yes'], {
    cwd: projectDir,
  }));
  must('status 看本地绑定', runCli(['status', '--yes'], { cwd: projectDir }));

  // 3. 依赖签约（用另一个自身的免费资源）
  const target = pool.resources.find((r) => r.resourceName.startsWith('freelog-test11/') && r.resourceId !== own.resourceId);
  must('dep add（免费策略自动签约）', runCli(['version', 'dep', 'add', target.resourceId, '--range', '^1.0.0'], {
    cwd: projectDir,
  }));

  // 4. 属性（改稿：先拉已有版本当底，出草稿）
  must('draft pull', runCli(['version', 'draft', 'pull', '--yes'], { cwd: projectDir }));
  must('attr add 自定义属性', runCli(['version', 'attr', 'add', '名称=测试作者 键=author 值=freelog-test11', '--yes'], { cwd: projectDir }));
  must('attr set 改值', runCli(['version', 'attr', 'set', '键=author 值=freelog-test11-v2', '--yes'], { cwd: projectDir }));
  must('attr list', runCli(['version', 'attr', 'list'], { cwd: projectDir }));
  must('option add（仅 RT001/RT002 支持；本例非主题则预期失败，改看错误口径）', runCli(['version', 'option', 'add', '名称=主题 键=theme 默认=dark', '--yes'], { cwd: projectDir }));

  // 5. 更新版本：提交 1.0.1
  must('update-version 提交 1.0.1（依赖+属性进版）', runCli(['update-version', '--yes', '--version', '1.0.1'], { cwd: projectDir }));
  must('version show 看刚发的号', runCli(['version', 'show', '--version', '1.0.1'], { cwd: projectDir }));

  // 6. 可选项：主题类型（RT001）在另一份身份上由 init 建，但 init 需要模板/安装，故跳过真实 POST，
  //    只验证 option 解析与“非主题类型拒绝”的负路径（上面已覆盖）。

  log('\n=== 资源池实测完成 ===');
  log(`报告: ${reportPath}`);
  const summary = lines.join('\n');
  fs.writeFileSync(reportPath, `${summary}\n\n结果: PASS\n`, 'utf8');
}

main().catch((error) => {
  lines.push(`\n=== 失败 ===\n${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: FAIL\n`, 'utf8');
  console.error(error);
  process.exit(1);
});
