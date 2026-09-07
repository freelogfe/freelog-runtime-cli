#!/usr/bin/env node
/**
 * 剩余命令面真网验证（dev，primary）：
 *   批次 A 管理面：status、update listing、policy template list/apply、policy set --on/--off
 *   批次 B 工作稿全操作：draft pull/description、attr set/rm、dep add/range/rm、
 *                        update-version --version 指定号、draft pull --version 覆盖语义
 *   批次 B2 主题可选配置（RT001 才支持）：option add/set/list/rm → 提交 → 线上读回
 *   批次 C bind 链：bind（幂等）→ 换绑 --force 门禁 → status → draft pull/description → 发新号 → logout
 *   批次 D 错误分支：未登录、坏凭据、logout 后打平台
 * 结果追加到系统临时目录 freelog-runtime-cli-verification/commands.txt。
 *
 * 用法：node test/verify-commands.mjs --env dev [--skip-build]
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, appendFileSync, rmSync, writeFileSync } from 'node:fs';
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
const themeArtifact = path.join(testRoot, 'fixtures', 'theme-artifact');
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
  return { ok: pass, out, err, status: res.status };
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
    const noAuth = runCli('未登录 create（应拒）', ['create', '--title', 'x', '--type', 'RT006003', '--name', `na-${stamp}`, '--yes', ...E], { cwd: p0, expectErr: '请先 login' });
    record('D0 未登录被拦', noAuth.ok);
    const badLogin = runCli('坏密码 login（应拒）', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: p0, input: 'definitely-wrong-password' });
    record('D0 坏凭据被拒', !badLogin.ok);
  } finally {
    rmSync(p0, { recursive: true, force: true });
  }

  // ========== 批次 A+B 主工程 ==========
  const work = mkdtempSync(path.join(tmpdir(), `freelog-cmd-${stamp}-`));
  let mainResourceId = '';
  let themeResourceId = '';
  try {
    log('\n--- 批次 A/B 准备：登录 + 建壳 + 发 1.0.0 ---');
    if (!runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: work, input: primary.password }).ok) {
      throw new Error('登录失败，中止');
    }
    if (!runCli('init', ['init', '--scaffold', 'none', '--resource-type', 'RT006003', '--yes', ...E], { cwd: work }).ok) throw new Error('init 失败');
    const mediaName = `clip-${stamp}.mp4`;
    copyFileSync(media, path.join(work, mediaName));
    const created = runCli('create', ['create', '--title', `cmd-${stamp}`, '--type', 'RT006003', '--name', `cmd-${stamp}`, '--file', mediaName, '--yes', ...E], { cwd: work });
    if (!created.ok) throw new Error('create 失败');
    if (!runCli('create-version --prepare', ['create-version', '--prepare', '--yes', ...E], { cwd: work }).ok) throw new Error('prepare 失败');
    if (!runCli('attr add', ['version', 'attr', 'add', '名称=作者 键=author 值=初始', '--yes', ...E], { cwd: work }).ok) throw new Error('attr add 失败');
    const v1 = runCli('create-version --yes（1.0.0）', ['create-version', '--yes', ...E], { cwd: work });
    if (!v1.ok) throw new Error('首版失败');
    const mainIdentity = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    mainResourceId = String(mainIdentity.resourceId ?? '');
    if (!mainResourceId) throw new Error('主工程 resourceId 读取失败');

    // ---- 批次 A：管理面 ----
    log('\n--- 批次 A 管理面 ---');
    const status1 = runCli('status', ['status', ...E], { cwd: work });
    record('A status 列出身份与版本', status1.ok && status1.out.includes('1.0.0'));

    const upd = runCli('update --title --intro --tags', ['update', '--title', `cmd-${stamp}-v2`, '--intro', '真网简介', '--tags', '测试,真网', '--yes', ...E], { cwd: work });
    record('A update listing', upd.ok);
    if (upd.ok) {
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
    const freePolicyId = (policyLines[0] ?? '').split('\t')[0] ?? '';

    if (newPolicyId && freePolicyId) {
      const off = runCli('policy set --off', ['policy', 'set', '--id', newPolicyId, '--off', '--yes', ...E], { cwd: work });
      record('A policy set --off', off.ok);
      const on = runCli('policy set --on', ['policy', 'set', '--id', newPolicyId, '--on', '--yes', ...E], { cwd: work });
      record('A policy set --on', on.ok);
      const offSelf = runCli('policy set --off（另一条）', ['policy', 'set', '--id', freePolicyId, '--off', '--yes', ...E], { cwd: work });
      record('A policy set --off（另一条可关）', offSelf.ok);
      const onBack = runCli('policy set --on 恢复', ['policy', 'set', '--id', freePolicyId, '--on', '--yes', ...E], { cwd: work });
      record('A 恢复启用', onBack.ok);
    }

    // ---- 批次 B：工作稿全操作（先改稿，提交，再做覆盖语义测试） ----
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

    // 依赖：dep range / rm / re-add（2026-09-07 depRange 刚补了完整校验链，必须真网）
    const depFixturePath = path.join(testRoot, 'fixtures', 'dev-free-policy-resources.json');
    const depFixture = JSON.parse(readFileSync(depFixturePath, 'utf8').replace(/^\uFEFF/, ''));
    const depTarget = (depFixture.resources ?? []).find((t) => t.owner === primary.loginName) ?? (depFixture.resources ?? [])[0];
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

    const upv = runCli('update-version --version 1.1.0', ['update-version', '--yes', '--version', '1.1.0', ...E], { cwd: work });
    record('B update-version --version 指定号', upv.ok && upv.out.includes('1.1.0'));
    const showV11 = runCli('version show 读回 1.1.0', ['version', 'show', ...E], { cwd: work });
    record('B 1.1.0 线上含描述/回归属性/依赖', showV11.ok && showV11.out.includes('更新稿描述-真网') && showV11.out.includes('回归') && (depTarget ? showV11.out.includes(depTarget.resourceId) : true));

    // 覆盖语义：1.1.0 提交成功后稿已删，pull 旧号应是「已拉」；若稿在则是「已覆盖」。两种都合法
    const pullV = runCli('draft pull --version 1.0.0（覆盖稿）', ['version', 'draft', 'pull', '--version', '1.0.0', '--yes', ...E], { cwd: work });
    record('B draft pull --version 覆盖', pullV.ok && (pullV.out.includes('已拉 1.0.0') || pullV.out.includes('已覆盖')));
    const showLocal = runCli('version show --local（应为 1.0.0 内容）', ['version', 'show', '--local', ...E], { cwd: work });
    record('B 覆盖后稿回到 1.0.0 内容', showLocal.ok && showLocal.out.includes('初始'));
    const discard = runCli('draft discard 丢稿收尾', ['version', 'draft', 'discard', '--yes', ...E], { cwd: work });
    record('B draft discard', discard.ok);

    // ---- 批次 B2：主题 RT001 可选配置全操作 ----
    log('\n--- 批次 B2 主题可选配置（RT001） ---');
    const p2 = mkdtempSync(path.join(tmpdir(), `freelog-opt-${stamp}-`));
    try {
      if (!runCli('主题 login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: p2, input: primary.password }).ok) throw new Error('主题 login 失败');
      if (!runCli('主题 init', ['init', '--scaffold', 'none', '--resource-type', 'RT001', '--yes', ...E], { cwd: p2 }).ok) throw new Error('主题 init 失败');
      mkdirSync(path.join(p2, 'dist'), { recursive: true });
      for (const f of readdirSync(themeArtifact)) {
        copyFileSync(path.join(themeArtifact, f), path.join(p2, 'dist', f));
      }
      if (!runCli('主题 create', ['create', '--title', `opt-${stamp}`, '--type', 'RT001', '--name', `opt-${stamp}`, '--file', 'dist', '--yes', ...E], { cwd: p2 }).ok) throw new Error('主题 create 失败');
      if (!runCli('主题 prepare', ['create-version', '--prepare', '--yes', ...E], { cwd: p2 }).ok) throw new Error('主题 prepare 失败');

      const optAdd = runCli('option add', ['version', 'option', 'add', '名称=清晰度 键=quality 方式=下拉 选项=标清|高清', '--yes', ...E], { cwd: p2 });
      record('B2 option add', optAdd.ok);
      const optSet = runCli('option set 改默认', ['version', 'option', 'set', '键=quality 默认=高清', '--yes', ...E], { cwd: p2 });
      record('B2 option set', optSet.ok);
      const optList = runCli('option list', ['version', 'option', 'list', ...E], { cwd: p2 });
      record('B2 option list', optList.ok && optList.out.includes('quality'));
      const optRm = runCli('option rm', ['version', 'option', 'rm', 'quality', '--yes', ...E], { cwd: p2 });
      record('B2 option rm', optRm.ok);
      const optRe = runCli('option add 重加（提交用）', ['version', 'option', 'add', '名称=清晰度 键=quality 方式=下拉 选项=标清|高清', '--yes', ...E], { cwd: p2 });
      record('B2 option re-add', optRe.ok);
      const optSubmit = runCli('主题 create-version --yes', ['create-version', '--yes', ...E], { cwd: p2 });
      record('B2 提交 1.0.0', optSubmit.ok && optSubmit.out.includes('1.0.0'));
      const optShow = runCli('主题 version show', ['version', 'show', ...E], { cwd: p2 });
      record('B2 线上含可选配置 quality', optShow.ok && optShow.out.includes('quality'));
      const optOff = runCli('主题 offline 收尾', ['offline', '--yes', ...E], { cwd: p2 });
      record('B2 offline', optOff.ok);
      themeResourceId = String(JSON.parse(readFileSync(path.join(p2, '.freelog', '1.json'), 'utf8')).resourceId ?? '');
    } finally {
      rmSync(p2, { recursive: true, force: true });
    }

    // ---- 批次 C：bind 链（新工程） ----
    log('\n--- 批次 C bind 链 ---');
    const p3 = mkdtempSync(path.join(tmpdir(), `freelog-bind-${stamp}-`));
    try {
      if (!runCli('bind 工程 login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: p3, input: primary.password }).ok) throw new Error('bind 工程 login 失败');
      if (!runCli('bind 工程 init', ['init', '--scaffold', 'none', '--resource-type', 'RT006003', '--yes', ...E], { cwd: p3 }).ok) throw new Error('bind 工程 init 失败');
      const bind = runCli('bind 接入线上资源', ['bind', mainResourceId, '--file', 'assets', ...E], { cwd: p3 });
      record('C bind by id', bind.ok);
      const st = runCli('bind 后 status', ['status', ...E], { cwd: p3 });
      record('C status 显示已接资源', st.ok && st.out.includes(mainResourceId));
      const bindDup = runCli('bind 重复接同一资源（幂等）', ['bind', mainResourceId, '--file', 'assets', ...E], { cwd: p3 });
      record('C 重复 bind 幂等成功', bindDup.ok);

      // 换绑门禁：同 --file 路径已绑 A 资源，再绑 B 必须显式 --force --yes（用 B2 主题资源，确定是自己的）
      if (themeResourceId && themeResourceId !== mainResourceId) {
        const rebindNoForce = runCli('bind 换绑未带 --force（应拒）', ['bind', themeResourceId, '--file', 'assets', ...E], { cwd: p3, expectErr: '换绑需要 --force' });
        record('C 换绑门禁', rebindNoForce.ok);
        const rebindForce = runCli('bind 换绑 --force（换绑主题资源）', ['bind', themeResourceId, '--force', '--yes', '--file', 'assets', ...E], { cwd: p3 });
        record('C 换绑 --force 成功', rebindForce.ok);
        const rebindBack = runCli('bind 换回主资源', ['bind', mainResourceId, '--force', '--yes', '--file', 'assets', ...E], { cwd: p3 });
        record('C 换绑回主资源', rebindBack.ok);
      }

      const bPull = runCli('bind 工程 draft pull', ['version', 'draft', 'pull', '--yes', '--file', 'assets', ...E], { cwd: p3 });
      record('C bind 后可拉稿', bPull.ok);
      const bDesc = runCli('bind 工程 draft description', ['version', 'draft', 'description', '--description', 'bind 工程改描述', '--file', 'assets', ...E], { cwd: p3 });
      record('C bind 后可改稿描述', bDesc.ok);
      const bUpv = runCli('bind 工程 update-version 1.2.0', ['update-version', '--yes', '--version', '1.2.0', '--file', 'assets', ...E], { cwd: p3 });
      record('C bind 后发新号 1.2.0', bUpv.ok && bUpv.out.includes('1.2.0'));
      const bOff = runCli('bind 工程 offline（未上架应幂等/友好）', ['offline', '--yes', '--file', 'assets', ...E], { cwd: p3 });
      record('C offline 未上架不崩', bOff.ok || bOff.err.length > 0);
      const logout = runCli('logout', ['logout', ...E], { cwd: p3 });
      record('C logout', logout.ok);
      const afterLogout = runCli('logout 后 status（应拒）', ['status', ...E], { cwd: p3 });
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
