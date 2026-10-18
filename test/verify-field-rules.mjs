#!/usr/bin/env node
/**
 * 字段级校验逐条真网验证（对照 业务梳理/字段级校验对照表.md）。
 * 用 primary 账号在 --env dev（或 test）上把每条校验规则真实打一遍：
 * 客户端规则验证 CLI 拒绝行为与报错文案；服务端规则（140 值平台接受度）用真提交验证。
 * 本脚本固定用 RT006003 作为“不支持可选配置”的门禁控制组；支持类型的属性、依赖、文本/下拉配置、首版与更新版真网全链由 verify-optional-config.mjs 覆盖。
 * 结果追加到系统临时目录 freelog-runtime-cli-verification/field-rules.txt。
 *
 * 用法：node test/verify-field-rules.mjs --env dev [--skip-build]
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveCliBin, skipWorkspaceBuild } from './acceptance/cli-bin.mjs';
import { matchesCommandResult } from './acceptance/protocol.mjs';
import { readonlyPropertyReadback } from './acceptance/readback.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { readPrivateJson } from './acceptance/read-private-json.mjs';
import { fileURLToPath } from 'node:url';

const envArgIndex = process.argv.indexOf('--env');
const env = envArgIndex >= 0 ? process.argv[envArgIndex + 1] || 'dev' : 'dev';
const skipBuild = skipWorkspaceBuild();

if (env === 'prod') {
  console.error('production 硬禁用。');
  process.exit(2);
}

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testRoot);
const cliBin = resolveCliBin(repoRoot);
if (!existsSync(cliBin)) {
  console.error(`缺少 CLI 构建产物：${cliBin}（先 pnpm build 或去掉 --skip-build）`);
  process.exit(2);
}

const credPath = path.join(testRoot, '.freelog-test-credentials.local.json');
if (!existsSync(credPath)) {
  console.error(`缺少凭据文件：${credPath}`);
  process.exit(2);
}
const creds = readPrivateJson(credPath);
const primary = creds.primary;
const secrets = [primary?.password];
const redact = (value) => redactEvidence(value, secrets);
if (!primary?.loginName || !primary?.password) {
  console.error('primary 凭据缺失。只有 primary 有发行/管理权限。');
  process.exit(2);
}

const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'field-rules.txt');
mkdirSync(reportDir, { recursive: true });

const lines = [];
function log(line) {
  const safe = redact(line);
  console.log(safe);
  lines.push(safe);
}

function runCli(label, args, { cwd, input, expectErr } = {}) {
  const res = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: cwd ?? repoRoot,
    input,
    encoding: 'utf8',
    timeout: 300_000,
  });
  const out = (res.stdout ?? '').trim();
  const err = (res.stderr ?? '').trim();
  const pass = matchesCommandResult(res, expectErr, err);
  log(`${pass ? 'PASS' : 'FAIL'} ${label} (exit ${res.status})`);
  if (out) log(`  stdout: ${redact(out).slice(0, 500).replaceAll('\n', ' | ')}`);
  if (err) log(`  stderr: ${redact(err).slice(0, 500).replaceAll('\n', ' | ')}`);
  return { ok: pass, out, err, stdout: out, status: res.status, signal: res.signal ?? null, error: res.error };
}

const results = [];
const blockedReasons = [];
function record(rule, pass, note = '') {
  results.push({ rule, pass, note: redact(note) });
  log(`  => ${pass ? '符合' : '不符合'} ${note}`);
}

async function main() {
  const stamp = Date.now().toString(36);
  log('=== 字段级校验逐条真网验证 ===');
  log(`时间: ${new Date().toISOString()}`);
  log(`环境: ${env}  账号: ${primary.loginName} / ******`);

  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--fail-if-no-match', '--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32',
    });
    if (build.status !== 0) {
      console.error(redact(build.stdout + build.stderr));
      process.exit(2);
    }
    log('build 完成');
  }

  const work = mkdtempSync(path.join(tmpdir(), 'freelog-field-'));
  const E = ['--env', env];
  const W = { cwd: work };
  const artifact = 'field.mp4';
  let completed = false;
  try {
    // ---- R0 登录（凭据落工程）----
    const login = runCli('R0 login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { ...W, input: primary.password });
    if (!login.ok) throw new Error('登录失败，中止');

    copyFileSync(path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4'), path.join(work, artifact));
    const init = runCli('R0 init 工程', ['init', '.', '--type', 'RT006003', '--artifact', artifact, '--yes', ...E], W);
    if (!init.ok) throw new Error('init 失败，中止');

    // ---- §5 资源创建字段 ----
    const requiredFlags = runCli('§5-1 --yes 缺 title（应拒）', ['create', '--type', 'RT006003', '--name', `fld-${stamp}-a`, '--yes', ...E], { ...W, expectErr: '必须同时提供 --title / --name' });
    record('§5-1 --yes 必须显式提供 title/name', requiredFlags.ok);
    record('§5-1 标题≤100', runCli('§5-1 标题 101 字（应拒）', ['create', '--title', '标'.repeat(101), '--type', 'RT006003', '--name', `fld-${stamp}-b`, '--yes', ...E], { ...W, expectErr: '不超过100个字符' }).ok);
    const titleOk = runCli('§5-1 标题恰好 100 字（真建壳）', ['create', '--title', '标'.repeat(100), '--type', 'RT006003', '--name', `fld-${stamp}-main`, '--artifact', artifact, '--yes', ...E], W);
    record('§5-1 标题 100 字平台接受', titleOk.ok);
    if (!titleOk.ok) throw new Error('建壳失败，中止');

    const sameProject = runCli('§5-2 同工程重复建壳（应拒）', ['create', '--resource', 'file:1.json', '--title', 'dup', '--type', 'RT006003', '--name', `fld-${stamp}-main`, '--artifact', artifact, '--yes', ...E], { ...W, expectErr: '已经创建过授权条目' });
    record('§5-2 同工程重复建壳被拦', sameProject.ok);

    // ---- 首版稿（普通资源单文件）----
    const prep2 = runCli('R1 create-version --prepare（真文件）', ['create-version', '--prepare', '--artifact', artifact, ...E], W);
    if (!prep2.ok) throw new Error('prepare 失败，中止');

    // ---- §2 自定义属性字段 ----
    record('§2 名称≤50', runCli('§2 名称 51 字（应拒）', ['version', 'attr', 'add', `名称=${'长'.repeat(51)} 键=aa1`, '--yes', ...E], { ...W, expectErr: '名称不能超过50个字符' }).ok);
    record('§2 键正则', runCli('§2 键数字开头（应拒）', ['version', 'attr', 'add', '名称=合法名 键=1abc', '--yes', ...E], { ...W, expectErr: '请输入英文字母' }).ok);
    record('§2 键≤30', runCli('§2 键 31 字（应拒）', ['version', 'attr', 'add', `名称=合法名 键=${'k'.repeat(31)}`, '--yes', ...E], { ...W, expectErr: '长度不能超过30个字符' }).ok);
    record('§2 说明≤50', runCli('§2 说明 51 字（应拒）', ['version', 'attr', 'add', `名称=合法名 键=aa2 说明=${'说'.repeat(51)}`, '--yes', ...E], { ...W, expectErr: '不能超过50个字符' }).ok);
    record('§2 值≤140（客户端）', runCli('§2 值 141 字（应拒）', ['version', 'attr', 'add', `名称=合法名 键=aa3 值=${'值'.repeat(141)}`, '--yes', ...E], { ...W, expectErr: '自定义属性值最长 140' }).ok);
    const v140 = runCli('§2 值恰好 140 字（写稿）', ['version', 'attr', 'add', `名称=值一百四 键=aa3 值=${'值'.repeat(140)}`, '--yes', ...E], W);
    record('§2 值 140 可写入工作稿', v140.ok);
    record('§2 名称查重（2026-09-07 新增）', runCli('§2 名称与已有条目撞（应拒）', ['version', 'attr', 'add', '名称=值一百四 键=aa4', '--yes', ...E], { ...W, expectErr: '名称已存在' }).ok);
    let attrFull = true;
    for (let i = 0; i < 29; i += 1) {
      const r = runCli(`§2 批量加属性 ${i + 1}/29`, ['version', 'attr', 'add', `名称=批${i}名 键=bat${i}`, '--yes', ...E], W);
      if (!r.ok) { attrFull = false; break; }
    }
    const full = runCli('§2 第 30 条之后再加（应拒 ATTR_FULL）', ['version', 'attr', 'add', '名称=超条 键=over', '--yes', ...E], { ...W, expectErr: '最多可添加30个属性' });
    record('§2 条数≤30（含可选配置外的全部条目）', attrFull && full.ok);

    // ---- §3 可选配置：固定不支持类型的门禁控制组；正向真网链在 verify-optional-config 覆盖 ----
    const optionGate = runCli('§3 当前类型不支持可选配置（应拒）', ['version', 'option', 'add', '名称=主题 键=theme 方式=文本 默认=dark', '--yes', ...E], { ...W, expectErr: '当前类型不支持可选配置' });
    record('§3 不支持类型能力门禁', optionGate.ok, 'RT006003 不支持可选配置；支持类型的全链见 test/verify-optional-config.mjs');

    // ---- §4 依赖字段 ----
    const depFixturePath = path.join(testRoot, '.freelog-test-resource-pool.local.json');
    if (existsSync(depFixturePath)) {
      const depFixture = JSON.parse(readFileSync(depFixturePath, 'utf8').replace(/^\uFEFF/, ''));
      const target = (depFixture.resources ?? []).find((item) => item.resourceId)
        ?? (depFixture.resources ?? []).find((item) => item.resourceId);
      if (target) {
        const targetId = target.resourceId ?? `${target.owner}/${target.resourceName.split('/').pop()}`;
        record('§4 maxSatisfying 校验', runCli('§4 范围 ^9.0.0 不命中（应拒）', ['version', 'dep', 'add', targetId, '--range', '^9.0.0', '--yes', ...E], { ...W, expectErr: '这个范围对不上对方已发行的版本' }).ok);
        record('§4 validRange 校验', runCli('§4 范围非 semver（应拒）', ['version', 'dep', 'add', targetId, '--range', 'abc..', '--yes', ...E], { ...W, expectErr: '这个范围对不上对方已发行的版本' }).ok);
        const depOk = runCli('§4 默认 ^latest（声明写稿）', ['version', 'dep', 'add', targetId, '--yes', ...E], W);
        record('§4 默认 ^latestVersion 可加', depOk.ok);
        record('§4 不能依赖自己', runCli('§4 自依赖（应拒）', ['version', 'dep', 'add', `${primary.loginName}/fld-${stamp}-main`, '--yes', ...E], { ...W, expectErr: '不能依赖自己' }).ok);
      } else {
        blockedReasons.push('依赖字段验收缺少带 resourceId 的资源池样本。');
        log('BLOCKED: 依赖字段验收缺少带 resourceId 的资源池样本。');
      }
    } else {
      blockedReasons.push('依赖字段验收缺少资源池。');
      log('BLOCKED: 依赖字段验收缺少资源池。');
    }

    // ---- §1 版本号 + R3 关键未知项：140 值平台接受度（真提交 1.0.0）----
    const submit = runCli('R3 create-version --yes（含 140 值属性真提交）', ['create-version', '--yes', ...E], W);
    record('R3 平台接受 140 长度属性值（关键未知项）', submit.ok, submit.ok ? redact(submit.out).slice(0, 60) : '平台拒绝——CLI 需回改 100');
    if (submit.ok) {
      const show = runCli('R3 version show 读回', ['version', 'show', ...E], W);
      record('R3 线上值完整（140 字未截断）', show.ok && readonlyPropertyReadback(show, 'aa3', '值'.repeat(140)), '正常完成后按 aa3 / readonlyText / 完整140字逐项核对');
      const pull = runCli('§1 draft pull', ['version', 'draft', 'pull', '--yes', ...E], W);
      record('§1 draft pull 前置', pull.ok);
      if (pull.ok) {
        record('§1 新号必须 > latest', runCli('§1 新号 ≤ latest（应拒）', ['update-version', '--yes', '--version', '1.0.0', ...E], { ...W, expectErr: '不能发' }).ok);
        record('§1 semver 校验', runCli('§1 非法版本号（应拒）', ['update-version', '--yes', '--version', 'not-semver', ...E], { ...W, expectErr: '版本号' }).ok);
        record('§1 丢弃草稿收尾', runCli('§1 丢弃草稿收尾', ['version', 'draft', 'discard', '--yes', ...E], W).ok);
      }
      const offline = runCli('R5 offline 收尾', ['offline', '--yes', ...E], W);
      record('R5 下架收尾', offline.ok);
    }

    // ---- 汇总 ----
    log('');
    log('=== 汇总 ===');
    let pass = 0;
    for (const r of results) {
      log(`${r.pass ? '✔' : '✘'} ${r.rule}${r.note ? ` —— ${r.note}` : ''}`);
      if (r.pass) pass += 1;
    }
    log(`共 ${results.length} 条，通过 ${pass}，失败 ${results.length - pass}`);
    appendFileSync(reportPath, `${lines.join('\n')}\n\n`, 'utf8');
    log(`报告: ${reportPath}`);

    if (results.some((r) => !r.pass)) {
      process.exitCode = 1;
    } else if (blockedReasons.length) {
      process.exitCode = 3;
    }
    completed = results.every((item) => item.pass) && blockedReasons.length === 0;
  } finally {
    cleanupWorkspace(work, { success: completed, prefixes: ['freelog-field-'], log });
  }
}

main().catch((e) => {
  log(`中止：${e.message}`);
  appendFileSync(reportPath, `${lines.join('\n')}\n\n`, 'utf8');
  console.error(redact(e instanceof Error ? e.stack ?? e.message : String(e)));
  process.exit(2);
});
