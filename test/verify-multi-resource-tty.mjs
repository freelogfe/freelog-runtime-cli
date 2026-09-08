#!/usr/bin/env node
/**
 * 多资源 TTY 真网验证（dev）。
 *
 * 创建两个未发布的 dev 资源壳建立同工程的 1.json/2.json，通过 expect 分配伪终端，
 * 在未传 --resource 的 status 中选择第二项，断言实际查询和本地输出均落在 2.json。
 * 不发布、不修改或上架资源；临时工程在结束时删除，线上资源壳留作 dev 审计。
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
if (expectProbe.error) {
  console.error('缺少 expect：该验证需要它提供伪终端。');
  process.exit(2);
}

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
  try {
    console.log(`=== 多资源 TTY dev 真网验证：${work} ===`);
    if (!runCli('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], work, primary.password)) throw new Error('login 失败');
    if (!runCli('init', ['init', '.', '--type', 'RT006003', '--yes', '--env', env], work)) throw new Error('init 失败');
    copyFileSync(mediaPath, path.join(work, 'first.mp4'));
    copyFileSync(mediaPath, path.join(work, 'second.mp4'));
    const stamp = Date.now().toString(36);
    if (!runCli('create 第一资源', ['create', '--title', `tty-first-${stamp}`, '--type', 'RT006003', '--name', `tty-first-${stamp}`, '--artifact', 'first.mp4', '--yes', '--env', env], work)) throw new Error('第一资源 create 失败');
    if (!runCli('create 第二资源', ['create', '--title', `tty-second-${stamp}`, '--type', 'RT006003', '--name', `tty-second-${stamp}`, '--artifact', 'second.mp4', '--yes', '--env', env], work)) throw new Error('第二资源 create 失败');
    const firstIdentity = JSON.parse(readFileSync(path.join(work, '.freelog', '1.json'), 'utf8'));
    const secondIdentity = JSON.parse(readFileSync(path.join(work, '.freelog', '2.json'), 'utf8'));

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
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
