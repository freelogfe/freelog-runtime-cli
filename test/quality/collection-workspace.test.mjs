/** Shared helper behavior only; these children and fixtures are not installed-candidate approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { itemWorkspaceSnapshot, itemChildEnvironment, itemChildExecute } from '../acceptance/collection-workspace.mjs';

function fixture(t) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  const home = path.join(controls, 'home'); mkdirSync(home);
  const trace = path.join(controls, 'trace.jsonl'), control = path.join(controls, 'control.json');
  writeFileSync(trace, ''); writeFileSync(control, JSON.stringify({ cwd, port: 1, trace, fault: 'none' }));
  const cliBin = path.join(cwd, 'synthetic-child.mjs'), preload = path.join(controls, 'preload.mjs');
  writeFileSync(preload, 'globalThis.__workspacePreload = "synthetic";\n');
  t.after(() => {
    for (const root of [cwd, controls]) {
      assert.equal(path.dirname(realpathSync(root)), realpathSync(tmpdir()));
      assert.ok(path.basename(root).startsWith('freelog-collection-recovery-'));
      rmSync(root, { recursive: true, force: false });
    }
  });
  return { cwd, controls, home, control, trace, cliBin, preload: pathToFileURL(preload).href,
    env: itemChildEnvironment(process.env, controls, control) };
}

test('workspace snapshot retains sorted complete paths, binary bytes and empty directories', (t) => {
  const f = fixture(t);
  mkdirSync(path.join(f.cwd, 'z-empty'));
  mkdirSync(path.join(f.cwd, 'a-dir'));
  writeFileSync(path.join(f.cwd, 'a-dir', 'binary'), Buffer.from([0, 255, 254]));
  writeFileSync(path.join(f.cwd, 'note'), 'synthetic');
  assert.deepEqual(itemWorkspaceSnapshot(f.cwd), [
    { path: 'a-dir', kind: 'directory' }, { path: 'a-dir/binary', kind: 'file', bytes: 'AP/+' },
    { path: 'note', kind: 'file', bytes: Buffer.from('synthetic').toString('base64') },
    { path: 'z-empty', kind: 'directory' },
  ]);
});
test('workspace snapshot rejects a link instead of following it outside the observed tree', (t) => {
  const f = fixture(t), link = path.join(f.cwd, 'link');
  symlinkSync(f.controls, link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => itemWorkspaceSnapshot(f.cwd), /^Error: Unexpected symlink/u);
  rmSync(link);
  assert.equal(readFileSync(f.control, 'utf8').includes('"fault":"none"'), true);
});
test('child environment preserves only its allowlist and replaces all owned home/control paths', () => {
  const input = { PATH: 'synthetic-path', WINDIR: 'synthetic-windir', LANG: 'zh_CN', FREELOG_TOKEN: 'synthetic-private',
    UNRELATED_SECRET: 'synthetic-private', NODE_OPTIONS: '--require synthetic-escape', HOME: 'wrong', FREELOG_ENV: 'prod' };
  const controls = path.resolve('owned-controls'), control = path.join(controls, 'control.json'), home = path.join(controls, 'home');
  assert.deepEqual(itemChildEnvironment(input, controls, control), {
    PATH: 'synthetic-path', WINDIR: 'synthetic-windir', LANG: 'zh_CN', HOME: home, USERPROFILE: home, APPDATA: home,
    LOCALAPPDATA: home, XDG_CONFIG_HOME: home, NODE_OPTIONS: '', FREELOG_ENV: 'dev', NO_COLOR: '1', FREELOG_TEST_RECOVERY_CONTROL: control,
  });
});
test('actual child uses explicit preload, argv, isolated env and captures its real pid and exact output', async (t) => {
  const f = fixture(t);
  writeFileSync(f.cliBin, `console.log(JSON.stringify({argv:process.argv.slice(2),preload:globalThis.__workspacePreload,dev:process.env.FREELOG_ENV==='dev',home:process.env.HOME===process.env.USERPROFILE,secretAbsent:process.env.UNRELATED_SECRET===undefined}));\n`);
  const child = await itemChildExecute({ cliBin: f.cliBin }, ['--synthetic'], f.cwd, f.env, f.preload);
  assert.ok(Number.isSafeInteger(child.childPid) && child.childPid > 0);
  assert.deepEqual(child.result, { status: 0, signal: null, error: null, timedOut: false,
    stdout: JSON.stringify({ argv: ['--synthetic'], preload: 'synthetic', dev: true, home: true, secretAbsent: true }) + '\n', stderr: '' });
});
test('actual default preload keeps the C03 transport/keyring guard and complete exit trace', async (t) => {
  const f = fixture(t); writeFileSync(f.cliBin, 'console.log("synthetic-default-guard");\n');
  const child = await itemChildExecute({ cliBin: f.cliBin }, [], f.cwd, f.env);
  assert.deepEqual(child.result, { status: 0, signal: null, error: null, timedOut: false, stdout: 'synthetic-default-guard\n', stderr: '' });
  const trace = readFileSync(f.trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(trace.map((entry) => entry.event), ['keyring-replaced', 'ready', 'finished']);
  assert.equal(trace[1].guard, 'collection-items-local-v1');
});
test('actual child nonzero status and stderr remain failures without rewriting either stream', async (t) => {
  const f = fixture(t); writeFileSync(f.cliBin, 'process.stderr.write("synthetic-failure");process.exitCode=7;\n');
  const child = await itemChildExecute({ cliBin: f.cliBin }, [], f.cwd, f.env, f.preload);
  assert.deepEqual(child.result, { status: 7, signal: null, error: null, timedOut: false, stdout: '', stderr: 'synthetic-failure' });
});
test('actual child missing cwd records spawn failure and cannot become exit0 approval', async (t) => {
  const f = fixture(t); writeFileSync(f.cliBin, 'console.log("must-not-run");\n');
  const child = await itemChildExecute({ cliBin: f.cliBin }, [], `${f.cwd}-missing`, f.env, f.preload);
  assert.equal(child.childPid, null); assert.match(child.result.error, /^Item child spawn failed:/u);
  assert.notEqual(child.result.status, 0); assert.equal(child.result.stdout, '');
});
test('actual child output overflow retains the failure and bounds the captured bytes', async (t) => {
  const f = fixture(t); writeFileSync(f.cliBin, 'process.stdout.write("X".repeat(1_000_001));setInterval(()=>{},1000);\n');
  const child = await itemChildExecute({ cliBin: f.cliBin }, [], f.cwd, f.env, f.preload);
  assert.equal(child.result.error, 'Item child output limit exceeded.');
  assert.ok(Buffer.byteLength(child.result.stdout) <= 1_000_000);
  assert.equal(child.result.status === 0 && child.result.signal === null && child.result.error === null, false);
});
test('actual child keeps the twenty-second deadline and reports timeout even after termination', { timeout: 30_000 }, async (t) => {
  const f = fixture(t); writeFileSync(f.cliBin, 'setInterval(()=>{},1000);\n');
  const child = await itemChildExecute({ cliBin: f.cliBin }, [], f.cwd, f.env, f.preload);
  assert.equal(child.result.timedOut, true); assert.equal(child.result.error, 'Item child exceeded 20 second deadline.');
  assert.equal(child.result.status === 0 && child.result.signal === null && child.result.error === null, false);
});

test('producer entries import pure workspace helpers instead of another executable producer', () => {
  for (const name of ['items', 'selection', 'edit']) {
    const source = readFileSync(new URL(`../verify-collection-${name}.mjs`, import.meta.url), 'utf8');
    assert.match(source, /from ['"]\.\/acceptance\/collection-workspace\.mjs['"]/u);
    assert.doesNotMatch(source, /from ['"]\.\/verify-collection-(?:items|selection|edit)\.mjs['"]/u);
    assert.doesNotMatch(source, /export\s*\{[^}]*itemWorkspaceSnapshot/u);
  }
});
test('workspace helper module owns no producer verdict, catalog, CLI entry or remote SDK', () => {
  const source = readFileSync(new URL('../acceptance/collection-workspace.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /writeSuiteCases|acceptanceCatalog|process\.argv|FServiceAPI/u);
});
test('forced close remains a failed timeout when kill never delivers a close event', async (t) => {
  const f = fixture(t), originalSpawn = childProcess.spawn, originalTimeout = globalThis.setTimeout;
  const kills = [], delays = [];
  const child = Object.assign(new EventEmitter(), { pid: 1234, stdout: new EventEmitter(), stderr: new EventEmitter(),
    kill(signal) { kills.push(signal); return true; } });
  childProcess.spawn = () => child;
  syncBuiltinESMExports();
  globalThis.setTimeout = (callback, delay, ...args) => {
    delays.push(delay);
    return originalTimeout(callback, delay === 20_000 || delay === 2000 ? 1 : delay, ...args);
  };
  let result;
  try {
    result = await itemChildExecute({ cliBin: f.cliBin }, [], f.cwd,
      itemChildEnvironment({ PATH: 'synthetic' }, f.controls, f.control), f.preload);
  } finally {
    childProcess.spawn = originalSpawn; syncBuiltinESMExports(); globalThis.setTimeout = originalTimeout;
  }
  assert.deepEqual(delays, [20_000, 2000]); assert.deepEqual(kills, ['SIGKILL']);
  assert.deepEqual(result.result, { status: null, signal: 'SIGKILL', error: 'Item child exceeded 20 second deadline.', timedOut: true, stdout: '', stderr: '' });
});
