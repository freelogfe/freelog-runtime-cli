#!/usr/bin/env node
/**
 * dev 真网验证：dep add 对「只启用付费策略」的依赖，签约后直接写稿并尝试发版。
 *
 * 流程：
 *   1. 原生 API：探 b_465（6a85480bf5749f003071e4cd，免费已停用、仅付费订阅启用）的策略与 batchAuth 状态
 *   2. CLI：login → init → create → prepare
 *   3. CLI：version dep add b_465 --range ^1.0.0（新逻辑：未授权则直签第一条启用策略，不分免费/付费）
 *   4. 原生 API：查签出来的合约（status/authStatus）与 batchAuth 复查
 *   5. CLI：create-version --yes（关键观察：平台是否允许带"未支付依赖"发版）
 *   6. CLI：version show / offline 收尾
 *
 * 用法：node test/verify-paid-dep.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { existsSync, mkdtempSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const env = 'dev';
const API = 'https://api.devfreelog.com';
const PAID_TARGET = {
  resourceId: '6a85480bf5749f003071e4cd',
  name: 'freelog-test11/b_465',
  range: '^1.0.0',
  paidPolicyId: 'bd0e6f0abcf2066241a3632bb686c6dc',
};

const credPath = path.join(testRoot, '.freelog-test-credentials.local.json');
const creds = JSON.parse(readFileSync(credPath, 'utf8').replace(/^\uFEFF/, ''));
const primary = creds.primary;
if (!primary?.loginName || !primary?.password) {
  console.error('primary 凭据缺失');
  process.exit(2);
}

function log(msg) {
  console.log(msg);
}

/** 原生 API 请求，返回 {status, json}；cookie 用登录 Set-Cookie 拼接 */
let cookie = '';
async function raw(method, pathname, params, body) {
  const url = new URL(API + pathname);
  if (params) for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    method,
    headers: { cookie, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

async function rawLogin() {
  const res = await fetch(API + '/v2/passport/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginName: primary.loginName, password: primary.password, isRemember: 1 }),
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  log(`[raw] login ${res.status} cookie=received`);
  if (res.status !== 200 && res.status !== 302) throw new Error(`登录失败: ${text.slice(0, 200)}`);
}

function runCli(label, args, { cwd, input } = {}) {
  const res = spawnSync(process.execPath, [cliBin, ...args], { cwd: cwd ?? repoRoot, input, encoding: 'utf8', timeout: 180_000 });
  const out = (res.stdout ?? '').trim();
  const err = (res.stderr ?? '').trim();
  log(`${res.status === 0 ? '✔' : '✘'} ${label} (exit ${res.status})`);
  if (out) log(`  stdout: ${out.slice(0, 700).replaceAll('\n', ' | ')}`);
  if (err) log(`  stderr: ${err.slice(0, 700).replaceAll('\n', ' | ')}`);
  return { ok: res.status === 0, out, err };
}

async function main() {
  const p = mkdtempSync(path.join(os.tmpdir(), 'freelog-paid-dep-'));
  log(`工程: ${p}`);

  await rawLogin();

  // ---- 1. 目标资源当前状态 ----
  const info = await raw('GET', `/v2/resources/${PAID_TARGET.resourceId}`, { isLoadPolicyInfo: 1, isTranslate: 1 });
  const policies = (info.json?.data?.policies ?? info.json?.data ?? []).map((it) => ({
    policyId: it.policyId,
    policyName: it.policyName,
    status: it.status,
    transaction: /transactionevent/i.test(it.policyText ?? ''),
  }));
  log(`[raw] ${PAID_TARGET.name} 策略: ${JSON.stringify(policies)}`);
  const authBefore = await raw('GET', '/v2/auths/resources/batchAuth/results', { resourceIds: PAID_TARGET.resourceId, versionRanges: PAID_TARGET.range });
  log(`[raw] 签约前 batchAuth: ${JSON.stringify(authBefore.json?.data)}`);

  // ---- 2. CLI 建壳备稿 ----
  copyFileSync(path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4'), path.join(p, 'sample-video.mp4'));
  runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], { cwd: p, input: primary.password });
  runCli('init', ['init', '.', '--type', 'RT006003', '--yes', '--env', env], { cwd: p });
  const stamp = `${Date.now().toString(36).slice(-6)}p`;
  const created = runCli('create 建壳', ['create', '--title', `paid-${stamp}`, '--type', 'RT006003', '--name', `paid-${stamp}`, '--artifact', 'sample-video.mp4', '--yes', '--env', env], { cwd: p });
  const identity = JSON.parse(readFileSync(path.join(p, '.freelog', '1.json'), 'utf8'));
  log(`  resourceId: ${identity.resourceId}`);
  runCli('create-version --prepare', ['create-version', '--prepare', '--yes', '--env', env], { cwd: p });

  // ---- 3. CLI dep add 付费依赖（新代码路径） ----
  const dep = runCli('version dep add b_465（付费策略）', ['version', 'dep', 'add', PAID_TARGET.resourceId, '--range', PAID_TARGET.range, '--env', env], { cwd: p });

  // ---- 4. 平台侧签约结果 ----
  const contracts = await raw('GET', '/v2/contracts/list', {
    licenseeId: identity.resourceId,
    subjectIds: PAID_TARGET.resourceId,
    isLoadPolicyInfo: 1,
    isTranslate: 1,
  });
  const contractView = (contracts.json?.data ?? []).map((c) => ({
    contractId: c.contractId,
    status: c.status,
    authStatus: c.authStatus,
    policyId: c.policyId,
    policyName: c.policyName,
    licensorId: c.licensorId,
  }));
  log(`[raw] 签后合约列表: ${JSON.stringify(contractView)}`);
  const authAfter = await raw('GET', '/v2/auths/resources/batchAuth/results', { resourceIds: PAID_TARGET.resourceId, versionRanges: PAID_TARGET.range });
  log(`[raw] 签约后 batchAuth: ${JSON.stringify(authAfter.json?.data)}`);

  // ---- 5. CLI 发版 ----
  const submit = runCli('create-version --yes（带付费依赖发版）', ['create-version', '--yes', '--env', env], { cwd: p });
  if (submit.ok) {
    const show = runCli('version show（线上）', ['version', 'show', '--env', env], { cwd: p });
    log(`  线上依赖含 b_465: ${show.out.includes(PAID_TARGET.resourceId)}`);
  } else {
    log('  发版被拒——平台对"未支付依赖"的校验如上（这是关键数据点）');
  }

  // ---- 6. 收尾 ----
  runCli('offline 下架', ['offline', '--yes', '--env', env], { cwd: p });
  rmSync(p, { recursive: true, force: true });
  log('\n=== 付费直签真网验证结束 ===');
}

try {
  await main();
} catch (e) {
  console.error('失败：', e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
}
