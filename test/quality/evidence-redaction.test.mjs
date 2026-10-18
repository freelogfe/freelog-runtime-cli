import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { redactEvidence } from '../acceptance/evidence-redaction.mjs';
import { collectSuiteOutcome } from '../run-final-acceptance.mjs';

// Deliberately fake values. No credential file, credential provider or network is read.
const fakePassword = 'synthetic-primary-password';
const sensitiveValues = ['synthetic-json-password', 'synthetic-json-token', 'synthetic-bearer', 'synthetic-cookie',
  'synthetic-refresh', 'synthetic-set-cookie', 'synthetic-set-refresh', 'synthetic-query', 'synthetic-url-password', fakePassword];
const diagnostic = `AxiosError: Request failed with status 503
config: { headers: Object [AxiosHeaders] {
  Authorization: 'Bearer synthetic-bearer',
  Cookie:
    'sid=synthetic-cookie; ' +
    'refresh=synthetic-refresh',
  'set-cookie': [
    'sid=synthetic-set-cookie; Path=/',
    'refresh=synthetic-set-refresh; Path=/'
  ]
}, url: 'https://synthetic-user:synthetic-url-password@example.invalid/path?access_token=synthetic-query&status=503',
data: '{"password":"synthetic-json-password","token":"synthetic-json-token"}',
status: 503, unrelated: '${fakePassword}' }
`;
function noSecrets(value, secrets = sensitiveValues) {
  for (const secret of secrets) assert.equal(String(value).includes(secret), false, `Leaked synthetic value: ${secret}`);
}
function temporary(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-redaction-quality-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-redaction-quality-'));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? filesUnder(path.join(root, entry.name)) : [path.join(root, entry.name)]);
}

test('JSON authentication fields and serialized HTTP errors redact without changing status/business JSON', () => {
  const source = { status: 'FAIL', exitCode: 1, code: 'HTTP_ERROR', response: { status: 503 },
    config: { headers: { Authorization: 'Basic synthetic-basic', Cookie: 'sid=synthetic-cookie' },
      data: JSON.stringify({ password: 'synthetic-json-password', access_token: 'synthetic-json-token' }) },
    stderr: diagnostic, assertions: [{ expected: 'unchanged', actual: 'unchanged', passed: true }] };
  const result = JSON.parse(redactEvidence(JSON.stringify(source), [fakePassword]));
  noSecrets(JSON.stringify(result), [...sensitiveValues, 'synthetic-basic']);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.equal(result.response.status, 503);
  assert.deepEqual(result.assertions, source.assertions);
  const business = '{\n  "version": "1.1.0", "description": "更新文本", "dependencies": [], "tokenCount": 2, "status": 1\n}';
  assert.equal(redactEvidence(business), business);
});

test('Node inspect multiline headers, joined cookie strings and cookie arrays do not leak', () => {
  const result = redactEvidence(diagnostic, [fakePassword]);
  noSecrets(result);
  assert.match(result, /503/u);
  assert.match(result, /AxiosError/u);
  for (const line of ['Cookie: sid=synthetic-cookie; refresh=synthetic-refresh\r\nstatus: 503',
    "'Set-Cookie': ['sid=synthetic-cookie]suffix', 'refresh=synthetic-refresh']", 'Authorization: Basic synthetic-basic']) {
    noSecrets(redactEvidence(line), ['synthetic-cookie', 'synthetic-refresh', 'synthetic-basic']);
  }
  const requestHeader = "_header: 'GET /path HTTP/1.1\\r\\n' +\n  'Cookie: sid=synthetic-cookie; refresh=synthetic-refresh\\r\\n' +\n  'Connection: keep-alive\\r\\n'";
  noSecrets(redactEvidence(requestHeader), ['synthetic-cookie', 'synthetic-refresh']);
});

test('known secrets include literal, JSON-escaped and URL-encoded forms; query field names stay bounded', () => {
  const secret = 'synthetic line\n"中文/&';
  for (const value of [secret, JSON.stringify(secret), encodeURIComponent(secret), encodeURIComponent(secret).toLowerCase()]) {
    assert.equal(redactEvidence(`unlabelled ${value}`, [secret]).includes(value), false);
  }
  const result = redactEvidence('https://example.invalid/path?token=synthetic-query&version=1.1.0&refresh_token=synthetic-refresh#ok');
  noSecrets(result, ['synthetic-query', 'synthetic-refresh']);
  assert.match(result, /version=1\.1\.0/u);
  assert.equal(redactEvidence('not-a-secret-marker resourceTokenCount=12'), 'not-a-secret-marker resourceTokenCount=12');
  assert.equal(redactEvidence('broken surrogate: \ud800', ['\ud800']), 'broken surrogate: <redacted>');
});

test('inline diagnostic header prefixes cannot leave credentials after a removed scheme or cookie segment', () => {
  for (const header of ['Authorization: Bearer synthetic-inline-auth', 'Authorization: Basic synthetic-inline-basic',
    'Proxy-Authorization: Bearer synthetic-inline-proxy', 'Cookie: sid=synthetic-inline-cookie; other=synthetic-inline-other',
    'Set-Cookie: sid=synthetic-inline-set; Path=/; HttpOnly', 'Authorization=Bearer synthetic-inline-equals']) {
    const safe = redactEvidence(`API query failed: ${header}\nstatus: 503`);
    assert.equal(safe.includes('synthetic-inline-'), false, safe);
    assert.match(safe, /status: 503/u);
  }
});

test('aggregator retains the failed process result but redacts diagnostic error and case reason', (t) => {
  const root = temporary(t);
  const catalog = [{ id: 'SYNTHETIC.REDACTION', kind: 'product-case', required: true,
    title: 'Synthetic failed process only', assertionIds: ['exact-result'], script: 'verify-commands.mjs' }];
  const result = collectSuiteOutcome('verify-commands.mjs', { status: 1, error: new Error(diagnostic) }, path.join(root, 'missing.json'), catalog);
  assert.equal(result.outcome.status, 'FAIL');
  assert.equal(result.outcome.process.exitCode, 1);
  assert.equal(result.cases[0].status, 'FAIL');
  // No password is supplied to this aggregate API; its field-labeled tokens/cookies must still be safe.
  noSecrets(JSON.stringify(result), sensitiveValues.filter((value) => value !== fakePassword));
});

function preload(root, mode) {
  const file = path.join(root, `preload-${mode}.mjs`);
  writeFileSync(file, `import fs from 'node:fs'; import cp from 'node:child_process'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import { syncBuiltinESMExports } from 'node:module';
const diagnostic = ${JSON.stringify(diagnostic)};
const denyNetwork = () => { throw new Error('Synthetic report test forbids network'); };
globalThis.fetch = denyNetwork; http.request = denyNetwork; https.request = denyNetwork;
net.connect = denyNetwork; net.createConnection = denyNetwork; net.Socket.prototype.connect = denyNetwork;
const originalRead = fs.readFileSync, originalExists = fs.existsSync, originalSpawn = cp.spawnSync;
fs.readFileSync = function(file, ...args) {
  const name = path.basename(String(file));
  if (name === '.freelog-test-credentials.local.json') return JSON.stringify({primary:{loginName:'freelog-synthetic',password:${JSON.stringify(fakePassword)}}});
  if (name === '.freelog-test-resource-pool.local.json') return JSON.stringify({resources:[{resourceId:'synthetic-target',resourceName:'synthetic/target'}]});
  return originalRead.call(this, file, ...args);
};
fs.existsSync = function(file) { return /^\\.freelog-test-.*\\.local\\.json$/u.test(path.basename(String(file))) || originalExists.call(this, file); };
os.tmpdir = () => ${JSON.stringify(root)};
cp.spawnSync = function(command, args, options) {
  if (command === 'git') return originalSpawn.call(this, command, args, options);
  if (${JSON.stringify(mode)} === 'throw') throw new Error(diagnostic);
  if (${JSON.stringify(mode)}.startsWith('type-')) {
    if (args?.[1] === 'login') return {status:0,signal:null,stdout:'synthetic login',stderr:''};
    if (args?.[1] === 'type') {
      const rows = {'type-unsupported':'RT005001\\t照片\\t可选配置：不支持','type-unknown':'可选配置：支持','type-foreign':'RT001\\t主题\\t可选配置：支持','type-supported':'RT005001\\t照片\\t可选配置：支持'};
      return {status:${JSON.stringify(mode)} === 'type-fail' ? 1 : 0,signal:null,stdout:rows[${JSON.stringify(mode)}] ?? '',stderr:''};
    }
  }
  if (args?.some(arg => String(arg).endsWith('tty-probe.mjs'))) return {status:0,signal:null,stdout:'synthetic probe only',stderr:''};
  return {status:1,signal:null,stdout:'{"code":"SYNTHETIC_FAILURE","message":"failure retained"}',stderr:diagnostic};
};
syncBuiltinESMExports();\n`);
  return file;
}

for (const mode of ['output', 'throw']) test(`lifecycle ${mode} failure console and every report artifact redact without claiming PASS`, (t) => {
  const root = temporary(t);
  const reportDir = path.join(root, 'reports'); mkdirSync(reportDir);
  const output = path.join(reportDir, 'suite.json');
  const fakeCli = path.join(root, 'synthetic-cli.mjs'); writeFileSync(fakeCli, '// synthetic; never executed\n');
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload(root, mode)).href,
    fileURLToPath(new URL('../verify-theme-image-full-lifecycle.mjs', import.meta.url)), '--env', 'dev', '--only', 'image'], {
    env: { ...process.env, FREELOG_TEST_SUITE_REPORT: output, FREELOG_TEST_RUN_ID: 'synthetic-redaction', FREELOG_TEST_CLI_BIN: fakeCli }, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 1, result.stderr);
  noSecrets(`${result.stdout}${result.stderr}`);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.deepEqual(report.cases.map((item) => item.status), ['NOT_TESTED', 'FAIL', 'NOT_TESTED']);
  assert.ok(filesUnder(reportDir).length >= 5);
  for (const file of filesUnder(reportDir)) noSecrets(readFileSync(file, 'utf8'));
  const raw = JSON.parse(readFileSync(report.cases[1].evidenceRef.path, 'utf8'));
  if (mode === 'output') {
    assert.equal(raw.observations.actions[0].process.exitCode, 1);
    assert.equal(raw.observations.actions[0].stdout, '{"code":"SYNTHETIC_FAILURE","message":"failure retained"}');
  } else assert.match(report.cases[1].reason, /AxiosError/u);
});

test('actual lifecycle type-info failure and unrecognized rows stay FAIL; only explicit same-code unsupported is BLOCKED', (t) => {
  const root = temporary(t);
  const fakeCli = path.join(root, 'synthetic-cli.mjs'); writeFileSync(fakeCli, '// synthetic; never executed\n');
  for (const [mode, exitCode, status] of [['type-fail', 1, 'FAIL'], ['type-unknown', 1, 'FAIL'], ['type-foreign', 1, 'FAIL'], ['type-unsupported', 3, 'BLOCKED'], ['type-supported', 1, 'FAIL']]) {
    const reportDir = path.join(root, mode); mkdirSync(reportDir);
    const output = path.join(reportDir, 'suite.json');
    const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload(root, mode)).href,
      fileURLToPath(new URL('../verify-theme-image-full-lifecycle.mjs', import.meta.url)), '--env', 'dev', '--only', 'image'], {
      env: { ...process.env, FREELOG_TEST_SUITE_REPORT: output, FREELOG_TEST_RUN_ID: 'synthetic-type-capability', FREELOG_TEST_CLI_BIN: fakeCli }, encoding: 'utf8', timeout: 15_000,
    });
    assert.equal(result.status, exitCode, mode);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(report.cases.map((item) => item.status), ['NOT_TESTED', status, 'NOT_TESTED'], mode);
    if (mode === 'type-supported') assert.ok(report.cases[1].observations.actions.some((item) => item.argv[0] === 'init'));
    else assert.equal(report.cases[1].observations.actions.length, 2, mode);
  }
});

test('aggregate failure artifacts redact child stderr without changing actual failure counts', (t) => {
  const root = temporary(t);
  const env = { ...process.env };
  delete env.FREELOG_TEST_CLI_BIN; delete env.FREELOG_TEST_CANDIDATE_MODE; delete env.FREELOG_TEST_SUITE_REPORT;
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload(root, 'output')).href,
    fileURLToPath(new URL('../run-final-acceptance.mjs', import.meta.url)), '--env', 'dev', '--skip-build'], {
    env, encoding: 'utf8', timeout: 30_000,
  });
  assert.equal(result.status, 1, result.stderr);
  noSecrets(`${result.stdout}${result.stderr}`, sensitiveValues.filter((value) => value !== fakePassword));
  const reportRoot = path.join(root, 'freelog-runtime-cli-verification');
  assert.ok(existsSync(reportRoot));
  const files = filesUnder(reportRoot);
  const report = JSON.parse(readFileSync(files.find((file) => path.basename(file) === 'acceptance.json'), 'utf8'));
  assert.ok(report.summary.FAIL > 0);
  assert.equal(report.releaseApproved, false);
  for (const file of files) noSecrets(readFileSync(file, 'utf8'), sensitiveValues.filter((value) => value !== fakePassword));
});

test('dependency report helper reuses safe text for console, retained lines and failure reason', (t) => {
  const root = temporary(t);
  const fakeCli = path.join(root, 'synthetic-cli.mjs'); writeFileSync(fakeCli, '// synthetic; never executed\n');
  const source = `import { makeContext, runCli } from ${JSON.stringify(new URL('../dependency-declaration-helpers.mjs', import.meta.url).href)};
    const ctx = makeContext('synthetic-dependency-report', 'dev');
    const result = runCli(ctx, 'login', ['login','--password-stdin'], { input: ${JSON.stringify(`${fakePassword}\n`)} });
    if (result.status !== 1 || result.ok) throw new Error('Synthetic failure status changed');
    ctx.log(${JSON.stringify(diagnostic)}); ctx.finish('FAIL', ${JSON.stringify(diagnostic)});`;
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload(root, 'output')).href, '--input-type=module', '-e', source], {
    env: { ...process.env, FREELOG_TEST_CLI_BIN: fakeCli }, encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.status, 0, result.stderr);
  noSecrets(`${result.stdout}${result.stderr}`);
  const file = path.join(root, 'freelog-runtime-cli-verification', 'synthetic-dependency-report.txt');
  noSecrets(readFileSync(file, 'utf8'));
  assert.match(readFileSync(file, 'utf8'), /结果: FAIL/u);
});
