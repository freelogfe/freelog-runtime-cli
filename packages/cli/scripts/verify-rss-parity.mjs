#!/usr/bin/env node
/**
 * RSS 专项 mandatory parity，两阶段运行，验证码只通过进程环境传递。
 *
 * prepare:
 *   FREELOG_RSS_FEED_URL=... FREELOG_RSS_RESOURCE_TYPE_CODE=... node ... prepare --env dev
 * complete:
 *   FREELOG_RSS_PROJECT_DIR=... FREELOG_RSS_FEED_URL=... FREELOG_RSS_VERIFICATION_CODE=... node ... complete --env dev
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verificationAccount } from './lib/verification-credentials.mjs';
import { parseCliJson } from './lib/cli-json.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(scriptDir, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const stage = process.argv[2];
const envIndex = process.argv.indexOf('--env');
const targetEnv = envIndex >= 0 ? process.argv[envIndex + 1] || 'dev' : 'dev';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`缺少 ${name}`);
  return value;
}

function run(args, cwd = cliRoot, expectFailure = false) {
  try {
    return execFileSync(process.execPath, [cliBin, ...args, '--env', targetEnv], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (expectFailure) return error.stderr?.toString() || error.stdout?.toString() || '';
    throw error;
  }
}

function json(stdout) {
  return parseCliJson(stdout);
}

function login() {
  const account = verificationAccount();
  run(['login', '--login-name', account.name, '--password', account.password, '--yes']);
}

function isImporting(progress) {
  return typeof progress?.status === 'string' && ['', 'pending', 'running'].includes(progress.status);
}

async function waitForInitialImport(projectDir) {
  const deadline = Date.now() + 300_000;
  let last;
  while (Date.now() < deadline) {
    last = json(run(['collection', 'rss', 'status', '--cwd', projectDir, '--json'], projectDir))
      .progress;
    if (!isImporting(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
  throw new Error(`RSS 初次导入超时：${JSON.stringify(last)}`);
}

if (!fs.existsSync(cliBin)) throw new Error('请先 pnpm build');
if (stage !== 'prepare' && stage !== 'complete') {
  throw new Error('阶段必须是 prepare 或 complete');
}

login();

if (stage === 'prepare') {
  const feedUrl = required('FREELOG_RSS_FEED_URL');
  const resourceTypeCode = required('FREELOG_RSS_RESOURCE_TYPE_CODE');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-rss-parity-'));
  const projectDir = path.join(root, 'rss-collection');
  const stamp = Date.now();
  json(
    run(
      [
        'init',
        projectDir,
        '--scaffold',
        'collection',
        '--resource-type',
        resourceTypeCode,
        '--resource-name',
        `rss-parity-${stamp}`,
        '--title',
        `RSS Parity ${stamp}`,
        '--yes',
        '--json',
      ],
      root,
    ),
  );
  json(run(['collection', 'create', '--yes', '--json'], projectDir));
  const inspected = json(run(['collection', 'rss', 'inspect', feedUrl, '--json'], projectDir));
  json(run(['collection', 'rss', 'send-code', feedUrl, '--json'], projectDir));
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      stage: 'prepare',
      projectDir,
      preview: inspected.preview,
      next: '从受控 RSS owner 邮箱取得验证码，再以环境变量运行 complete；不要把验证码写入文件',
    })}\n`,
  );
} else {
  const projectDir = path.resolve(required('FREELOG_RSS_PROJECT_DIR'));
  const feedUrl = required('FREELOG_RSS_FEED_URL');
  const code = required('FREELOG_RSS_VERIFICATION_CODE');
  const bindArgs = [
    'collection',
    'rss',
    'bind',
    feedUrl,
    '--code',
    code,
    '--yes',
    '--json',
  ];
  if (process.env.FREELOG_RSS_PUB_START) {
    bindArgs.push('--pub-start', process.env.FREELOG_RSS_PUB_START);
  }
  if (process.env.FREELOG_RSS_PUB_END) {
    bindArgs.push('--pub-end', process.env.FREELOG_RSS_PUB_END);
  }
  json(run(bindArgs, projectDir));
  const initialProgress = await waitForInitialImport(projectDir);
  const lockError = run(
    ['collection', 'update', '--title', 'must-be-rejected', '--yes', '--json'],
    projectDir,
    true,
  );
  if (!/feed 管理/.test(lockError)) throw new Error('RSS 合集人工编辑锁定未生效');
  const sync = json(run(['collection', 'rss', 'sync', '--yes', '--json'], projectDir));
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      stage: 'complete',
      initialProgress,
      manualSync: sync.progress,
      rssEditLock: 'passed',
      projectDir,
    })}\n`,
  );
}
