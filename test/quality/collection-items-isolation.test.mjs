/** Local apparatus controls only; no installed candidate or real platform acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { itemRouteAllowed } from '../acceptance/collection-items-control.mjs';
import { recoveryRouteAllowed } from '../acceptance/collection-recovery-control.mjs';
import { itemScenarioNames, itemExpectedRequests } from '../acceptance/collection-items-evidence.mjs';
const preload = new URL('../acceptance/collection-items-preload.mjs', import.meta.url).href;
const loader = new URL('../acceptance/collection-recovery-loader.mjs', import.meta.url).href;
function fixture(t, port = 1, fault = 'none') {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-'))), controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  t.after(() => { for (const d of [cwd, controls]) { assert.equal(path.dirname(realpathSync(d)), realpathSync(tmpdir())); assert.ok(path.basename(d).startsWith('freelog-collection-recovery-')); rmSync(d, { recursive: true, force: false }); } });
  const trace = path.join(controls, 'trace.jsonl'), control = path.join(controls, 'control.json');
  writeFileSync(trace, ''); writeFileSync(control, JSON.stringify({ cwd, port, trace, fault }));
  return { cwd, controls, trace, control };
}
function child(f, source) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/iu.test(key)));
  return new Promise((resolve) => {
    const c = spawn(process.execPath, ['--no-warnings', '--experimental-loader', loader, '--import', preload, '--input-type=module', '-e', source],
      { cwd: f.cwd, env: { ...env, TEMP: realpathSync(tmpdir()), TMP: realpathSync(tmpdir()), TMPDIR: realpathSync(tmpdir()),
        HOME: f.controls, USERPROFILE: f.controls, APPDATA: f.controls, LOCALAPPDATA: f.controls, XDG_CONFIG_HOME: f.controls,
        NODE_OPTIONS: '', FREELOG_TEST_RECOVERY_CONTROL: f.control }, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000, windowsHide: true });
    let stdout = '', stderr = '', error = null;
    c.stdout.on('data', (b) => { stdout += b; if (stdout.length > 100_000) c.kill(); });
    c.stderr.on('data', (b) => { stderr += b; if (stderr.length > 100_000) c.kill(); });
    c.once('error', () => { error = 'Child failed'; }); c.once('close', (status, signal) => resolve({ status, signal, error, stdout, stderr }));
  });
}
test('all fixed C03 routes are admitted, while C09 publication routes and arbitrary selectors are not', () => {
  for (const name of itemScenarioNames) for (const r of itemExpectedRequests(name)) assert.equal(itemRouteAllowed(r.method, r.path), true, `${name}: ${r.path}`);
  assert.equal(itemRouteAllowed('PUT', '/v2/resources/catalogue/local_collection'), false);
  assert.equal(recoveryRouteAllowed('POST', '/v2/resources/catalogues/drafts/local_collection/items'), false);
  assert.equal(recoveryRouteAllowed('GET', '/v2/resources/source_image?isLoadLatestVersionInfo=1'), false);
  for (const p of ['/v2/resources/real_resource', '/v2/resources/source_range_101', '/v2/resources/source_image?token=leak',
    '/v2/resources/source_image?isLoadLatestVersionInfo=1&isLoadLatestVersionInfo=1', '//other/path', '/v2/contracts/batchSign',
    '/v2/resources/catalogues/drafts/local_collection/items/batchAuth?itemIds=unexpected']) assert.equal(itemRouteAllowed('GET', p), false, p);
});
test('C03 forwards actual SDK-shaped HTTPS to only its loopback endpoint', async (t) => {
  const seen = [], server = createServer((req, res) => { seen.push({ method: req.method, path: req.url }); res.end('synthetic source'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); server.closeAllConnections(); });
  const f = fixture(t, server.address().port);
  const r = await child(f, `import https from 'node:https';
const text = await new Promise((resolve,reject)=>https.get({hostname:'api.devfreelog.com',path:'/v2/resources/source_image?isLoadLatestVersionInfo=1'},r=>{let s='';r.on('data',b=>s+=b);r.on('end',()=>resolve(s));}).on('error',reject)); console.log(text);`);
  assert.deepEqual(r, { status: 0, signal: null, error: null, stdout: 'synthetic source\n', stderr: '' });
  assert.deepEqual(seen, [{ method: 'GET', path: '/v2/resources/source_image?isLoadLatestVersionInfo=1' }]);
  assert.match(readFileSync(f.trace, 'utf8'), /collection-items-local-v1/u);
});
test('C03 denies alternate transports, process escape and real keyring identities or writes', async (t) => {
  const f = fixture(t), r = await child(f, `import https from 'node:https';import http from 'node:http';import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';import cp from 'node:child_process';import {Worker} from 'node:worker_threads';import {Entry} from '@napi-rs/keyring';
let denied=0;for(const fn of [()=>https.request({hostname:'example.com',path:'/v2/resources/source_image'}),()=>https.request({hostname:'api.devfreelog.com',path:'/v2/resources/real_resource'}),()=>http.get('http://127.0.0.1:1'),()=>net.connect(1),()=>tls.connect(443),()=>dns.lookup('example.com'),()=>cp.spawn('node'),()=>new Worker(''),()=>new Entry('freelog-runtime-cli','wrong'),()=>new Entry('freelog-runtime-cli','v1/dev/7').setPassword('x')]){try{fn()}catch{denied++}}console.log(denied);`);
  assert.deepEqual(r, { status: 0, signal: null, error: null, stdout: '10\n', stderr: '' });
  const events = readFileSync(f.trace, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(events.filter((e) => e.event === 'blocked').length, 10); assert.equal(events.filter((e) => e.event === 'request').length, 0);
});
for (const fault of ['prepared', 'sending', 'cleanup']) test(`C03 refuses recovery ${fault} fault before running CLI code`, async (t) => {
  const f = fixture(t, 1, fault), r = await child(f, `console.log('FORBIDDEN_CHILD_EXECUTED');`);
  assert.equal(r.status, 1); assert.equal(r.stdout, ''); assert.match(r.stderr, /Invalid C03 fault\/cwd/u);
  assert.doesNotMatch(readFileSync(f.trace, 'utf8'), /ready|fault/u);
});
