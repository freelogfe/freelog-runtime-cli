/** Closed synthetic login fixture. This is not a production credential store or network proxy. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module, { syncBuiltinESMExports } from 'node:module';
import dns from 'node:dns';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import './deny-network.mjs';

const regular = (file) => typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file
  && fs.realpathSync(file) === file && fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink();
const directory = (file) => typeof file === 'string' && path.isAbsolute(file) && path.resolve(file) === file
  && fs.realpathSync(file) === file && fs.lstatSync(file).isDirectory() && !fs.lstatSync(file).isSymbolicLink();
let config;
try {
  const file = process.env.FREELOG_TEST_LOGIN_CONTROL;
  if (!regular(file)) throw new Error();
  config = JSON.parse(fs.readFileSync(file, 'utf8'));
  const controls = path.dirname(file), temporary = fs.realpathSync(os.tmpdir());
  if (Object.keys(config).sort().join(',') !== 'cwd,home,mode,store,trace'
    || !['ok', 'http-rejected', 'business-rejected'].includes(config.mode)
    || !directory(controls) || path.dirname(controls) !== temporary || !path.basename(controls).startsWith('freelog-login-controls-')
    || !directory(config.cwd) || path.dirname(config.cwd) !== temporary || !path.basename(config.cwd).startsWith('freelog-login-work-')
    || !directory(config.home) || config.home !== path.join(controls, 'home') || os.homedir() !== config.home
    || process.cwd() !== config.cwd || !regular(config.trace) || path.dirname(config.trace) !== controls
    || !regular(config.store) || path.dirname(config.store) !== controls) throw new Error();
} catch { throw new Error('Invalid isolated login control; execution forbidden.'); }
let blocked = 0;
export const recordLogin = (event) => fs.appendFileSync(config.trace, `${JSON.stringify({ schemaVersion: 1, ...event })}\n`);
function deny(kind) { blocked++; recordLogin({ event: 'blocked', kind }); throw new Error('Unapproved login fixture operation.'); }
const key = 'v1/dev/7';
export class Entry {
  constructor(service, account) {
    if (service !== 'freelog-runtime-cli' || account !== key) deny('credential-identity');
    this.service = service; this.key = account;
  }
  getPassword() {
    recordLogin({ event: 'credential-get', service: this.service, key: this.key });
    return JSON.parse(fs.readFileSync(config.store, 'utf8'))[this.key] ?? null;
  }
  setPassword(value) {
    recordLogin({ event: 'credential-set', service: this.service, key: this.key, value });
    const store = JSON.parse(fs.readFileSync(config.store, 'utf8'));
    store[this.key] = value; fs.writeFileSync(config.store, JSON.stringify(store));
  }
  deleteCredential() { return deny('credential-delete'); }
}
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === '@napi-rs/keyring') { recordLogin({ event: 'keyring-replaced' }); return { Entry }; }
  if (typeof request === 'string' && /keyring.*\.node|@napi-rs[/\\]keyring/u.test(request)) return deny('native-keyring');
  return load.call(this, request, ...args);
};
// deny-network guards sockets; also close DNS, subprocess and worker escapes in this fixture.
for (const target of [dns, dns.promises, dns.Resolver.prototype, dns.promises.Resolver.prototype]) {
  for (const name of Object.getOwnPropertyNames(target)) if (/^(lookup|resolve|reverse)/u.test(name) && typeof target[name] === 'function') target[name] = () => deny('dns');
}
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[name] = () => deny('subprocess');
workerThreads.Worker = function () { return deny('worker'); };
// Guard the current synchronous selector API too: HOME alone does not isolate ancestor search.
const read = fs.readFileSync;
fs.readFileSync = function (file, ...args) {
  if (typeof file === 'string' && ['auth', 'auth-default.json'].includes(path.basename(file))
    && ![path.join(config.cwd, '.freelog/auth'), path.join(config.home, '.freelog/auth-default.json')].includes(path.resolve(file))) deny('outside-selector-read');
  return read.call(this, file, ...args);
};
fs.unlinkSync = function () { return deny('unlink'); };
globalThis.fetch = async function (url, options) {
  if (url !== 'https://api.devfreelog.com/v2/passport/login' || options?.method !== 'POST'
    || JSON.stringify(options.headers) !== JSON.stringify({ 'content-type': 'application/json' })
    || typeof options.body !== 'string' || !(options.signal instanceof AbortSignal)) return deny('fetch');
  let body; try { body = JSON.parse(options.body); } catch { return deny('fetch-body'); }
  recordLogin({ event: 'request', url, method: options.method, body });
  const headers = new Headers();
  headers.append('set-cookie', 'authInfo=synthetic-login-cookie; Path=/; HttpOnly');
  headers.append('set-cookie', 'uid=7; Path=/');
  return new Response(JSON.stringify({ ret: 0, errCode: config.mode === 'business-rejected' ? 1 : 0,
    data: { userId: 7, username: 'synthetic-user', tokenSn: 'synthetic-login-token' } }),
  { status: config.mode === 'http-rejected' ? 401 : 200, headers });
};
syncBuiltinESMExports();
recordLogin({ event: 'ready', guard: 'account-login-local-v1' });
process.once('exit', () => recordLogin({ event: 'finished', blocked }));
