#!/usr/bin/env node
/**
 * 可选配置最终真网验收（dev，primary）。
 *
 * 需要被忽略的 test/.freelog-test-optional-config.local.json：
 * { "typeCode": "<启用且支持可选配置的最终叶子类型>", "artifact": "<相对 test/ 的适配文件或目录>" }
 *
 * 覆盖：属性、依赖、文本与下拉 add → 首版提交 / 读回 → draft pull → attr set、option set / rm → 更新版提交 / 读回。
 * 缺失 fixture 或不满足类型能力时以 BLOCKED 退出，不把字段单测或能力门禁当真网成功。
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');
const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'optional-config.txt');

function blocked(message) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `结果: BLOCKED\n原因: ${message}\n`, 'utf8');
  console.error(`BLOCKED: ${message}`);
  console.error(`报告: ${reportPath}`);
  process.exit(3);
}

if (env !== 'dev') blocked('可选配置最终真网验收当前只允许 --env dev。');
if (!existsSync(cliBin)) blocked('缺少 CLI 构建产物。');

const credentialPath = path.join(testRoot, '.freelog-test-credentials.local.json');
const configPath = path.join(testRoot, '.freelog-test-optional-config.local.json');
const resourcePoolPath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
if (!existsSync(credentialPath)) blocked('缺少 primary 凭据。');
if (!existsSync(configPath)) blocked('缺少可选配置类型与产物 fixture。');
if (!existsSync(resourcePoolPath)) blocked('缺少依赖资源池。');

const primary = JSON.parse(readFileSync(credentialPath, 'utf8')).primary;
const config = JSON.parse(readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
if (!primary?.loginName || !primary?.password) blocked('primary 凭据无效。');
if (typeof config.typeCode !== 'string' || !config.typeCode.trim() || typeof config.artifact !== 'string' || !config.artifact.trim()) {
  blocked('可选配置 fixture 必须提供 typeCode 和相对 test/ 的 artifact。');
}
const sourceArtifact = path.resolve(testRoot, config.artifact);
if (!sourceArtifact.startsWith(`${testRoot}${path.sep}`) || !existsSync(sourceArtifact)) {
  blocked('可选配置 fixture 的 artifact 必须是 test/ 内存在的文件或目录。');
}
const dependency = JSON.parse(readFileSync(resourcePoolPath, 'utf8')).resources
  ?.find((item) => typeof item?.resourceName === 'string' && typeof item?.policyId === 'string');
if (!dependency) blocked('依赖资源池没有可显式签约的 resourceName / policyId 条目。');

function runCli(label, args, cwd, input) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd, input, encoding: 'utf8', timeout: 300_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  console.log(`${result.status === 0 ? 'PASS' : 'FAIL'} ${label} (exit ${result.status})`);
  if (result.status !== 0) console.error(output.slice(0, 1200));
  return { ok: result.status === 0, output };
}

function requirePass(result, label) {
  if (!result.ok) throw new Error(label);
}

async function main() {
  mkdirSync(reportDir, { recursive: true });
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32', timeout: 120_000,
    });
    if (build.status !== 0) throw new Error('CLI 构建失败');
  }
  const work = mkdtempSync(path.join(tmpdir(), 'freelog-optional-config-'));
  try {
    const artifact = path.basename(sourceArtifact);
    cpSync(sourceArtifact, path.join(work, artifact), { recursive: true });
    const stamp = Date.now().toString(36);
    const E = ['--env', env];
    requirePass(runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], work, primary.password), '登录失败');
    requirePass(runCli('init', ['init', '.', '--type', config.typeCode, '--artifact', artifact, '--yes', ...E], work), 'init 失败');
    requirePass(runCli('create', ['create', '--title', `optional-${stamp}`, '--type', config.typeCode, '--name', `optional-${stamp}`, '--artifact', artifact, '--yes', ...E], work), 'create 失败');
    requirePass(runCli('prepare', ['create-version', '--prepare', '--yes', ...E], work), 'prepare 失败');
    requirePass(runCli('attr add', ['version', 'attr', 'add', '名称=验收作者 键=qaAuthor 值=first', '--yes', ...E], work), '属性添加失败');
    requirePass(runCli('dep add', ['version', 'dep', 'add', dependency.resourceName, '--policy-id', dependency.policyId, '--yes', ...E], work), '依赖添加或签约失败');
    requirePass(runCli('option add 文本', ['version', 'option', 'add', '名称=主题 键=theme 方式=文本 默认=dark', '--yes', ...E], work), '文本配置添加失败；请确认 fixture 类型实际支持可选配置');
    requirePass(runCli('option add 下拉', ['version', 'option', 'add', '名称=语言 键=lang 方式=下拉 选项=中文|English', '--yes', ...E], work), '下拉配置添加失败');
    requirePass(runCli('create-version 1.0.0', ['create-version', '--yes', ...E], work), '首版提交失败');
    const first = runCli('线上读回 1.0.0', ['version', 'show', '--version', '1.0.0', ...E], work);
    requirePass(first, '首版读回失败');
    if (!first.output.includes('qaAuthor') || !first.output.includes('theme') || !first.output.includes('lang') || !first.output.includes('editableText') || !first.output.includes('select') || !first.output.includes(dependency.resourceName)) {
      throw new Error('首版未同时读回属性、依赖、文本和下拉可选配置');
    }
    requirePass(runCli('draft pull', ['version', 'draft', 'pull', '--yes', ...E], work), 'draft pull 失败');
    requirePass(runCli('attr set', ['version', 'attr', 'set', '键=qaAuthor 值=second', '--yes', ...E], work), '属性修改失败');
    requirePass(runCli('option set 文本', ['version', 'option', 'set', '键=theme 默认=light', '--yes', ...E], work), '文本配置修改失败');
    requirePass(runCli('option set 下拉', ['version', 'option', 'set', '键=lang 方式=下拉 选项=English|中文', '--yes', ...E], work), '下拉配置修改失败');
    requirePass(runCli('option rm 文本', ['version', 'option', 'rm', 'theme', ...E], work), '可选配置删除失败');
    requirePass(runCli('update-version 1.1.0', ['update-version', '--version', '1.1.0', '--yes', ...E], work), '更新版本提交失败');
    const second = runCli('线上读回 1.1.0', ['version', 'show', '--version', '1.1.0', ...E], work);
    requirePass(second, '更新版读回失败');
    if (!second.output.includes('qaAuthor') || !second.output.includes('second') || !second.output.includes('lang') || !second.output.includes('English') || !second.output.includes(dependency.resourceName) || second.output.includes('"key": "theme"')) {
      throw new Error('更新版没有精确读回属性、依赖和可选配置的 set / rm 结果');
    }
    requirePass(runCli('offline 收尾', ['offline', '--yes', ...E], work), '下架收尾失败');
    writeFileSync(reportPath, '结果: PASS\n覆盖: attr add/set, dep add/sign, option add(text/select), 首版读回, pull, option set(text/select)/rm, 更新版读回, offline\n', 'utf8');
    console.log(`报告: ${reportPath}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `结果: FAIL\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`, 'utf8');
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  console.error(`报告: ${reportPath}`);
  process.exitCode = 1;
}
