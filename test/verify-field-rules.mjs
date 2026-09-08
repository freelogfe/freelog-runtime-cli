#!/usr/bin/env node
/**
 * 字段级校验逐条真网验证（对照 业务梳理/字段级校验对照表.md）。
 * 用 primary 账号在 --env dev（或 test）上把每条校验规则真实打一遍：
 * 客户端规则验证 CLI 拒绝行为与报错文案；服务端规则（140 值平台接受度）用真提交验证。
 * 结果追加到系统临时目录 freelog-runtime-cli-verification/field-rules.txt。
 *
 * 用法：node test/verify-field-rules.mjs --env dev [--skip-build]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envArg = process.argv.find((a) => a === '--env test' || a === '--env dev');
const env = envArg ? envArg.split(' ')[1] : 'dev';
const skipBuild = process.argv.includes('--skip-build');

if (env === 'prod') {
  console.error('production 硬禁用。');
  process.exit(2);
}

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(testRoot);
const cliBin = path.join(repoRoot, 'packages/cli/dist/bin/index.js');
if (!existsSync(cliBin)) {
  console.error(`缺少 CLI 构建产物：${cliBin}（先 pnpm build 或去掉 --skip-build）`);
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

const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'field-rules.txt');
mkdirSync(reportDir, { recursive: true });

const lines = [];
function log(line) {
  console.log(line);
  lines.push(line);
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
  const pass = expectErr !== undefined ? res.status !== 0 && err.includes(expectErr) : res.status === 0;
  log(`${pass ? 'PASS' : 'FAIL'} ${label} (exit ${res.status})`);
  if (out) log(`  stdout: ${out.slice(0, 500).replaceAll('\n', ' | ')}`);
  if (err) log(`  stderr: ${err.slice(0, 500).replaceAll('\n', ' | ')}`);
  return { ok: pass, out, err };
}

const results = [];
function record(rule, pass, note = '') {
  results.push({ rule, pass, note });
  log(`  => ${pass ? '符合' : '不符合'} ${note}`);
}

async function main() {
  const stamp = Date.now().toString(36);
  log('=== 字段级校验逐条真网验证 ===');
  log(`时间: ${new Date().toISOString()}`);
  log(`环境: ${env}  账号: ${primary.loginName} / ******`);

  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot, encoding: 'utf8', shell: process.platform === 'win32',
    });
    if (build.status !== 0) {
      console.error(build.stdout + build.stderr);
      process.exit(2);
    }
    log('build 完成');
  }

  const work = path.join(tmpdir(), `freelog-field-${stamp}`);
  mkdirSync(work, { recursive: true });
  const E = ['--env', env];
  const W = { cwd: work };

  try {
    // ---- R0 登录（凭据落工程）----
    const login = runCli('R0 login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { ...W, input: primary.password });
    if (!login.ok) throw new Error('登录失败，中止');

    const init = runCli('R0 init 工程', ['init', '.', '--type', 'RT001', '--yes', ...E], W);
    if (!init.ok) throw new Error('init 失败，中止');

    // ---- §5 资源创建字段 ----
    runCli('§5-1 create 标题空（应拒）', ['create', '--type', 'RT001', '--name', `fld-${stamp}-a`, '--yes', ...E], { ...W, expectErr: '请输入资源标题' })
      .ok && record('§5-1 标题必填', true);
    runCli('§5-1 标题 101 字（应拒）', ['create', '--title', '标'.repeat(101), '--type', 'RT001', '--name', `fld-${stamp}-b`, '--yes', ...E], { ...W, expectErr: '不超过100个字符' })
      .ok && record('§5-1 标题≤100', true);
    const titleOk = runCli('§5-1 标题恰好 100 字（真建壳）', ['create', '--title', '标'.repeat(100), '--type', 'RT001', '--name', `fld-${stamp}-main`, '--yes', ...E], W);
    record('§5-1 标题 100 字平台接受', titleOk.ok);
    if (!titleOk.ok) throw new Error('建壳失败，中止');

    runCli('§5-2 授权标识已存在（应拒）', ['create', '--title', 'dup', '--type', 'RT001', '--name', `fld-${stamp}-main`, '--yes', ...E], { ...W, expectErr: '已被使用' })
      .ok && record('§5-2 标识查重', true);

    // ---- 首版稿（RT001 主题：目录内容打 zip）----
    const media = path.join(testRoot, 'fixtures', 'theme-artifact');
    const prep2 = runCli('R1 create-version --prepare（真目录）', ['create-version', '--prepare', '--artifact', media, ...E], W);
    if (!prep2.ok) throw new Error('prepare 失败，中止');

    // ---- §2 自定义属性字段 ----
    runCli('§2 名称 51 字（应拒）', ['version', 'attr', 'add', `名称=${'长'.repeat(51)} 键=aa1`, '--yes', ...E], { ...W, expectErr: '名称不能超过50个字符' })
      .ok && record('§2 名称≤50', true);
    runCli('§2 键数字开头（应拒）', ['version', 'attr', 'add', '名称=合法名 键=1abc', '--yes', ...E], { ...W, expectErr: '请输入英文字母' })
      .ok && record('§2 键正则', true);
    runCli('§2 键 31 字（应拒）', ['version', 'attr', 'add', `名称=合法名 键=${'k'.repeat(31)}`, '--yes', ...E], { ...W, expectErr: '长度不能超过30个字符' })
      .ok && record('§2 键≤30', true);
    runCli('§2 说明 51 字（应拒）', ['version', 'attr', 'add', `名称=合法名 键=aa2 说明=${'说'.repeat(51)}`, '--yes', ...E], { ...W, expectErr: '不能超过50个字符' })
      .ok && record('§2 说明≤50', true);
    runCli('§2 值 141 字（应拒）', ['version', 'attr', 'add', `名称=合法名 键=aa3 值=${'值'.repeat(141)}`, '--yes', ...E], { ...W, expectErr: '自定义属性值最长 140' })
      .ok && record('§2 值≤140（客户端）', true);
    const v140 = runCli('§2 值恰好 140 字（写稿）', ['version', 'attr', 'add', `名称=值一百四 键=aa3 值=${'值'.repeat(140)}`, '--yes', ...E], W);
    record('§2 值 140 可写入工作稿', v140.ok);
    runCli('§2 名称与已有条目撞（应拒）', ['version', 'attr', 'add', '名称=值一百四 键=aa4', '--yes', ...E], { ...W, expectErr: '名称已存在' })
      .ok && record('§2 名称查重（2026-09-07 新增）', true);
    let attrFull = true;
    for (let i = 0; i < 29; i += 1) {
      const r = runCli(`§2 批量加属性 ${i + 1}/29`, ['version', 'attr', 'add', `名称=批${i}名 键=bat${i}`, '--yes', ...E], W);
      if (!r.ok) { attrFull = false; break; }
    }
    const full = runCli('§2 第 30 条之后再加（应拒 ATTR_FULL）', ['version', 'attr', 'add', '名称=超条 键=over', '--yes', ...E], { ...W, expectErr: '最多可添加30个属性' });
    record('§2 条数≤30（含可选配置外的全部条目）', attrFull && full.ok);

    // ---- §3 可选配置字段 ----
    runCli('§3 文本默认 141（应拒）', ['version', 'option', 'add', `名称=配一 键=op1 方式=文本 默认=${'默'.repeat(141)}`, '--yes', ...E], { ...W, expectErr: '不超过140个字符' })
      .ok && record('§3 文本默认≤140', true);
    runCli('§3 下拉选项重复（应拒）', ['version', 'option', 'add', '名称=配二 键=op2 方式=下拉 选项=中文|中文', '--yes', ...E], { ...W, expectErr: '该选项已存在' })
      .ok && record('§3 选项去重', true);
    runCli('§3 下拉写默认（应拒）', ['version', 'option', 'add', '名称=配三 键=op3 方式=下拉 选项=中文|英文 默认=英文', '--yes', ...E], { ...W, expectErr: '下拉默认值固定为第一项' })
      .ok && record('§3 下拉默认=第一项', true);
    runCli('§3 名称与属性撞（应拒）', ['version', 'option', 'add', '名称=值一百四 键=op4 方式=文本', '--yes', ...E], { ...W, expectErr: '名称已存在' })
      .ok && record('§3 名称查重（2026-09-07 新增）', true);
    const opts31 = Array.from({ length: 31 }, (_, i) => `项${i}`).join('|');
    runCli('§3 下拉 31 项（应拒）', ['version', 'option', 'add', `名称=配五 键=op5 方式=下拉 选项=${opts31}`, '--yes', ...E], { ...W, expectErr: '选项个数不能超过30项' })
      .ok && record('§3 选项≤30', true);
    const optOk = runCli('§3 正常下拉（写稿）', ['version', 'option', 'add', '名称=配六 键=op6 方式=下拉 选项=中文|英文', '--yes', ...E], W);
    record('§3 合法可选配置可写入', optOk.ok);

    // ---- §4 依赖字段 ----
    const depFixturePath = path.join(testRoot, 'fixtures', 'dev-free-policy-resources.json');
    if (existsSync(depFixturePath)) {
      const depFixture = JSON.parse(readFileSync(depFixturePath, 'utf8').replace(/^\uFEFF/, ''));
      const target = (depFixture.resources ?? [])[0];
      if (target) {
        const targetId = target.resourceId ?? `${target.owner}/${target.resourceName.split('/').pop()}`;
        runCli('§4 范围 ^9.0.0 不命中（应拒）', ['version', 'dep', 'add', targetId, '--range', '^9.0.0', '--yes', ...E], { ...W, expectErr: '这个范围对不上对方已发行的版本' })
          .ok && record('§4 maxSatisfying 校验', true);
        runCli('§4 范围非 semver（应拒）', ['version', 'dep', 'add', targetId, '--range', 'abc..', '--yes', ...E], { ...W, expectErr: '这个范围对不上对方已发行的版本' })
          .ok && record('§4 validRange 校验', true);
        const depOk = runCli('§4 默认 ^latest（签约+写稿）', ['version', 'dep', 'add', targetId, '--yes', ...E], W);
        record('§4 默认 ^latestVersion 可加', depOk.ok);
        runCli('§4 自依赖（应拒）', ['version', 'dep', 'add', `${primary.loginName}/fld-${stamp}-main`, '--yes', ...E], { ...W, expectErr: '不能依赖自己' });
        record('§4 不能依赖自己', true);
      }
    } else {
      log('（缺依赖 fixture，§4 跳过）');
    }

    // ---- §1 版本号 + R3 关键未知项：140 值平台接受度（真提交 1.0.0）----
    const submit = runCli('R3 create-version --yes（含 140 值属性真提交）', ['create-version', '--yes', ...E], W);
    record('R3 平台接受 140 长度属性值（关键未知项）', submit.ok, submit.ok ? submit.out.slice(0, 60) : '平台拒绝——CLI 需回改 100');
    if (submit.ok) {
      const show = runCli('R3 version show 读回', ['version', 'show', ...E], W);
      const m = (show.out.match(/"defaultValue":\s*"(值+)"/) || [])[1] ?? (show.out.match(/"(值{20,})"/) || [])[1];
      record('R3 线上值完整（140 字未截断）', m ? m.length === 140 : false, m ? `读回 ${m.length} 字` : '未读到');
      const pull = runCli('§1 draft pull', ['version', 'draft', 'pull', '--yes', ...E], W);
      if (pull.ok) {
        runCli('§1 新号 ≤ latest（应拒）', ['update-version', '--yes', '--version', '1.0.0', ...E], { ...W, expectErr: '不能发' })
          .ok && record('§1 新号必须 > latest', true);
        runCli('§1 非法版本号（应拒）', ['update-version', '--yes', '--version', 'not-semver', ...E], { ...W, expectErr: '版本号' })
          .ok && record('§1 semver 校验', true);
        runCli('§1 丢弃草稿收尾', ['version', 'draft', 'discard', '--yes', ...E], W);
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
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((e) => {
  log(`中止：${e.message}`);
  appendFileSync(reportPath, `${lines.join('\n')}\n\n`, 'utf8');
  console.error(e);
  process.exit(2);
});
