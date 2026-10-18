#!/usr/bin/env node
/**
 * 合集策略 dev 闭环：建 subjectType=4 审计壳 → 当前主体模板目录 → 精确参数化创建 →
 * 读回 → off/on 读回。壳不发布、不上架、不添加单品；本地临时工程仅全部成功后清理，失败保留。
 *
 * 用法：node test/verify-collection-policy.mjs --env dev [--skip-build]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveCliBin, skipWorkspaceBuild } from './acceptance/cli-bin.mjs';
import { matchesCommandResult, writeSuiteCases } from './acceptance/protocol.mjs';
import { fixedTemplateSamples, SampleUnavailableError } from './acceptance/template-samples.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { readPrivateJson } from './acceptance/read-private-json.mjs';
import { fileURLToPath } from 'node:url';

const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] || 'dev' : 'dev';
const skipBuild = skipWorkspaceBuild();
if (env !== 'dev') throw new Error('本脚本只允许 --env dev');

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testRoot);
const cli = resolveCliBin(repoRoot);
const credentialPath = path.join(testRoot, '.freelog-test-credentials.local.json');
if (!existsSync(cli) || !existsSync(credentialPath)) throw new Error('缺少 CLI 构建产物或 dev 私有凭据');
const primary = readPrivateJson(credentialPath).primary;
const redact = (value) => redactEvidence(value, [primary?.password]);
if (!primary?.loginName || !primary?.password) throw new Error('primary dev 凭据不完整');

function run(label, args, cwd, input) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: 'utf8', timeout: 300_000 });
  const out = (result.stdout ?? '').trim();
  const err = (result.stderr ?? '').trim();
  const ok = matchesCommandResult(result);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} (exit ${result.status})`);
  if (!ok) console.log(`  ${redact(err).slice(0, 600).replaceAll('\n', ' | ')}`);
  return { ok, out, err, exitCode: result.status, signal: result.signal ?? null, error: result.error?.message ?? null };
}

function catalog(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed?.templates)) throw new Error('模板 JSON 信封无 templates');
  return parsed.templates;
}

function policyRows(output) {
  return output.split(/\r?\n/u).filter((line) => line.trim()).map((line) => {
    const [policyId, policyName, status, extra] = line.split('\t');
    if (!policyId || !policyName || !['on', 'off'].includes(status) || extra !== undefined) throw new Error('合集策略列表不是预期三列格式');
    return { policyId, policyName, status };
  });
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

const policyCase = { id: 'POLICY.COLLECTION.SELECTED_TEMPLATES', status: 'NOT_TESTED', assertions: [], reason: 'Not executed.', templateResults: [] };

/** Fix the sample set before writes; a failed sample cannot be replaced by a successful template. */
function parameterRichTemplates(templates, variation, count = 2) {
  return fixedTemplateSamples(templates, variation, valueFor, count);
}

async function main() {
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--fail-if-no-match', '--filter', '@freelog-cli/cli2', 'build'], { cwd: repoRoot, shell: process.platform === 'win32', encoding: 'utf8', timeout: 120_000 });
    if (build.status !== 0) throw new Error('CLI 构建失败');
  }
  const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-policy-'));
  const stamp = Date.now().toString(36);
  const shared = ['--env', 'dev'];
  let completed = false;
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
      policyCase.templateResults.push({ templateId: item.template.id, title: item.template.title, status: applied.ok ? 'PASS' : 'FAIL', exitCode: applied.exitCode,
        ...(applied.ok ? {} : { reason: 'Selected template apply failed; no substitute sample was used.' }) });
      if (applied.ok) policyNames.push(policyName);
      else rejectedTemplates.push(item.template.title);
    }
    policyCase.assertions.push({ id: 'all-selected-created', passed: rejectedTemplates.length === 0 && policyNames.length === selected.length,
      expected: selected.length, actual: policyNames.length });
    if (rejectedTemplates.length || policyNames.length !== selected.length) throw new Error(`合集选定模板不可被替换：成功 ${policyNames.length}/${selected.length}；失败模板：${rejectedTemplates.join('、') || '无'}`);

    const policies = run('collection policy list', ['collection', 'policy', 'list', ...shared], cwd);
    const rows = policies.ok ? policyRows(policies.out) : [];
    const policyId = rows.find((row) => row.policyName === policyNames[0])?.policyId;
    const namesReadBack = policyNames.filter((name) => rows.filter((row) => row.policyName === name && row.status === 'on').length === 1);
    const readBack = policies.ok && Boolean(policyId) && namesReadBack.length === policyNames.length;
    policyCase.assertions.push({ id: 'all-selected-read-back', passed: readBack, expected: policyNames,
      actual: namesReadBack });
    if (!readBack) throw new Error('合集多参数策略创建后未完整读回');
    if (!run('collection policy set --off', ['collection', 'policy', 'set', '--id', policyId, '--off', '--yes', ...shared], cwd).ok) throw new Error('合集策略停用失败');
    const off = run('collection policy list after off', ['collection', 'policy', 'list', ...shared], cwd);
    const offState = off.ok ? policyRows(off.out).find((row) => row.policyId === policyId)?.status : undefined;
    if (offState !== 'off') throw new Error('合集策略停用后精确读回未为 off');
    if (!run('collection policy set --on', ['collection', 'policy', 'set', '--id', policyId, '--on', '--yes', ...shared], cwd).ok) throw new Error('合集策略启用失败');
    const on = run('collection policy list after on', ['collection', 'policy', 'list', ...shared], cwd);
    const onState = on.ok ? policyRows(on.out).find((row) => row.policyId === policyId)?.status : undefined;
    policyCase.assertions.push({ id: 'policy-off-on', passed: offState === 'off' && onState === 'on', expected: ['off', 'on'], actual: [offState, onState] });
    if (onState !== 'on') throw new Error('合集策略启用后精确读回未为 on');
    policyCase.status = 'PASS';
    delete policyCase.reason;
    console.log('PASS 合集策略 dev 闭环：两条多参数策略均已创建、读回、off/on');
    writeSuiteCases([policyCase]);
    completed = true;
  } finally {
    // Preserve failed workspace and selected-template outcomes for diagnosis.
    cleanupWorkspace(cwd, { success: completed, prefixes: ['freelog-collection-policy-'] });
  }
}

main().catch((error) => {
  policyCase.status = error instanceof SampleUnavailableError ? 'BLOCKED' : 'FAIL';
  policyCase.reason = redact(error instanceof Error ? error.message : String(error));
  writeSuiteCases([policyCase]);
  console.error(`FAIL: ${policyCase.reason}`);
  process.exitCode = error instanceof SampleUnavailableError ? 3 : 1;
});
