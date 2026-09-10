#!/usr/bin/env node
/**
 * 多资源 TTY 真网验证（dev）。
 *
 * 创建未发布的 dev 资源壳建立同工程多份状态，通过 expect 分配伪终端，
 * 验证 TTY 选择、跨工作区标题同步，以及多资源工程继续 create / bind 的编号分配。
 * 不发行、不上架；临时工程在结束时删除，线上资源壳留作 dev 审计。
 *
 * 用法：node test/verify-multi-resource-tty.mjs --env dev [--skip-build]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testRoot, '..');
const cliBin = path.join(repoRoot, 'packages', 'cli', 'dist', 'bin', 'index.js');
const envIndex = process.argv.indexOf('--env');
const env = envIndex >= 0 ? process.argv[envIndex + 1] ?? 'dev' : 'dev';
const skipBuild = process.argv.includes('--skip-build');

if (env !== 'dev') {
  console.error('多资源 TTY 真网验证当前只允许 --env dev。');
  process.exit(2);
}

const expectProbe = spawnSync('expect', ['-v'], { encoding: 'utf8' });
const hasExpect = !expectProbe.error && expectProbe.status === 0;

const credPath = path.join(testRoot, '.freelog-test-credentials.local.json');
const mediaPath = path.join(testRoot, 'fixtures', 'media', 'sample-video.mp4');
if (!existsSync(credPath) || !existsSync(mediaPath)) {
  console.error('缺少本地 primary 凭据或视频测试素材。');
  process.exit(2);
}

const primary = JSON.parse(readFileSync(credPath, 'utf8')).primary;
if (!primary?.loginName || !primary?.password) {
  console.error('primary 凭据无效。');
  process.exit(2);
}

/** 运行非交互 CLI 步骤；密码仅走 stdin，日志不打印输入。 */
function runCli(label, args, cwd, input) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  console.log(`${result.status === 0 ? '✔' : '✘'} ${label} (exit ${result.status})`);
  if (result.status !== 0) console.error(output.slice(0, 800));
  return result.status === 0;
}

/** 以伪终端选第二项并返回完整可审计输出。 */
function selectSecondInTty(cwd) {
  const expectProgram = String.raw`
    set timeout 120
    cd {${cwd}}
    spawn -noecho {${process.execPath}} {${cliBin}} status --env {${env}}
    expect {
      -re {请选择资源} {
        send -- "\033\[B"
        send -- "\r"
      }
      timeout { puts stderr "未出现资源选择菜单"; exit 3 }
      eof { puts stderr "资源选择前命令已退出"; exit 4 }
    }
    expect {
      -re {本地：2\.json} {}
      timeout { puts stderr "选择后未操作 2.json"; exit 5 }
      eof { puts stderr "选择后命令提前退出"; exit 6 }
    }
    expect eof
  `;
  return spawnSync('expect', ['-c', expectProgram], {
    cwd,
    encoding: 'utf8',
    timeout: 130_000,
  });
}

/** 在同一类选择菜单中选第二项后改标题，覆盖真实平台写操作的资源路由。 */
function selectSecondAndUpdateTitle(cwd, title) {
  const expectProgram = String.raw`
    set timeout 120
    cd {${cwd}}
    spawn -noecho {${process.execPath}} {${cliBin}} update --title {${title}} --env {${env}}
    expect {
      -re {请选择资源} {
        send -- "\033\[B"
        send -- "\r"
      }
      timeout { puts stderr "更新前未出现资源选择菜单"; exit 3 }
      eof { puts stderr "选择前更新命令已退出"; exit 4 }
    }
    expect eof
  `;
  return spawnSync('expect', ['-c', expectProgram], {
    cwd,
    encoding: 'utf8',
    timeout: 130_000,
  });
}

function main() {
  if (!skipBuild) {
    const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
    });
    if (build.status !== 0) throw new Error('CLI 构建失败');
  }

  const work = mkdtempSync(path.join(tmpdir(), 'freelog-multi-tty-'));
  const remoteWork = mkdtempSync(path.join(tmpdir(), 'freelog-multi-remote-'));
  const bindWork = mkdtempSync(path.join(tmpdir(), 'freelog-multi-bind-'));
  try {
    console.log(`=== 多资源 TTY dev 真网验证：${work} ===`);
    if (!runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], work, primary.password)) throw new Error('login 失败');
    copyFileSync(mediaPath, path.join(work, 'first.mp4'));
    copyFileSync(mediaPath, path.join(work, 'second.mp4'));
    copyFileSync(mediaPath, path.join(work, 'third.mp4'));
    if (!runCli('init', ['init', '.', '--type', 'RT006003', '--artifact', 'first.mp4', '--yes', '--env', env], work)) throw new Error('init 失败');
    const stamp = Date.now().toString(36);
    if (!runCli('create 第一资源', ['create', '--title', `tty-first-${stamp}`, '--type', 'RT006003', '--name', `tty-first-${stamp}`, '--artifact', 'first.mp4', '--yes', '--env', env], work)) throw new Error('第一资源 create 失败');
    if (!runCli('create 第二资源', ['create', '--title', `tty-second-${stamp}`, '--type', 'RT006003', '--name', `tty-second-${stamp}`, '--artifact', 'second.mp4', '--yes', '--env', env], work)) throw new Error('第二资源 create 失败');
    const firstIdentity = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    const secondIdentity = JSON.parse(readFileSync(path.join(work, '.freelog', '2.json'), 'utf8'));

    if (hasExpect) {
      const result = selectSecondInTty(work);
      const transcript = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      const menuFields = [
        `标题=${firstIdentity.title}`,
        `标识=${firstIdentity.name}`,
        `ID=${firstIdentity.resourceId}`,
        '类型=RT006003',
        '产物=first.mp4',
        '无工作稿',
        `标题=${secondIdentity.title}`,
        `标识=${secondIdentity.name}`,
        `ID=${secondIdentity.resourceId}`,
        '产物=second.mp4',
      ];
      if (result.status !== 0 || !transcript.includes('本地：2.json') || !transcript.includes(secondIdentity.resourceId) || !menuFields.every((field) => transcript.includes(field))) {
        throw new Error(`TTY 选择未稳定操作第二资源（exit ${result.status}）：${transcript.slice(0, 1200)}`);
      }
      console.log('✔ TTY 菜单完整展示身份信息；选择第二资源后，status 仅输出 2.json 与第二资源 resourceId');

      const updatedTitle = `tty-selected-${stamp}`;
      const updateResult = selectSecondAndUpdateTitle(work, updatedTitle);
      const firstAfterUpdate = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
      const secondAfterUpdate = JSON.parse(readFileSync(path.join(work, '.freelog', '2.json'), 'utf8'));
      if (updateResult.status !== 0 || firstAfterUpdate.title !== firstIdentity.title || secondAfterUpdate.title !== updatedTitle) {
        throw new Error(`TTY 选择后的 update 未只回写第二资源（exit ${updateResult.status}）`);
      }
      console.log('✔ TTY 选择第二资源后，update --title 只写第二资源并由平台成功接受');
    } else {
      console.warn('⚠ 缺少 expect，跳过实际 TTY 选择；选择路由由包内单测覆盖。');
    }

    if (!runCli('多资源工程 create 第三资源', ['create', '--title', `tty-third-${stamp}`, '--type', 'RT006003', '--name', `tty-third-${stamp}`, '--artifact', 'third.mp4', '--yes', '--env', env], work)) throw new Error('第三资源 create 失败');
    const thirdIdentity = JSON.parse(readFileSync(path.join(work, '.freelog', '3.json'), 'utf8'));
    const firstAfterCreate = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    const secondAfterCreate = JSON.parse(readFileSync(path.join(work, '.freelog', '2.json'), 'utf8'));
    if (firstAfterCreate.resourceId !== firstIdentity.resourceId || secondAfterCreate.resourceId !== secondIdentity.resourceId || thirdIdentity.filePath !== 'third.mp4') {
      throw new Error('多资源 create 没有新增 3.json，或改写了既有状态');
    }
    console.log('✔ S66：已有两份绑定状态时 create 新增 3.json，不改写 1.json / 2.json');

    if (!runCli('远端工作区 login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], remoteWork, primary.password)) throw new Error('远端工作区 login 失败');
    copyFileSync(mediaPath, path.join(remoteWork, 'second.mp4'));
    if (!runCli('远端工作区 init', ['init', '.', '--type', 'RT006003', '--artifact', 'second.mp4', '--yes', '--env', env], remoteWork)) throw new Error('远端工作区 init 失败');
    if (!runCli('远端工作区 bind 第二资源', ['bind', secondIdentity.resourceId, '--artifact', 'second.mp4', '--yes', '--env', env], remoteWork)) throw new Error('远端工作区 bind 失败');
    const syncedTitle = `tty-synced-${stamp}`;
    if (!runCli('远端工作区改第二资源标题', ['update', '--title', syncedTitle, '--yes', '--env', env], remoteWork)) throw new Error('远端工作区 update 标题失败');
    if (!runCli('原工程仅同步第二资源标题', ['resource', 'sync', '--resource', `id:${secondIdentity.resourceId}`, '--env', env], work)) throw new Error('单资源标题同步失败');
    const firstAfterSync = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    const secondAfterSync = JSON.parse(readFileSync(path.join(work, '.freelog', '2.json'), 'utf8'));
    if (firstAfterSync.title !== firstIdentity.title || secondAfterSync.title !== syncedTitle) {
      throw new Error('S65 标题同步改错资源或未写回远端标题');
    }
    if (!runCli('原工程批量同步标题', ['resource', 'sync', '--env', env], work)) throw new Error('批量标题同步失败');
    console.log('✔ S65：另一工作区改标题后，精确同步只写 2.json；批量同步可继续处理当前工程全部身份');

    if (!runCli('bind 工程 login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], bindWork, primary.password)) throw new Error('bind 工程 login 失败');
    copyFileSync(mediaPath, path.join(bindWork, 'first.mp4'));
    copyFileSync(mediaPath, path.join(bindWork, 'second.mp4'));
    copyFileSync(mediaPath, path.join(bindWork, 'third.mp4'));
    if (!runCli('bind 工程 init', ['init', '.', '--type', 'RT006003', '--artifact', 'first.mp4', '--yes', '--env', env], bindWork)) throw new Error('bind 工程 init 失败');
    if (!runCli('bind 第一资源', ['bind', firstIdentity.resourceId, '--artifact', 'first.mp4', '--yes', '--env', env], bindWork)) throw new Error('bind 第一资源失败');
    if (!runCli('bind 第二资源', ['bind', secondIdentity.resourceId, '--artifact', 'second.mp4', '--yes', '--env', env], bindWork)) throw new Error('bind 第二资源失败');
    if (!runCli('bind 第三资源', ['bind', thirdIdentity.resourceId, '--artifact', 'third.mp4', '--yes', '--env', env], bindWork)) throw new Error('bind 第三资源失败');
    const boundIds = [1, 2, 3].map((n) => JSON.parse(readFileSync(path.join(bindWork, '.freelog', `${n}.json`), 'utf8')).resourceId);
    if (JSON.stringify(boundIds) !== JSON.stringify([firstIdentity.resourceId, secondIdentity.resourceId, thirdIdentity.resourceId])) {
      throw new Error('S66 bind 没有为多资源工程逐份新增状态');
    }
    console.log('✔ S66：已有绑定状态时连续 bind 新增 2.json / 3.json，不需要选择或覆盖既有资源');
  } finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(remoteWork, { recursive: true, force: true });
    rmSync(bindWork, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
