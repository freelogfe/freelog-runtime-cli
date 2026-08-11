#!/usr/bin/env node
/**
 * C 层 createVersion：CLI 真实登录 + Console 源码契约（非浏览器抓包为主）。
 * 1. dev login → init/create/version set → publish --dry-run
 * 2. 断言 body 符合 Console step2Effects / tools-lib 字段约定
 * 3. RT005001 额外：dry-run → publish → version show value round-trip
 * 可选：--browser-golden 与 test/fixtures 浏览器快照 diff（仅 spot check）
 *
 * 用法：pnpm verify:console [--env dev] [--type RT005001|RT001|RT006003|all] [--browser-golden]
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
import {
  formatContractErrors,
  validateCreateVersionContract,
  validateCreateVersionPlanContract,
} from './lib/console-source-contract.mjs';
import { diffInputAttrsByValue, formatAttrDiff } from './lib/payload-parity.mjs';
import { verificationLoginArgs } from './lib/verification-credentials.mjs';
import { parseCliJson } from './lib/cli-json.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(__dirname, '..');
const cliBin = path.join(cliRoot, 'dist', 'bin', 'index.js');
const fixturesDir = path.join(cliRoot, 'test/fixtures');

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';
const typeArgIdx = process.argv.indexOf('--type');
const typeFilter = typeArgIdx >= 0 ? process.argv[typeArgIdx + 1] || 'all' : 'all';
const useBrowserGolden = process.argv.includes('--browser-golden');

function runCli(args, opts = {}) {
  return execSync(`node "${cliBin}" ${args} --env ${env}`, {
    cwd: opts.cwd || cliRoot,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function parseJson(stdout) {
  return parseCliJson(stdout);
}

function assertOk(label, cond, detail) {
  if (cond) {
    console.log(`✔ ${label}${detail ? `: ${detail}` : ''}`);
    return true;
  }
  console.error(`✘ ${label}${detail ? `: ${detail}` : ''}`);
  return false;
}

const TYPE_CONTRACT = {
  RT005001: { minInputAttrs: 1, expectVideoCover: false, roundTrip: true },
  RT001: { minInputAttrs: 1, expectVideoCover: false, roundTrip: false },
  RT006003: { minInputAttrs: 0, expectVideoCover: false, roundTrip: false },
};

const SCENARIOS = {
  RT005001: () => {
    const ts = Date.now();
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cv-photo-'));
    const photo = path.join(proj, 'photo.png');
    fs.copyFileSync(path.resolve(cliRoot, '../../test/fixtures/media/sample-image.png'), photo);
    fs.appendFileSync(photo, String(ts));
    try {
      runCli(
        `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name paritycv${ts} --title "Parity ${ts}" --yes --json`,
        { cwd: proj },
      );
      parseJson(runCli('create --yes --json', { cwd: proj }));
      runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: proj });
      const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: proj }));
      let roundTrip = null;
      if (TYPE_CONTRACT.RT005001.roundTrip) {
        const pub = parseJson(runCli('publish --yes --debug --json', { cwd: proj }));
        const shown = parseJson(
          runCli(`version show --version ${pub.version} --yes --json`, { cwd: proj }),
        );
        const dryDiff = diffInputAttrsByValue(
          pub.createVersionParams?.inputAttrs,
          shown.inputAttrs,
        );
        roundTrip = { pub, shown, dryDiff };
      }
      return {
        params: dry.createVersionParams,
        unresolved: dry.unresolved,
        actualParams: roundTrip?.pub?.createVersionParams,
        proj,
        roundTrip,
        cleanup: () => fs.rmSync(proj, { recursive: true, force: true }),
      };
    } catch (e) {
      fs.rmSync(proj, { recursive: true, force: true });
      throw e;
    }
  },
  RT006003: () => {
    const ts = Date.now();
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cv-video-'));
    const clip = path.join(proj, 'clip.mp4');
    const videoSrc = path.resolve(cliRoot, '../../test/fixtures/media/sample-video.mp4');
    if (!fs.existsSync(videoSrc)) throw new Error(`测试视频不存在: ${videoSrc}`);
    fs.copyFileSync(videoSrc, clip);
    fs.appendFileSync(clip, String(ts));
    try {
      runCli(
        `init . --scaffold none --artifact-mode file --resource-type RT006003 --resource-name vidp${ts} --title "Vid ${ts}" --yes --json`,
        { cwd: proj },
      );
      parseJson(runCli('create --yes --json', { cwd: proj }));
      runCli('version set --version 1.0.0 --file clip.mp4 --yes --json', { cwd: proj });
      const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: proj }));
      const pub = parseJson(runCli('publish --yes --debug --json', { cwd: proj }));
      return {
        params: dry.createVersionParams,
        unresolved: dry.unresolved,
        actualParams: pub.createVersionParams,
        cleanup: () => fs.rmSync(proj, { recursive: true, force: true }),
      };
    } catch (e) {
      fs.rmSync(proj, { recursive: true, force: true });
      throw e;
    }
  },
  RT001: () => {
    const ts = Date.now();
    const themeProj = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cv-theme-'));
    const themeArtifact = path.resolve(cliRoot, '../../test/fixtures/theme-artifact');
    if (!fs.existsSync(themeArtifact)) {
      fs.rmSync(themeProj, { recursive: true, force: true });
      throw new Error(`主题测试产物不存在: ${themeArtifact}`);
    }
    try {
      runCli(
        `init theme . --template vite-react-ts --runtime 0.5 --resource-name parity-theme-${ts} --title "Parity Theme ${ts}" --skip-install --yes --json`,
        { cwd: themeProj },
      );
      fs.cpSync(themeArtifact, path.join(themeProj, 'dist'), { recursive: true });
      parseJson(runCli('create --yes --json', { cwd: themeProj }));
      const dry = parseJson(runCli('publish --dry-run --yes --json', { cwd: themeProj }));
      return {
        params: dry.createVersionParams,
        unresolved: dry.unresolved,
        cleanup: () => fs.rmSync(themeProj, { recursive: true, force: true }),
      };
    } catch (error) {
      fs.rmSync(themeProj, { recursive: true, force: true });
      throw error;
    }
  },
};

if (!fs.existsSync(cliBin)) {
  console.error('请先 pnpm build');
  process.exit(1);
}

console.log(`\n=== createVersion parity：CLI 真实登录 + Console 源码契约 (env=${env}) ===\n`);
runCli(verificationLoginArgs());

const types =
  typeFilter === 'all' ? Object.keys(SCENARIOS) : typeFilter.split(',').map((t) => t.trim());
let ok = true;

for (const typeCode of types) {
  const run = SCENARIOS[typeCode];
  const contract = TYPE_CONTRACT[typeCode];
  if (!run || !contract) {
    console.error(`✘ 未知类型 ${typeCode}`);
    ok = false;
    continue;
  }
  console.log(`--- ${typeCode} ---`);
  let cleanup = () => {};
  try {
    const result = run();
    cleanup = result.cleanup || cleanup;
    const params = result.params;

    ok = assertOk(`${typeCode} dry-run 产出 body`, params?.fileSha1, params?.filename) && ok;

    const planErrors = validateCreateVersionPlanContract(params, result.unresolved);
    ok =
      assertOk(
        `${typeCode} dry-run 计划协议`,
        planErrors.length === 0,
        planErrors.length ? formatContractErrors(planErrors) : 'resolved/unresolved 约定 OK',
      ) && ok;

    if (result.actualParams) {
      const contractErrors = validateCreateVersionContract(result.actualParams, {
        ...contract,
        typeCode,
      });
      ok =
        assertOk(
          `${typeCode} 真实 publish 符合 Console step2 契约`,
          contractErrors.length === 0,
          contractErrors.length ? formatContractErrors(contractErrors) : '字段约定 OK',
        ) && ok;
    } else {
      console.log(`i ${typeCode} 本轮仅验证 dry-run 计划；未执行真实 publish`);
    }

    if (result.roundTrip) {
      ok =
        assertOk(
          `${typeCode} publish body → version show value`,
          result.roundTrip.dryDiff.length === 0,
          result.roundTrip.dryDiff.length ? formatAttrDiff(result.roundTrip.dryDiff) : 'inputAttrs 一致',
        ) && ok;
    }

    if (useBrowserGolden) {
      const goldenPath = path.join(fixturesDir, `console-createVersion-${typeCode}.json`);
      if (fs.existsSync(goldenPath)) {
        const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
        const goldenCandidate = result.actualParams || params;
        const mismatches = diffCreateVersionBodies(
          golden,
          normalizeCreateVersionBody(goldenCandidate),
        );
        ok =
          assertOk(
            `${typeCode} 浏览器金样 spot check（可选）`,
            mismatches.length === 0,
            mismatches.length ? formatCreateVersionDiff(mismatches) : '一致',
          ) && ok;
      } else {
        console.log(`i 跳过浏览器金样：${goldenPath} 不存在`);
      }
    }
  } catch (error) {
    ok = false;
    console.error(`✘ ${typeCode}`, error.stderr?.toString()?.slice(0, 400) || error.message);
  } finally {
    cleanup();
  }
}

console.log(`\n=== 结果: ${ok ? 'PASS' : 'FAIL'} ===`);
if (!useBrowserGolden) {
  console.log('i 主验证：CLI 真实 API + Console 源码契约；浏览器金样请加 --browser-golden\n');
} else {
  console.log('');
}
process.exit(ok ? 0 : 1);
