#!/usr/bin/env node
/**
 * C 层：多类型 Console Network createVersion ↔ CLI dry-run（dev）。
 * 用法：pnpm verify:console [--env dev] [--type RT005001|RT001|RT006003|all]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diffCreateVersionBodies,
  formatCreateVersionDiff,
  normalizeCreateVersionBody,
} from './lib/create-version-diff.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const fixturesDir = path.join(cliRoot, 'test/fixtures');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const typeArgIdx = process.argv.indexOf('--type');
const typeFilter = typeArgIdx >= 0 ? process.argv[typeArgIdx + 1] || 'all' : 'all';

function runCli(args, opts = {}) {
  return execSync(`node "${cliBin}" ${args} --env ${env}`, {
    cwd: opts.cwd || cliRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  if (start < 0) throw new Error(`无 JSON: ${stdout.slice(0, 200)}`);
  return JSON.parse(stdout.slice(start));
}

function assertOk(label, cond, detail) {
  if (cond) {
    console.log(`✔ ${label}${detail ? `: ${detail}` : ''}`);
    return true;
  }
  console.error(`✘ ${label}${detail ? `: ${detail}` : ''}`);
  return false;
}

function loadGolden(typeCode) {
  const file = path.join(fixturesDir, `console-createVersion-${typeCode}.json`);
  if (!fs.existsSync(file)) throw new Error(`缺少金样 ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function compareWithGolden(typeCode, cliBody) {
  const golden = loadGolden(typeCode);
  const mismatches = diffCreateVersionBodies(golden, cliBody);
  return assertOk(
    `${typeCode} Console ↔ CLI dry-run`,
    mismatches.length === 0,
    mismatches.length ? formatCreateVersionDiff(mismatches) : `${Object.keys(normalizeCreateVersionBody(cliBody)).length} 字段一致`,
  );
}

const SCENARIOS = {
  RT005001: () => {
    const ts = Date.now();
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cv-photo-'));
    const photo = path.join(proj, 'photo.png');
    fs.copyFileSync(path.resolve(cliRoot, '../../test/abcdef.png'), photo);
    fs.appendFileSync(photo, String(ts));
    try {
      runCli(
        `init . --scaffold none --resource-type RT005001 --resource-name paritycv${ts} --title "Parity ${ts}" --yes --json`,
        { cwd: proj },
      );
      parseJson(runCli('create --yes --json', { cwd: proj }));
      runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: proj });
      const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: proj }));
      return dry.createVersionParams;
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  },
  RT006003: () => {
    const ts = Date.now();
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cv-video-'));
    const clip = path.join(proj, 'clip.mp4');
    const cover = path.join(proj, 'cover.png');
    const videoSrc = path.resolve(cliRoot, '../../test/codex-e2e-video-20260805142911/sample-video.mp4');
    if (!fs.existsSync(videoSrc)) throw new Error(`测试视频不存在: ${videoSrc}`);
    fs.copyFileSync(videoSrc, clip);
    fs.appendFileSync(clip, String(ts));
    fs.copyFileSync(path.resolve(cliRoot, '../../test/abcdef.png'), cover);
    fs.appendFileSync(cover, String(ts));
    try {
      runCli(
        `init . --scaffold none --resource-type RT006003 --resource-name vidp${ts} --title "Vid ${ts}" --yes --json`,
        { cwd: proj },
      );
      parseJson(runCli('create --yes --json', { cwd: proj }));
      runCli(
        'version set --version 1.0.0 --file clip.mp4 --video-cover cover.png --yes --json',
        { cwd: proj },
      );
      const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: proj }));
      return dry.createVersionParams;
    } finally {
      fs.rmSync(proj, { recursive: true, force: true });
    }
  },
  RT001: () => {
    const themeProj = path.resolve(cliRoot, '../../test/my-freelog-project');
    const dist = path.join(themeProj, 'dist');
    if (!fs.existsSync(dist)) {
      throw new Error('test/my-freelog-project/dist 不存在，请先 pnpm build');
    }
    const dry = parseJson(runCli('publish --dry-run --bump --yes --json', { cwd: themeProj }));
    return dry.createVersionParams;
  },
};

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== Console ↔ CLI createVersion parity (env=${env}, type=${typeFilter}) ===\n`);
runCli('login --login-name freelog-test11 --password freelog-test1111 --yes');

const types =
  typeFilter === 'all' ? Object.keys(SCENARIOS) : typeFilter.split(',').map((t) => t.trim());
let ok = true;

for (const typeCode of types) {
  const run = SCENARIOS[typeCode];
  if (!run) {
    console.error(`✘ 未知类型 ${typeCode}`);
    ok = false;
    continue;
  }
  console.log(`--- ${typeCode} ---`);
  try {
    const params = run();
    ok =
      assertOk(`${typeCode} dry-run`, params?.fileSha1 || params?.videoCover, params?.filename || 'video') &&
      ok;
    ok =
      assertOk(
        `${typeCode} 不传 batchSignContracts`,
        normalizeCreateVersionBody(params).batchSignContracts === undefined,
        '未携带',
      ) && ok;
    console.log(`i 金样 test/fixtures/console-createVersion-${typeCode}.json（忽略 fileSha1/filename/videoCover URL）`);
    ok = compareWithGolden(typeCode, params) && ok;
  } catch (error) {
    ok = false;
    console.error(`✘ ${typeCode}`, error.stderr?.toString()?.slice(0, 400) || error.message);
  }
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===\n`);
process.exit(ok ? 0 : 1);
