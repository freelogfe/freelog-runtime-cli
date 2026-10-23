/** Apparatus controls only. These child programs are NOT installed CLI or product acceptance. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recoveryFaultExit, recoveryResource, recoveryRouteAllowed } from '../acceptance/collection-recovery-control.mjs';

const preload = new URL('../acceptance/collection-recovery-preload.mjs', import.meta.url).href;
const loader = new URL('../acceptance/collection-recovery-loader.mjs', import.meta.url).href;

function fixture(t, fault = 'none', port = 1) {
  const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  t.after(() => {
    // Only these just-created apparatus directories, never production cleanup or user data.
    for (const directory of [work, controls]) {
      assert.equal(path.dirname(realpathSync(directory)), realpathSync(tmpdir()));
      assert.ok(path.basename(directory).startsWith('freelog-collection-recovery-'));
      rmSync(directory, { recursive: true, force: false });
    }
  });
  const trace = path.join(controls, 'trace.jsonl'), control = path.join(controls, 'control.json');
  writeFileSync(trace, '', { flag: 'wx' });
  writeFileSync(control, JSON.stringify({ cwd: work, fault, port, trace }));
  return { work, controls, trace, control };
}

function child(f, source, overrides = {}) {
  // Do not inherit tokens, proxies, NODE_OPTIONS, account files or user HOME/config.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/iu.test(key)));
  return new Promise((resolve) => {
    const process = spawn(globalThis.process.execPath, ['--no-warnings', '--experimental-loader', loader, '--import', preload, '--input-type=module', '-e', source], {
      cwd: f.work, env: { ...inherited, HOME: f.controls, USERPROFILE: f.controls, APPDATA: f.controls, LOCALAPPDATA: f.controls,
        XDG_CONFIG_HOME: f.controls, NODE_OPTIONS: '', FREELOG_ENV: 'dev', FREELOG_TEST_RECOVERY_CONTROL: f.control, ...overrides },
      stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000,
    });
    let stdout = '', stderr = '', error = null;
    process.stdout.on('data', (bytes) => { stdout += bytes; if (stdout.length > 100_000) process.kill(); });
    process.stderr.on('data', (bytes) => { stderr += bytes; if (stderr.length > 100_000) process.kill(); });
    process.on('error', (value) => { error = value.message; });
    process.on('close', (status, signal) => resolve({ status, signal, error, stdout, stderr }));
  });
}
const records = (f) => readFileSync(f.trace, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
function completed(result) { assert.equal(result.status, 0, result.stderr); assert.equal(result.signal, null); assert.equal(result.error, null); assert.equal(result.stderr, ''); }

test('C09 apparatus only forwards the fixed SDK route families', () => {
  assert.equal(recoveryRouteAllowed('GET', `/v2/resources/${recoveryResource}?isLoadLatestVersionInfo=1`), true);
  assert.equal(recoveryRouteAllowed('PUT', `/v2/resources/catalogue/${recoveryResource}`), true);
  for (const [method, route] of [['POST', '/v2/contracts'], ['DELETE', `/v2/resources/${recoveryResource}`],
    ['PUT', `/v2/resources/catalogue/${recoveryResource}?unexpected=1`], ['GET', '/v2/resources/other'], ['GET', '//api.freelog.com/v2/resources'],
    ['GET', `/v2/resources/${recoveryResource}#ignored`], ['GET', '/v2/resources/catalogues/drafts/local_collection']]) {
    assert.equal(recoveryRouteAllowed(method, route), false, `${method} ${route}`);
  }
});

test('C09 apparatus refuses unknown, duplicate or misleading query parameters before logging them', () => {
  for (const route of ['/v2/resources/local_collection?secret=do-not-log',
    '/v2/resources/local_collection?isLoadLatestVersionInfo=1&isLoadLatestVersionInfo=0',
    '/v2/resources/types/getInfoByCode?code=OTHER', '/v2/resources/catalogue/local_collection/items?limit=1',
    '/v2/resources/local_collection\n?isLoadLatestVersionInfo=1']) {
    assert.equal(recoveryRouteAllowed('GET', route), false, route);
  }
});

test('collection metadata routes allow only the exact readonly fixture type and field', () => {
  for (const route of ['/v2/storages/files/info?resourceTypeCode=CT001', '/v2/resources/attrs/getInfoByKey?key=display_artist']) {
    assert.equal(recoveryRouteAllowed('GET', route), true, route);
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(recoveryRouteAllowed(method, route), false, `${method} ${route}`);
  }
  for (const route of ['/v2/storages/files/info', '/v2/storages/files/info?resourceTypeCode=CT002',
    '/v2/storages/files/info?resourceTypeCode=CT001&resourceTypeCode=CT001', '/v2/storages/files/info?resourceTypeCode=CT001&extra=1',
    '/v2/resources/attrs/getInfoByKey', '/v2/resources/attrs/getInfoByKey?key=qaAuthor',
    '/v2/resources/attrs/getInfoByKey?key=display_artist&key=display_artist', '/v2/resources/attrs/getInfoByKey?key=display_artist&extra=1',
    '/v2/resources/attrs/getInfoByKey?key=display_artist#ignored', '/v2/storages/files/other?resourceTypeCode=CT001']) {
    assert.equal(recoveryRouteAllowed('GET', route), false, route);
  }
});

test('C09 apparatus forwards actual HTTPS request bytes to its exact loopback server', async (t) => {
  const requests = [];
  const server = createServer((request, response) => {
    let body = ''; request.on('data', (bytes) => { body += bytes; });
    request.on('end', () => { requests.push({ method: request.method, path: request.url, body }); response.end(JSON.stringify({ ret: 0, errCode: 0, data: { local: true } })); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const f = fixture(t, 'none', server.address().port);
  const result = await child(f, `import https from 'node:https';
    const request = https.request({hostname:'api.devfreelog.com',protocol:'https:',method:'PUT',path:'/v2/resources/catalogue/local_collection'}, response => {
      response.setEncoding('utf8'); response.on('data', bytes => process.stdout.write(bytes));
    }); request.on('error', error => { console.error(error); process.exitCode=1; }); request.end(JSON.stringify({description:'local-only'}));`);
  completed(result); assert.deepEqual(JSON.parse(result.stdout), { ret: 0, errCode: 0, data: { local: true } });
  assert.deepEqual(requests, [{ method: 'PUT', path: '/v2/resources/catalogue/local_collection', body: '{"description":"local-only"}' }]);
  assert.deepEqual(records(f).filter((r) => r.event === 'request'), [{ schemaVersion: 1, event: 'request', method: 'PUT', path: '/v2/resources/catalogue/local_collection' }]);
  assert.deepEqual(records(f).at(-1), { schemaVersion: 1, event: 'finished' });
  assert.equal(records(f).filter((r) => r.event === 'blocked').length, 0);
});

test('C09 apparatus blocks unapproved hosts/routes/methods and alternate transports before connections', async (t) => {
  const f = fixture(t);
  const result = await child(f, `import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
    import tls from 'node:tls'; import dgram from 'node:dgram'; import http2 from 'node:http2'; import dns from 'node:dns';
    const actions = [()=>https.request({hostname:'api.freelog.com',path:'/v2/resources/local_collection'}),
      ()=>https.request({hostname:'api.devfreelog.com',method:'POST',path:'/v2/contracts'}),
      ()=>https.request({hostname:'api.devfreelog.com',path:'/v2/resources/other'}),
      ()=>http.request('http://127.0.0.1:1/'), ()=>net.connect(443,'api.devfreelog.com'),
      ()=>new net.Socket().connect({host:'127.0.0.1',port:1}), ()=>tls.connect(443,'api.devfreelog.com'),
      ()=>dgram.createSocket('udp4'), ()=>http2.connect('https://api.devfreelog.com'), ()=>fetch('https://api.devfreelog.com'),
      ()=>dns.lookup('localhost',()=>{}), ()=>dns.promises.lookup('localhost'),
      ()=>new dns.Resolver().resolve4('localhost',()=>{}), ()=>new dns.promises.Resolver().resolve4('localhost')];
    let rejected=0; for (const action of actions) { try { await action(); } catch { rejected++; } }
    console.log(JSON.stringify({rejected}));`);
  completed(result); assert.deepEqual(JSON.parse(result.stdout), { rejected: 14 });
  assert.equal(records(f).filter((r) => r.event === 'request').length, 0);
  assert.equal(records(f).filter((r) => r.event === 'blocked').length, 14);
  assert.equal(records(f).at(-1).event, 'finished');
});

test('C09 apparatus blocks query leakage and unguarded child or worker escape paths', async (t) => {
  const f = fixture(t);
  const result = await child(f, `import https from 'node:https'; import childProcess from 'node:child_process'; import {Worker} from 'node:worker_threads';
    let denied=0; const actions=[()=>https.request({hostname:'api.devfreelog.com',path:'/v2/resources/local_collection?secret=do-not-log'}),
      ()=>childProcess.spawn(process.execPath,['-e','throw 1']),()=>childProcess.execFileSync(process.execPath,['-e','throw 1']),
      ()=>childProcess.fork('not-created.js'),()=>new Worker('throw 1',{eval:true})];
    for(const action of actions) { try { action(); } catch { denied++; } } console.log(JSON.stringify({denied}));`);
  completed(result); assert.deepEqual(JSON.parse(result.stdout), { denied: 5 });
  assert.equal(records(f).filter((r) => r.event === 'blocked').length, 5);
  assert.ok(!readFileSync(f.trace, 'utf8').includes('do-not-log'));
});

test('C09 apparatus replaces ESM and CommonJS keyring before native load and rejects identity/writes', async (t) => {
  const f = fixture(t);
  const result = await child(f, `import {Entry} from '@napi-rs/keyring'; import {createRequire} from 'node:module';
    const CjsEntry=createRequire(import.meta.url)('@napi-rs/keyring').Entry;
    const entry=new Entry('freelog-runtime-cli','v1/dev/7');
    const cjs=new CjsEntry('freelog-runtime-cli','v1/dev/7');
    let denied=0; for(const action of [()=>new Entry('wrong','v1/dev/7'),()=>entry.setPassword('not-written'),
      ()=>entry.deleteCredential(),()=>createRequire(import.meta.url)('@napi-rs/keyring-win32-x64-msvc'),
      ()=>import('@napi-rs/keyring-win32-x64-msvc')]) {
      try { await action(); } catch { denied++; }
    }
    console.log(JSON.stringify({esm:JSON.parse(entry.getPassword()).schemaVersion,cjs:JSON.parse(cjs.getPassword()).schemaVersion,denied}));`);
  completed(result); assert.deepEqual(JSON.parse(result.stdout), { esm: 1, cjs: 1, denied: 5 });
  assert.equal(records(f).filter((r) => r.event === 'keyring-get').length, 2);
  assert.equal(records(f).filter((r) => r.event === 'blocked').length, 5);
  assert.ok(!readFileSync(f.trace, 'utf8').includes('local-recovery-synthetic-token'));
});

for (const fault of ['prepared', 'sending']) test(`C09 apparatus ${fault} fault exits only after exact intent persistence`, async (t) => {
  const f = fixture(t, fault);
  const directory = path.join(f.work, '.freelog/collection-forms/intents'); mkdirSync(directory, { recursive: true });
  const intent = path.join(directory, `${recoveryResource}.json`), source = path.join(directory, '.intent.tmp');
  writeFileSync(source, JSON.stringify({ state: fault }));
  const result = await child(f, `import {renameSync} from 'node:fs'; renameSync(${JSON.stringify(source)},${JSON.stringify(intent)}); console.log('must not execute');`);
  assert.equal(result.status, recoveryFaultExit); assert.equal(result.signal, null); assert.equal(result.error, null);
  assert.equal(result.stdout, ''); assert.equal(result.stderr, ''); assert.equal(existsSync(source), false);
  assert.deepEqual(JSON.parse(readFileSync(intent)), { state: fault });
  assert.deepEqual(records(f).filter((r) => r.event === 'fault'), [{ schemaVersion: 1, event: 'fault', kind: fault, exitCode: recoveryFaultExit }]);
});

test('C09 apparatus cleanup failure affects only its exact intent, not current draft or other files', async (t) => {
  const f = fixture(t, 'cleanup');
  const directory = path.join(f.work, '.freelog/collection-forms/intents'); mkdirSync(directory, { recursive: true });
  const intent = path.join(directory, `${recoveryResource}.json`), other = path.join(directory, 'other.json');
  writeFileSync(intent, '{"state":"rejected"}'); writeFileSync(other, 'disposable');
  const result = await child(f, `import {unlinkSync} from 'node:fs';
    let code; try { unlinkSync(${JSON.stringify(intent)}); } catch(error) { code=error.code; }
    unlinkSync(${JSON.stringify(other)}); console.log(JSON.stringify({code}));`);
  completed(result); assert.deepEqual(JSON.parse(result.stdout), { code: 'EACCES' });
  assert.equal(readFileSync(intent, 'utf8'), '{"state":"rejected"}'); assert.equal(existsSync(other), false);
  assert.equal(records(f).filter((r) => r.event === 'fault').length, 1);
});

test('C09 apparatus refuses missing/malformed/foreign control before executing child code', async (t) => {
  for (const kind of ['missing', 'malformed', 'foreign']) {
    const f = fixture(t);
    if (kind === 'malformed') writeFileSync(f.control, '{partial-control');
    if (kind === 'foreign') {
      const config = JSON.parse(readFileSync(f.control)); config.cwd = f.controls; writeFileSync(f.control, JSON.stringify(config));
    }
    const result = await child(f, 'console.log("must not execute")', kind === 'missing' ? { FREELOG_TEST_RECOVERY_CONTROL: '' } : {});
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
    assert.ok(result.stderr.includes('Invalid owned local recovery control; CLI execution forbidden.'));
    assert.ok(!result.stderr.includes('partial-control'));
  }
});
