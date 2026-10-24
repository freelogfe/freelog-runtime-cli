/** Synthetic oracle controls; no native keyring, execution, network or release approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { accountLoginCases, loginNames, loginCommand, loginSteps, evaluateAccountLogin } from '../acceptance/account-login-evidence.mjs';

const password = 'synthetic-login-password', username = 'synthetic-user';
const secret = JSON.stringify({ schemaVersion: 1, token: 'synthetic-login-token', cookie: 'authInfo=synthetic-login-cookie; uid=7' });
const jsonl = events => events.map(JSON.stringify).join('\n') + '\n';
const file = (name, value) => ({ path: name, kind: 'file', bytes: Buffer.from(value).toString('base64') });
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'freelog-login-oracle-'));
  t.after(() => { assert.equal(path.dirname(root), tmpdir()); assert.ok(path.basename(root).startsWith('freelog-login-oracle-')); rmSync(root, { recursive: true }); });
  const cliBin = path.join(root, 'node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js');
  mkdirSync(path.dirname(cliBin), { recursive: true }); writeFileSync(cliBin, 'synthetic nonexecuted bin');
  const startedAt = '2026-10-24T00:00:00.000Z', finishedAt = '2026-10-24T00:00:02.000Z';
  const normal = { status: 0, signal: null, error: null, timedOut: false, completed: true, stdout: `登录成功：${username}\n`, stderr: '' };
  const observed = { cliBin, packageName: '@freelog-cli/cli2', version: '0.5.8', binSha256: createHash('sha256').update('synthetic nonexecuted bin').digest('hex'),
    platform: process.platform, nodeVersion: 'v22.18.0', startedAt, finishedAt,
    capability: { childPid: 1, result: { ...normal, stdout: '{"stdin":true,"stdout":true}\n', completedSteps: 1, matchedPrompts: ['capability'] } }, scenarios: [] };
  for (const name of loginNames) {
    const scenario = { name, cwd: path.join(root, `work-${name}`), home: path.join(root, `home-${name}`), stages: [] };
    for (let index = 0; index < (name === 'duplicate' ? 2 : 1); index++) {
      const success = ['stdin-work', 'stdin-global', 'tty-work', 'tty-global'].includes(name) || name === 'duplicate' && index === 0;
      const tty = name.startsWith('tty-') || name.startsWith('cancel-'), steps = loginSteps(name);
      const before = [{ path: '.freelog', kind: 'directory' }, ...['1.json', '1.version.json', '2.json', '2.collection.json'].map(p => file(`.freelog/${p}`, `keep:${p}`))];
      const homeBefore = [file('keep.txt', 'preserve home')];
      const selector = file('.freelog/auth', JSON.stringify({ schemaVersion: 1, credentialKey: 'v1/dev/7', env: 'dev', userId: 7, username, createdAt: '2026-10-24T00:00:01.000Z' }));
      if (index) before.push(selector);
      const stage = { argv: loginCommand(name, index), stdin: tty ? null : name === 'empty-password' ? '\n' : `${password}\n`, tty, steps,
        childPid: 2, startedAt, finishedAt, result: { ...normal }, before, after: structuredClone(before), homeBefore, homeAfter: structuredClone(homeBefore),
        storeBefore: index ? { 'v1/dev/7': secret } : {}, storeAfter: success || index ? { 'v1/dev/7': secret } : {} };
      if (success) {
        if (name.endsWith('-global')) stage.homeAfter.push({ path: '.freelog', kind: 'directory' }, { ...selector, path: '.freelog/auth-default.json' });
        else stage.after.push(selector);
      } else {
        const message = name === 'duplicate' ? '当前目标已有凭据，请先 logout 再 login' : name === 'empty-password' ? '请提供密码' : name.startsWith('cancel-') ? '命令执行失败；如涉及写入，请先核对实际结果，勿重复执行。' : '登录失败：平台拒绝登录或未返回有效凭据';
        stage.result = { ...normal, status: 1, stdout: name === 'duplicate' ? JSON.stringify({ code: 'LOGIN_AUTH_EXISTS', message }) + '\n' : tty ? `${message}\n` : '', stderr: tty || name === 'duplicate' ? '' : `${message}\n` };
      }
      if (tty) { stage.result.completedSteps = steps.length; stage.result.matchedPrompts = steps.map(s => s.expect); }
      stage.trace = jsonl([{ schemaVersion: 1, event: 'ready', guard: 'account-login-local-v1' }, { schemaVersion: 1, event: 'keyring-replaced' },
        ...(success || name.endsWith('rejected') ? [{ schemaVersion: 1, event: 'request', url: 'https://api.devfreelog.com/v2/passport/login', method: 'POST', body: { loginName: username, password, isRemember: 1 } }] : []),
        ...(success ? [{ schemaVersion: 1, event: 'credential-set', service: 'freelog-runtime-cli', key: 'v1/dev/7', value: secret }] : []), { schemaVersion: 1, event: 'finished', blocked: 0 }]);
      stage.networkTrace = jsonl([{ schemaVersion: 1, event: 'ready', guard: 'local-parameter-no-network-v1' }, { schemaVersion: 1, event: 'finished', attempts: 0 }]);
      scenario.stages.push(stage);
    }
    observed.scenarios.push(scenario);
  }
  assert.equal(evaluateAccountLogin(observed).status, 'PASS'); return observed;
}
const stage = o => o.scenarios[0].stages[0];

test('actual product trace validator reopens raw login evidence and rejects forged PASS, run or time binding', async t => {
  const location = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
  const validate = (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace };\n//# sourceURL=account-login-trace-test.mjs`).toString('base64')}`)).validateProductTrace;
  const observed = fixture(t); observed.cliBin = realpathSync(observed.cliBin);
  observed.runId = 'synthetic-login-source-case'; observed.evidenceDir = realpathSync(path.dirname(observed.cliBin));
  const report = { cliBin: observed.cliBin, runId: observed.runId, evidenceDir: observed.evidenceDir, startedAt: observed.startedAt, finishedAt: observed.finishedAt };
  for (const mutate of [null, o => { stage(o).result.stdout = 'forged success'; }, o => { o.runId = 'wrong-run'; },
    o => { o.evidenceDir = path.dirname(o.evidenceDir); }, o => { o.finishedAt = '2026-10-24T00:00:03.000Z'; }]) {
    const result = evaluateAccountLogin(structuredClone(observed));
    if (mutate) mutate(result.observations);
    const bytes = JSON.stringify({ schemaVersion: 1, runId: report.runId, caseId: result.id, observations: result.observations, assertions: result.assertions });
    const raw = path.join(report.evidenceDir, 'raw-login.json'); writeFileSync(raw, bytes);
    result.evidenceRef = { path: raw, sha256: createHash('sha256').update(bytes).digest('hex'), runId: report.runId };
    if (mutate) assert.throws(() => validate(result, report), /SOURCE_CASE_EVIDENCE/u);
    else assert.doesNotThrow(() => validate(result, report));
  }
});
test('fixed login descriptor and complete synthetic positive control', t => {
  const result = evaluateAccountLogin(fixture(t)); assert.equal(result.assertions.length, 8);
  assert.deepEqual(result.assertions.map(a => a.id), accountLoginCases[0].assertionIds);
  assert.equal(accountLoginCases[0].required, true);
  assert.equal(accountLoginCases[0].parentRule, 'COMMAND.PARAMETER_CONTRACT');
});
test('native transcript permits ANSI and CRLF line endings', t => {
  const observed = fixture(t); observed.scenarios[6].stages[0].result.stdout = '\u001b[32m登录成功：synthetic-user\u001b[0m\r\n';
  assert.equal(evaluateAccountLogin(observed).status, 'PASS');
});
const negatives = [
  ['missing scenario', o => o.scenarios.pop()],
  ['duplicate scenario', o => { o.scenarios[1] = structuredClone(o.scenarios[0]); }],
  ['wrong scenario name', o => { o.scenarios[0].name = 'invented'; }],
  ['wrong installed hash', o => { o.binSha256 = '0'.repeat(64); }],
  ['native TTY unavailable', o => { o.capability.result.stdout = '{"stdin":false,"stdout":true}\n'; }],
  ['native child killed', o => { o.capability.result.signal = 'SIGTERM'; }],
  ['wrong argv', o => stage(o).argv.push('--global')],
  ['password echo', o => { o.scenarios[6].stages[0].result.stdout += password; }],
  ['token echo', o => { o.scenarios[6].stages[0].result.stdout += 'synthetic-login-token'; }],
  ['cookie value echo without cookie header', o => { o.scenarios[6].stages[0].result.stdout += 'synthetic-login-cookie'; }],
  ['ANSI-split secret echo', o => { o.scenarios[6].stages[0].result.stdout += 'synthetic-\u001b[32mlogin-cookie\u001b[0m'; }],
  ['native driver error', o => { o.scenarios[6].stages[0].result.stderr = 'transcript incomplete'; }],
  ['truncated output', o => { stage(o).result.stdout = '登录成功：'; }],
  ['wrong secret', o => { stage(o).storeAfter['v1/dev/7'] = '{}'; }],
  ['extra credential write', o => { const s = stage(o), e = s.trace.trim().split('\n'); e.splice(-1, 0, e.at(-2)); s.trace = e.join('\n'); }],
  ['changed identity draft', o => { stage(o).after.find(e => e.path === '.freelog/1.json').bytes = Buffer.from('changed').toString('base64'); }],
  ['native access blocked', o => { stage(o).trace = stage(o).trace.replace('"blocked":0', '"blocked":1'); }],
  ['network attempt', o => { stage(o).networkTrace = stage(o).networkTrace.replace('"attempts":0', '"attempts":1'); }],
  ['extra trace event', o => { stage(o).trace = stage(o).trace.replace('"event":"keyring-replaced"', '"event":"unknown"'); }],
  ['request retry', o => { const s = stage(o), e = s.trace.trim().split('\n'); e.splice(2, 0, e[2]); s.trace = e.join('\n'); }],
  ['credential write before request', o => { const s = stage(o), e = s.trace.trim().split('\n'); [e[2], e[3]] = [e[3], e[2]]; s.trace = e.join('\n'); }],
  ['request wrong password', o => { stage(o).trace = stage(o).trace.replace(password, 'different'); }],
  ['cancel side effect', o => { o.scenarios[8].stages[0].after.push(file('unexpected', 'written')); }],
  ['selector secret leak', o => { const s = stage(o), entry = s.after.find(e => e.path === '.freelog/auth'); const value = JSON.parse(Buffer.from(entry.bytes, 'base64')); value.token = 'synthetic-login-token'; entry.bytes = Buffer.from(JSON.stringify(value)).toString('base64'); }],
  ['selector outside stage window', o => { const s = stage(o), entry = s.after.find(e => e.path === '.freelog/auth'); entry.bytes = Buffer.from(Buffer.from(entry.bytes, 'base64').toString().replace('00:00:01', '00:01:01')).toString('base64'); }],
  ['duplicate credential loss', o => { o.scenarios[2].stages[1].storeAfter = {}; }],
  ['failed prompt completion', o => { o.scenarios[6].stages[0].result.completedSteps--; }],
  ['invented matched prompts', o => { o.scenarios[6].stages[0].result.matchedPrompts[0] = 'invented'; }],
];
for (const [name, mutate] of negatives) test(`rejects ${name}`, t => { const observed = fixture(t); mutate(observed); assert.equal(evaluateAccountLogin(observed).status, 'FAIL'); });
test('malformed observations fail closed without throwing', () => { for (const value of [null, {}, { scenarios: null }, { scenarios: [{}] }]) assert.equal(evaluateAccountLogin(value).status, 'FAIL'); });
