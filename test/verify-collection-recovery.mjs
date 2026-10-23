#!/usr/bin/env node
/** C09: real installed CLI and bundled SDK, isolated loopback transport, full recovery observations. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { recoveryRouteAllowed } from './acceptance/collection-recovery-control.mjs';
import { evaluateCollectionRecovery, recoveryBody, recoveryCommand, recoveryDraft, recoveryFixture, recoveryScenarios, recoveryVersion } from './acceptance/collection-recovery-evidence.mjs';

const id = 'COLLECTION.RECOVERY.INSTALLED_MATRIX';
const producer = 'verify-collection-recovery.mjs';
const loader = new URL('./acceptance/collection-recovery-loader.mjs', import.meta.url).href;
const preload = new URL('./acceptance/collection-recovery-preload.mjs', import.meta.url).href;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const jsonBytes = (value) => `${JSON.stringify(value, null, 2)}\n`;
const maxOutput = 1_000_000;
const childTimeout = 20_000;

/** Include empty directories and every exact file byte, not merely recognized state filenames. */
function snapshot(cwd) {
  const entries = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = lstatSync(file);
      const relative = path.relative(cwd, file).split(path.sep).join('/');
      if (stat.isSymbolicLink()) throw new Error('Unexpected symlink in owned collection recovery workspace.');
      if (stat.isDirectory()) { entries.push({ path: relative, kind: 'directory' }); visit(file); }
      else if (stat.isFile()) entries.push({ path: relative, kind: 'file', bytes: readFileSync(file).toString('base64') });
      else throw new Error('Unexpected special file in owned collection recovery workspace.');
    }
  }
  visit(cwd);
  return entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function writeJson(file, value) { writeFileSync(file, jsonBytes(value)); }

function childEnvironment(env, controls, control) {
  // Never inherit credentials, proxies, npm state, NODE_OPTIONS, user config or caller hooks.
  const inherited = Object.fromEntries(Object.entries(env).filter(([key, value]) =>
    /^(?:PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|LANG|LC_ALL|TZ)$/iu.test(key) && typeof value === 'string'));
  const home = path.join(controls, 'home');
  return { ...inherited, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
    XDG_CONFIG_HOME: home, NODE_OPTIONS: '', FREELOG_ENV: 'dev', NO_COLOR: '1',
    FREELOG_TEST_RECOVERY_CONTROL: control };
}

/** Async spawn keeps the parent loopback server responsive while the actual SDK is running. */
function execute(installed, argv, cwd, env) {
  return new Promise((resolve) => {
    let child, timer, forcedFinish, settled = false, error = null, timedOut = false, outputBytes = 0;
    const stdout = [], stderr = [];
    const finish = (status, signal) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(forcedFinish);
      resolve({ childPid: Number.isSafeInteger(child?.pid) ? child.pid : null,
        result: { status, signal: signal ?? null, error, timedOut,
          stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') } });
    };
    const stop = (reason) => {
      error ??= reason;
      child?.kill('SIGKILL');
      // A missing close event is itself an apparatus failure, never successful completion.
      forcedFinish ??= setTimeout(() => finish(null, 'SIGKILL'), 2_000);
    };
    try {
      child = spawn(process.execPath, ['--no-warnings', '--experimental-loader', loader, '--import', preload, installed.cliBin, ...argv], {
        cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      });
      const collect = (target) => (chunk) => {
        const bytes = Buffer.from(chunk);
        if (outputBytes + bytes.length <= maxOutput) target.push(bytes);
        outputBytes += bytes.length;
        if (outputBytes > maxOutput) stop('Collection recovery child exceeded the fixed output limit; retained streams are incomplete.');
      };
      child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr));
      child.once('error', (failure) => { error = `Collection recovery child spawn failure: ${failure.code ?? 'UNKNOWN'}`; });
      child.once('close', finish);
      timer = setTimeout(() => { timedOut = true; stop('Collection recovery child exceeded its fixed timeout.'); }, childTimeout);
    } catch { error = 'Collection recovery child could not be started.'; finish(null, null); }
  });
}

async function platform(fixture, scenario) {
  const initialForm = scenario === 'new-draft' ? fixture.baseline : fixture.form;
  const expected = clone(recoveryBody(initialForm, 1, fixture.auth));
  const state = { latest: 'snapshot_0', version: clone(recoveryVersion(fixture.baseline, 'snapshot_0', fixture.auth)),
    published: clone(fixture.published), draft: clone(fixture.draft) };
  const baseline = clone(state.version);
  const requests = [], errors = [];
  let puts = 0;
  const server = createServer((request, response) => {
    let bytes = 0, body = '', deliberateDisconnect = false;
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes <= maxOutput) body += chunk;
      else request.destroy();
    });
    request.once('error', () => { if (!deliberateDisconnect) errors.push('Loopback request failed before a complete body was observed.'); });
    request.on('end', () => {
      const method = request.method, url = request.url;
      let parsed = null;
      if (body) { try { parsed = JSON.parse(body); } catch { errors.push('Loopback request body was not JSON.'); } }
      // Record before responding or deliberately closing the socket; never log authorization headers.
      requests.push({ method, path: url, body: parsed });
      const send = (data, ret = 0, errCode = 0) => {
        const text = JSON.stringify({ ret, errCode, ...(ret ? { msg: 'synthetic rejection' } : {}), data });
        response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) }); response.end(text);
      };
      if (!recoveryRouteAllowed(method, url) || method === 'GET' && body !== '') {
        errors.push('Loopback received a route/method/body outside the fixed recovery interface.'); send(null, 1, 77); return;
      }
      if (method === 'PUT') {
        puts += 1;
        if (puts !== 1 || !isDeepStrictEqual(parsed, expected)) {
          errors.push(puts !== 1 ? 'A second publication PUT was attempted.' : 'Publication body differed from the independent full fixture.');
          send(null, 1, 77); return;
        }
        if (scenario === 'rejected') { send(null, 1, 77); return; }
        if (scenario !== 'uncommitted') {
          state.latest = 'snapshot_1'; state.version = clone(recoveryVersion(initialForm, 'snapshot_1', fixture.auth));
          state.published = clone(fixture.draft);
        }
        if (scenario === 'cleanup') send({ resourceId: fixture.resourceId, version: state.latest });
        else { deliberateDisconnect = true; request.socket.destroy(); }
        return;
      }
      const route = new URL(url, 'http://127.0.0.1').pathname;
      if (route === `/v2/resources/${fixture.resourceId}`) {
        send({ resourceId: fixture.resourceId, resourceName: fixture.resourceName, resourceTitle: 'Local recovery collection',
          resourceTypeCode: fixture.typeCode, subjectType: 4, userId: fixture.userId, status: 0,
          latestVersion: state.latest, serializeStatus: 0 });
      } else if (route === `/v2/resources/${fixture.resourceId}/versions/snapshot_0`) send(baseline);
      else if (route === `/v2/resources/${fixture.resourceId}/versions/snapshot_1`) send(state.version);
      else if (route.endsWith('/items/collectRules')) send(null);
      else if (route.endsWith('/items')) {
        const rows = route.includes('/catalogues/drafts/') ? state.draft : state.published;
        const skip = Number(new URL(url, 'http://127.0.0.1').searchParams.get('skip') ?? '0');
        send({ skip, limit: 100, totalItem: rows.length, dataList: clone(rows.slice(skip, skip + 100)) });
      } else if (route === '/v2/resources/types/listSimpleByGroup') {
        send([{ code: fixture.typeCode, name: 'Local collection', subjectType: 4, status: 1, isTerminate: true }]);
      } else if (route === '/v2/resources/types/getInfoByCode') {
        send({ code: fixture.typeCode, name: 'Local collection', subjectType: 4, status: 1, isTerminate: true,
          attrs: [{ key: 'display_artist', name: '系统作者' }],
          resourceConfig: { supportOptionalConfig: 2 } });
      } else if (route === '/v2/storages/files/info') {
        send({ metaInfoArray: [{ key: 'display_artist', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '' }] });
      } else if (route === '/v2/resources/attrs/getInfoByKey') {
        send({ key: 'display_artist', format: 6, contentRule: { maxLength: 140 } });
      } else { errors.push('Approved route lacked an independent loopback response.'); send(null, 1, 77); }
    });
  });
  server.requestTimeout = childTimeout; server.headersTimeout = childTimeout;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { state, requests, errors, port: server.address().port,
    close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}

function initialize(cwd, fixture, scenario) {
  for (const directory of ['.freelog/collection-forms/dev', '.freelog/collection-forms/intents', 'empty-dir']) mkdirSync(path.join(cwd, directory), { recursive: true });
  writeJson(path.join(cwd, '.freelog/1.json'), fixture.identity);
  writeJson(path.join(cwd, '.freelog/auth'), fixture.selector);
  writeFileSync(path.join(cwd, '.freelog/.sequence'), '1\n');
  writeFileSync(path.join(cwd, 'keep.txt'), 'local recovery sentinel\n');
  if (scenario !== 'new-draft') writeJson(path.join(cwd, '.freelog/collection-forms/dev', `${fixture.resourceId}.json`), recoveryDraft(fixture.form));
}

/** Deliberate post-request changes stay separate from the captured CLI stages. */
function changeAfterRepeat(name, cwd, fixture, remote) {
  const draftFile = path.join(cwd, '.freelog/collection-forms/dev', `${fixture.resourceId}.json`);
  const intentFile = path.join(cwd, '.freelog/collection-forms/intents', `${fixture.resourceId}.json`);
  if (name === 'changed') {
    const draft = JSON.parse(readFileSync(draftFile, 'utf8')); draft.form.description = 'edited after unknown publish'; writeJson(draftFile, draft);
  } else if (name === 'broken') writeFileSync(draftFile, '{broken local draft\n');
  else if (name === 'new-draft') writeJson(draftFile, recoveryDraft(fixture.form));
  else if (name === 'wrong-resource') remote.version.resourceId = 'other_collection';
  else if (name === 'wrong-version') remote.version.version = 'snapshot_other';
  else if (name === 'wrong-form') remote.version.description = 'different remote form';
  else if (name === 'wrong-auth') remote.version.authExcludedItems[0].excludedValue = 'wrong_exclusion';
  else if (name === 'wrong-directory') remote.published[0].itemTitle = 'wrong published item title';
  else if (name === 'legacy') writeJson(intentFile, { schemaVersion: 1, resourceId: fixture.resourceId, state: 'unknown' });
  else if (name === 'invalid-intent') writeFileSync(intentFile, '{"schemaVersion":2,\n');
  else if (['payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name)) {
    const intent = JSON.parse(readFileSync(intentFile, 'utf8'));
    if (name === 'payload-mismatch') intent.payloadSha256 = '0'.repeat(64);
    if (name === 'wrong-env') intent.env = 'test';
    if (name === 'wrong-owner') intent.userId = 8;
    if (name === 'wrong-type') intent.resourceTypeCode = 'CT999';
    writeJson(intentFile, intent);
  } else if (name === 'readonly-txn') {
    writeJson(path.join(cwd, '.freelog/.txn.json'), { schemaVersion: 1, entries: [{ path: '.sequence',
      before: '1\n', beforeSha256: digest('1\n'), after: '2\n', afterSha256: digest('2\n') }] });
  }
}

async function scenario(name, installed, env, evidenceDir, deadline) {
  const fixture = recoveryFixture();
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  const observed = { name, cwd, controls, stages: [] };
  let server;
  try {
    mkdirSync(path.join(controls, 'home')); initialize(cwd, fixture, name);
    server = await platform(fixture, name);
    for (const stageName of ['publish', 'repeat', 'inspect', 'apply']) {
      if (Date.now() > deadline) throw new Error('Collection recovery matrix exceeded its fixed total time budget.');
      if (stageName === 'inspect') changeAfterRepeat(name, cwd, fixture, server.state);
      const trace = path.join(controls, `${stageName}.jsonl`), control = path.join(controls, 'control.json');
      writeFileSync(trace, '', { flag: 'wx' });
      const fault = stageName !== 'publish' ? 'none' : ['prepared', 'sending'].includes(name) ? name
        : ['cleanup', 'rejected'].includes(name) ? 'cleanup' : 'none';
      writeJson(control, { cwd, port: server.port, trace, fault });
      const argv = recoveryCommand(stageName);
      const before = snapshot(cwd), startRequest = server.requests.length, startError = server.errors.length;
      const startedAt = new Date().toISOString();
      const executed = await execute(installed, argv, cwd, childEnvironment(env, controls, control));
      const stage = { name: stageName, argv, startedAt, finishedAt: new Date().toISOString(),
        ...executed, before, after: snapshot(cwd), trace: readFileSync(trace, 'utf8'),
        requests: clone(server.requests.slice(startRequest)), remote: { version: clone(server.state.version),
          published: clone(server.state.published), draft: clone(server.state.draft) },
        apparatusErrors: server.errors.slice(startError) };
      const file = path.join(evidenceDir, `collection-recovery.${name}.${stageName}.json`);
      const bytes = jsonBytes(stage); writeFileSync(file, bytes, { flag: 'wx' });
      stage.evidenceRef = { path: file, sha256: digest(bytes) };
      observed.stages.push(stage);
      // Never run a successor after an apparatus timeout/error or arbitrary signal termination.
      if (stage.result.error || stage.result.timedOut || stage.result.signal !== null || !Number.isSafeInteger(stage.result.status)) break;
    }
  } catch (error) { observed.apparatusError = error instanceof Error ? error.message : 'Collection recovery apparatus failed.'; }
  finally { if (server) await server.close(); }
  return observed;
}

export async function runCollectionRecoveryCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const startedAt = new Date().toISOString();
  let installed, evidenceDir;
  if (typeof output !== 'string' || !path.isAbsolute(output) || existsSync(output)) throw new Error('A new absolute FREELOG_TEST_SUITE_REPORT is required; existing evidence is never overwritten.');
  evidenceDir = path.dirname(output);
  if (realpathSync(evidenceDir) !== evidenceDir || !lstatSync(evidenceDir).isDirectory() || lstatSync(evidenceDir).isSymbolicLink()) throw new Error('Recovery evidence directory must be a real owned candidate run directory.');
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '') || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new Error('Recovery run ID must match the actual evidence-writer process.');
  try { installed = requireInstalledCli(env); } catch (error) {
    const result = { id, status: 'BLOCKED', assertions: [], reason: error.message,
      observations: { runId: env.FREELOG_TEST_RUN_ID, startedAt, finishedAt: new Date().toISOString(), executed: false } };
    writeSuiteCases([result], output); return { cases: [result], exitCode: 3 };
  }
  const observations = { runId: env.FREELOG_TEST_RUN_ID, evidenceDir, ...installed,
    platform: process.platform, nodeVersion: process.version, startedAt, finishedAt: null, scenarios: [], apparatusErrors: [] };
  const deadline = Date.now() + 15 * 60_000;
  for (const name of recoveryScenarios) {
    const run = await scenario(name, installed, env, evidenceDir, deadline);
    observations.scenarios.push(run);
    if (run.apparatusError) observations.apparatusErrors.push(`${name}: ${run.apparatusError}`);
    for (const stage of run.stages) for (const error of stage.apparatusErrors) observations.apparatusErrors.push(`${name}/${stage.name}: ${error}`);
  }
  observations.finishedAt = new Date().toISOString();
  const result = evaluateCollectionRecovery(observations);
  // Preserve all raw observations before even considering removal of successful no-intent workspaces.
  writeSuiteCases([result], output);
  for (const run of observations.scenarios) {
    const intent = path.join(run.cwd, '.freelog/collection-forms/intents', 'local_collection.json');
    if (result.status !== 'PASS' || existsSync(intent)) {
      console.log(`RETAIN collection recovery workspace: ${run.cwd}; controls: ${run.controls}`); continue;
    }
    try {
      cleanupWorkspace(run.cwd, { success: true, prefixes: ['freelog-collection-recovery-work-'] });
      cleanupWorkspace(run.controls, { success: true, prefixes: ['freelog-collection-recovery-controls-'] });
    } catch (error) {
      result.status = 'FAIL'; result.reason = `Owned recovery workspace cleanup failed: ${error.message}`;
      writeSuiteCases([result], output);
    }
  }
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 3 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new Error('Installed collection recovery permits only --env dev; no workspace build or real network option exists.');
    const result = await runCollectionRecoveryCases();
    console.log(JSON.stringify({ producer, result: result.cases[0].status })); process.exitCode = result.exitCode;
  } catch (error) { console.error(error instanceof Error ? error.message : 'Installed collection recovery producer failed.'); process.exitCode = 1; }
}
