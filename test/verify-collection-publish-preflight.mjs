#!/usr/bin/env node
/** C08 installed publication checks; all mutations are confined to owned fixtures. */
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
import { recoveryPaths } from './acceptance/collection-recovery-evidence.mjs';
import { preflightNames, preflightHash, preflightEntries, preflightCommand, preflightInitial, preflightRules,
  evaluateCollectionPublishPreflight } from './acceptance/collection-publish-preflight-evidence.mjs';
const producer = 'verify-collection-publish-preflight.mjs', id = 'COLLECTION.PUBLISH.PREFLIGHT_INSTALLED';
const preload = new URL('./acceptance/collection-publish-preflight-preload.mjs', import.meta.url).href;
const copy = value => structuredClone(value), json = value => `${JSON.stringify(value, null, 2)}\n`;
async function platform(name, cwd, actions) {
  const state = preflightInitial(name), baselineVersion = copy(state.version), requests = [], errors = []; let ruleReads = 0;
  const mutate = () => {
    if (!name.startsWith('race-') && !['allow-no-draft', 'block-no-published'].includes(name)) return;
    const action = { kind: name, point: 'second-rules-get', requestIndex: requests.length - 1, at: new Date().toISOString(), remoteBefore: copy(state), local: null };
    // Imperative external changes, separate from the oracle's expected-state calculation.
    switch (name) {
      case 'race-rules': state.automatic = 1; break;
      case 'race-options': state.capability = 1; break;
      case 'race-description': state.version.description = '其它客户端'; break;
      case 'race-dependency': state.version.dependencies[0].versionRange = '^9.0.0'; break;
      case 'race-auth': state.version.authExcludedItems[0].excludedValue = 'contract_other'; break;
      case 'race-published': case 'block-no-published': state.published[0].itemTitle = '其它客户端改名'; break;
      case 'race-draft': case 'allow-no-draft': state.draft[0].itemTitle = '确认后目录改名'; break;
      case 'race-owner': state.target.userId = 8; break;
      case 'race-name': state.target.resourceName = 'alice/renamed'; break;
      case 'race-type': state.target.resourceTypeCode = 'CT002'; break;
      case 'race-frozen': state.target.status = 2; break;
      case 'race-rss': state.target.rssSource = 'yes'; break;
      case 'race-local': {
        const file = path.join(cwd, recoveryPaths.draft), bytes = readFileSync(file), value = JSON.parse(bytes.toString('utf8'));
        value.form.description = '外部编辑器'; writeFileSync(file, `${JSON.stringify(value, null, 4)}\n`);
        action.local = { path: recoveryPaths.draft, before: bytes.toString('base64'), after: readFileSync(file).toString('base64') }; break;
      }
    }
    if (['race-description', 'race-dependency', 'race-auth', 'race-published', 'block-no-published'].includes(name)) {
      state.target.latestVersion = 'snapshot_1'; state.version.version = 'snapshot_1';
    }
    action.remoteAfter = copy(state); actions.push(action);
  };
  const server = createServer((req, res) => {
    let text = '', size = 0; req.setEncoding('utf8');
    req.on('data', chunk => { size += Buffer.byteLength(chunk); if (size <= 1_000_000) text += chunk; else { errors.push('Preflight request exceeded byte bound.'); req.destroy(); } });
    req.on('error', () => errors.push('Preflight request incomplete.'));
    req.on('end', () => {
      let body = null; try { if (text) body = JSON.parse(text); } catch { errors.push('Non-JSON publication body.'); }
      const entry = { method: req.method, path: req.url, body, response: null }; requests.push(entry);
      const send = (data, ret = 0, errCode = 0) => { entry.response = { ret, errCode, data: copy(data) }; const bytes = JSON.stringify(entry.response);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }); res.end(bytes); };
      if (!recoveryRouteAllowed(req.method, req.url) || req.method === 'GET' && text) { errors.push('Unapproved preflight route/method/body.'); send(null, 1, 77); return; }
      const url = new URL(req.url, 'https://api.devfreelog.com'), route = url.pathname;
      if (req.method === 'PUT') {
        state.puts++;
        if (state.puts !== 1 || !body || Array.isArray(body)
          || Object.keys(body).sort().join(',') !== 'authExcludedItems,catalogueProperty,customPropertyDescriptors,dependencies,description,inputAttrs,isMergeCatalogueDraft'
          || !Array.isArray(body.inputAttrs) || !Array.isArray(body.customPropertyDescriptors) || !Array.isArray(body.dependencies)
          || !Array.isArray(body.authExcludedItems) || ![0, 1].includes(body.isMergeCatalogueDraft)) {
          errors.push('Invalid or repeated publication PUT.'); send(null, 1, 77); return;
        }
        const { inputAttrs, isMergeCatalogueDraft, ...snapshot } = body;
        state.target.latestVersion = 'snapshot_1';
        state.version = { resourceId: 'local_collection', version: 'snapshot_1', ...copy(snapshot),
          systemPropertyDescriptors: inputAttrs.map(({ key, value }) => ({ key, insertMode: 2, valueDisplay: value })) };
        if (isMergeCatalogueDraft === 1) state.published = copy(state.draft);
        send({ resourceId: 'local_collection', version: 'snapshot_1' }); return;
      }
      if (route === '/v2/resources/local_collection') { send(state.target); return; }
      if (route === '/v2/resources/local_collection/versions/snapshot_0') { send(baselineVersion); return; }
      if (route === '/v2/resources/local_collection/versions/snapshot_1' && state.version.version === 'snapshot_1') { send(state.version); return; }
      if (route.endsWith('/collectRules')) { ruleReads++; if (ruleReads === 2) mutate(); send(preflightRules(state.automatic)); return; }
      if (route.endsWith('/items')) { const rows = route.includes('/catalogues/drafts/') ? state.draft : state.published, skip = Number(url.searchParams.get('skip'));
        send({ skip, limit: 100, totalItem: rows.length, dataList: rows.slice(skip, skip + 100) }); return; }
      if (route === '/v2/resources/types/listSimpleByGroup') { send([{ code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true }]); return; }
      if (route === '/v2/resources/types/getInfoByCode') { send({ code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true,
        attrs: [{ key: 'display_artist', name: '系统作者' }], resourceConfig: { supportOptionalConfig: state.capability } }); return; }
      if (route === '/v2/storages/files/info') { send({ metaInfoArray: [{ key: 'display_artist', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '' }] }); return; }
      if (route === '/v2/resources/attrs/getInfoByKey') { send({ key: 'display_artist', format: 6, contentRule: { maxLength: 140 } }); return; }
      errors.push('Approved preflight request has no model response.'); send(null, 1, 77);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, requests, errors, port: server.address().port, close: () => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
export async function preflightScenario(name, installed, env, evidenceDir) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  mkdirSync(path.join(controls, 'home'));
  for (const entry of preflightEntries(name)) { const file = path.join(cwd, entry.path);
    if (entry.kind === 'directory') mkdirSync(file, { recursive: true }); else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(entry.bytes, 'base64')); } }
  const trace = path.join(controls, 'trace.jsonl'), control = path.join(controls, 'control.json');
  const observed = { name, cwd, controls, argv: preflightCommand(name), controlActions: [], apparatusErrors: [] }; let server;
  try {
    server = await platform(name, cwd, observed.controlActions); writeFileSync(trace, '', { flag: 'wx' });
    writeFileSync(control, json({ cwd, trace, port: server.port, fault: 'none' }), { flag: 'wx' });
    observed.before = itemWorkspaceSnapshot(cwd); observed.homeBefore = itemWorkspaceSnapshot(path.join(controls, 'home'));
    observed.remoteBefore = copy(server.state); observed.startedAt = new Date().toISOString();
    Object.assign(observed, await itemChildExecute(installed, observed.argv, cwd, itemChildEnvironment(env, controls, control), preload));
    observed.finishedAt = new Date().toISOString(); observed.after = itemWorkspaceSnapshot(cwd); observed.homeAfter = itemWorkspaceSnapshot(path.join(controls, 'home'));
    observed.remoteAfter = copy(server.state); observed.requests = copy(server.requests); observed.trace = readFileSync(trace, 'utf8'); observed.apparatusErrors = copy(server.errors);
  } catch { observed.apparatusErrors.push('Owned preflight apparatus failed; scene retained.'); }
  finally { if (server) await server.close(); }
  const file = path.join(evidenceDir, `collection-publish-preflight.${name}.json`), bytes = json(observed);
  writeFileSync(file, bytes, { flag: 'wx' }); observed.evidenceRef = { path: file, sha256: preflightHash(bytes) }; return observed;
}
export async function runCollectionPublishPreflightCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const startedAt = new Date().toISOString();
  if (typeof output !== 'string' || !path.isAbsolute(output) || existsSync(output)) throw new Error('A fresh absolute preflight report is required.');
  const evidenceDir = path.dirname(output);
  if (!lstatSync(evidenceDir).isDirectory() || lstatSync(evidenceDir).isSymbolicLink() || realpathSync(evidenceDir) !== evidenceDir) throw new Error('Preflight raw root must be canonical.');
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '') || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new Error('Preflight run differs from writer.');
  let installed;
  try { installed = requireInstalledCli(env); }
  catch { const result = { id, status: 'BLOCKED', assertions: [], reason: 'A verified isolated installed candidate is required.',
    observations: { runId: env.FREELOG_TEST_RUN_ID, startedAt, finishedAt: new Date().toISOString(), executed: false } };
    writeSuiteCases([result], output); return { cases: [result], exitCode: 3 }; }
  const observed = { ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir, platform: process.platform, nodeVersion: process.version,
    startedAt, finishedAt: null, scenarios: [], apparatusErrors: [] }, deadline = Date.now() + 10 * 60_000;
  for (const name of preflightNames) {
    if (Date.now() > deadline) { observed.apparatusErrors.push('Preflight fixed deadline exceeded.'); break; }
    const scene = await preflightScenario(name, installed, env, evidenceDir); observed.scenarios.push(scene); observed.apparatusErrors.push(...scene.apparatusErrors);
    if (!scene.result || scene.result.error || scene.result.signal || scene.result.timedOut) { observed.apparatusErrors.push('Preflight child incomplete; successors not executed.'); break; }
  }
  observed.finishedAt = new Date().toISOString(); const result = evaluateCollectionPublishPreflight(observed); writeSuiteCases([result], output);
  if (result.status === 'PASS') for (const scene of observed.scenarios) {
    try { cleanupWorkspace(scene.cwd, { success: true, prefixes: ['freelog-collection-recovery-work-'] }); cleanupWorkspace(scene.controls, { success: true, prefixes: ['freelog-collection-recovery-controls-'] }); }
    catch { result.status = 'FAIL'; result.reason = 'Preflight owned cleanup failed; remaining scenes retained.'; break; }
  }
  if (result.status !== 'PASS') writeSuiteCases([result], output);
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : 1 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const args = process.argv.slice(2).filter(value => value !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new Error('Only --env dev is permitted.');
    const result = await runCollectionPublishPreflightCases(); console.log(JSON.stringify({ producer, result: result.cases[0].status })); process.exitCode = result.exitCode;
  } catch { console.error('Installed C08 producer failed; existing raw retained.'); process.exitCode = 1; }
}
