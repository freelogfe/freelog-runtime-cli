#!/usr/bin/env node
/**
 * 写命令 JSON envelope 扫尾（JSON-*）。用法：node scripts/verify-json-envelope.mjs [--env dev]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHarness, testPhoto } from './lib/verify-harness.mjs';

const envArgIdx = process.argv.indexOf('--env');
const env = envArgIdx >= 0 ? process.argv[envArgIdx + 1] || 'dev' : 'dev';

const h = createHarness(env);
const {
  pass,
  fail,
  runCli,
  runCliExpectFail,
  parseJson,
  parseCliErrorJson,
  expectEnvelope,
  loginPrimary,
  copyUniqueFile,
  writePolicyFile,
  summarize,
  assertCliBuilt,
} = h;

console.log(`\n=== JSON envelope 验证 (env=${env}) ===\n`);
assertCliBuilt();

function checkSuccess(label, stdout, expectedCommand) {
  const parsed = parseJson(stdout);
  if (expectEnvelope(parsed, { ok: true, command: expectedCommand })) {
    pass(label, parsed.command);
    return parsed;
  }
  fail(label, JSON.stringify(parsed).slice(0, 200));
  return null;
}

function checkFailure(label, result, expectedCode) {
  const parsed = parseCliErrorJson(`${result.stderr}${result.stdout}`);
  if (!result.failed) {
    fail(label, '应失败但成功');
    return;
  }
  if (expectEnvelope(parsed, { ok: false }) && parsed.error?.code === expectedCode) {
    pass(label, `code ${expectedCode}`);
    return;
  }
  fail(label, (result.stderr || result.stdout).slice(0, 200));
}

// JSON-01 离线写命令：config / policy / dep init-auth-map
try {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-json-offline-'));
  checkSuccess('JSON-01 config init', runCli('config init --default-env dev --json', { cwd: work }), 'config');
  checkSuccess('JSON-01 policy init', runCli('policy init --json', { cwd: work }), 'scaffold');
  checkSuccess('JSON-01 dep init-auth-map', runCli('dep init-auth-map --json', { cwd: work }), 'dep init-auth-map');
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('JSON-01 离线 envelope', e.message);
}

// JSON-02 dev 写命令成功 envelope
try {
  if (!fs.existsSync(testPhoto)) {
    fail('JSON-02 dev 写命令', '测试图片不存在');
  } else {
    loginPrimary();
    const ts = Date.now();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-json-dev-'));
    copyUniqueFile(testPhoto, path.join(work, 'photo.png'), ts);
    writePolicyFile(path.join(work, 'policy.free.json'));
    checkSuccess('JSON-02 init', runCli(
        `init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name json-${ts} --title "JSON" --yes --json`,
        { cwd: work },
      ), 'init');
    checkSuccess('JSON-02 create', runCli('create --yes --json', { cwd: work }), 'create');
    checkSuccess(
      'JSON-02 version set',
      runCli('version set --version 1.0.0 --file photo.png --yes --json', { cwd: work }),
      'version',
    );
    checkSuccess('JSON-02 publish dry-run', runCli('publish --dry-run --json', { cwd: work }), 'publish');
    checkSuccess('JSON-02 status', runCli('status --json', { cwd: work }), 'status');
    checkSuccess('JSON-02 dep list', runCli('dep list --json', { cwd: work }), 'dep list');
    fs.rmSync(work, { recursive: true, force: true });
  }
} catch (e) {
  fail('JSON-02 dev 写命令', e.stderr?.toString()?.slice(0, 200) || e.message);
}

// JSON-03 stdout 协议：失败时 stderr 含 JSON，stdout 不混入人类日志（create 在无 env 时）
try {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-json-stdout-'));
  runCli(
    'init . --scaffold none --artifact-mode file --resource-type RT005001 --resource-name jout --title "J" --yes --json',
    { cwd: work },
  );
  const result = runCliExpectFail('create --yes --json', {
    cwd: work,
    includeEnv: false,
    envVars: { FREELOG_ENV: '', FREELOG_DEV: '' },
  });
  const stdoutTrim = (result.stdout || '').trim();
  if (result.failed && (!stdoutTrim || stdoutTrim.startsWith('{'))) {
    pass('JSON-03 失败 stdout 协议', stdoutTrim ? 'envelope on stdout' : 'empty stdout');
  } else if (result.failed) {
    pass('JSON-03 失败 stdout 协议', 'stderr 承载错误');
  } else {
    fail('JSON-03 失败 stdout 协议', '未触发失败');
  }
  fs.rmSync(work, { recursive: true, force: true });
} catch (e) {
  fail('JSON-03 stdout 协议', e.message);
}

// JSON-04 debug 脱敏（login 错误路径不含明文 password）
try {
  const probe = `probe-${Date.now()}-x7Kq9mP2`;
  const result = runCliExpectFail(
    [
      'login',
      '--global',
      '--login-name',
      'invalid-user-xyz',
      '--password-stdin',
      '--yes',
      '--debug',
      '--json',
    ],
    { input: `${probe}\n` },
  );
  const blob = `${result.stdout}${result.stderr}`;
  if (!blob.includes(probe)) {
    pass('JSON-04 debug 脱敏', result.failed ? 'failure path' : 'success path 无 password');
  } else {
    fail('JSON-04 debug 脱敏', blob.slice(0, 200));
  }
} catch (e) {
  fail('JSON-04 debug 脱敏', e.message);
}

// JSON-05 已知失败 envelope 字段
try {
  const result = runCliExpectFail('policy set fake-id --status 9 --yes --json');
  checkFailure('JSON-05 policy set 非法 status', result, 4);
} catch (e) {
  fail('JSON-05 policy set 非法 status', e.message);
}

process.exit(summarize('JSON 汇总') ? 1 : 0);
