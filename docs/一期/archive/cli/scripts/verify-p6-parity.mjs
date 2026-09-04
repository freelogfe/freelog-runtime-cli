#!/usr/bin/env node
/**
 * P6 Console parity 真实环境验证（dev API + 主账号）。
 * 用法：pnpm build && node scripts/verify-p6-parity.mjs [--env dev]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHarness, testPhoto } from './lib/verify-harness.mjs';
import { resolveFrozenResourceId } from './lib/test-fixtures.mjs';

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

const h = createHarness(env);
const {
  pass,
  skip,
  fail,
  runCli,
  runCliExpectFail,
  parseJson,
  expectFailCode,
  expectEnvelope,
  loginPrimary,
  copyUniqueFile,
  writePolicyFile,
  summarize,
  assertCliBuilt,
} = h;

console.log(`\n=== P6 Console parity E2E (env=${env}) ===\n`);
assertCliBuilt();

if (!fs.existsSync(testPhoto)) {
  skip('P6-* 全链路', '测试图片不存在');
  process.exit(summarize('P6 汇总') ? 1 : 0);
}

const ts = Date.now();
let depTargetId = '';
let depTargetLatest = '';
let engResourceId = '';
let engSha1 = '';
let sessionResourceId = '';

try {
  loginPrimary();
  pass('P6-00 login');

  // --- 准备：发布一个可被依赖的资源（P6-1 用） ---
  const depSrcWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-p6-dep-src-'));
  copyUniqueFile(testPhoto, path.join(depSrcWork, 'photo.png'), `p6-dep-${ts}`);
  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name p6-dep-src-${ts} --title "P6 Dep Src ${ts}" --yes --json`,
    { cwd: depSrcWork },
  );
  runCli(`create --yes --json`, { cwd: depSrcWork });
  runCli(`version set --version 1.0.0 --file photo.png --yes --json`, { cwd: depSrcWork });
  const depPub = parseJson(runCli(`publish --yes --json`, { cwd: depSrcWork }));
  if (
    expectEnvelope(depPub, { ok: true, command: 'publish' }) &&
    depPub.resourceId &&
    depPub.version === '1.0.0'
  ) {
    depTargetId = depPub.resourceId;
    depTargetLatest = depPub.version;
    pass('P6-01 准备依赖源资源 publish', `${depTargetId}@${depTargetLatest}`);
  } else {
    fail('P6-01 准备依赖源资源 publish', JSON.stringify(depPub).slice(0, 200));
  }

  // --- P6-1：dep add 默认 ^latestVersion ---
  if (depTargetId) {
    const depWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-p6-dep-add-'));
    copyUniqueFile(testPhoto, path.join(depWork, 'photo.png'), `p6-host-${ts}`);
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name p6-host-${ts} --title "P6 Host ${ts}" --yes --json`,
      { cwd: depWork },
    );
    runCli(`create --yes --json`, { cwd: depWork });
    runCli(`version set --version 1.0.0 --file photo.png --yes --json`, { cwd: depWork });
    runCli(`publish --yes --json`, { cwd: depWork });

    const depAddResult = parseJson(
      runCli(`dep add ${depTargetId} --yes --json`, { cwd: depWork }),
    );
    const added = depAddResult?.dependencies?.find((d) => d.resourceId === depTargetId);
    const expectedRange = `^${depTargetLatest}`;
    if (added?.versionRange === expectedRange) {
      pass('P6-1 dep add 默认 range', expectedRange);
    } else {
      fail('P6-1 dep add 默认 range', `期望 ${expectedRange}，实际 ${added?.versionRange ?? 'missing'}`);
    }

    // 显式 * 仍优先
    runCli(`dep remove ${depTargetId} --yes --json`, { cwd: depWork });
    const explicitStar = parseJson(
      runCli(`dep add ${depTargetId} --version-range "*" --yes --json`, { cwd: depWork }),
    );
    const starAdded = explicitStar?.dependencies?.find((d) => d.resourceId === depTargetId);
    if (starAdded?.versionRange === '*') {
      pass('P6-1 dep add 显式 * 优先', '*');
    } else {
      fail('P6-1 dep add 显式 * 优先', starAdded?.versionRange ?? 'missing');
    }
  }

  // --- P6-2 工程：publish --reuse-version ---
  const engWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-p6-reuse-eng-'));
  copyUniqueFile(testPhoto, path.join(engWork, 'photo.png'), `p6-eng-${ts}`);
  runCli(
    `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name p6-reuse-eng-${ts} --title "P6 Reuse Eng ${ts}" --yes --json`,
    { cwd: engWork },
  );
  runCli(`create --yes --json`, { cwd: engWork });
  runCli(`version set --version 1.0.0 --file photo.png --yes --json`, { cwd: engWork });
  const engPub1 = parseJson(runCli(`publish --yes --json`, { cwd: engWork }));
  if (engPub1?.resourceId && engPub1?.fileSha1) {
    engResourceId = engPub1.resourceId;
    engSha1 = engPub1.fileSha1;
    const engPub2 = parseJson(
      runCli(`publish --reuse-version 1.0.0 --bump --yes --json`, { cwd: engWork }),
    );
    if (
      expectEnvelope(engPub2, { ok: true, command: 'publish' }) &&
      engPub2.version === '1.0.1' &&
      engPub2.fileSha1 === engSha1
    ) {
      pass('P6-2 工程 publish --reuse-version', `1.0.1 sha1=${engSha1.slice(0, 12)}…`);
    } else {
      fail(
        'P6-2 工程 publish --reuse-version',
        JSON.stringify({ version: engPub2?.version, sha1: engPub2?.fileSha1?.slice(0, 12) }).slice(
          0,
          200,
        ),
      );
    }
  } else {
    fail('P6-2 工程首发 publish', JSON.stringify(engPub1).slice(0, 200));
  }

  // --- P6-2 会话：resource publish --reuse-version ---
  const sesWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-p6-reuse-ses-'));
  const sesPhoto = path.join(sesWork, 'ses.png');
  copyUniqueFile(testPhoto, sesPhoto, `p6-ses-${ts}`);
  const sesPub1 = parseJson(
    runCli(
      `resource publish --session --title "P6 Ses ${ts}" --type RT005001 --artifact-mode file --file "${sesPhoto}" --version 1.0.0 --yes --json`,
      { cwd: sesWork },
    ),
  );
  if (sesPub1?.resourceId && sesPub1?.fileSha1) {
    sessionResourceId = sesPub1.resourceId;
    const sesSha1 = sesPub1.fileSha1;
    const sesPub2 = parseJson(
      runCli(
        `resource publish --session --resource-id ${sessionResourceId} --reuse-version 1.0.0 --version 1.0.1 --yes --json`,
        { cwd: sesWork },
      ),
    );
    if (
      expectEnvelope(sesPub2, { ok: true, command: 'resource publish' }) &&
      sesPub2.version === '1.0.1' &&
      sesPub2.fileSha1 === sesSha1
    ) {
      pass('P6-2 会话 --reuse-version', `1.0.1 mode=${sesPub2.mode}`);
    } else {
      fail('P6-2 会话 --reuse-version', JSON.stringify(sesPub2).slice(0, 240));
    }
  } else {
    fail('P6-2 会话首发 publish', JSON.stringify(sesPub1).slice(0, 200));
  }

  // --- P6-4：frozen 资源 online（可选） ---
  const frozenId = resolveFrozenResourceId(env);
  if (!frozenId) {
    skip('P6-4 frozen online 拒绝', '运行 provision-frozen-fixture 或设置 FREELOG_TEST_FROZEN_RESOURCE_ID');
  } else {
    const frozenWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-p6-frozen-'));
    copyUniqueFile(testPhoto, path.join(frozenWork, 'f.png'), `p6-frozen-${ts}`);
    runCli(
      `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name p6-frozen-bind-${ts} --title "Frozen Bind" --yes --json`,
      { cwd: frozenWork },
    );
    runCli(`bind ${frozenId} --yes --json`, { cwd: frozenWork });
    const policyPath = path.join(frozenWork, 'policy.free.json');
    writePolicyFile(policyPath);
    try {
      runCli(`policy apply --from-file "${policyPath}" --yes --json`, { cwd: frozenWork });
    } catch {
      // 冻结资源可能无法 apply policy
    }
    const frozenOnline = runCliExpectFail('online --yes --json', { cwd: frozenWork });
    if (frozenOnline.failed && expectFailCode(frozenOnline, 4)) {
      pass('P6-4 frozen online 拒绝', frozenId);
    } else {
      fail('P6-4 frozen online 拒绝', frozenOnline.stderr.slice(0, 200) || '未失败');
    }
  }
} catch (e) {
  fail('P6 未捕获异常', e.message);
}

process.exit(summarize('P6 汇总') ? 1 : 0);
