import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolve } from '../acceptance/account-loader.mjs';

const loader = new URL('../acceptance/account-loader.mjs', import.meta.url).href;
const preload = new URL('../acceptance/account-preload.mjs', import.meta.url).href;
function owned(t) {
  const roots = ['freelog-command-parameters-', 'freelog-command-controls-', 'freelog-logout-outside-']
    .map((prefix) => realpathSync(mkdtempSync(path.join(tmpdir(), prefix))));
  t.after(() => {
    for (const [index, root] of roots.entries()) {
      assert.equal(path.dirname(root), realpathSync(tmpdir()));
      assert.ok(path.basename(root).startsWith(['freelog-command-parameters-', 'freelog-command-controls-', 'freelog-logout-outside-'][index]));
      rmSync(root, { recursive: true, force: true });
    }
  });
  const [work, controls, outside] = roots;
  const home = path.join(controls, 'home'); mkdirSync(home);
  mkdirSync(path.join(work, '.freelog'));
  writeFileSync(path.join(work, '.freelog/auth'), 'SYNTHETIC_SELECTOR_ONLY');
  writeFileSync(path.join(outside, 'keep.txt'), 'SYNTHETIC_OUTSIDE_ONLY');
  const trace = path.join(controls, 'logout.jsonl'), network = path.join(controls, 'network.jsonl');
  writeFileSync(trace, ''); writeFileSync(network, '');
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key, value]) =>
    /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|LANG|LC_ALL|TZ)$/iu.test(key) && typeof value === 'string'));
  const temporary = realpathSync(tmpdir());
  return { work, home, trace, network, outside, env: { ...inherited,
    TEMP: temporary, TMP: temporary, TMPDIR: temporary, HOME: home, USERPROFILE: home,
    NODE_OPTIONS: '', FREELOG_TEST_NETWORK_LOG: network, FREELOG_TEST_ACCOUNT_WORK: work, FREELOG_TEST_ACCOUNT_TRACE: trace, FREELOG_TEST_ACCOUNT_MODE: 'logout' } };
}
function run(fixture, code, env = fixture.env) {
  return spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', loader, '--import', preload, '--input-type=module', '-e', code], {
    cwd: fixture.work, env, encoding: 'utf8', timeout: 15_000, maxBuffer: 100_000,
  });
}

test('logout loader replaces the exact package before native resolution and rejects subpaths', () => {
  const fallback = () => { throw new Error('Native resolution must not run'); };
  assert.deepEqual(resolve('@napi-rs/keyring', {}, fallback), { url: new URL('../acceptance/account-keyring.mjs', import.meta.url).href, shortCircuit: true });
  assert.throws(() => resolve('@napi-rs/keyring/subpath', {}, fallback), /forbidden/u);
});

test('real child cannot use credentials, read selector contents or unlink outside owned roots, even when errors are caught', (t) => {
  const fixture = owned(t);
  const result = run(fixture, `
    import fs from 'node:fs'; import { createRequire } from 'node:module';
    const { Entry } = await import('@napi-rs/keyring');
    const actions = [() => new Entry(), () => Entry.prototype.getPassword.call({}),
      () => Entry.prototype.setPassword.call({}), () => Entry.prototype.deleteCredential.call({}),
      () => fs.readFileSync(${JSON.stringify(path.join(fixture.work, '.freelog/auth'))}),
      () => fs.unlinkSync(${JSON.stringify(path.join(fixture.outside, 'keep.txt'))}),
      () => createRequire(import.meta.url)('@napi-rs/keyring')];
    for (const action of actions) { try { action(); } catch {} }
    console.log('finished caught probes');
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  assert.equal(result.stdout, 'finished caught probes\n');
  const raw = readFileSync(fixture.trace, 'utf8');
  const events = raw.trim().split('\n').map(JSON.parse);
  assert.equal(events.filter((item) => item.event === 'keyring-replaced').length, 1);
  assert.deepEqual(events.filter((item) => item.event === 'blocked').map((item) => item.kind),
    ['credential', 'credential', 'credential', 'credential', 'selector-read', 'outside-unlink', 'native-keyring']);
  assert.deepEqual(events.at(-1), { schemaVersion: 1, event: 'finished', blocked: 7 });
  assert.equal(existsSync(path.join(fixture.work, '.freelog/auth')), true);
  assert.equal(readFileSync(path.join(fixture.outside, 'keep.txt'), 'utf8'), 'SYNTHETIC_OUTSIDE_ONLY');
  assert.doesNotMatch(raw, /SYNTHETIC|keep\.txt/u);
});

test('allowed selector unlink is the actual filesystem operation with an exact safe trace', (t) => {
  const fixture = owned(t);
  const result = run(fixture, `import {unlinkSync} from 'node:fs'; unlinkSync(${JSON.stringify(path.join(fixture.work, '.freelog/auth'))});`);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path.join(fixture.work, '.freelog/auth')), false);
  const events = readFileSync(fixture.trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events, [
    { schemaVersion: 1, event: 'ready', guard: 'logout-local-boundary-v1' },
    { schemaVersion: 1, event: 'unlink', root: 'work', path: '.freelog/auth' },
    { schemaVersion: 1, event: 'finished', blocked: 0 },
  ]);
});

test('invalid control roots fail before the child body can run', (t) => {
  const fixture = owned(t);
  const result = run(fixture, `console.log('MUST_NOT_EXECUTE');`, { ...fixture.env, FREELOG_TEST_ACCOUNT_WORK: fixture.outside });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Invalid owned account boundary/u);
});

test('selector mode allows only the owned selector read; credentials, outside reads and every unlink stay forbidden', (t) => {
  const fixture = owned(t);
  const ownedSelector = path.join(fixture.work, '.freelog/auth');
  const outsideSelector = path.join(fixture.outside, 'auth'); writeFileSync(outsideSelector, 'SYNTHETIC_OUTSIDE_SELECTOR');
  const result = run(fixture, `
    import fs from 'node:fs'; const {Entry} = await import('@napi-rs/keyring');
    fs.readFileSync(${JSON.stringify(ownedSelector)}, 'utf8');
    for (const action of [() => new Entry(), () => fs.readFileSync(${JSON.stringify(outsideSelector)}),
      () => fs.unlinkSync(${JSON.stringify(ownedSelector)})]) { try { action(); } catch {} }
  `, { ...fixture.env, FREELOG_TEST_ACCOUNT_MODE: 'selector' });
  assert.equal(result.status, 0, result.stderr);
  const events = readFileSync(fixture.trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(events, [
    { schemaVersion: 1, event: 'ready', guard: 'account-selector-boundary-v1' },
    { schemaVersion: 1, event: 'keyring-replaced' },
    { schemaVersion: 1, event: 'selector-read', root: 'work', path: '.freelog/auth' },
    { schemaVersion: 1, event: 'blocked', kind: 'credential' },
    { schemaVersion: 1, event: 'blocked', kind: 'outside-selector-read' },
    { schemaVersion: 1, event: 'blocked', kind: 'outside-unlink' },
    { schemaVersion: 1, event: 'finished', blocked: 3 },
  ]);
  assert.equal(existsSync(ownedSelector), true);
  assert.equal(readFileSync(outsideSelector, 'utf8'), 'SYNTHETIC_OUTSIDE_SELECTOR');
});

test('unknown account mode is rejected instead of silently weakening the boundary', (t) => {
  const fixture = owned(t);
  const result = run(fixture, `console.log('MUST_NOT_EXECUTE');`, { ...fixture.env, FREELOG_TEST_ACCOUNT_MODE: 'unknown' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.match(result.stderr, /Invalid owned account boundary/u);
});
