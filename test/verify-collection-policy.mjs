#!/usr/bin/env node
/**
 * 合集策略 dev 闭环：建 subjectType=4 审计壳 → 当前主体模板目录 → 精确参数化创建 →
 * 读回 → off/on 读回。壳不发布、不上架、不添加单品；本地临时工程结束后删除。
 *
 * 用法：node test/verify-collection-policy.mjs --env dev [--skip-build]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] || 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');
if (env !== 'dev') throw new Error('本脚本只允许 --env dev');

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testRoot);
const cli = path.join(repoRoot, 'packages/cli/dist/bin/index.js');
const credentialPath = path.join(testRoot, '.freelog-test-credentials.local.json');
if (!existsSync(cli) || !existsSync(credentialPath)) throw new Error('缺少 CLI 构建产物或 dev 私有凭据');
const primary = JSON.parse(readFileSync(credentialPath, 'utf8')).primary;
if (!primary?.loginName || !primary?.password) throw new Error('primary dev 凭据不完整');

function run(label, args, cwd, input) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: 'utf8', timeout: 300_000 });
  const out = (result.stdout ?? '').trim();
  const err = (result.stderr ?? '').trim();
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${label} (exit ${result.status})`);
  if (result.status !== 0) console.log(`  ${err.slice(0, 600).replaceAll('\n', ' | ')}`);
  return { ok: result.status === 0, out, err };
}

function catalog(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed?.templates)) throw new Error('模板 JSON 信封无 templates');
  return parsed.templates;
}

function valueFor(parameter) {
  if (Object.hasOwn(parameter, 'defaultValue')) return parameter.defaultValue;
  if (parameter.type === 'select' && parameter.options?.[0]) return parameter.options[0].value;
  if (parameter.type === 'number') return parameter.numberRule?.min ?? 0.01;
  if (parameter.type === 'datetime') return '2099-01-01 00:00';
  throw new Error(`参数 [${parameter.slot}] 没有可验收值`);
}

async function main() {
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], { cwd: repoRoot, shell: process.platform === 'win32', encoding: 'utf8', timeout: 120_000 });
    if (build.status !== 0) throw new Error('CLI 构建失败');
  }
  const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-policy-'));
  const stamp = Date.now().toString(36);
  const shared = ['--env', 'dev'];
  try {
    if (!run('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...shared], cwd, primary.password).ok) throw new Error('login 失败');
    if (!run('collection create', ['collection', 'create', '--type', 'RT003011', '--title', `策略验收合集-${stamp}`, '--name', `policy-${stamp}`, '--yes', ...shared], cwd).ok) throw new Error('合集建壳失败');

    const listed = run('collection policy template list --json', ['collection', 'policy', 'template', 'list', '--json', ...shared], cwd);
    if (!listed.ok) throw new Error('合集模板目录失败');
    const templates = catalog(listed.out);
    if (templates.length === 0) throw new Error('当前合集没有可用策略模板');
    const template = templates.find((item) => item.title.includes('永久免费')) ?? templates[0];
    const policyName = `合集策略-${stamp}`;
    const applied = run('collection policy template apply', [
      'collection', 'policy', 'template', 'apply', template.id,
      '--template-fingerprint', template.fingerprint,
      '--name', policyName,
      ...template.parameters.flatMap((parameter) => ['--param', `${parameter.slot}=${valueFor(parameter)}`]),
      '--yes', ...shared,
    ], cwd);
    if (!applied.ok) throw new Error('合集策略模板创建失败');

    const policies = run('collection policy list', ['collection', 'policy', 'list', ...shared], cwd);
    const policyId = policies.out.split('\n').find((line) => line.includes(policyName))?.split('\t')[0];
    if (!policies.ok || !policyId) throw new Error('合集策略创建后未读回');
    if (!run('collection policy set --off', ['collection', 'policy', 'set', '--id', policyId, '--off', '--yes', ...shared], cwd).ok) throw new Error('合集策略停用失败');
    if (!run('collection policy set --on', ['collection', 'policy', 'set', '--id', policyId, '--on', '--yes', ...shared], cwd).ok) throw new Error('合集策略启用失败');
    console.log('PASS 合集策略 dev 闭环');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
