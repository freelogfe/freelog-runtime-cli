#!/usr/bin/env node
/** Real C07 native interactions; platform state is an owned loopback fixture only. */
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { itemWorkspaceSnapshot, itemChildEnvironment, itemChildExecute } from './acceptance/collection-workspace.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { recoveryRouteAllowed } from './acceptance/collection-recovery-control.mjs';
import { preflightRules } from './acceptance/collection-publish-preflight-evidence.mjs';
import { previewNames, previewSpec, previewEntries, previewCommand, previewSteps, previewModel, previewHash,
  previewCapabilityCommand, evaluateCollectionPublishPreview } from './acceptance/collection-publish-preview-evidence.mjs';
const producer = 'verify-collection-publish-preview.mjs', id = 'COLLECTION.PUBLISH.PREVIEW_TTY';
const preload = new URL('./acceptance/collection-publish-preview-preload.mjs', import.meta.url).href;
const loader = new URL('./acceptance/collection-recovery-loader.mjs', import.meta.url).href;
const copy = value => structuredClone(value), json = value => `${JSON.stringify(value, null, 2)}\n`;
function owned(name) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  mkdirSync(path.join(controls, 'home'));
  for (const entry of previewEntries(name)) { const file = path.join(cwd, entry.path);
    if (entry.kind === 'directory') mkdirSync(file, { recursive: true }); else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(entry.bytes, 'base64')); } }
  return { cwd, controls };
}
function persist(value, evidenceDir, name) {
  const file = path.join(evidenceDir, `collection-publish-preview.${name}.json`), bytes = json(value);
  writeFileSync(file, bytes, { flag: 'wx' }); value.evidenceRef = { path: file, sha256: previewHash(bytes) }; return value;
}
async function platform(name) {
  const state = previewModel(name), baseline = copy(state.version), requests = [], errors = [];
  const server = createServer((req, res) => {
    let text = '', count = 0; req.setEncoding('utf8');
    req.on('data', chunk => { count += Buffer.byteLength(chunk); if (count <= 1_000_000) text += chunk; else { errors.push('Preview body exceeded bound.'); req.destroy(); } });
    req.on('error', () => errors.push('Preview request incomplete.'));
    req.on('end', () => {
      let body = null; try { if (text) body = JSON.parse(text); } catch { errors.push('Preview request body not JSON.'); }
      const entry = { method: req.method, path: req.url, body, response: null }; requests.push(entry);
      const send = (data, ret = 0, errCode = 0) => { entry.response = { ret, errCode, data: copy(data) }; const bytes = JSON.stringify(entry.response);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }); res.end(bytes); };
      if (!recoveryRouteAllowed(req.method, req.url) || req.method === 'GET' && text) { errors.push('Unapproved preview route/method/body.'); send(null, 1, 77); return; }
      const url = new URL(req.url, 'https://api.devfreelog.com'), route = url.pathname;
      if (req.method === 'PUT') {
        state.puts++;
        if (state.puts !== 1 || !body || Array.isArray(body)
          || Object.keys(body).sort().join(',') !== 'authExcludedItems,catalogueProperty,customPropertyDescriptors,dependencies,description,inputAttrs,isMergeCatalogueDraft'
          || !Array.isArray(body.inputAttrs) || !Array.isArray(body.customPropertyDescriptors) || !Array.isArray(body.dependencies)
          || !Array.isArray(body.authExcludedItems) || ![0, 1].includes(body.isMergeCatalogueDraft)) {
          errors.push('Invalid or repeated preview publication.'); send(null, 1, 77); return;
        }
        const { inputAttrs, isMergeCatalogueDraft, ...snapshot } = body;
        state.target.latestVersion = 'snapshot_1'; state.version = { resourceId: 'local_collection', version: 'snapshot_1', ...copy(snapshot),
          systemPropertyDescriptors: inputAttrs.map(({ key, value }) => ({ key, insertMode: 2, valueDisplay: value })) };
        if (isMergeCatalogueDraft === 1) state.published = copy(state.draft);
        send({ resourceId: 'local_collection', version: 'snapshot_1' }); return;
      }
      if (route === '/v2/resources/local_collection') { send(state.target); return; }
      if (route === '/v2/resources/local_collection/versions/snapshot_0') { send(baseline); return; }
      if (route === '/v2/resources/local_collection/versions/snapshot_1' && state.version.version === 'snapshot_1') { send(state.version); return; }
      if (route.endsWith('/collectRules')) { send(preflightRules(0)); return; }
      if (route.endsWith('/items')) { const rows = route.includes('/catalogues/drafts/') ? state.draft : state.published, skip = Number(url.searchParams.get('skip'));
        send({ skip, limit: 100, totalItem: rows.length, dataList: rows.slice(skip, skip + 100) }); return; }
      if (route === '/v2/resources/types/listSimpleByGroup') { send([{ code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true }]); return; }
      if (route === '/v2/resources/types/getInfoByCode') { send({ code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true,
        attrs: [{ key: 'display_artist', name: '系统作者' }], resourceConfig: { supportOptionalConfig: 2 } }); return; }
      if (route === '/v2/storages/files/info') { send({ metaInfoArray: [{ key: 'display_artist', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '' }] }); return; }
      if (route === '/v2/resources/attrs/getInfoByKey') { send({ key: 'display_artist', format: 6, contentRule: { maxLength: 140 } }); return; }
      errors.push('Preview route has no model response.'); send(null, 1, 77);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, requests, errors, port: server.address().port, close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
function controlFiles(f, port) {
  const trace = path.join(f.controls, 'trace.jsonl'), control = path.join(f.controls, 'control.json');
  writeFileSync(trace, '', { flag: 'wx' }); writeFileSync(control, json({ cwd: f.cwd, trace, port, fault: 'none' }), { flag: 'wx' }); return { trace, control };
}
async function capability(env, evidenceDir, runTty) {
  const f = owned('full-cancel'), { trace, control } = controlFiles(f, 1);
  const value = { name: 'capability', ...f, argv: previewCapabilityCommand(), requests: [], before: itemWorkspaceSnapshot(f.cwd),
    homeBefore: itemWorkspaceSnapshot(path.join(f.controls, 'home')), startedAt: new Date().toISOString() };
  value.result = await runTty({ cwd: f.cwd, program: process.execPath, args: ['--no-warnings', '--experimental-loader', loader, '--import', preload, ...value.argv],
    env: itemChildEnvironment(env, f.controls, control), steps: [{ expect: '{"stdin":true,"stdout":true}' }], timeoutSeconds: 15, maxOutputBytes: 100_000, onSpawn: pid => { value.childPid = pid; } });
  value.finishedAt = new Date().toISOString(); value.after = itemWorkspaceSnapshot(f.cwd); value.homeAfter = itemWorkspaceSnapshot(path.join(f.controls, 'home'));
  value.trace = readFileSync(trace, 'utf8'); return persist(value, evidenceDir, 'capability');
}
export async function previewScenario(name, installed, env, evidenceDir, runTty) {
  const f = owned(name), spec = previewSpec(name), value = { name, ...f, argv: previewCommand(name), steps: spec.tty ? previewSteps(name) : [], apparatusErrors: [] }; let server;
  try {
    server = await platform(name); const { trace, control } = controlFiles(f, server.port), childEnv = itemChildEnvironment(env, f.controls, control);
    value.before = itemWorkspaceSnapshot(f.cwd); value.homeBefore = itemWorkspaceSnapshot(path.join(f.controls, 'home')); value.remoteBefore = copy(server.state); value.startedAt = new Date().toISOString();
    if (spec.tty) value.result = await runTty({ cwd: f.cwd, program: process.execPath,
      args: ['--no-warnings', '--experimental-loader', loader, '--import', preload, installed.cliBin, ...value.argv], env: childEnv, steps: value.steps,
      timeoutSeconds: 30, maxOutputBytes: 1_000_000, onSpawn: pid => { value.childPid = pid; } });
    else Object.assign(value, await itemChildExecute(installed, value.argv, f.cwd, childEnv, preload));
    value.finishedAt = new Date().toISOString(); value.after = itemWorkspaceSnapshot(f.cwd); value.homeAfter = itemWorkspaceSnapshot(path.join(f.controls, 'home'));
    value.remoteAfter = copy(server.state); value.requests = copy(server.requests); value.trace = readFileSync(trace, 'utf8'); value.apparatusErrors = copy(server.errors);
  } catch { value.apparatusErrors.push('Owned preview apparatus failed; scene retained.'); }
  finally { if (server) await server.close(); }
  return persist(value, evidenceDir, name);
}
export async function runCollectionPublishPreviewCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const startedAt = new Date().toISOString();
  if (typeof output !== 'string' || !path.isAbsolute(output) || existsSync(output)) throw new Error('Fresh absolute preview report required.');
  const evidenceDir = path.dirname(output);
  if (!lstatSync(evidenceDir).isDirectory() || lstatSync(evidenceDir).isSymbolicLink() || realpathSync(evidenceDir) !== evidenceDir) throw new Error('Preview raw root must be canonical.');
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '') || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new Error('Preview run differs from writer.');
  const blocked = reason => { const result = { id, status: 'BLOCKED', assertions: [], reason,
    observations: { runId: env.FREELOG_TEST_RUN_ID, startedAt, finishedAt: new Date().toISOString(), executed: false } }; writeSuiteCases([result], output); return { cases: [result], exitCode: 3 }; };
  let installed, runTty;
  try { installed = requireInstalledCli(env); } catch { return blocked('Verified isolated candidate required.'); }
  try { ({ runTty } = await import('./tty-driver.mjs')); } catch { return blocked('Native node-pty unavailable.'); }
  const observed = { ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir, platform: process.platform, nodeVersion: process.version,
    startedAt, finishedAt: null, scenarios: [], apparatusErrors: [] };
  observed.capability = await capability(env, evidenceDir, runTty);
  if (!observed.capability.result?.completed || observed.capability.result.status !== 0 || observed.capability.result.signal !== null) return blocked('Actual native preview probe failed; raw retained.');
  const deadline = Date.now() + 8 * 60_000;
  for (const name of previewNames) {
    if (Date.now() > deadline) { observed.apparatusErrors.push('Preview fixed execution deadline exceeded.'); break; }
    const scene = await previewScenario(name, installed, env, evidenceDir, runTty); observed.scenarios.push(scene); observed.apparatusErrors.push(...scene.apparatusErrors);
    if (previewSpec(name).tty ? scene.result?.completed !== true : !scene.result || scene.result.error || scene.result.signal || scene.result.timedOut) {
      observed.apparatusErrors.push('Preview child incomplete; successors not executed.'); break;
    }
  }
  observed.finishedAt = new Date().toISOString(); const result = evaluateCollectionPublishPreview(observed); writeSuiteCases([result], output);
  if (result.status === 'PASS') for (const scene of [observed.capability, ...observed.scenarios]) {
    try { cleanupWorkspace(scene.cwd, { success: true, prefixes: ['freelog-collection-recovery-work-'] }); cleanupWorkspace(scene.controls, { success: true, prefixes: ['freelog-collection-recovery-controls-'] }); }
    catch { result.status = 'FAIL'; result.reason = 'Preview owned cleanup failed; remaining scenes retained.'; break; }
  }
  if (result.status !== 'PASS') writeSuiteCases([result], output); return { cases: [result], exitCode: result.status === 'PASS' ? 0 : 1 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const args = process.argv.slice(2).filter(value => value !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new Error('Only --env dev permitted.');
    const result = await runCollectionPublishPreviewCases(); process.stdout.write(JSON.stringify({ producer, result: result.cases[0].status }) + '\n', () => process.exit(result.exitCode));
  } catch { console.error('Installed C07 producer failed; existing evidence retained.'); process.exitCode = 1; }
}
