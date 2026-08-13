#!/usr/bin/env node
/**
 * 会话模式 smoke（SES-*）：vitest 子集 + 离线门禁 + dev API 全链路。
 * 用法：pnpm build && node scripts/verify-session-smoke.mjs [--env dev]
 *
 * 覆盖 §17 会话 MVP=Y：R-01/V-01、R-02、P-01–P-04、--export-project 等。
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHarness, cliRoot, testPhoto } from './lib/verify-harness.mjs';

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

console.log(`\n=== 会话模式 smoke (env=${env}) ===\n`);
assertCliBuilt();

// SES-00 vitest 子集（离线）
try {
  execSync(
    'pnpm exec vitest run tests/ephemeralStore.test.ts tests/exportSessionProject.test.ts tests/sessionPublish.test.ts tests/sessionDep.test.ts tests/sessionDepSources.test.ts tests/sessionDepSeed.test.ts',
    { cwd: cliRoot, stdio: 'pipe', encoding: 'utf8' },
  );
  pass('SES-00 vitest 会话子集');
} catch (e) {
  fail('SES-00 vitest 会话子集', e.stdout?.slice(-400) || e.message);
}

// SES-01 离线门禁：maintenance 缺 resource-id
try {
  const result = runCliExpectFail('policy list --session --json');
  if (result.failed && expectFailCode(result, 4)) {
    pass('SES-01 policy list --session 缺 resource-id', 'code 4');
  } else {
    fail('SES-01 policy list --session 缺 resource-id', result.stderr.slice(0, 200) || '未失败');
  }
} catch (e) {
  fail('SES-01 policy list --session 缺 resource-id', e.message);
}

// SES-02 draft push --session 拒
try {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-ses-draft-'));
  const result = runCliExpectFail('draft push --session --yes --json', { cwd: work });
  if (result.failed && expectFailCode(result, 4)) {
    pass('SES-02 draft push --session', 'code 4');
  } else {
    fail('SES-02 draft push --session', result.stderr.slice(0, 200) || '未失败');
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('SES-02 draft push --session', e.message);
}

// SES-03 resource publish 缺 --session
try {
  const result = runCliExpectFail('resource publish --json');
  if (result.failed && expectFailCode(result, 4)) {
    pass('SES-03 resource publish 缺 --session', 'code 4');
  } else {
    fail('SES-03 resource publish 缺 --session', result.stderr.slice(0, 200) || '未失败');
  }
} catch (e) {
  fail('SES-03 resource publish 缺 --session', e.message);
}

if (!fs.existsSync(testPhoto)) {
  skip('SES-10+ dev API 全链路', '测试图片不存在');
  process.exit(summarize('SES 汇总') ? 1 : 0);
}

let sessionResourceId = '';
let sessionWork = '';

try {
  loginPrimary();
  pass('SES-10 login');

  const ts = Date.now();
  sessionWork = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-ses-e2e-'));
  const photo = path.join(sessionWork, 'photo.png');
  copyUniqueFile(testPhoto, photo, ts);
  const policyPath = path.join(sessionWork, 'policy.free.json');
  writePolicyFile(policyPath);

  // R-01 + V-01 + V-02：会话首发 create + publish
  const pub = parseJson(
    runCli(
      `resource publish --session --title "SES ${ts}" --type RT005001 --artifact-mode file --file "${photo}" --version 1.0.0 --yes --json`,
      { cwd: sessionWork },
    ),
  );
  if (
    expectEnvelope(pub, { ok: true, command: 'resource publish' }) &&
    pub.resourceId &&
    pub.version === '1.0.0' &&
    pub.mode === 'session'
  ) {
    sessionResourceId = pub.resourceId;
    pass('SES-11 R-01/V-01 会话首发 publish', sessionResourceId);
  } else {
    fail('SES-11 R-01/V-01 会话首发 publish', JSON.stringify(pub).slice(0, 240));
  }

  // R-02：listing update
  const upd = parseJson(
    runCli(
      `resource update --session --resource-id ${sessionResourceId} --title "SES Upd ${ts}" --yes --json`,
      { cwd: sessionWork },
    ),
  );
  if (expectEnvelope(upd, { ok: true, command: 'resource update' }) && upd.mode === 'session') {
    pass('SES-12 R-02 resource update --session');
  } else {
    fail('SES-12 R-02 resource update --session', JSON.stringify(upd).slice(0, 240));
  }

  // P-01 policy apply
  const pol = parseJson(
    runCli(
      `policy apply --session --resource-id ${sessionResourceId} --from-file "${policyPath}" --yes --json`,
      { cwd: sessionWork },
    ),
  );
  if (expectEnvelope(pol, { ok: true, command: 'policy apply' }) && pol.applied >= 1) {
    pass('SES-13 P-01 policy apply --session', `applied=${pol.applied}`);
  } else {
    fail('SES-13 P-01 policy apply --session', JSON.stringify(pol).slice(0, 240));
  }

  // P-03 online（sidebar 门禁）
  const on = parseJson(
    runCli(`online --session --resource-id ${sessionResourceId} --yes --json`, { cwd: sessionWork }),
  );
  if (expectEnvelope(on, { ok: true, command: 'online' }) && on.mode === 'session') {
    pass('SES-14 P-03 online --session', on.already ? 'already online' : 'online ok');
  } else {
    fail('SES-14 P-03 online --session', JSON.stringify(on).slice(0, 240));
  }

  // P-04 offline
  const off = parseJson(
    runCli(`offline --session --resource-id ${sessionResourceId} --yes --json`, { cwd: sessionWork }),
  );
  if (expectEnvelope(off, { ok: true, command: 'offline' }) && off.mode === 'session') {
    pass('SES-15 P-04 offline --session');
  } else {
    fail('SES-15 P-04 offline --session', JSON.stringify(off).slice(0, 240));
  }

  // P-02 policy set（offline 态下启停，避免「最后一条启用策略」门禁）
  const list = parseJson(
    runCli(`policy list --session --resource-id ${sessionResourceId} --json`, { cwd: sessionWork }),
  );
  const policyId = list.policies?.[0]?.policyId;
  if (policyId) {
    const setOff = parseJson(
      runCli(
        `policy set ${policyId} --status 0 --session --resource-id ${sessionResourceId} --yes --json`,
        { cwd: sessionWork },
      ),
    );
    if (expectEnvelope(setOff, { ok: true, command: 'policy set' })) {
      pass('SES-16 P-02 policy set --session', `policyId=${policyId}`);
      parseJson(
        runCli(`policy set ${policyId} --status 1 --session --resource-id ${sessionResourceId} --yes --json`, {
          cwd: sessionWork,
        }),
      );
    } else {
      fail('SES-16 P-02 policy set --session', JSON.stringify(setOff).slice(0, 240));
    }
  } else {
    fail('SES-16 P-02 policy set --session', '无 policyId');
  }

  // D-* dep list --session（D-05 dep auth 见 SES-00 vitest sessionDep.test.ts）
  const deps = parseJson(
    runCli(
      `dep list --session --resource-id ${sessionResourceId} --target-version 1.0.1 --json`,
      { cwd: sessionWork },
    ),
  );
  if (expectEnvelope(deps, { ok: true, command: 'dep list' }) && deps.mode === 'session') {
    pass('SES-17 D-* dep list --session', `count=${deps.dependencies?.length ?? 0}`);
  } else {
    fail('SES-17 D-* dep list --session', JSON.stringify(deps).slice(0, 240));
  }

  // §9 export-project
  const exportDir = path.join(sessionWork, 'exported');
  fs.mkdirSync(exportDir, { recursive: true });
  const pol2 = parseJson(
    runCli(
      `policy list --session --resource-id ${sessionResourceId} --export-project "${exportDir}" --json`,
      { cwd: sessionWork },
    ),
  );
  if (
    expectEnvelope(pol2, { ok: true }) &&
    pol2.persisted === true &&
    pol2.exportProject &&
    fs.existsSync(path.join(exportDir, 'freelog.manifest.json'))
  ) {
    pass('SES-18 --export-project', exportDir);
  } else {
    fail('SES-18 --export-project', JSON.stringify(pol2).slice(0, 240));
  }
} catch (e) {
  fail('SES-10+ dev API 全链路', e.stderr?.toString()?.slice(0, 300) || e.message);
} finally {
  if (sessionWork && fs.existsSync(sessionWork)) {
    fs.rmSync(sessionWork, { recursive: true, force: true });
  }
}

process.exit(summarize('SES 汇总') ? 1 : 0);
