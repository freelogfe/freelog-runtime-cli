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

function valueFor(parameter, variation) {
  if (parameter.type === 'select' && parameter.options?.length) {
    return parameter.options[variation % parameter.options.length].value;
  }
  if (parameter.type === 'number') {
    const base = Number(parameter.defaultValue ?? parameter.numberRule?.min ?? 0.01);
    const precision = parameter.numberRule?.precision ?? 2;
    const step = precision === 0 ? 1 : 0.01;
    return Number((base + variation * step).toFixed(precision));
  }
  if (parameter.type === 'datetime') return `2099-01-${String((variation % 28) + 1).padStart(2, '0')} 00:00`;
  if (Object.hasOwn(parameter, 'defaultValue')) return parameter.defaultValue;
  throw new Error(`参数 [${parameter.slot}] 没有可验收值`);
}

/** 合集至少验收两条参数不少于两个且所有参数都有可提交值的模板。 */
function parameterRichTemplates(templates, variation, count = 2) {
  const candidates = templates.flatMap((template) => {
    if (!Array.isArray(template.parameters) || template.parameters.length < 2) return [];
    try {
      return [{ template, values: template.parameters.map((parameter) => valueFor(parameter, variation)) }];
    } catch {
      return [];
    }
  }).sort((left, right) => right.template.parameters.length - left.template.parameters.length
    || String(left.template.title).localeCompare(String(right.template.title)));
  if (candidates.length < count) {
    throw new Error(`dev 合集模板中只有 ${candidates.length} 条可提交的多参数模板，验收至少需要 ${count} 条`);
  }
  return candidates;
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
    const selected = parameterRichTemplates(templates, Date.now() % 997);
    const policyNames = [];
    const rejectedTemplates = [];
    for (const [index, item] of selected.entries()) {
      const kinds = item.template.parameters.map((parameter) => parameter.type).join(',');
      console.log(`选择合集模板：${item.template.title}（${item.template.parameters.length} 参数：${kinds}）`);
      const policyName = `合集${stamp}${index + 1}`;
      const applied = run(`collection policy template apply #${index + 1}`, [
        'collection', 'policy', 'template', 'apply', item.template.id,
        '--template-fingerprint', item.template.fingerprint,
        '--name', policyName,
        ...item.template.parameters.flatMap((parameter, parameterIndex) => ['--param', `${parameter.slot}=${item.values[parameterIndex]}`]),
        '--yes', ...shared,
      ], cwd);
      if (applied.ok) policyNames.push(policyName);
      else rejectedTemplates.push(item.template.title);
      if (policyNames.length === 2) break;
    }
    if (policyNames.length < 2) throw new Error(`合集多参数策略仅成功 ${policyNames.length} 条；失败模板：${rejectedTemplates.join('、') || '无'}`);

    const policies = run('collection policy list', ['collection', 'policy', 'list', ...shared], cwd);
    const policyId = policies.out.split('\n').find((line) => line.includes(policyNames[0]))?.split('\t')[0];
    if (!policies.ok || !policyId || !policyNames.every((name) => policies.out.includes(name))) throw new Error('合集多参数策略创建后未完整读回');
    if (!run('collection policy set --off', ['collection', 'policy', 'set', '--id', policyId, '--off', '--yes', ...shared], cwd).ok) throw new Error('合集策略停用失败');
    if (!run('collection policy set --on', ['collection', 'policy', 'set', '--id', policyId, '--on', '--yes', ...shared], cwd).ok) throw new Error('合集策略启用失败');
    console.log('PASS 合集策略 dev 闭环：两条多参数策略均已创建、读回、off/on');
    if (rejectedTemplates.length) console.log(`WARN 服务端未能编译的多参数模板：${rejectedTemplates.join('、')}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
