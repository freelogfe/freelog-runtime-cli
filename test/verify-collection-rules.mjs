#!/usr/bin/env node
/** Installed C05 commands against an owned local model; never a real-dev business approval. */
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { itemWorkspaceSnapshot, itemChildEnvironment, itemChildExecute } from './acceptance/collection-workspace.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { rulesRouteAllowed } from './acceptance/collection-rules-control.mjs';
import { rulesNames, rulesPath, rulesPublished, rulesDraft, rulesType, rulesHash, rulesEntries, rulesCommand, rulesModel,
  rulesOk, rulesPage, evaluateCollectionRules } from './acceptance/collection-rules-evidence.mjs';
const producer = 'verify-collection-rules.mjs', id = 'COLLECTION.RULES.INSTALLED_MATRIX';
const preload = new URL('./acceptance/collection-rules-preload.mjs', import.meta.url).href;
const copy = value => structuredClone(value), json = value => `${JSON.stringify(value, null, 2)}\n`;

async function platform(name) {
  const state = rulesModel(name), requests = [], errors = []; let written = false;
  const server = createServer((req, res) => {
    let text = '', count = 0, deliberate = false; req.setEncoding('utf8');
    req.on('data', chunk => { count += Buffer.byteLength(chunk); if (count <= 1_000_000) text += chunk; else { errors.push('Rules body limit exceeded.'); req.destroy(); } });
    req.on('error', () => { if (!deliberate) errors.push('Rules request failed before complete observation.'); });
    req.on('end', () => {
      let body = null; try { if (text) body = JSON.parse(text); } catch { errors.push('Rules body was not JSON.'); }
      const entry = { method: req.method, path: req.url, body, response: null }; requests.push(entry);
      const send = value => { entry.response = copy(value); const bytes = JSON.stringify(value);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }); res.end(bytes); };
      if (!rulesRouteAllowed(req.method, req.url) || req.method === 'GET' && text) { errors.push('Unapproved rules route/method/body.'); send({ ret: 1, errCode: 77, data: null }); return; }
      const url = new URL(req.url, 'https://api.devfreelog.com'), route = url.pathname;
      if (req.method === 'GET') {
        if (route === '/v2/resources/local_collection') { send(rulesOk(state.target)); return; }
        if (route === rulesPath) { send(name === 'get-failed' || written && name === 'readback-invalid'
          ? { ret: 1, errCode: 0, data: state.rules } : rulesOk(state.rules)); return; }
        if (route === '/v2/resources/types/getInfoByCode') { send(rulesOk({ ...rulesType, isTerminate: name !== 'invalid-type' })); return; }
        if ([rulesPublished, rulesDraft].includes(route)) {
          const skip = Number(url.searchParams.get('skip'));
          send(name === 'bad-catalogue' ? rulesOk({ skip: 0, limit: 100, totalItem: 1, dataList: [] }) : rulesPage(route === rulesPublished ? state.published : state.draft, skip)); return;
        }
      }
      if (req.method !== 'POST' || route !== rulesPath || written || !body || Array.isArray(body)
        || Object.keys(body).sort().join(',') !== 'conditionType,filterConditions,serializeStatus,status'
        || ![0, 1].includes(body.serializeStatus) || ![0, 1].includes(body.status) || ![1, 2].includes(body.conditionType) || !Array.isArray(body.filterConditions)) {
        errors.push('Unrecognized or repeated rules write.'); send({ ret: 1, errCode: 77, data: null }); return;
      }
      // Apply the actual request; source-fixed expected outcomes are not used to drive model state.
      state.target.serializeStatus = body.serializeStatus;
      state.rules = { status: body.status, conditionType: body.conditionType, filterConditions: copy(body.filterConditions) };
      if (name === 'readback-mismatch') state.rules.status = 1;
      written = true;
      if (name === 'disconnect') { entry.response = { disconnected: true }; deliberate = true; req.socket.destroy(); }
      else send(name === 'bad-ack' ? { ret: 1, errCode: 0, data: null } : name === 'missing-ack' ? { data: null }
        : name === 'string-ack' ? { ret: '0', errCode: 0, data: null } : rulesOk(null));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, requests, errors, port: server.address().port,
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}

export async function rulesScenario(name, installed, env, evidenceDir) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  mkdirSync(path.join(controls, 'home'));
  for (const entry of rulesEntries(name)) { const file = path.join(cwd, entry.path); if (entry.kind === 'directory') mkdirSync(file, { recursive: true });
    else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, Buffer.from(entry.bytes, 'base64')); } }
  const trace = path.join(controls, 'trace.jsonl'), control = path.join(controls, 'control.json');
  const observed = { name, cwd, controls, argv: rulesCommand(name), apparatusErrors: [] }; let server;
  try {
    server = await platform(name); writeFileSync(trace, '', { flag: 'wx' }); writeFileSync(control, json({ cwd, port: server.port, trace, fault: 'none' }), { flag: 'wx' });
    observed.before = itemWorkspaceSnapshot(cwd); observed.homeBefore = itemWorkspaceSnapshot(path.join(controls, 'home'));
    observed.remoteBefore = copy(server.state); observed.startedAt = new Date().toISOString();
    Object.assign(observed, await itemChildExecute(installed, observed.argv, cwd, itemChildEnvironment(env, controls, control), preload));
    observed.finishedAt = new Date().toISOString(); observed.after = itemWorkspaceSnapshot(cwd); observed.homeAfter = itemWorkspaceSnapshot(path.join(controls, 'home'));
    observed.remoteAfter = copy(server.state); observed.requests = copy(server.requests); observed.trace = readFileSync(trace, 'utf8'); observed.apparatusErrors = copy(server.errors);
  } catch { observed.apparatusErrors.push('Owned rules apparatus failed; retained for diagnosis.'); }
  finally { if (server) await server.close(); }
  const file = path.join(evidenceDir, `collection-rules.${name}.json`), bytes = json(observed);
  writeFileSync(file, bytes, { flag: 'wx' }); observed.evidenceRef = { path: file, sha256: rulesHash(bytes) }; return observed;
}

export async function runCollectionRulesCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const startedAt = new Date().toISOString();
  if (typeof output !== 'string' || !path.isAbsolute(output) || existsSync(output)) throw new Error('A fresh absolute rules report is required.');
  const evidenceDir = path.dirname(output);
  if (!lstatSync(evidenceDir).isDirectory() || lstatSync(evidenceDir).isSymbolicLink() || realpathSync(evidenceDir) !== evidenceDir) throw new Error('Rules evidence root must be canonical.');
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '') || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new Error('Rules run ID differs from writer.');
  let installed;
  try { installed = requireInstalledCli(env); }
  catch { const result = { id, status: 'BLOCKED', assertions: [], reason: 'A verified isolated installed candidate is required.',
    observations: { runId: env.FREELOG_TEST_RUN_ID, startedAt, finishedAt: new Date().toISOString(), executed: false } };
    writeSuiteCases([result], output); return { cases: [result], exitCode: 3 }; }
  const observed = { ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir, platform: process.platform, nodeVersion: process.version,
    startedAt, finishedAt: null, scenarios: [], apparatusErrors: [] }, deadline = Date.now() + 10 * 60_000;
  for (const name of rulesNames) {
    if (Date.now() > deadline) { observed.apparatusErrors.push('Rules fixed execution deadline exceeded.'); break; }
    const scene = await rulesScenario(name, installed, env, evidenceDir); observed.scenarios.push(scene); observed.apparatusErrors.push(...scene.apparatusErrors);
    if (scene.result?.error || scene.result?.signal || scene.result?.timedOut || !scene.result) { observed.apparatusErrors.push('Rules child incomplete; successors not executed.'); break; }
  }
  observed.finishedAt = new Date().toISOString(); const result = evaluateCollectionRules(observed); writeSuiteCases([result], output);
  if (result.status === 'PASS') for (const scene of observed.scenarios) {
    try { cleanupWorkspace(scene.cwd, { success: true, prefixes: ['freelog-collection-recovery-work-'] }); cleanupWorkspace(scene.controls, { success: true, prefixes: ['freelog-collection-recovery-controls-'] }); }
    catch { result.status = 'FAIL'; result.reason = 'Rules owned cleanup failed; remaining scenes retained.'; break; }
  }
  if (result.status !== 'PASS') writeSuiteCases([result], output);
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : 1 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).filter(value => value !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new Error('Only --env dev is permitted.');
    const result = await runCollectionRulesCases(); console.log(JSON.stringify({ producer, result: result.cases[0].status })); process.exitCode = result.exitCode;
  } catch { console.error('Installed C05 producer failed; existing evidence retained.'); process.exitCode = 1; }
}
