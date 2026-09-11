#!/usr/bin/env node
/**
 * dev 真网验证：dep add 对「只启用付费策略」的依赖，显式选择策略后签约并写稿。
 *
 * 流程：
 *   1. 从用户维护的资源池找到仅付费策略依赖，读取它的策略与 batchAuth 状态
 *   2. CLI：login → init → create → prepare
 *   3. CLI：先验证未给 --policy-id 会停止；再带资源池中明确的启用付费策略签约。
 *   4. 原生 API：查签出来的合约（status/authStatus）与 batchAuth 复查
 *   5. CLI：create-version --yes（关键观察：平台是否允许带"未支付依赖"发版）
 *   6. CLI：version show / offline 收尾
 *
 * 支付不在 CLI 范围；带未支付依赖能否发版仅记录平台结果，不作为本脚本成败条件。
 *
 * 用法：node test/verify-paid-dep.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const env = 'dev';
const API = 'https://api.devfreelog.com';
const credPath = path.join(testRoot, '.freelog-test-credentials.local.json');
const creds = JSON.parse(readFileSync(credPath, 'utf8').replace(/^\uFEFF/, ''));
const primary = creds.primary;
if (!primary?.loginName || !primary?.password) {
  console.error('primary 凭据缺失');
  process.exit(2);
}

const resourcePoolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
const resourcePool = JSON.parse(readFileSync(resourcePoolPath, 'utf8').replace(/^\uFEFF/, ''));
const PAID_CANDIDATES = (resourcePool.resources ?? []).filter((resource) => (
  typeof resource.resourceId === 'string'
  && typeof resource.resourceName === 'string'
  && typeof resource.policyId === 'string'
  && String(resource.policyName ?? '').includes('付费')
));
if (PAID_CANDIDATES.length === 0) {
  console.error(`资源池未提供带明确付费策略的依赖：${resourcePoolPath}`);
  process.exit(2);
}

class BlockedError extends Error {}

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

function requireOk(result, message) {
  if (!result.ok) throw new Error(message);
  return result;
}

function batchAuthIsAuthorized(response, resourceId) {
  const data = response.json?.data;
  const list = Array.isArray(data) ? data : data?.dataList ?? data?.list;
  if (Array.isArray(list)) {
    const hit = list.find((item) => item?.resourceId === resourceId) ?? list[0];
    return hit?.isAuth === true;
  }
  return data?.isAuth === true;
}

/**
 * 真网必须覆盖“未授权 → 显式策略签约”这一分支，不能固定某个历史资源名。
 * 所有候选都已授权时，资源池不具备该分支的前置条件，应明确 BLOCKED。
 */
async function findUnauthorizedPaidTarget() {
  let authorizedCount = 0;
  for (const candidate of PAID_CANDIDATES) {
    const range = candidate.range || '^1.0.0';
    const info = await raw('GET', `/v2/resources/${candidate.resourceId}`, { isLoadPolicyInfo: 1, isTranslate: 1 });
    const policies = (info.json?.data?.policies ?? info.json?.data ?? []).map((item) => ({
      policyId: item.policyId,
      status: item.status,
      transaction: /transactionevent/i.test(item.policyText ?? ''),
    }));
    if (!policies.some((policy) => policy.policyId === candidate.policyId && policy.status === 1)) continue;
    const authBefore = await raw('GET', '/v2/auths/resources/batchAuth/results', {
      resourceIds: candidate.resourceId,
      versionRanges: range,
    });
    if (!batchAuthIsAuthorized(authBefore, candidate.resourceId)) {
      return { target: { ...candidate, range }, policies, authBefore };
    }
    authorizedCount += 1;
  }
  if (authorizedCount > 0) {
    throw new BlockedError('资源池中所有启用付费策略候选均已对 primary 账号授权，无法重演未授权签约分支。');
  }
  throw new BlockedError('资源池没有当前启用且可用于未授权签约的付费策略。');
}

async function main() {
  const p = mkdtempSync(path.join(os.tmpdir(), 'freelog-paid-dep-'));
  log(`工程: ${p}`);
  try {
    await rawLogin();

    // ---- 1. 目标资源当前状态 ----
    const { target, policies, authBefore } = await findUnauthorizedPaidTarget();
    log(`[raw] 已选未授权付费候选，启用策略数: ${policies.filter((policy) => policy.status === 1).length}`);
    log(`[raw] 签约前 batchAuth 已授权: ${batchAuthIsAuthorized(authBefore, target.resourceId)}`);

    // ---- 2. CLI 建壳备稿 ----
    copyFileSync(path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4'), path.join(p, 'sample-video.mp4'));
    requireOk(runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], { cwd: p, input: primary.password }), 'login 失败');
    requireOk(runCli('init', ['init', '.', '--type', 'RT006003', '--artifact', 'sample-video.mp4', '--yes', '--env', env], { cwd: p }), 'init 失败');
    const stamp = `${Date.now().toString(36).slice(-6)}p`;
    requireOk(runCli('create 建壳', ['create', '--title', `paid-${stamp}`, '--type', 'RT006003', '--name', `paid-${stamp}`, '--artifact', 'sample-video.mp4', '--yes', '--env', env], { cwd: p }), 'create 失败');
    const identity = JSON.parse(readFileSync(path.join(p, '.freelog', '1.json'), 'utf8'));
    requireOk(runCli('create-version --prepare', ['create-version', '--prepare', '--yes', '--env', env], { cwd: p }), 'prepare 失败');

    // ---- 3. CLI dep add 付费依赖：脚本绝不允许按策略列表顺序猜测 ----
    const missingPolicy = runCli('version dep add 未给 --policy-id（应拒）', ['version', 'dep', 'add', target.resourceId, '--range', target.range, '--yes', '--env', env], { cwd: p });
    if (missingPolicy.ok || !missingPolicy.err.includes('未授权依赖请显式提供 --policy-id')) {
      throw new Error('未授权的非交互依赖没有要求 --policy-id');
    }
    requireOk(
      runCli('version dep add（显式付费策略）', ['version', 'dep', 'add', target.resourceId, '--range', target.range, '--policy-id', target.policyId, '--yes', '--env', env], { cwd: p }),
      '显式策略签约或写稿失败',
    );

    // ---- 4. 平台侧签约结果 ----
    const contracts = await raw('GET', '/v2/contracts/list', {
      licenseeId: identity.resourceId,
      subjectIds: target.resourceId,
      isLoadPolicyInfo: 1,
      isTranslate: 1,
    });
    const contractView = (contracts.json?.data ?? []).map((c) => ({
      contractId: c.contractId,
      status: c.status,
      authStatus: c.authStatus,
      matchesSelectedPolicy: c.policyId === target.policyId,
    }));
    if (!contractView.some((contract) => contract.matchesSelectedPolicy)) {
      throw new Error('显式付费策略没有创建对应合约');
    }
    log(`[raw] 签后合约已包含所选策略；合约数: ${contractView.length}`);
    const authAfter = await raw('GET', '/v2/auths/resources/batchAuth/results', { resourceIds: target.resourceId, versionRanges: target.range });
    log(`[raw] 签约后 batchAuth 已授权: ${batchAuthIsAuthorized(authAfter, target.resourceId)}`);

    // ---- 5. CLI 发版 ----
    const submit = runCli('create-version --yes（带付费依赖发版）', ['create-version', '--yes', '--env', env], { cwd: p });
    if (submit.ok) {
      const show = runCli('version show（线上）', ['version', 'show', '--env', env], { cwd: p });
      log(`  线上依赖含所选目标: ${show.out.includes(target.resourceId)}`);
    } else {
      log('  发版被拒——平台对“未支付依赖”的校验已记录；这不改变依赖已按显式策略写稿的断言。');
    }
  } finally {
    const identityPath = path.join(p, '.freelog', '1.json');
    if (existsSync(identityPath) && JSON.parse(readFileSync(identityPath, 'utf8')).resourceId) {
      runCli('offline 下架收尾', ['offline', '--yes', '--env', env], { cwd: p });
    }
    rmSync(p, { recursive: true, force: true });
  }
  log('\n=== 付费直签真网验证结束 ===');
}

try {
  await main();
} catch (e) {
  if (e instanceof BlockedError) {
    console.error(`BLOCKED: ${e.message}`);
    process.exit(3);
  }
  console.error('失败：', e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
}
