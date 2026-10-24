import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { itemChildEnvironment } from '../acceptance/collection-workspace.mjs';

function fixture(t) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-login-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-login-controls-')));
  t.after(() => { for (const target of [cwd, controls]) {
    assert.equal(path.dirname(realpathSync(target)), realpathSync(tmpdir()));
    assert.match(path.basename(target), /^freelog-login-(work|controls)-/u); rmSync(target, { recursive: true });
  } });
  const home = path.join(controls, 'home'); mkdirSync(home);
  const trace = path.join(controls, 'trace.jsonl'), network = path.join(controls, 'network.jsonl');
  const store = path.join(controls, 'store.json'), control = path.join(controls, 'control.json');
  writeFileSync(trace, ''); writeFileSync(network, ''); writeFileSync(store, '{}');
  writeFileSync(control, JSON.stringify({ cwd, home, trace, store, mode: 'ok' }));
  const env = itemChildEnvironment(process.env, controls, control); delete env.FREELOG_TEST_RECOVERY_CONTROL;
  env.FREELOG_TEST_NETWORK_LOG = network; env.FREELOG_TEST_LOGIN_CONTROL = control;
  return { cwd, controls, trace, store, control, env };
}
function execute(f, code) {
  return spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', new URL('../acceptance/account-login-loader.mjs', import.meta.url).href,
    '--import', new URL('../acceptance/account-login-preload.mjs', import.meta.url).href, '--input-type=module', '-e', code],
  { cwd: f.cwd, env: f.env, encoding: 'utf8', timeout: 10_000, maxBuffer: 100_000, windowsHide: true });
}
const events = f => readFileSync(f.trace, 'utf8').trim().split('\n').map(JSON.parse);
test('synthetic keyring import never loads native, permits only the fixed identity, and forbids deletion', t => {
  const f = fixture(t), result = execute(f, `import {Entry} from '@napi-rs/keyring';
    const entry=new Entry('freelog-runtime-cli','v1/dev/7');entry.setPassword('synthetic-value');
    console.log(entry.getPassword()==='synthetic-value');
    try{new Entry('other-service','v1/dev/7')}catch{};try{entry.deleteCredential()}catch{}`);
  assert.equal(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.equal(result.stdout, 'true\n'); assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(readFileSync(f.store, 'utf8')), { 'v1/dev/7': 'synthetic-value' });
  assert.deepEqual(events(f).filter(e => e.event === 'blocked').map(e => e.kind), ['credential-identity', 'credential-delete']);
  assert.deepEqual(events(f).at(-1), { schemaVersion: 1, event: 'finished', blocked: 2 });
});
test('outside selector reads, CJS native subpaths, network, subprocess and worker attempts are blocked before use', t => {
  const f = fixture(t), outside = path.join(f.controls, 'auth'); writeFileSync(outside, 'synthetic-outside-selector');
  const result = execute(f, `import fs from 'node:fs';import {createRequire} from 'node:module';import dns from 'node:dns';
    import {spawnSync} from 'node:child_process';import {Worker} from 'node:worker_threads';
    for(const action of [()=>fs.readFileSync(${JSON.stringify(outside)},'utf8'),()=>fs.unlinkSync(${JSON.stringify(outside)}),
      ()=>createRequire(import.meta.url)('@napi-rs/keyring/native'),()=>dns.lookup('invalid.example'),
      ()=>spawnSync('invalid-program'),()=>new Worker('invalid',{eval:true})]){try{action()}catch{}}
    try{await fetch('https://invalid.example')}catch{};console.log('done');`);
  assert.equal(result.status, 0); assert.equal(result.error, undefined); assert.equal(result.stdout, 'done\n');
  assert.equal(result.stderr, ''); assert.equal(readFileSync(outside, 'utf8'), 'synthetic-outside-selector');
  assert.deepEqual(events(f).filter(e => e.event === 'blocked').map(e => e.kind),
    ['outside-selector-read', 'unlink', 'native-keyring', 'dns', 'subprocess', 'worker', 'fetch']);
  assert.deepEqual(events(f).at(-1), { schemaVersion: 1, event: 'finished', blocked: 7 });
});
test('malformed login control fails before any application or native code executes', t => {
  const f = fixture(t); writeFileSync(f.control, '{malformed-synthetic-control');
  const result = execute(f, `console.log('APPLICATION_MUST_NOT_START')`);
  assert.notEqual(result.status, 0); assert.equal(result.signal, null); assert.equal(result.error, undefined);
  assert.equal(result.stdout, ''); assert.ok(result.stderr.includes('Invalid isolated login control; execution forbidden.'));
  assert.ok(!result.stderr.includes('malformed-synthetic-control'));
  assert.equal(readFileSync(f.store, 'utf8'), '{}'); assert.equal(readFileSync(f.trace, 'utf8'), '');
});
