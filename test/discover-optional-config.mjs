#!/usr/bin/env node
/**
 * 可选配置类型的只读发现器（dev）。
 *
 * 它只在临时目录登录、查询启用叶子及其详情，不创建资源、不上传、也不修改仓库。
 * 有候选只说明“可填写 fixture 的 typeCode”；产物仍需按该类型显式配对。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
const reportPath = path.join(reportDir, 'optional-config-discovery.txt');

function finish(result, message, code) {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(reportPath, `结果: ${result}\n${message}\n`, 'utf8');
  console.log(`${result}: ${message}`);
  console.log(`报告: ${reportPath}`);
  process.exitCode = code;
}

function runCli(args, cwd, input) {
  return spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

if (env !== 'dev') {
  finish('BLOCKED', '可选配置类型发现当前只允许 --env dev。', 3);
} else if (!existsSync(path.join(testRoot, '.freelog-test-credentials.local.json'))) {
  finish('BLOCKED', '缺少 primary 凭据，不能做只读类型发现。', 3);
} else {
  const primary = JSON.parse(readFileSync(path.join(testRoot, '.freelog-test-credentials.local.json'), 'utf8')).primary;
  if (!primary?.loginName || !primary?.password) {
    finish('BLOCKED', 'primary 凭据无效，不能做只读类型发现。', 3);
  } else {
    let buildFailed = false;
    if (!skipBuild) {
      const build = spawnSync('pnpm', ['--filter', '@freelog-cli/cli2', 'build'], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        timeout: 120_000,
      });
      if (build.status !== 0) {
        finish('FAIL', 'CLI 构建失败。', 1);
        buildFailed = true;
      }
    }
    if (buildFailed) {
      // finish 已写报告；不继续进行任何登录或网络请求。
    } else if (!existsSync(cliBin)) {
      finish('FAIL', '缺少 CLI 构建产物。', 1);
    } else {
      const work = mkdtempSync(path.join(tmpdir(), 'freelog-option-type-discovery-'));
      try {
        const login = runCli(['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', env], work, primary.password);
        if (login.status !== 0) throw new Error('只读类型发现登录失败。');
        const listed = runCli(['type', 'list', '--env', env], work);
        if (listed.status !== 0) throw new Error('读取启用叶子类型失败。');
        const codes = [...new Set((listed.stdout ?? '').split(/\r?\n/)
          .map((line) => line.split('\t')[0]?.trim())
          .filter(Boolean))];
        const supported = [];
        for (const code of codes) {
          const info = runCli(['type', 'info', code, '--env', env], work);
          if (info.status !== 0) throw new Error(`读取类型详情失败：${code}`);
          const text = (info.stdout ?? '').trim();
          if (text.includes('可选配置：支持')) supported.push(text);
        }
        if (supported.length === 0) {
          finish('BLOCKED', 'dev 当前所有启用单资源最终叶子均不支持可选配置；请等待平台提供启用候选类型，CLI 不会猜测或试建。', 3);
        } else {
          finish('READY', `可填写 fixture 的候选类型：\n${supported.join('\n')}\n仍须为其中一个类型显式配对真实本地产物。`, 0);
        }
      } catch (error) {
        finish('FAIL', error instanceof Error ? error.message : String(error), 1);
      } finally {
        rmSync(work, { recursive: true, force: true });
      }
    }
  }
}
