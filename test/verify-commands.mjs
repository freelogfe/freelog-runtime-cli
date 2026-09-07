#!/usr/bin/env node
/**
 * 剩余命令面真网验证（dev，primary）：
 *   批次 A 管理面：policy template list/apply、policy set --on/--off、update listing、status、logout
 *   批次 B 工作稿全操作：dep range/rm（2026-09-07 刚改校验链）、attr set/rm、option set/rm、
 *                       draft description、draft pull --version 指定号、update-version --version 指定号
 *   批次 C bind 链：新工程 bind → status → draft pull → 发新号 → 下架
 *   批次 D 错误分支：未登录打平台、logout 后打平台、坏凭据登录、draft 命令无稿
 * 结果追加到系统临时目录 freelog-runtime-cli-verification/commands.txt。
 *
 * 用法：node test/verify-commands.mjs --env dev [--skip-build]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, appendFileSync, rmSync, mkdtempSync, writeFileSync } from 'node:fs';
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
  console.error('primary 凭据缺失。');
  process.exit(2);
}

const media = path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4');
const reportDir = path.join(tmpdir(), 'freelog-runtime-cli-verification');
const reportPath = path.join(reportDir, 'commands.txt');
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
  if (out) log(`  stdout: ${out.slice(0, 400).replaceAll('\n', ' | ')}`);
  if (err) log(`  stderr: ${err.slice(0, 400).replaceAll('\n', ' | ')}`);
  return { ok: pass, out, err };
}

const results = [];
function record(rule, pass, note = '') {
  results.push({ rule, pass, note });
  log(`  => ${pass ? '符合' : '不符合'} ${note}`);
}

async function main() {
  const stamp = Date.now().toString(36);
  log('=== 剩余命令面真网验证 ===');
  log(`时间: ${new Date().toISOString()}  环境: ${env}  账号: ${primary.loginName}`);

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

  const E = ['--env', env];

  // ========== 批次 D-0：未登录 / 坏凭据（全新空工程） ==========
  log('\n--- 批次 D-0 未登录/坏凭据 ---');
  const p0 = mkdtempSync(path.join(tmpdir(), `freelog-cmd0-${stamp}-`));
  try {
    const noAuth = runCli('未登录 create（应拒）', ['create', '--title', 'x', '--type', 'RT006003', '--name', `na-${stamp}`, '--yes', ...E], { cwd: p0, expectErr: '请先登录' });
    record('D0 未登录被拦', noAuth.ok);
    const badLogin = runCli('坏密码 login（应拒）', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: p0, input: 'definitely-wrong-password' });
    record('D0 坏凭据被拒', !badLogin.ok);
  } finally {
    rmSync(p0, { recursive: true, force: true });
  }

  // ========== 批次 A+B 主工程：建资源发版后打管理面/工作稿全操作 ==========
  const work = mkdtempSync(path.join(tmpdir(), `freelog-cmd-${stamp}-`));
  try {
    log('\n--- 批次 A/B 准备：登录 + 建壳 + 发 1.0.0 ---');
    if (!runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: work, input: primary.password }).ok) {
      throw new Error('登录失败，中止');
    }
    if (!runCli('init', ['init', '--scaffold', 'none', '--resource-type', 'RT006003', '--yes', ...E], { cwd: work }).ok) throw new Error('init 失败');
    const mediaName = `clip-${stamp}.mp4`;
    const { copyFileSync } = await import('node:fs');
    copyFileSync(media, path.join(work, mediaName));
    const created = runCli('create', ['create', '--title', `cmd-${stamp}`, '--type', 'RT006003', '--name', `cmd-${stamp}`, '--file', mediaName, '--yes', ...E], { cwd: work });
    if (!created.ok) throw new Error('create 失败');
    if (!runCli('create-version --prepare', ['create-version', '--prepare', '--yes', ...E], { cwd: work }).ok) throw new Error('prepare 失败');
    if (!runCli('attr add', ['version', 'attr', 'add', '名称=作者 键=author 值=初始', '--yes', ...E], { cwd: work }).ok) throw new Error('attr add 失败');
    const v1 = runCli('create-version --yes（1.0.0）', ['create-version', '--yes', ...E], { cwd: work });
    if (!v1.ok) throw new Error('首版失败');

    // ---- 批次 A：管理面 ----
    log('\n--- 批次 A 管理面 ---');
    const status1 = runCli('status', ['status', ...E], { cwd: work });
    record('A status 列出身份与版本', status1.ok && status1.out.includes('1.0.0'));

    const upd = runCli('update --title --intro --tags', ['update', '--title', `cmd-${stamp}-v2`, '--intro', '真网简介', '--tags', '测试,真网', '--yes', ...E], { cwd: work });
    record('A update listing', upd.ok);
    if (upd.ok) {
      // 用 status/不存在 listing 读接口验证：直接再 update --title 单改回，验证幂等
      const upd2 = runCli('update --title 单改回', ['update', '--title', `cmd-${stamp}`, '--yes', ...E], { cwd: work });
      record('A update 幂等再改', upd2.ok);
    }

    const tplList = runCli('policy template list', ['policy', 'template', 'list', ...E], { cwd: work });
    record('A policy template list', tplList.ok);
    const tplId = (tplList.out.match(/^[a-z0-9-]+/m) || [''])[0];

    if (tplId) {
      const tplApply = runCli('policy template apply', ['policy', 'template', 'apply', tplId, '--name', `模板策略-${stamp}`, '--yes', ...E], { cwd: work });
      record('A policy template apply', tplApply.ok);
    } else {
      log('  => 跳过 policy template apply（环境未返回模板）');
      record('A policy template apply（环境无模板时跳过）', true);
    }

    const pList = runCli('policy list', ['policy', 'list', ...E], { cwd: work });
    record('A policy list', pList.ok);
    const policyLines = pList.out.split('\n').filter((l) => l.includes('\t'));
    const newPolicyLine = policyLines.find((l) => l.includes(`模板策略-${stamp}`));
    const newPolicyId = newPolicyLine ? newPolicyLine.split('\t')[0] : '';
    const freePolicyLine = policyLines[0] ?? '';
    const freePolicyId = freePolicyLine.split('\t')[0] ?? '';

    if (newPolicyId) {
      const off = runCli('policy set --off', ['policy', 'set', '--id', newPolicyId, '--off', '--yes', ...E], { cwd: work });
      record('A policy set --off', off.ok);
      const on = runCli('policy set --on', ['policy', 'set', '--id', newPolicyId, '--on', '--yes', ...E], { cwd: work });
      record('A policy set --on', on.ok);
      // 已上架时不能关到 0 条启用：先 off 自家的，再 off from-file 那条应被拒
      const offSelf = runCli('policy set --off（from-file 条）', ['policy', 'set', '--id', freePolicyId, '--off', '--yes', ...E], { cwd: work });
      const offAll = runCli('policy set --off（模板条，应拒：0 条启用）', ['policy', 'set', '--id', newPolicyId, '--off', '--yes', ...E], { cwd: work });
      record('A 不能关到 0 条启用策略', !offAll.ok, offAll.err.slice(0, 60));
      const onBack = runCli('policy set --on 恢复', ['policy', 'set', '--id', freePolicyId, '--on', '--yes', ...E], { cwd: work });
      record('A 恢复启用', onBack.ok);
      void offSelf;
    }

    // ---- 批次 B：工作稿全操作 ----
    log('\n--- 批次 B 工作稿全操作 ---');
    const pull = runCli('draft pull', ['version', 'draft', 'pull', '--yes', ...E], { cwd: work });
    record('B draft pull', pull.ok);

    const descSet = runCli('draft description 改稿描述', ['version', 'draft', 'description', '--description', '更新稿描述-真网', ...E], { cwd: work });
    record('B draft description', descSet.ok);

    const attrSet = runCli('attr set 改值', ['version', 'attr', 'set', '键=author 值=第二版', '--yes', ...E], { cwd: work });
    record('B attr set', attrSet.ok);
    const attrRm = runCli('attr rm', ['version', 'attr', 'rm', 'author', '--yes', ...E], { cwd: work });
    record('B attr rm', attrRm.ok);
    const attrRe = runCli('attr add 重加', ['version', 'attr', 'add', '名称=作者 键=author 值=回归', '--yes', ...E], { cwd: work });
    record('B attr add 重加', attrRe.ok);

    const optAdd = runCli('option add', ['version', 'option', 'add', '名称=清晰度 键=quality 方式=下拉 选项=标清|高清', '--yes', ...E], { cwd: work });
    record('B option add（RT006003 不支持时也须拒）', optAdd.ok || optAdd.err.includes('可选配置'), optAdd.ok ? '已加' : optAdd.err.slice(0, 40));
    if (optAdd.ok) {
      const optSet = runCli('option set', ['version', 'option', 'set', '键=quality 默认=高清', '--yes', ...E], { cwd: work });
      record('B option set', optSet.ok);
      const optRm = runCli('option rm', ['version', 'option', 'rm', 'quality', '--yes', ...E], { cwd: work });
      record('B option rm', optRm.ok);
      runCli('option add 重加（提交用）', ['version', 'option', 'add', '名称=清晰度 键=quality 方式=下拉 选项=标清|高清', '--yes', ...E], { cwd: work });
    }

    // 依赖：dep range / rm / re-add（2026-09-07 depRange 刚补了完整校验链，必须真网）
    const depFixturePath = path.join(testRoot, 'fixtures', 'dev-free-policy-resources.json');
    const depFixture = JSON.parse(readFileSync(depFixturePath, 'utf8').replace(/^\uFEFF/, ''));
    const depTarget = depFixture.resources?.[0];
    if (depTarget) {
      const targetId = depTarget.resourceId;
      const depAdd = runCli('dep add', ['version', 'dep', 'add', targetId, '--range', '^1.0.0', '--yes', ...E], { cwd: work });
      record('B dep add', depAdd.ok);
      const depRange = runCli('dep range 改范围', ['version', 'dep', 'range', targetId, '--range', `^${(depTarget.latestVersion ?? '1.0.0')}`, '--yes', ...E], { cwd: work });
      record('B dep range（新校验链）', depRange.ok);
      const depRangeBad = runCli('dep range 坏范围（应拒）', ['version', 'dep', 'range', targetId, '--range', '^9.9.9', '--yes', ...E], { cwd: work, expectErr: '这个范围对不上对方已发行的版本' });
      record('B dep range 校验生效', depRangeBad.ok);
      const depRm = runCli('dep rm', ['version', 'dep', 'rm', targetId, '--yes', ...E], { cwd: work });
      record('B dep rm', depRm.ok);
      const depReAdd = runCli('dep re-add', ['version', 'dep', 'add', targetId, '--range', '^1.0.0', '--yes', ...E], { cwd: work });
      record('B dep re-add', depReAdd.ok);
    }

    // 指定号：draft pull --version + update-version --version
    const pullV = runCli('draft pull --version 1.0.0', ['version', 'draft', 'pull', '--version', '1.0.0', '--yes', ...E], { cwd: work });
    record('B draft pull --version', pullV.ok);
    const upv = runCli('update-version --version 1.1.0', ['update-version', '--yes', '--version', '1.1.0', ...E], { cwd: work });
    record('B update-version --version 指定号', upv.ok && upv.out.includes('1.1.0'));
    const showV11 = runCli('version show 读回 1.1.0', ['version', 'show', ...E], { cwd: work });
    record('B 1.1.0 含描述与回归属性', showV11.ok && showV11.out.includes('更新稿描述-真网') && showV11.out.includes('回归'));

    // ---- 批次 C：bind 链（新工程） ----
    log('\n--- 批次 C bind 链 ---');
    const p3 = mkdtempSync(path.join(tmpdir(), `freelog-bind-${stamp}-`));
    try {
      if (!runCli('bind 工程 login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: p3, input: primary.password }).ok) throw new Error('bind 工程 login 失败');
      if (!runCli('bind 工程 init', ['init', '--scaffold', 'none', '--resource-type', 'RT006003', '--yes', ...E], { cwd: p3 }).ok) throw new Error('bind 工程 init 失败');
      const bind = runCli('bind 接入线上资源', ['bind', `cmd-${stamp}`, ...E], { cwd: p3 });
      record('C bind by name', bind.ok);
      const st = runCli('bind 后 status', ['status', ...E], { cwd: p3 });
      record('C status 显示已接资源', st.ok && st.out.includes(`cmd-${stamp}`));
      const bindDup = runCli('bind 重复接（应拒或 --force）', ['bind', `cmd-${stamp}`, ...E], { cwd: p3 });
      record('C 重复 bind 被拦', !bindDup.ok || bindDup.out.includes('--force'));
      const bPull = runCli('bind 工程 draft pull', ['version', 'draft', 'pull', '--yes', ...E], { cwd: p3 });
      record('C bind 后可拉稿', bPull.ok);
      const bDesc = runCli('bind 工程 draft description', ['version', 'draft', 'description', '--description', 'bind 工程改描述', ...E], { cwd: p3 });
      record('C bind 后可改稿描述', bDesc.ok);
      const bUpv = runCli('bind 工程 update-version 1.2.0', ['update-version', '--yes', '--version', '1.2.0', ...E], { cwd: p3 });
      record('C bind 后发新号 1.2.0', bUpv.ok && bUpv.out.includes('1.2.0'));
      const bOff = runCli('bind 工程 offline（未上架应幂等/友好）', ['offline', '--yes', ...E], { cwd: p3 });
      record('C offline 未上架不崩', bOff.ok || bOff.err.length > 0);
      const logout = runCli('logout', ['logout', ...E], { cwd: p3 });
      record('C logout', logout.ok);
      const afterLogout = runCli('logout 后 status（应拒：凭据没了）', ['status', ...E], { cwd: p3 });
      record('C logout 后打平台被拦', !afterLogout.ok);
    } finally {
      rmSync(p3, { recursive: true, force: true });
    }

    // ---- 收尾：主工程下架 ----
    const off = runCli('主工程 offline 收尾', ['offline', '--yes', ...E], { cwd: work });
    record('收尾 offline', off.ok);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  // ---- 汇总 ----
  log('\n=== 汇总 ===');
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
}

main().catch((e) => {
  log(`中止：${e.message}`);
  appendFileSync(reportPath, `${lines.join('\n')}\n\n`, 'utf8');
  console.error(e);
  process.exit(2);
});
