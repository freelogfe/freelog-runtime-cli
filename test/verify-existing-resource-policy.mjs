#!/usr/bin/env node
/**
 * 在 dev 资源池中已有、且属于 primary 的单资源上验收策略管理。
 *
 * 这是“已有资源管理”专项，不创建资源、不发布版本、不修改产物；但会新增两条
 * 带唯一名称的多参数策略，并对其中一条执行 off/on。因此必须明确传
 * --allow-existing-resource-write，避免被常规全量验收误用。
 *
 * 用法：node test/verify-existing-resource-policy.mjs --env dev --allow-existing-resource-write [--skip-build]
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');
const allowWrite = process.argv.includes('--allow-existing-resource-write');
const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testRoot);
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const credentialPath = path.join(testRoot, '.freelog-test-credentials.local.json');
const poolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
const artifact = path.join(testRoot, 'fixtures', 'media', 'sample-image.png');

function run(label, args, cwd, input) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd, input, encoding: 'utf8', timeout: 300_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${label} (exit ${result.status})`);
  if (result.status !== 0 && output) console.log(`  ${output.slice(0, 700).replaceAll('\n', ' | ')}`);
  return { ok: result.status === 0, output };
}

function requirePass(result, message) {
  if (!result.ok) throw new Error(message);
}

function catalog(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed?.templates)) throw new Error('策略模板 JSON 信封无 templates 数组');
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
  throw new Error(`模板参数 [${parameter.slot}] 没有可用于 dev 验收的值`);
}

/** 只选择参数不少于两个、并且每个参数都有可提交值的模板；不把样本不足伪装成通过。 */
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
    throw new Error(`dev 单资源模板中只有 ${candidates.length} 条可提交的多参数模板，验收至少需要 ${count} 条`);
  }
  return candidates.slice(0, count);
}

function policyIdFromList(output, policyName) {
  return output.split('\n')
    .find((line) => line.includes(policyName))
    ?.split('\t')[0];
}

async function main() {
  if (env !== 'dev') throw new Error('本脚本只允许 --env dev');
  if (!allowWrite) throw new Error('此专项会修改资源池中的既有资源；必须显式传 --allow-existing-resource-write');
  if (![cliBin, credentialPath, poolPath, artifact].every(existsSync)) throw new Error('缺少 CLI 构建产物、凭据、资源池或图片锚点');
  const primary = JSON.parse(readFileSync(credentialPath, 'utf8')).primary;
  const resources = JSON.parse(readFileSync(poolPath, 'utf8')).resources;
  if (!primary?.loginName || !primary?.password || !Array.isArray(resources)) throw new Error('primary 凭据或资源池无效');
  const target = resources.find((item) => typeof item?.resourceId === 'string'
    && typeof item?.resourceName === 'string'
    && item.resourceName.startsWith(`${primary.loginName}/`)
    && item.resourceTypeCode === 'RT005001');
  if (!target) throw new Error('资源池中没有 primary 名下可用于本专项的 RT005001 资源');

  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot, shell: process.platform === 'win32', encoding: 'utf8', timeout: 120_000,
    });
    if (build.status !== 0) throw new Error('CLI 构建失败');
  }

  const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-existing-policy-'));
  const envArgs = ['--env', 'dev'];
  const stamp = Date.now().toString(36);
  try {
    cpSync(artifact, path.join(cwd, 'anchor.png'));
    requirePass(run('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...envArgs], cwd, primary.password), '登录失败');
    requirePass(run('bind 既有资源', ['bind', target.resourceId, '--artifact', 'anchor.png', '--yes', ...envArgs], cwd), '既有资源 bind 失败');
    requirePass(run('policy list（写前）', ['policy', 'list', ...envArgs], cwd), '既有资源策略读取失败');

    const listed = run('policy template list --json', ['policy', 'template', 'list', '--json', ...envArgs], cwd);
    requirePass(listed, '策略模板目录读取失败');
    const templates = catalog(listed.output);
    const selected = parameterRichTemplates(templates, Date.now() % 997);
    const policyNames = selected.map((item, index) => `验收${stamp}${index + 1}`);
    for (const [index, item] of selected.entries()) {
      const kinds = item.template.parameters.map((parameter) => parameter.type).join(',');
      console.log(`选择单资源模板：${item.template.title}（${item.template.parameters.length} 参数：${kinds}）`);
      requirePass(run(`apply 多参数模板 #${index + 1}`, [
        'policy', 'template', 'apply', item.template.id,
        '--template-fingerprint', item.template.fingerprint, '--name', policyNames[index],
        ...item.template.parameters.flatMap((parameter, parameterIndex) => ['--param', `${parameter.slot}=${item.values[parameterIndex]}`]),
        '--yes', ...envArgs,
      ], cwd), `单资源多参数策略 #${index + 1} 创建失败`);
    }

    const after = run('policy list（写后）', ['policy', 'list', ...envArgs], cwd);
    requirePass(after, '策略创建后读取失败');
    const policyId = policyIdFromList(after.output, policyNames[0]);
    if (!policyId || !policyNames.every((name) => after.output.includes(name))) throw new Error('新增多参数策略没有被完整读回');
    requirePass(run('policy set --off', ['policy', 'set', '--id', policyId, '--off', '--yes', ...envArgs], cwd), '多参数策略停用失败');
    requirePass(run('policy set --on', ['policy', 'set', '--id', policyId, '--on', '--yes', ...envArgs], cwd), '多参数策略重新启用失败');
    console.log('PASS 既有单资源策略：bind、模板目录、两条多参数策略创建、读回、off/on 均已通过');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
