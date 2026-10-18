import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { commandParameterCases } from '../acceptance/command-parameter-cases.mjs';

const guard = fileURLToPath(new URL('../acceptance/deny-network.mjs', import.meta.url));
const producer = new URL('../verify-command-parameters.mjs', import.meta.url);
function temporary(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-command-quality-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-command-quality-'));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
const snapshot = [{ path: '.freelog', kind: 'directory' }, { path: '.freelog/1.json', kind: 'file', size: 12, sha256: 'a'.repeat(64) }];
function observation(leaf) {
  return { argv: [...leaf.action.argv], stdin: leaf.action.stdin,
    result: { status: 1, signal: null, error: null, timedOut: false, stdout: `${JSON.stringify(leaf.expected.errorJson)}\n`, stderr: '' },
    before: snapshot, after: structuredClone(snapshot),
    networkLog: `${JSON.stringify({ schemaVersion: 1, event: 'ready', guard: 'local-parameter-no-network-v1' })}\n${JSON.stringify({ schemaVersion: 1, event: 'finished', attempts: 0 })}\n` };
}

test('five design-bound leaves retain complete input, expected JSON and side-effect contracts', () => {
  assert.equal(commandParameterCases.length, 5);
  assert.equal(new Set(commandParameterCases.map((leaf) => leaf.id)).size, 5);
  for (const leaf of commandParameterCases) {
    assert.equal(leaf.parentRule, 'COMMAND.PARAMETER_CONTRACT');
    assert.equal(leaf.expected.exitCode, 1);
    assert.equal(leaf.expected.networkAttempts, 0);
    assert.ok(leaf.action.argv.includes('--json') && leaf.action.argv.includes('--yes'));
    assert.ok(leaf.preconditions.length && leaf.forbiddenSideEffects.length && leaf.inputClass && leaf.layer);
    for (const ref of leaf.designRefs) assert.ok(ref.section && existsSync(fileURLToPath(new URL(`../../${ref.path}`, import.meta.url))), ref.path);
  }
});

test('complete exact observations pass, but wrong JSON, crashes, local changes and missing guard cannot pass', async () => {
  const { evaluateCommandCase } = await import(producer);
  const leaf = commandParameterCases[0];
  assert.equal(evaluateCommandCase(leaf, observation(leaf)).status, 'PASS');
  for (const [mutate, assertion] of [
    [(value) => { value.result.stdout = JSON.stringify({ ...leaf.expected.errorJson, code: 'AUTH_REQUIRED' }); }, 'exact-error-json'],
    [(value) => { value.result.stdout += '{}'; }, 'exact-error-json'],
    [(value) => { value.result.stderr = 'unexpected warning'; }, 'stderr-empty'],
    [(value) => { value.result.status = null; value.result.signal = 'SIGTERM'; }, 'normal-rejection'],
    [(value) => { value.result.error = new Error('spawn failed'); }, 'normal-rejection'],
    [(value) => { value.result.timedOut = true; }, 'normal-rejection'],
    [(value) => { value.after = [...value.after, { path: 'unexpected-empty-dir', kind: 'directory' }]; }, 'local-unchanged'],
    [(value) => { value.after[1].sha256 = 'b'.repeat(64); }, 'local-unchanged'],
    [(value) => { delete value.before; delete value.after; }, 'local-unchanged'],
    [(value) => { value.before = []; value.after = []; }, 'local-unchanged'],
    [(value) => { value.networkLog = ''; }, 'network-unused'],
    [(value) => { value.networkLog = value.networkLog.replace('"attempts":0', '"attempts":1'); }, 'network-unused'],
    [(value) => { value.networkLog = `${JSON.stringify({ schemaVersion: 1, event: 'ready', guard: 'local-parameter-no-network-v1' })}\n${JSON.stringify({ schemaVersion: 1, event: 'blocked', kind: 'https.request' })}\n${JSON.stringify({ schemaVersion: 1, event: 'finished', attempts: 1 })}\n`; }, 'network-unused'],
  ]) {
    const value = observation(leaf); mutate(value);
    const result = evaluateCommandCase(leaf, value);
    assert.equal(result.status, 'FAIL', assertion);
    assert.equal(result.assertions.find((item) => item.id === assertion).passed, false, assertion);
  }
});

test('suite completion rejects missing, duplicate and foreign leaves instead of approving partial reports', async () => {
  const { evaluateCommandCase, validateCommandResults } = await import(producer);
  const cases = commandParameterCases.map((leaf) => evaluateCommandCase(leaf, observation(leaf)));
  assert.equal(validateCommandResults(cases).length, 5);
  assert.throws(() => validateCommandResults(cases.slice(1)), /Missing cases/u);
  assert.throws(() => validateCommandResults([...cases, cases[0]]), /duplicate/u);
  assert.throws(() => validateCommandResults([{ ...cases[0], id: 'unknown' }, ...cases.slice(1)]), /Unknown/u);
});

test('identical error messages cannot substitute execution of a different input class', async () => {
  const { evaluateCommandCase } = await import(producer);
  const staging = commandParameterCases[0];
  const local = commandParameterCases[1];
  const observed = observation(local);
  observed.argv = [...staging.action.argv];
  observed.stdin = staging.action.stdin;
  const result = evaluateCommandCase(local, observed);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.assertions.find((item) => item.id === 'command-input').passed, false);
});

test('installed-bin resolution has no workspace fallback and missing bins produce all five BLOCKED results', async (t) => {
  const { requireInstalledCli, runCommandParameterCases } = await import(producer);
  assert.throws(() => requireInstalledCli({}), /FREELOG_TEST_CLI_BIN/u);
  assert.throws(() => requireInstalledCli({ FREELOG_TEST_CLI_BIN: path.resolve('packages/cli/dist/bin/index.js') }), /installed/u);
  const root = temporary(t);
  const output = path.join(root, 'suite.json');
  const originalRunId = process.env.FREELOG_TEST_RUN_ID;
  process.env.FREELOG_TEST_RUN_ID = 'quality-blocked';
  try {
    const results = runCommandParameterCases({ env: { FREELOG_TEST_RUN_ID: 'quality-blocked' }, output });
    assert.equal(results.cases.length, 5);
    assert.ok(results.cases.every((item) => item.status === 'BLOCKED' && item.reason.includes('FREELOG_TEST_CLI_BIN is required')));
    const report = JSON.parse(readFileSync(output));
    assert.equal(report.cases.length, 5);
    for (const item of report.cases) {
      assert.equal(item.evidenceRef.runId, 'quality-blocked');
      assert.ok(existsSync(item.evidenceRef.path));
      assert.equal(JSON.parse(readFileSync(item.evidenceRef.path)).observations.executed, false);
    }
  } finally {
    if (originalRunId === undefined) delete process.env.FREELOG_TEST_RUN_ID;
    else process.env.FREELOG_TEST_RUN_ID = originalRunId;
  }
});

test('network preload blocks actual HTTP/HTTPS/fetch/net/socket attempts without recording request data', (t) => {
  const root = temporary(t);
  const log = path.join(root, 'network.jsonl'); writeFileSync(log, '');
  const source = `import http from 'node:http'; import https from 'node:https'; import net from 'node:net'; import tls from 'node:tls'; import dgram from 'node:dgram'; import http2 from 'node:http2';
    const actions = [() => http.get('http://127.0.0.1:1/?private=never-log-me'), () => http.request('http://127.0.0.1:1'),
      () => https.get('https://example.invalid/?private=never-log-me'), () => https.request('https://example.invalid'),
      () => fetch('https://example.invalid'), () => net.connect(1, '127.0.0.1'), () => net.createConnection(1, '127.0.0.1'),
      () => new net.Socket().connect(1, '127.0.0.1'), () => tls.connect(1, '127.0.0.1'),
      () => dgram.createSocket('udp4'), () => http2.connect('https://example.invalid')];
    for (const action of actions) { try { await action(); throw new Error('network was allowed'); } catch (error) { if (error.code !== 'FREELOG_TEST_NETWORK_FORBIDDEN') throw error; } }
    console.log('all denied');`;
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, '--input-type=module', '-e', source], {
    env: { ...process.env, NODE_OPTIONS: '', FREELOG_TEST_NETWORK_LOG: log }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  const raw = readFileSync(log, 'utf8');
  const events = raw.trim().split('\n').map(JSON.parse);
  assert.equal(events.filter((item) => item.event === 'blocked').length, 11);
  assert.equal(events.at(-1).attempts, 11);
  assert.doesNotMatch(raw, /example|127\.0|private|never-log/u);
});

test('network preload proves its zero-attempt lifecycle and fails closed without an owned log', (t) => {
  const root = temporary(t);
  const log = path.join(root, 'network.jsonl'); writeFileSync(log, '');
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, '-e', 'process.stdout.write("local only")'], {
    env: { ...process.env, NODE_OPTIONS: '', FREELOG_TEST_NETWORK_LOG: log }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(readFileSync(log, 'utf8').trim().split('\n').at(-1)).attempts, 0);
  const invalid = spawnSync(process.execPath, ['--import', pathToFileURL(guard).href, '-e', 'process.stdout.write("must not run")'], {
    env: { ...process.env, NODE_OPTIONS: '', FREELOG_TEST_NETWORK_LOG: '' }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
});
