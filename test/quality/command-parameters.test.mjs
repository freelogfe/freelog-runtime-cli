import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { bindingSelectorBytes, commandParameterCases, logoutSelectorContents } from '../acceptance/command-parameter-cases.mjs';

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
  if (leaf.authBinding) return bindingObservation(leaf);
  if (leaf.logout) return logoutObservation(leaf);
  return { argv: [...leaf.action.argv], stdin: leaf.action.stdin,
    result: { status: 1, signal: null, error: null, timedOut: false, stdout: `${JSON.stringify(leaf.expected.errorJson)}\n`, stderr: '' },
    before: snapshot, after: structuredClone(snapshot),
    networkLog: `${JSON.stringify({ schemaVersion: 1, event: 'ready', guard: 'local-parameter-no-network-v1' })}\n${JSON.stringify({ schemaVersion: 1, event: 'finished', attempts: 0 })}\n` };
}

function bindingObservation(leaf) {
  const workRoot = path.join(realpathSync(tmpdir()), 'freelog-command-parameters-quality');
  const controls = path.join(realpathSync(tmpdir()), 'freelog-command-controls-quality');
  const home = path.join(controls, 'home');
  const { scope, key } = leaf.authBinding;
  const entry = (name, bytes) => ({ path: name, kind: 'file', size: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') });
  const before = [...snapshot, entry('.freelog/1.version.json', '{}'), entry('.freelog/2.json', '{}'),
    ...(scope === 'work' ? [entry('.freelog/auth', bindingSelectorBytes(key))] : [])];
  const homeBefore = [entry('keep.txt', 'keep'), entry('.freelog/auth-default.json', bindingSelectorBytes(scope === 'home' ? key : 'v1/dev/8', 8))];
  return { ...observation(commandParameterCases.find((item) => item.id === 'COMMAND.PARAMETER.ENV_STAGING_REJECTED')),
    workRoot, controls, home, cwd: workRoot, argv: [...leaf.action.argv], before, after: structuredClone(before), homeBefore, homeAfter: structuredClone(homeBefore),
    result: { status: 1, signal: null, error: null, timedOut: false, stderr: '', stdout: JSON.stringify({ code: 'AUTH_INVALID',
      message: `凭据选择器损坏：${path.join(scope === 'home' ? home : workRoot, scope === 'home' ? '.freelog/auth-default.json' : '.freelog/auth')}` }) },
    accountLog: [{ schemaVersion: 1, event: 'ready', guard: 'account-selector-boundary-v1' }, { schemaVersion: 1, event: 'keyring-replaced' },
      { schemaVersion: 1, event: 'selector-read', root: scope, path: scope === 'work' ? '.freelog/auth' : '.freelog/auth-default.json' },
      { schemaVersion: 1, event: 'finished', blocked: 0 }].map(JSON.stringify).join('\n') + '\n',
  };
}

function logoutObservation(leaf) {
  const work = path.join(realpathSync(tmpdir()), 'freelog-command-parameters-quality');
  const controls = path.join(realpathSync(tmpdir()), 'freelog-command-controls-quality');
  const home = path.join(controls, 'home');
  const { fixture, root, removed } = leaf.logout;
  const file = (name) => {
    const bytes = name === '.freelog/auth-default.json' ? logoutSelectorContents.global
      : fixture === 'legacy' && name === 'project/.freelog/auth' ? logoutSelectorContents.legacy : logoutSelectorContents.workspace;
    return { path: name, kind: 'file', size: Buffer.byteLength(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
  };
  const before = [
    { path: 'project', kind: 'directory' },
    ...['project/.freelog/1.json', 'project/.freelog/1.version.json', 'project/.freelog/2.json', 'project/.freelog/collection-forms/dev/synthetic-collection.json'].map(file),
    ...(!['none', 'fallback'].includes(fixture) ? ['.freelog/auth', 'project/.freelog/auth', 'other/.freelog/auth'].map(file) : []),
  ];
  const homeBefore = [file('keep.txt'), ...(!['none', 'global-missing'].includes(fixture) ? [file('.freelog/auth-default.json')] : [])];
  return { ...observation(commandParameterCases.find((item) => item.id === 'COMMAND.PARAMETER.ENV_STAGING_REJECTED')),
    workRoot: work, controls, home, cwd: fixture === 'cwd' ? work : path.join(work, 'project/nested/deep'),
    argv: [...leaf.action.argv], stdin: '', before, after: before.filter((item) => !(root === 'work' && item.path === removed)),
    homeBefore, homeAfter: homeBefore.filter((item) => !(root === 'home' && item.path === removed)),
    result: { status: leaf.expected.exitCode, signal: null, error: null, timedOut: false, stderr: '',
      stdout: removed ? `已退出登录：${path.join(root === 'work' ? work : home, removed)}\n` : `${JSON.stringify(leaf.expected.errorJson)}\n` },
    logoutLog: [
      { schemaVersion: 1, event: 'ready', guard: 'logout-local-boundary-v1' }, { schemaVersion: 1, event: 'keyring-replaced' },
      ...(removed ? [{ schemaVersion: 1, event: 'unlink', root, path: removed }] : []), { schemaVersion: 1, event: 'finished', blocked: 0 },
    ].map(JSON.stringify).join('\n') + '\n',
  };
}

test('twenty-two design-bound leaves retain complete input, output and side-effect contracts', () => {
  assert.equal(commandParameterCases.length, 22);
  assert.equal(new Set(commandParameterCases.map((leaf) => leaf.id)).size, 22);
  for (const leaf of commandParameterCases) {
    assert.equal(leaf.parentRule, 'COMMAND.PARAMETER_CONTRACT');
    assert.equal(leaf.expected.exitCode, leaf.logout?.removed ? 0 : 1);
    assert.equal(leaf.expected.networkAttempts, 0);
    assert.ok(leaf.action.argv.includes('--json'));
    assert.ok(leaf.preconditions.length && leaf.forbiddenSideEffects.length && leaf.inputClass && leaf.layer);
    for (const ref of leaf.designRefs) assert.ok(ref.section && existsSync(fileURLToPath(new URL(`../../${ref.path}`, import.meta.url))), ref.path);
  }
});

test('all command contracts and successful logout observations survive JSON without field loss', async () => {
  const { evaluateCommandCase } = await import(producer);
  assert.deepEqual(JSON.parse(JSON.stringify(commandParameterCases)), commandParameterCases);
  for (const leaf of commandParameterCases.filter((item) => item.logout)) {
    const result = evaluateCommandCase(leaf, observation(leaf));
    assert.equal(result.status, 'PASS');
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  }
});

test('complete exact observations pass, but wrong JSON, crashes, local changes and missing guard cannot pass', async () => {
  const { evaluateCommandCase } = await import(producer);
  const leaf = commandParameterCases.find((item) => item.id === 'COMMAND.PARAMETER.ENV_STAGING_REJECTED');
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
  assert.equal(validateCommandResults(cases).length, 22);
  assert.throws(() => validateCommandResults(cases.slice(1)), /Missing cases/u);
  assert.throws(() => validateCommandResults([...cases, cases[0]]), /duplicate/u);
  assert.throws(() => validateCommandResults([{ ...cases[0], id: 'unknown' }, ...cases.slice(1)]), /Unknown/u);
});

test('identical error messages cannot substitute execution of a different input class', async () => {
  const { evaluateCommandCase } = await import(producer);
  const staging = commandParameterCases.find((item) => item.id === 'COMMAND.PARAMETER.ENV_STAGING_REJECTED');
  const local = commandParameterCases.find((item) => item.id === 'COMMAND.PARAMETER.ENV_LOCAL_REJECTED');
  const observed = observation(local);
  observed.argv = [...staging.action.argv];
  observed.stdin = staging.action.stdin;
  const result = evaluateCommandCase(local, observed);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.assertions.find((item) => item.id === 'command-input').passed, false);
});

test('all six login input classes are distinct and cannot borrow each other’s observations', async () => {
  const { evaluateCommandCase } = await import(producer);
  const login = commandParameterCases.filter((leaf) => leaf.id.startsWith('COMMAND.PARAMETER.LOGIN_'));
  assert.equal(login.length, 6);
  assert.equal(new Set(login.map((leaf) => JSON.stringify(leaf.action.argv))).size, 6);
  assert.equal(login.filter((leaf) => leaf.action.argv.includes('--yes')).length, 3);
  for (const [index, leaf] of login.entries()) {
    assert.equal(evaluateCommandCase(leaf, observation(leaf)).status, 'PASS');
    const wrongInput = observation(login[(index + 1) % login.length]);
    assert.equal(evaluateCommandCase(leaf, wrongInput).assertions.find((item) => item.id === 'command-input').passed, false);
  }
});

test('installed-bin resolution has no workspace fallback and missing bins produce all twenty-two BLOCKED results', async (t) => {
  const { requireInstalledCli, runCommandParameterCases } = await import(producer);
  assert.throws(() => requireInstalledCli({}), /FREELOG_TEST_CLI_BIN/u);
  const root = temporary(t);
  const workspaceBin = path.join(root, 'packages/cli/dist/bin/index.js');
  mkdirSync(path.dirname(workspaceBin), { recursive: true });
  writeFileSync(workspaceBin, 'throw new Error("must not execute workspace entry");\n');
  assert.throws(() => requireInstalledCli({ FREELOG_TEST_CLI_BIN: workspaceBin }),
    { message: 'The parameter producer requires an installed @freelog-cli/cli2 bin, never workspace dist.' });
  assert.throws(() => requireInstalledCli({ FREELOG_TEST_CLI_BIN: path.join(root, 'missing.js') }),
    { message: 'FREELOG_TEST_CLI_BIN must identify the existing absolute candidate CLI entry; fallback is forbidden.' });
  const output = path.join(root, 'suite.json');
  const originalRunId = process.env.FREELOG_TEST_RUN_ID;
  process.env.FREELOG_TEST_RUN_ID = 'quality-blocked';
  try {
    const results = runCommandParameterCases({ env: { FREELOG_TEST_RUN_ID: 'quality-blocked' }, output });
    assert.equal(results.cases.length, 22);
    assert.ok(results.cases.every((item) => item.status === 'BLOCKED' && item.reason.includes('FREELOG_TEST_CLI_BIN is required')));
    const report = JSON.parse(readFileSync(output));
    assert.equal(report.cases.length, 22);
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

test('binding leaves require the exact inconsistent selector, no fallback, no credential query and unchanged home', async () => {
  const { evaluateCommandCase } = await import(producer);
  const leaves = commandParameterCases.filter((leaf) => leaf.authBinding);
  assert.equal(leaves.length, 4);
  for (const [index, leaf] of leaves.entries()) {
    const observed = observation(leaf);
    assert.equal(evaluateCommandCase(leaf, observed).status, 'PASS');
    assert.equal(evaluateCommandCase(leaf, observation(leaves[(index + 1) % leaves.length])).status, 'FAIL');
    for (const mutate of [
      (value) => { value.before = value.before.filter((item) => item.path !== '.freelog/1.version.json'); value.after = structuredClone(value.before); },
      (value) => { value.homeAfter = []; },
      (value) => { value.accountLog = value.accountLog.replace('"blocked":0', '"blocked":1'); },
      (value) => { value.accountLog = ''; },
      (value) => { value.result.stdout = '{"code":"CREDENTIAL_STORE_UNAVAILABLE","message":"wrong branch"}'; },
    ]) {
      const changed = structuredClone(observed); mutate(changed);
      assert.equal(evaluateCommandCase(leaf, changed).status, 'FAIL');
    }
  }
});

test('all seven logout contracts recompute exact output, removal and both complete state snapshots', async () => {
  const { evaluateCommandCase } = await import(producer);
  const leaves = commandParameterCases.filter((leaf) => leaf.logout);
  assert.equal(leaves.length, 7);
  for (const leaf of leaves) {
    const observed = observation(leaf);
    assert.equal(evaluateCommandCase(leaf, observed).status, 'PASS', leaf.id);
    for (const mutate of [
      (value) => { value.after = [...value.after, { path: 'unexpected', kind: 'directory' }]; },
      (value) => { value.after = value.after.filter((item) => !item.path.endsWith('1.version.json')); },
      (value) => { value.homeAfter = []; },
      (value) => { value.logoutLog = ''; },
      (value) => { value.logoutLog = value.logoutLog.replace('"blocked":0', '"blocked":1'); },
      (value) => { value.cwd = value.workRoot + '-other'; },
      (value) => { value.result.stdout += 'extra'; },
      (value) => { value.result.status = null; value.result.signal = 'SIGTERM'; },
    ]) {
      const changed = structuredClone(observed); mutate(changed);
      assert.equal(evaluateCommandCase(leaf, changed).status, 'FAIL', leaf.id);
    }
  }
});

test('legacy logout cannot reuse ordinary selector observations despite identical argv and output', async () => {
  const { evaluateCommandCase } = await import(producer);
  const nearest = commandParameterCases.find((leaf) => leaf.id === 'COMMAND.PARAMETER.LOGOUT_NEAREST');
  const legacy = commandParameterCases.find((leaf) => leaf.id === 'COMMAND.PARAMETER.LOGOUT_LEGACY');
  const ordinary = observation(nearest);
  assert.equal(evaluateCommandCase(nearest, ordinary).status, 'PASS');
  assert.equal(evaluateCommandCase(legacy, ordinary).status, 'FAIL');
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
