#!/usr/bin/env node
/**
 * 新 CLI 真网端到端验证（dev）。
 *
 * 只用 test/.freelog-test-credentials.local.json 的 primary 账号：
 * 该账号才有发行/管理权限。辅账号禁止用于任何写平台场景。
 *
 * 用法：node test/run-all-scenarios.mjs [--env dev] [--skip-build]
 * 报告写入系统临时目录 freelog-runtime-cli-verification/latest.txt。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');

if (env === 'prod') {
  console.error('production 硬禁用：不允许对 prod 跑真网场景。');
  process.exit(2);
}

const credPath = path.join(testRoot, '.freelog-test-credentials.local.json');
if (!existsSync(credPath)) {
  console.error(`缺少凭据文件：${credPath}`);
  process.exit(2);
}
const creds = JSON.parse(readFileSync(credPath, 'utf8'));
const primary = creds.primary;
if (!primary?.loginName || !primary?.password) {
  console.error('primary 凭据缺失。只有 primary 有发行/管理权限。');
  process.exit(2);
}

const videoSample = path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4');
const policyFixture = path.join(testRoot, 'fixtures', 'policies', 'free.json');

const reportDir = path.join(os.tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'latest.txt');
const lines = [];
const startedAt = new Date().toISOString();

fs.mkdirSync(reportDir, { recursive: true });

function log(line) {
  console.log(line);
  lines.push(line);
}

function runCli(label, args, { cwd, input } = {}) {
  const res = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: cwd ?? repoRoot,
    input,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const out = (res.stdout ?? '').trim();
  const err = (res.stderr ?? '').trim();
  log(`${res.status === 0 ? '✔' : '✘'} ${label} (exit ${res.status})`);
  if (out) log(`  stdout: ${out.slice(0, 600).replaceAll('\n', ' | ')}`);
  if (err) log(`  stderr: ${err.slice(0, 800).replaceAll('\n', ' | ')}`);
  return { ok: res.status === 0, out, err };
}

async function main() {
  log('=== 新 CLI 真网端到端（primary only） ===');
  log(`时间: ${startedAt}`);
  log(`环境: ${env}`);
  log(`账号: ${primary.loginName} / ******`);

  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    log(`${build.status === 0 ? '✔' : '✘'} build CLI`);
    if (build.status !== 0) {
      log((build.stdout ?? '') + (build.stderr ?? ''));
      throw new Error('build 失败');
    }
  }

  const projectDir = mkdtempSync(path.join(os.tmpdir(), 'freelog-e2e-'));
  log(`临时工程: ${projectDir}`);

  // T2.1 prod 拦截
  const prodGate = runCli('prod 拦截（默认 env）', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes'], { cwd: projectDir, input: primary.password });
  if (prodGate.ok || !prodGate.err.includes('prod 暂未开放')) {
    throw new Error('prod 门禁未生效');
  }

  // T2.2 登录
  const login = runCli('login --env dev', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], { cwd: projectDir, input: primary.password });
  if (!login.ok) throw new Error('登录失败');
  const authFile = path.join(projectDir, '.freelog', 'auth');
  if (!existsSync(authFile)) throw new Error('工作区凭据未写入');
  const authRaw = JSON.parse(readFileSync(authFile, 'utf8'));
  if (!authRaw.iv || !authRaw.tag || typeof authRaw.token !== 'string') throw new Error('凭据未加密存储');

  // T3.1 立项（短视频叶子类型）
  const init = runCli('init --scaffold none', ['init', '--scaffold', 'none', '--resource-type', 'RT006003', '--yes', '--env', env], { cwd: projectDir });
  if (!init.ok) throw new Error('init 失败');

  // Step1 §0.1：--file 必须落在工程里；把素材拷进工程
  const projectVideo = path.join(projectDir, 'sample-video.mp4');
  fs.copyFileSync(videoSample, projectVideo);

  // T4.1 建壳
  const stamp = Date.now().toString(36).slice(-6);
  const create = runCli('create 建壳', ['create', '--title', `smoke-${stamp}`, '--type', 'RT006003', '--name', `smoke-${stamp}`, '--file', 'sample-video.mp4', '--yes', '--env', env], { cwd: projectDir });
  if (!create.ok) throw new Error('create 失败');
  const identity = JSON.parse(readFileSync(path.join(projectDir, '.freelog', '1.json'), 'utf8'));
  if (!identity.resourceId) throw new Error('N.json 未写入 resourceId');
  log(`  resourceId: ${identity.resourceId}`);

  // T6 + T9.1 备稿（上传 + 解析，不 POST）
  const prepare = runCli('create-version --prepare', ['create-version', '--prepare', '--yes', '--env', env], { cwd: projectDir });
  if (!prepare.ok) throw new Error('备稿失败');
  if (!prepare.out.includes('已备稿')) throw new Error('备稿文案不符');

  // T5.2 看本地稿
  const showLocal = runCli('version show --local', ['version', 'show', '--local', '--env', env], { cwd: projectDir });
  if (!showLocal.ok) throw new Error('看稿失败');
  if (!showLocal.out.includes('fileSha1')) throw new Error('工作稿缺 fileSha1');

  // T9.2 提交首版
  const submit = runCli('create-version --yes（POST 1.0.0）', ['create-version', '--yes', '--env', env], { cwd: projectDir });
  if (!submit.ok || submit.out !== '1.0.0') throw new Error('首版提交失败');
  if (existsSync(path.join(projectDir, '.freelog', '1.version.json'))) throw new Error('成功 POST 后工作稿未删除');

  // T10 看线上
  const showOnline = runCli('version show（线上）', ['version', 'show', '--env', env], { cwd: projectDir });
  if (!showOnline.ok || !showOnline.out.includes('"version": "1.0.0"')) throw new Error('线上无 1.0.0');

  // T12.1 免费策略
  const policy = JSON.parse(readFileSync(policyFixture, 'utf8'));
  const policyTextPath = path.join(os.tmpdir(), `freelog-policy-${stamp}.txt`);
  writeFileSync(policyTextPath, policy.policyText, 'utf8');
  const apply = runCli('policy apply --from-file', ['policy', 'apply', '--from-file', policyTextPath, '--yes', '--env', env], { cwd: projectDir });
  if (!apply.ok) throw new Error('追加策略失败');
  const policyList = runCli('policy list', ['policy', 'list', '--yes', '--env', env], { cwd: projectDir });
  if (!policyList.ok) throw new Error('看策略失败');

  // T12.3 预检 + 上架
  const validate = runCli('validate --for online', ['validate', '--for', 'online', '--yes', '--env', env], { cwd: projectDir });
  if (!validate.ok) throw new Error('预检失败');
  const online = runCli('online 上架', ['online', '--yes', '--env', env], { cwd: projectDir });
  if (!online.ok) throw new Error('上架失败');

  const finalStatus = runCli('status（终态）', ['status', '--yes', '--env', env], { cwd: projectDir });
  if (!finalStatus.ok || !finalStatus.out.includes('latestVersion=1.0.0')) throw new Error('终态 status 不符');

  // 收尾：下架（资源保留在测试账号，便于 Console 复查；下架即离开市场）
  const offline = runCli('offline 下架收尾', ['offline', '--yes', '--env', env], { cwd: projectDir });
  if (!offline.ok) throw new Error('下架失败');

  rmSync(policyTextPath, { force: true });
  rmSync(projectDir, { recursive: true, force: true });

  log('\n=== 全部通过 ===');
  log(`resourceId: ${identity.resourceId}（保留在测试账号，已下架）`);
  lines.push('', `resourceId: ${identity.resourceId}`);
  return true;
}

try {
  await main();
  writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: PASS\n完成: ${new Date().toISOString()}\n`, 'utf8');
  log(`报告: ${reportPath}`);
} catch (error) {
  lines.push(`\n=== 失败 ===\n${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  writeFileSync(reportPath, `${lines.join('\n')}\n\n结果: FAIL\n完成: ${new Date().toISOString()}\n`, 'utf8');
  log(`报告: ${reportPath}`);
  process.exit(1);
}
