#!/usr/bin/env node
/**
 * 有损工作稿操作真网验证（dev，不发行）。
 *
 * 在临时工程创建未发布资源壳和首版工作稿，验证：
 * - 非交互 discard 缺 --yes 不删稿；
 * - 真正 TTY 中默认“否”取消不删稿；
 * - create-version --reset 遇到不存在的产物时不删稿；
 * - --reset --yes 能重建选中资源的工作稿，随后 discard --yes 能清理它。
 *
 * 用法：node test/verify-draft-safety.mjs --env dev [--skip-build]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeTty, runTty } from './tty-driver.mjs';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');
const credPath = path.join(testRoot, '.freelog-test-credentials.local.json');
const mediaPath = path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4');

if (env !== 'dev') {
  console.error('有损工作稿真网验证当前只允许 --env dev。');
  process.exit(2);
}
if (!existsSync(credPath) || !existsSync(mediaPath)) {
  console.error('缺少本地 primary 凭据或视频测试素材。');
  process.exit(2);
}
const primary = JSON.parse(readFileSync(credPath, 'utf8')).primary;
if (!primary?.loginName || !primary?.password) {
  console.error('primary 凭据无效。');
  process.exit(2);
}
const tty = await probeTty(repoRoot);
if (!tty.available) {
  console.error(`BLOCKED: node-pty 不可用。${tty.reason}`);
  process.exit(3);
}

/** 密码仅经 stdin 传递；失败时只输出有限的 CLI 返回内容。 */
function runCli(label, args, cwd, input, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  const ok = result.status === expectedStatus;
  console.log(`${ok ? '✔' : '✘'} ${label} (exit ${result.status})`);
  if (!ok) console.error(output.slice(0, 1000));
  return { ok, output };
}

/** 以伪终端接受默认“否”，验证真正的交互取消而不是函数 mock。 */
function cancelDiscardInTty(cwd) {
  return runTty({
    cwd,
    program: process.execPath,
    args: [cliBin, 'version', 'draft', 'discard', '--env', env],
    steps: [
      { expect: '确认丢弃工作稿', send: '\r' },
      { expect: '已取消' },
    ],
  });
}

function draftPath(work) {
  return path.join(work, '.freelog', '1.version.json');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot, encoding: 'utf8', timeout: 120_000,
    });
    if (build.status !== 0) throw new Error('CLI 构建失败');
  }

  const work = mkdtempSync(path.join(tmpdir(), 'freelog-draft-safety-'));
  try {
    console.log(`=== 有损工作稿 dev 真网验证（不发行）：${work} ===`);
    assert(runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], work, primary.password).ok, 'login 失败');
    copyFileSync(mediaPath, path.join(work, 'first.mp4'));
    copyFileSync(mediaPath, path.join(work, 'second.mp4'));
    assert(runCli('init', ['init', '.', '--type', 'RT006003', '--artifact', 'first.mp4', '--yes', '--env', env], work).ok, 'init 失败');
    const stamp = Date.now().toString(36);
    assert(runCli('create 未发布资源壳', ['create', '--title', `draft-safety-${stamp}`, '--type', 'RT006003', '--name', `draft-safety-${stamp}`, '--artifact', 'first.mp4', '--yes', '--env', env], work).ok, 'create 失败');
    assert(runCli('prepare 首版工作稿', ['create-version', '--prepare', '--yes', '--env', env], work).ok, 'prepare 失败');
    const beforeMissingReset = readFileSync(draftPath(work), 'utf8');

    const noYes = runCli('discard 缺 --yes', ['version', 'draft', 'discard', '--env', env], work, undefined, 1);
    assert(noYes.ok && noYes.output.includes('--yes'), '非交互 discard 未要求 --yes');
    assert(readFileSync(draftPath(work), 'utf8') === beforeMissingReset, '缺 --yes 却删除或改写了工作稿');

    const missing = runCli('reset 不存在的产物', ['create-version', '--reset', '--prepare', '--artifact', 'missing.mp4', '--yes', '--env', env], work, undefined, 1);
    assert(missing.ok && missing.output.includes('本地文件不在'), '缺失产物没有在 reset 确认前失败');
    assert(readFileSync(draftPath(work), 'utf8') === beforeMissingReset, '缺失产物 reset 删除或改写了工作稿');

    if (tty.available) {
      const cancelled = await cancelDiscardInTty(work);
      const transcript = `${cancelled.stdout ?? ''}${cancelled.stderr ?? ''}`;
      assert(cancelled.status === 0 && transcript.includes('已取消'), `TTY 默认否未取消：${transcript.slice(0, 1000)}`);
      assert(readFileSync(draftPath(work), 'utf8') === beforeMissingReset, 'TTY 取消后工作稿变化');
      console.log('✔ 非 TTY 缺 --yes、缺失产物 reset、TTY 默认取消均保留工作稿');
    }

    assert(runCli('reset 并重建工作稿', ['create-version', '--reset', '--prepare', '--artifact', 'second.mp4', '--yes', '--env', env], work).ok, 'reset 失败');
    const rebuilt = readFileSync(draftPath(work), 'utf8');
    assert(rebuilt.includes('second.mp4'), 'reset 未用新产物重建工作稿');
    assert(runCli('discard --yes', ['version', 'draft', 'discard', '--yes', '--env', env], work).ok, 'discard --yes 失败');
    assert(!existsSync(draftPath(work)), 'discard --yes 后工作稿仍存在');
    console.log('✔ --reset --yes 仅重建当前工作稿；discard --yes 清理成功');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
