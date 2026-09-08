#!/usr/bin/env node
/**
 * 设计场景边角真网验证（dev，primary）：补 verify-commands.mjs 未覆盖的 S 场景。
 *   批次 E：version description --version（S16 改已发号描述，不发新号）
 *           version set --file（S39 只改 filePath 记录）
 *           update-version --reuse-version（S13/S19 续用旧底）
 *           update-version --version+--bump 冲突拒绝（S17）
 *           update-version 对不上底（S19：稿来自 1.0.0，latest 已是更高）
 *           draft pull 不存在的号（S11：「没有这个版本」，不写盘）
 *           create 重复建壳（S3）
 *           template list / type list / type search / type info（S41 / 只读命令）
 *           status --json（--json 模式）
 * 结果追加到系统临时目录 freelog-runtime-cli-verification/scenarios.txt。
 *
 * 用法：node test/verify-scenarios.mjs --env dev [--skip-build]
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
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
const reportPath = path.join(reportDir, 'scenarios.txt');
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
  if (out) log(`  stdout: ${out.slice(0, 300).replaceAll('\n', ' | ')}`);
  if (err) log(`  stderr: ${err.slice(0, 300).replaceAll('\n', ' | ')}`);
  return { ok: pass, out, err, status: res.status };
}

const results = [];
function record(rule, pass, note = '') {
  results.push({ rule, pass, note });
  log(`  => ${pass ? '符合' : '不符合'} ${note}`);
}

async function main() {
  const stamp = Date.now().toString(36);
  log('=== 设计场景边角真网验证（S11/S13/S16/S17/S19/S3/S39/S41 + 只读命令） ===');
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
  const work = mkdtempSync(path.join(tmpdir(), `freelog-sc-${stamp}-`));
  try {
    log('\n--- 准备：登录 + 建壳 + 发 1.0.0 + 1.1.0 ---');
    if (!runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', ...E], { cwd: work, input: primary.password }).ok) throw new Error('登录失败');
    if (!runCli('init', ['init', '.', '--type', 'RT006003', '--yes', ...E], { cwd: work }).ok) throw new Error('init 失败');
    copyFileSync(media, path.join(work, `clip-${stamp}.mp4`));
    if (!runCli('create', ['create', '--title', `sc-${stamp}`, '--type', 'RT006003', '--name', `sc-${stamp}`, '--file', `clip-${stamp}.mp4`, '--yes', ...E], { cwd: work }).ok) throw new Error('create 失败');
    if (!runCli('备稿', ['create-version', '--prepare', '--yes', ...E], { cwd: work }).ok) throw new Error('prepare 失败');
    if (!runCli('attr add', ['version', 'attr', 'add', '名称=作者 键=author 值=一版', '--yes', ...E], { cwd: work }).ok) throw new Error('attr add 失败');
    if (!runCli('提交 1.0.0', ['create-version', '--yes', ...E], { cwd: work }).ok) throw new Error('1.0.0 失败');

    // ---- S3 重复建壳 ----
    log('\n--- S3 壳已有再 create ---');
    const dupCreate = runCli('create 重复建壳（应拒）', ['create', '--title', 'dup', '--type', 'RT006003', '--name', `dup-${stamp}`, '--yes', ...E], { cwd: work, expectErr: '已经创建过授权条目' });
    record('S3 重复建壳被拦', dupCreate.ok, dupCreate.err.slice(0, 60));

    // ---- S16 改已发号描述 ----
    log('\n--- S16 version description ---');
    const desc = runCli('description 改 1.0.0 描述', ['version', 'description', '--version', '1.0.0', '--description', 'S16 线上描述-真网', ...E], { cwd: work });
    record('S16 改已发号描述', desc.ok && desc.out.includes('1.0.0'));
    const show = runCli('version show 读回描述', ['version', 'show', ...E], { cwd: work });
    record('S16 线上描述已更新', show.ok && show.out.includes('S16 线上描述-真网'));

    // ---- S39 version set 只改路径记录：换 build/ 下新文件发 1.1.2，验证 filename 跟着变 ----
    log('\n--- S39 version set + 换文件发新号 ---');
    mkdirSync(path.join(work, 'build'), { recursive: true });
    copyFileSync(media, path.join(work, 'build', 'moved.mp4'));
    const vset = runCli('version set --file build', ['version', 'set', '--file', 'build', ...E], { cwd: work });
    record('S39 version set 改记录', vset.ok && vset.out.includes('build'));
    const stAfter = runCli('status 确认记录', ['status', ...E], { cwd: work });
    record('S39 status 显示新路径', stAfter.ok && stAfter.out.includes('build'));
    const pull39 = runCli('draft pull（1.0.0 底）', ['version', 'draft', 'pull', '--yes', ...E], { cwd: work });
    record('S39 拉稿', pull39.ok);
    const dirRej = runCli('目录对 RT006003（应拒）', ['update-version', '--yes', '--version', '1.1.1', '--file', 'build', ...E], { cwd: work, expectErr: '不支持文件夹' });
    record('S39 非主题目录被拒', dirRej.ok, dirRej.err.slice(0, 50));
    const upv39 = runCli('update-version --file build/moved.mp4 发 1.1.1', ['update-version', '--yes', '--version', '1.1.1', '--file', 'build/moved.mp4', ...E], { cwd: work });
    record('S39 换文件发新号', upv39.ok && upv39.out.includes('1.1.1'));
    const show39 = runCli('version show 验 filename', ['version', 'show', ...E], { cwd: work });
    record('S39 线上 filename=moved.mp4', show39.ok && show39.out.includes('moved.mp4'));
    const off39 = runCli('S39 下架收尾', ['offline', '--yes', ...E], { cwd: work });
    record('S39 收尾', off39.ok);

    // ---- S11 拉不存在的号 ----
    log('\n--- S11 draft pull 不存在的号 ---');
    const pullBad = runCli('draft pull --version 9.9.9（应拒）', ['version', 'draft', 'pull', '--version', '9.9.9', '--yes', ...E], { cwd: work, expectErr: '没有这个版本' });
    record('S11 不存在的号被拒', pullBad.ok);
    const noDraft = runCli('version show --local（稿未被写）', ['version', 'show', '--local', ...E], { cwd: work, expectErr: '没有本地版本工作稿' });
    record('S11 失败不写盘', noDraft.ok);

    // ---- S12/S19：拉 1.0.0 旧底，latest=1.1.1，测续用旧底与底对不上 ----
    log('\n--- S13/S19 reuse-version 与底对不上 ---');
    const pullOld = runCli('draft pull --version 1.0.0（旧底）', ['version', 'draft', 'pull', '--version', '1.0.0', '--yes', ...E], { cwd: work });
    record('S19 拉旧底', pullOld.ok);
    const attrUp = runCli('attr set 改值', ['version', 'attr', 'set', '键=author 值=续旧底', '--yes', ...E], { cwd: work });
    record('S19 续改旧稿', attrUp.ok);
    const reuse = runCli('update-version --reuse-version 1.0.0 --version 1.2.0', ['update-version', '--yes', '--reuse-version', '1.0.0', '--version', '1.2.0', ...E], { cwd: work });
    record('S13 --reuse-version 续旧底发 1.2.0', reuse.ok && reuse.out.includes('1.2.0'));
    const show11 = runCli('version show 读回 1.2.0', ['version', 'show', ...E], { cwd: work });
    record('S13 线上 1.2.0 含续改值', show11.ok && show11.out.includes('续旧底'));

    // 稿已删；再拉 1.0.0，此时 latest=1.2.0，不带 --reuse-version 直接交 → 应拒（底对不上）
    const pullOld2 = runCli('draft pull --version 1.0.0（再拉旧底）', ['version', 'draft', 'pull', '--version', '1.0.0', '--yes', ...E], { cwd: work });
    record('S19 再拉旧底', pullOld2.ok);
    const attrUp2 = runCli('attr set 再改', ['version', 'attr', 'set', '键=author 值=底对不上测试', '--yes', ...E], { cwd: work });
    record('S19 再改旧稿', attrUp2.ok);
    const mismatch = runCli('update-version 不带 reuse（应拒：底对不上）', ['update-version', '--yes', '--version', '1.2.5', ...E], { cwd: work, expectErr: '稿来自 1.0.0、底是 1.2.0' });
    record('S19 底对不上被拒', mismatch.ok, mismatch.err.slice(0, 80));
    const reuseFix = runCli('update-version --reuse-version 1.0.0 --version 1.2.5（明确续用）', ['update-version', '--yes', '--reuse-version', '1.0.0', '--version', '1.2.5', ...E], { cwd: work });
    record('S19 明确续用后成功', reuseFix.ok && reuseFix.out.includes('1.2.5'));

    // ---- S17 --version 与 --bump 冲突 ----
    log('\n--- S17 定号冲突 ---');
    const pullLate = runCli('draft pull（latest 底）', ['version', 'draft', 'pull', '--yes', ...E], { cwd: work });
    record('S17 准备稿', pullLate.ok);
    const conflict = runCli('--version + --bump 同给（应拒）', ['update-version', '--yes', '--version', '1.3.0', '--bump', 'patch', ...E], { cwd: work, expectErr: '不能一起用' });
    record('S17 冲突被拒', conflict.ok, conflict.err.slice(0, 60));
    runCli('丢稿收尾', ['version', 'draft', 'discard', '--yes', ...E], { cwd: work });

    // ---- 只读命令：template list / type list / type search / type info ----
    log('\n--- S41 / 只读命令 ---');
    const tpl = runCli('template list', ['template', 'list', ...E], { cwd: work });
    record('S41 template list', tpl.ok);
    const tlist = runCli('type list', ['type', 'list', ...E], { cwd: work });
    record('type list', tlist.ok && tlist.out.includes('RT'));
    const tsearch = runCli('type search 视频', ['type', 'search', '视频', ...E], { cwd: work });
    record('type search', tsearch.ok && tsearch.out.includes('RT006'));
    const code = (tsearch.out.match(/RT\d+/) || ['RT001'])[0];
    const tinfo = runCli('type info', ['type', 'info', code, ...E], { cwd: work });
    record('type info', tinfo.ok && tinfo.out.includes(code));

    // ---- status 只读（--json 是注册旗标，status 打印文本不违反设计） ----
    log('\n--- status 只读 ---');
    const stJson = runCli('status（带 --json 旗不崩）', ['status', '--json', ...E], { cwd: work });
    record('status 带 --json 正常', stJson.ok);

    // ---- 收尾 ----
    const off = runCli('offline 收尾', ['offline', '--yes', ...E], { cwd: work });
    record('收尾 offline', off.ok);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

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
