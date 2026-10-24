/** Fixed installed-login contract. Synthetic protocol controls never approve a release. */
import { isDeepStrictEqual as equal, stripVTControlCharacters as strip } from 'node:util';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const loginNames = Object.freeze(['stdin-work', 'stdin-global', 'duplicate', 'empty-password', 'http-rejected', 'business-rejected', 'tty-work', 'tty-global', 'cancel-name', 'cancel-password']);
const ids = ['installed-bin', 'native-tty', 'exact-scenarios', 'commands-and-output', 'auth-requests', 'credential-effects', 'selector-and-drafts', 'guards-complete'];
export const accountLoginCases = Object.freeze([{ id: 'ACCOUNT.LOGIN.INSTALLED_MATRIX', kind: 'product-case', required: true,
  parentRule: 'COMMAND.PARAMETER_CONTRACT',
  title: 'Installed login stdin, native TTY, rejection and cancellation boundaries', script: 'verify-account-login.mjs', assertionIds: ids,
  layer: 'installed-candidate/local-transport/native-TTY/not-real-dev', inputClass: 'S02 fixed ten login scenarios',
  designRefs: [{ path: 'docs/一期/产品方案/脚手架设计/ARCHITECTURE/01-账号.md', sections: ['1', '2.1', '2.2'] }],
  preconditions: ['Isolated workspace/home and synthetic credential store; installed bin; native TTY capability.'],
  action: ['Run ten fixed login scenarios and compare requests, secrets, selectors and complete snapshots.'],
  forbiddenSideEffects: ['real network', 'native credential store', 'password echo', 'draft changes', 'automatic retry'] }]);
const password = 'synthetic-login-password', username = 'synthetic-user', token = 'synthetic-login-token';
const cookie = 'authInfo=synthetic-login-cookie; uid=7';
const secret = JSON.stringify({ schemaVersion: 1, token, cookie });
const store = { 'v1/dev/7': secret };
const successText = `登录成功：${username}\n`;
const terminalText = text => strip(text).replace(/\r\n/gu, '\n');
const unexpected = '命令执行失败；如涉及写入，请先核对实际结果，勿重复执行。';
const isTty = name => name.startsWith('tty-') || name.startsWith('cancel-');
const succeeds = (name, index) => ['stdin-work', 'stdin-global', 'tty-work', 'tty-global'].includes(name) || name === 'duplicate' && index === 0;
export function loginCommand(name, index = 0) {
  return ['login', ...(isTty(name) ? [] : ['--login-name', username, '--password-stdin', '--yes']), '--env', 'dev',
    ...(name.endsWith('-global') ? ['--global'] : []), ...(name === 'duplicate' && index === 1 ? ['--json'] : [])];
}
export function loginSteps(name) {
  if (!isTty(name)) return [];
  const steps = [{ expect: '登录名', send: name === 'cancel-name' ? '\u0003' : `${username}\r` }];
  if (name !== 'cancel-name') steps.push({ expect: '密码', send: name === 'cancel-password' ? '\u0003' : `${password}\r` });
  if (!name.startsWith('cancel-')) steps.push({ expect: `登录成功：${username}` });
  return steps;
}
const events = raw => raw.trim().split('\n').map(JSON.parse);
const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const inside = (time, start, end) => stamp(time) && stamp(start) && stamp(end) && Date.parse(start) <= Date.parse(time) && Date.parse(time) <= Date.parse(end);
function snapshot(entries) {
  return Array.isArray(entries) && new Set(entries.map(e => e?.path)).size === entries.length && entries.every(e =>
    e && typeof e.path === 'string' && e.path.length > 0 && !e.path.includes('\\') && !e.path.split('/').some(p => !p || p === '..' || p === '.')
    && (e.kind === 'directory' ? Object.keys(e).length === 2 : e.kind === 'file' && Object.keys(e).length === 3
      && typeof e.bytes === 'string' && Buffer.from(e.bytes, 'base64').toString('base64') === e.bytes));
}
const sorted = entries => [...entries].sort((a, b) => a.path.localeCompare(b.path, 'en'));
const same = (a, b) => snapshot(a) && snapshot(b) && equal(sorted(a), sorted(b));
function processOk(result, status, tty, steps) {
  return result?.status === status && result.signal === null && result.completed === true && typeof result.stdout === 'string' && typeof result.stderr === 'string'
    && ![password, token, 'synthetic-login-cookie'].some(secret => [result.stdout, result.stderr,
      terminalText(result.stdout), terminalText(result.stderr)].some(output => output.includes(secret)))
    && (tty ? result.stderr === '' && result.completedSteps === steps.length && Array.isArray(result.matchedPrompts) && result.matchedPrompts.length === steps.length
      : result.error === null && result.timedOut === false);
}
function outputOk(name, index, stage) {
  const ok = succeeds(name, index), tty = isTty(name), r = stage.result;
  if (!processOk(r, ok ? 0 : 1, tty, loginSteps(name))) return false;
  if (tty && !equal(r.matchedPrompts, loginSteps(name).map(s => s.expect))) return false;
  if (ok) return tty ? terminalText(r.stdout).includes(successText) && !terminalText(r.stdout).includes('登录失败') : r.stdout === successText && r.stderr === '';
  const code = name === 'duplicate' ? 'LOGIN_AUTH_EXISTS' : name === 'empty-password' ? 'LOGIN_PASSWORD_REQUIRED' : name.startsWith('cancel-') ? 'CLI_UNEXPECTED_ERROR' : 'LOGIN_FAILED';
  const message = name === 'duplicate' ? '当前目标已有凭据，请先 logout 再 login' : name === 'empty-password' ? '请提供密码' : name.startsWith('cancel-') ? unexpected : '登录失败：平台拒绝登录或未返回有效凭据';
  if (name === 'duplicate') { try { return equal(JSON.parse(r.stdout), { code, message }) && r.stderr === ''; } catch { return false; } }
  return tty ? terminalText(r.stdout).includes(`${message}\n`) && !terminalText(r.stdout).includes(successText) : r.stdout === '' && r.stderr === `${message}\n`;
}
function selectorOk(scenario, stage, created) {
  const targetHome = scenario.name.endsWith('-global'), target = targetHome ? '.freelog/auth-default.json' : '.freelog/auth';
  const before = targetHome ? stage.homeBefore : stage.before, after = targetHome ? stage.homeAfter : stage.after;
  if (![stage.before, stage.after, stage.homeBefore, stage.homeAfter].every(snapshot)) return false;
  if (!['.freelog/1.json', '.freelog/1.version.json', '.freelog/2.json', '.freelog/2.collection.json'].every(p => stage.before.some(e => e.path === p && e.kind === 'file'))
    || !stage.homeBefore.some(e => e.path === 'keep.txt' && e.kind === 'file')) return false;
  if (!created) return same(stage.before, stage.after) && same(stage.homeBefore, stage.homeAfter);
  if (before.some(e => e.path === target)) return false;
  const entry = after.find(e => e.path === target);
  if (entry?.kind !== 'file') return false;
  const selector = JSON.parse(Buffer.from(entry.bytes, 'base64').toString('utf8'));
  if (!equal(Object.keys(selector).sort(), ['schemaVersion', 'credentialKey', 'env', 'userId', 'username', 'createdAt'].sort())
    || !equal({ ...selector, createdAt: '' }, { schemaVersion: 1, credentialKey: 'v1/dev/7', env: 'dev', userId: 7, username, createdAt: '' })
    || !inside(selector.createdAt, stage.startedAt, stage.finishedAt)) return false;
  const permitted = after.filter(e => e.path !== target && !(e.path === '.freelog' && e.kind === 'directory' && !before.some(b => b.path === '.freelog')));
  return same(before, permitted) && same(targetHome ? stage.before : stage.homeBefore, targetHome ? stage.after : stage.homeAfter);
}
export function evaluateAccountLogin(observed) {
  const assertions = [], add = (id, check) => { let passed = false; try { passed = check() === true; } catch {} assertions.push({ id, passed }); };
  const all = fn => Array.isArray(observed?.scenarios) && observed.scenarios.every(s => Array.isArray(s.stages) && s.stages.length > 0 && s.stages.every((stage, index) => fn(s, stage, index)));
  add('installed-bin', () => path.isAbsolute(observed.cliBin) && /[/\\]node_modules[/\\]@freelog-cli[/\\]cli2[/\\]dist[/\\]bin[/\\]index\.js$/u.test(observed.cliBin)
    && lstatSync(observed.cliBin).isFile() && !lstatSync(observed.cliBin).isSymbolicLink() && observed.packageName === '@freelog-cli/cli2' && /^\d+\.\d+\.\d+/u.test(observed.version)
    && createHash('sha256').update(readFileSync(observed.cliBin)).digest('hex') === observed.binSha256
    && ['win32', 'darwin', 'linux'].includes(observed.platform) && /^v(?:20|22)\./u.test(observed.nodeVersion) && inside(observed.startedAt, observed.startedAt, observed.finishedAt));
  add('native-tty', () => { const c = observed.capability, r = c.result; return Number.isSafeInteger(c.childPid) && c.childPid > 0 && processOk(r, 0, true, [{}])
    && r.stderr === '' && equal(JSON.parse(strip(r.stdout).trim()), { stdin: true, stdout: true }); });
  add('exact-scenarios', () => equal(observed.scenarios.map(s => s.name), loginNames) && new Set(observed.scenarios.map(s => s.cwd)).size === loginNames.length
    && new Set(observed.scenarios.map(s => s.home)).size === loginNames.length && all((s, st) => path.isAbsolute(s.cwd) && path.isAbsolute(s.home) && s.cwd !== s.home
      && s.stages.length === (s.name === 'duplicate' ? 2 : 1) && Number.isSafeInteger(st.childPid) && st.childPid > 0 && inside(st.startedAt, observed.startedAt, observed.finishedAt) && inside(st.finishedAt, st.startedAt, observed.finishedAt)));
  add('commands-and-output', () => all((s, st, i) => equal(st.argv, loginCommand(s.name, i)) && st.tty === isTty(s.name) && equal(st.steps, loginSteps(s.name))
    && st.stdin === (isTty(s.name) ? null : s.name === 'empty-password' ? '\n' : `${password}\n`) && outputOk(s.name, i, st)));
  add('auth-requests', () => all((s, st, i) => { const requests = events(st.trace).filter(e => e.event === 'request');
    const expected = succeeds(s.name, i) || ['http-rejected', 'business-rejected'].includes(s.name);
    return equal(requests, expected ? [{ schemaVersion: 1, event: 'request', url: 'https://api.devfreelog.com/v2/passport/login', method: 'POST', body: { loginName: username, password, isRemember: 1 } }] : []); }));
  add('credential-effects', () => all((s, st, i) => { const retained = s.name === 'duplicate' && i === 1, writes = events(st.trace).filter(e => e.event === 'credential-set');
    return equal(st.storeBefore, retained ? store : {}) && equal(st.storeAfter, succeeds(s.name, i) || retained ? store : {})
      && equal(writes, succeeds(s.name, i) ? [{ schemaVersion: 1, event: 'credential-set', service: 'freelog-runtime-cli', key: 'v1/dev/7', value: secret }] : []); }));
  add('selector-and-drafts', () => all((s, st, i) => selectorOk(s, st, succeeds(s.name, i)) && (i === 0 || same(s.stages[i - 1].after, st.before) && same(s.stages[i - 1].homeAfter, st.homeBefore) && equal(s.stages[i - 1].storeAfter, st.storeBefore))));
  add('guards-complete', () => all((s, st, i) => { const trace = events(st.trace), body = trace.slice(1, -1), order = body.map(e => e.event);
    return equal(trace[0], { schemaVersion: 1, event: 'ready', guard: 'account-login-local-v1' }) && equal(trace.at(-1), { schemaVersion: 1, event: 'finished', blocked: 0 })
      && body.every(e => ['request', 'credential-set', 'keyring-replaced'].includes(e.event)) && body.filter(e => e.event === 'keyring-replaced').length === 1
      && equal(body.find(e => e.event === 'keyring-replaced'), { schemaVersion: 1, event: 'keyring-replaced' })
      && (!succeeds(s.name, i) || order.indexOf('request') < order.indexOf('credential-set'))
      && equal(events(st.networkTrace), [{ schemaVersion: 1, event: 'ready', guard: 'local-parameter-no-network-v1' }, { schemaVersion: 1, event: 'finished', attempts: 0 }]); }));
  const status = assertions.every(a => a.passed) ? 'PASS' : 'FAIL';
  return { id: accountLoginCases[0].id, status, assertions, observations: observed, ...(status === 'FAIL' ? { reason: `Login contract mismatched: ${assertions.filter(a => !a.passed).map(a => a.id).join(', ')}` } : {}) };
}
