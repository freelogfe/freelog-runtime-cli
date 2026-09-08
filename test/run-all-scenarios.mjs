#!/usr/bin/env node
/**
 * 新 CLI 真网端到端验证（dev）。
 *
 * 只用 test/.freelog-test-credentials.local.json 的 primary 账号：
 * 该账号才有发行/管理权限。辅账号禁止用于任何写平台场景。
 *
 * 覆盖：
 *   1. 主链（短视频资源）：login → init → create → prepare → attr → dep → 1.0.0
 *      → draft pull → attr set → dep 2 → update-version 1.1.0 → 上下架
 *   2. 主题（RT001）：线上模板 init → dist 目录压缩 → create → 1.0.0 → 下架
 *   依赖标的来自 test/fixtures/dev-free-policy-resources.json（免费策略可签）。
 *
 * 用法：node test/run-all-scenarios.mjs [--env dev] [--skip-build]
 * 报告写入系统临时目录 freelog-runtime-cli-verification/latest.txt。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from 'node:fs';
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

const depFixturePath = path.join(testRoot, 'fixtures', 'dev-free-policy-resources.json');
if (!existsSync(depFixturePath)) {
  console.error(`缺少依赖标的 fixture：${depFixturePath}`);
  process.exit(2);
}
const depFixture = JSON.parse(readFileSync(depFixturePath, 'utf8').replace(/^\uFEFF/, ''));
/** 优先自己的资源作首位依赖，跨账号资源作第二位（未授权时按新版规则直签第一条启用策略） */
const depTargets = depFixture.resources ?? [];

const videoSample = path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4');
const policyFixture = path.join(testRoot, 'fixtures', 'policies', 'free.json');
const themeArtifact = path.join(testRoot, 'fixtures', 'theme-artifact');

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
  if (out) log(`  stdout: ${out.slice(0, 900).replaceAll('\n', ' | ')}`);
  if (err) log(`  stderr: ${err.slice(0, 900).replaceAll('\n', ' | ')}`);
  return { ok: res.status === 0, out, err };
}

async function main() {
  log('=== 新 CLI 真网端到端（primary only，含依赖/属性/可选项） ===');
  log(`时间: ${startedAt}`);
  log(`环境: ${env}`);
  log(`账号: ${primary.loginName} / ******`);
  log(`依赖标的: ${depTargets.map((t) => `${t.owner}/${t.resourceName.split('/').pop()}`).join(', ')}`);

  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    log(`${build.status === 0 ? '✔' : '✘'} build CLI`);
    if (build.status !== 0) {
      log((build.stdout ?? '') + (build.stderr ?? ''));
      throw new Error('build 失败');
    }
  }

  // ---------- 场景 1：短视频，create-version 1.0.0（属性+依赖）+ update-version 1.1.0 ----------
  const p1 = mkdtempSync(path.join(os.tmpdir(), 'freelog-e2e-video-'));
  log(`\n[场景 1] 短视频发版（依赖 + 属性 + 更新） 工程: ${p1}`);

  const prodGate = runCli('prod 拦截（默认 env）', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes'], { cwd: p1, input: primary.password });
  if (prodGate.ok || !prodGate.err.includes('prod 暂未开放')) {
    throw new Error('prod 门禁未生效');
  }

  const login = runCli('login --env dev', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], { cwd: p1, input: primary.password });
  if (!login.ok) throw new Error('登录失败');

  const init = runCli('init . --type RT006003', ['init', '.', '--type', 'RT006003', '--yes', '--env', env], { cwd: p1 });
  if (!init.ok) throw new Error('init 失败');

  copyFileSync(videoSample, path.join(p1, 'sample-video.mp4'));

  const stamp = Date.now().toString(36).slice(-6);
  const create = runCli('create 建壳', ['create', '--title', `smoke-${stamp}`, '--type', 'RT006003', '--name', `smoke-${stamp}`, '--file', 'sample-video.mp4', '--yes', '--env', env], { cwd: p1 });
  if (!create.ok) throw new Error('create 失败');
  const identity = JSON.parse(readFileSync(path.join(p1, '.freelog', '1.json'), 'utf8'));
  if (!identity.resourceId) throw new Error('N.json 未写入 resourceId');
  log(`  resourceId: ${identity.resourceId}`);

  const prepare = runCli('create-version --prepare', ['create-version', '--prepare', '--yes', '--env', env], { cwd: p1 });
  if (!prepare.ok || !prepare.out.includes('已备稿')) throw new Error('备稿失败');

  // 属性：自定义 readonlyText
  const attrAdd = runCli('version attr add 作者', ['version', 'attr', 'add', '名称=作者 键=author 值=测试作者', '--yes', '--env', env], { cwd: p1 });
  if (!attrAdd.ok) throw new Error('加属性失败');

  // 依赖 1：自己的免费资源 b_462
  const dep1 = depTargets.find((t) => t.owner === primary.loginName) ?? depTargets[0];
  const depAdd = runCli('version dep add b_462', ['version', 'dep', 'add', dep1.resourceId, '--range', '^1.0.0', '--env', env], { cwd: p1 });
  if (!depAdd.ok) throw new Error('加依赖失败');

  const showLocal = runCli('version show --local', ['version', 'show', '--local', '--env', env], { cwd: p1 });
  if (!showLocal.ok || !showLocal.out.includes('author')) throw new Error('工作稿缺 author');
  if (!showLocal.out.includes(dep1.resourceId)) throw new Error('工作稿缺依赖');

  const submit = runCli('create-version --yes（POST 1.0.0）', ['create-version', '--yes', '--env', env], { cwd: p1 });
  if (!submit.ok || submit.out !== '1.0.0') throw new Error('首版提交失败');
  if (existsSync(path.join(p1, '.freelog', '1.version.json'))) throw new Error('成功 POST 后工作稿未删除');

  const showV1 = runCli('version show（线上 1.0.0）', ['version', 'show', '--env', env], { cwd: p1 });
  if (!showV1.ok || !showV1.out.includes('"version": "1.0.0"')) throw new Error('线上无 1.0.0');
  if (!showV1.out.includes('测试作者')) throw new Error('线上无自定义属性 author');
  if (!showV1.out.includes(dep1.resourceId)) throw new Error('线上无依赖 1');

  // 更新版本：pull → 改属性值 + 加第二条依赖 → 1.1.0
  const pull = runCli('version draft pull --yes', ['version', 'draft', 'pull', '--yes', '--env', env], { cwd: p1 });
  if (!pull.ok) throw new Error('draft pull 失败');
  const attrSet = runCli('version attr set 作者值', ['version', 'attr', 'set', '键=author 值=测试作者v2', '--yes', '--env', env], { cwd: p1 });
  if (!attrSet.ok) throw new Error('改属性失败');
  const dep2 = depTargets.find((t) => t.owner !== primary.loginName) ?? dep1;
  const depAdd2 = runCli('version dep add 第二条依赖', ['version', 'dep', 'add', dep2.resourceId, '--range', '^1.0.0', '--env', env], { cwd: p1 });
  if (!depAdd2.ok) throw new Error('加第二条依赖失败');

  const update = runCli('update-version --yes --bump minor', ['update-version', '--yes', '--bump', 'minor', '--env', env], { cwd: p1 });
  if (!update.ok || update.out !== '1.1.0') throw new Error('更新版本失败');
  if (existsSync(path.join(p1, '.freelog', '1.version.json'))) throw new Error('更新成功后工作稿未删除');

  const showV11 = runCli('version show（线上 1.1.0）', ['version', 'show', '--env', env], { cwd: p1 });
  if (!showV11.ok || !showV11.out.includes('"version": "1.1.0"')) throw new Error('线上无 1.1.0');
  if (!showV11.out.includes('测试作者v2')) throw new Error('线上属性未更新');
  if (!showV11.out.includes(dep2.resourceId)) throw new Error('线上无依赖 2');

  // 收尾：策略 + 上架 + 下架（沿用主链验管理门禁）
  const policy = JSON.parse(readFileSync(policyFixture, 'utf8'));
  const apply = runCli('policy apply --from-file', ['policy', 'apply', '--from-file', policyFixture, '--name', policy.policyName, '--yes', '--env', env], { cwd: p1 });
  if (!apply.ok) throw new Error('追加策略失败');
  const policyList = runCli('policy list', ['policy', 'list', '--yes', '--env', env], { cwd: p1 });
  if (!policyList.ok) throw new Error('看策略失败');
  const validate = runCli('validate --for online', ['validate', '--for', 'online', '--yes', '--env', env], { cwd: p1 });
  if (!validate.ok) throw new Error('预检失败');
  const online = runCli('online 上架', ['online', '--yes', '--env', env], { cwd: p1 });
  if (!online.ok) throw new Error('上架失败');
  const offline = runCli('offline 下架收尾', ['offline', '--yes', '--env', env], { cwd: p1 });
  if (!offline.ok) throw new Error('下架失败');
  rmSync(p1, { recursive: true, force: true });

  // ---------- 场景 2：主题 RT001，线上模板 + 目录压缩 ----------
  const p2 = mkdtempSync(path.join(os.tmpdir(), 'freelog-e2e-theme-'));
  log(`\n[场景 2] 主题（RT001）模板与压缩发版 工程: ${p2}`);
  const login2 = runCli('login --env dev', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], { cwd: p2, input: primary.password });
  if (!login2.ok) throw new Error('场景2 登录失败');
  const initTheme = runCli('init theme . --template vite-react-ts', ['init', 'theme', '.', '--template', 'vite-react-ts', '--yes', '--env', env], { cwd: p2 });
  if (!initTheme.ok) throw new Error('场景2 init 失败');
  mkdirSync(path.join(p2, 'dist'), { recursive: true });
  for (const f of readdirSync(themeArtifact)) {
    copyFileSync(path.join(themeArtifact, f), path.join(p2, 'dist', f));
  }
  const stamp2 = `${Date.now().toString(36).slice(-6)}t`;
  const createTheme = runCli('create 主题壳 --file dist', ['create', '--title', `theme-${stamp2}`, '--type', 'RT001', '--name', `theme-${stamp2}`, '--file', 'dist', '--yes', '--env', env], { cwd: p2 });
  if (!createTheme.ok) throw new Error('场景2 create 失败');
  const prepTheme = runCli('create-version --prepare（打 zip）', ['create-version', '--prepare', '--yes', '--env', env], { cwd: p2 });
  if (!prepTheme.ok) throw new Error('场景2 备稿失败');
  const submitTheme = runCli('create-version --yes（主题 1.0.0）', ['create-version', '--yes', '--env', env], { cwd: p2 });
  if (!submitTheme.ok || submitTheme.out !== '1.0.0') throw new Error('场景2 提交失败');
  const showTheme = runCli('version show（主题线上）', ['version', 'show', '--env', env], { cwd: p2 });
  if (!showTheme.ok || !showTheme.out.includes('.zip')) throw new Error('线上主题未使用 zip 发行物');
  const offlineTheme = runCli('offline 下架收尾', ['offline', '--yes', '--env', env], { cwd: p2 });
  if (!offlineTheme.ok) throw new Error('场景2 下架失败');
  rmSync(p2, { recursive: true, force: true });

  log('\n=== 全部通过 ===');
  const identities = [];
  lines.push('', `场景1 resourceId: ${identity.resourceId}（1.1.0，已下架）`);
  console.log(`场景1 resourceId: ${identity.resourceId}（1.1.0，已下架）`);
  return identities;
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
