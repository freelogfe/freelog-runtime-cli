#!/usr/bin/env node
/** dev 真实 TTY：模板翻页、选中、取消；只读资源策略，不新增或修改线上策略。 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveCliBin } from './acceptance/cli-bin.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { readPrivateJson } from './acceptance/read-private-json.mjs';
import { fileURLToPath } from 'node:url';
import { probeTty, runTty } from './tty-driver.mjs';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testRoot);
const cli = resolveCliBin(repoRoot);
const credentialPath = path.join(testRoot, '.freelog-test-credentials.local.json');
const poolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
const artifact = path.join(testRoot, 'fixtures', 'media', 'sample-image.png');
const paginationCase = { id: 'POLICY.TTY.REAL_PAGINATION', status: 'NOT_TESTED', assertions: [], reason: 'Not executed.' };
const secrets = [];
const redact = (value) => redactEvidence(value, secrets);
if (!process.argv.includes('--env') || process.argv[process.argv.indexOf('--env') + 1] !== 'dev') {
  throw new Error('此脚本只允许 --env dev');
}

function cliRun(args, cwd, input) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, input, encoding: 'utf8', timeout: 120_000 });
  if (result.status !== 0) throw new Error(`${args.slice(0, 3).join(' ')} 失败：${redact(result.stderr).slice(0, 500)}`);
  return result.stdout.trim();
}

async function main() {
  if (![cli, credentialPath, poolPath, artifact].every(existsSync)) throw new Error('缺少 CLI 构建、凭据、资源池或图片 fixture');
  const tty = await probeTty(repoRoot);
  if (!tty.available) throw new Error(`node-pty 不可用：${tty.reason}`);
  const primary = readPrivateJson(credentialPath).primary;
  secrets.push(primary?.password);
  const pool = JSON.parse(readFileSync(poolPath, 'utf8')).resources;
  const target = pool.find((item) => item.resourceTypeCode === 'RT005001' && item.resourceName?.startsWith(`${primary.loginName}/`));
  if (!target) throw new Error('资源池中没有当前账号的图片单资源');
  const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-policy-tty-'));
  let completed = false;
  try {
    copyFileSync(artifact, path.join(cwd, 'anchor.png'));
    cliRun(['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', 'dev'], cwd, primary.password);
    cliRun(['bind', target.resourceId, '--artifact', 'anchor.png', '--yes', '--env', 'dev'], cwd);
    const before = cliRun(['policy', 'list', '--env', 'dev'], cwd);
    const catalog = JSON.parse(cliRun(['policy', 'template', 'list', '--json', '--env', 'dev'], cwd));
    if (!Array.isArray(catalog.templates) || catalog.templates.length === 0) throw new Error('没有可供 TTY 浏览的模板');
    const hasSecondPage = catalog.templates.length > 20;
    const selected = catalog.templates[0];
    const fields = selected.parameters.length;
    const secondPageSize = Math.min(20, catalog.templates.length - 20);
    const steps = [
      ...(hasSecondPage ? [
        { expect: '授权策略模板（第 1/', send: `${'\u001b[B'.repeat(20)}\r` },
        { expect: '授权策略模板（第 2/', send: `${'\u001b[B'.repeat(secondPageSize)}\r` },
      ] : []),
      { expect: '授权策略模板（第 1/', send: '\r' },
      { expect: '编辑授权策略模板', send: `${'\u001b[B'.repeat(fields * 2 + 2)}\r` },
    ];
    const result = await runTty({ cwd, program: process.execPath, args: [cli, 'policy', 'template', 'list', '--env', 'dev'], steps, timeoutSeconds: 60 });
    if (!result.completed || result.signal !== null || result.status !== 0 || !result.stdout.includes(selected.id)) {
      throw new Error(`模板 TTY 翻页/取消失败：${redact(result.stderr) || redact(result.stdout).slice(-800)}`);
    }
    const after = cliRun(['policy', 'list', '--env', 'dev'], cwd);
    if (before !== after) throw new Error('取消模板交互后线上策略列表发生变化');
    paginationCase.status = hasSecondPage ? 'PASS' : 'NOT_TESTED';
    paginationCase.observations = { catalogCount: catalog.templates.length, completedSteps: result.completedSteps,
      expectedSteps: steps.length, matchedPrompts: result.matchedPrompts };
    paginationCase.assertions = [
      { id: 'second-page-available', passed: hasSecondPage, expected: true, actual: hasSecondPage },
      { id: 'next-page', passed: hasSecondPage, expected: true, actual: hasSecondPage && result.stdout.includes('授权策略模板（第 2/') },
      { id: 'previous-page', passed: hasSecondPage, expected: true, actual: hasSecondPage && result.completedSteps === steps.length },
      { id: 'cancel-no-write', passed: true, expected: createHash('sha256').update(before).digest('hex'), actual: createHash('sha256').update(after).digest('hex') },
    ];
    if (hasSecondPage) delete paginationCase.reason;
    else paginationCase.reason = `Real catalog has ${catalog.templates.length} templates, insufficient for next/previous page verification; homepage cancellation passed only.`;
    writeSuiteCases([paginationCase]);
    console.log(`PASS dev TTY 模板${hasSecondPage ? '跨页' : '首页'}选择与取消；策略列表不变（共 ${catalog.templates.length} 个模板）`);
    completed = paginationCase.status === 'PASS';
  } finally {
    cleanupWorkspace(cwd, { success: completed, prefixes: ['freelog-policy-tty-'] });
  }
}

try { await main(); process.exit(0); } catch (error) {
  paginationCase.status = 'FAIL';
  paginationCase.reason = redact(error instanceof Error ? error.message : String(error));
  writeSuiteCases([paginationCase]);
  console.error(paginationCase.reason);
  process.exit(1);
}
