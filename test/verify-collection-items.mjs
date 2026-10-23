#!/usr/bin/env node
/** Real installed CLI/SDK commands against a fixed local platform, never real-dev writes. */
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { itemRouteAllowed } from './acceptance/collection-items-control.mjs';
import { itemWorkspaceSnapshot as snapshot, itemChildEnvironment as environment, itemChildExecute as execute } from './acceptance/collection-workspace.mjs';
import { collectionItemsCases, itemHash, itemScenarioNames, itemCommand, itemFixture, itemInitialEntries, itemPage, evaluateCollectionItems } from './acceptance/collection-items-evidence.mjs';

const producer = 'verify-collection-items.mjs', id = collectionItemsCases[0].id;
const clone = (v) => structuredClone(v), json = (v) => `${JSON.stringify(v, null, 2)}\n`;
async function localPlatform(f) {
  const state = { draft: clone(f.initial), published: clone(f.published) }, requests = [], errors = [];
  let posted = false;
  const server = createServer((req, res) => {
    let body = '', bytes = 0, deliberate = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => { bytes += Buffer.byteLength(chunk); if (bytes <= 1_000_000) body += chunk; else req.destroy(); });
    req.once('error', () => { if (!deliberate) errors.push('Local item request failed before a complete observation.'); });
    req.on('end', () => {
      let parsed = null;
      try { if (body) parsed = JSON.parse(body); } catch { errors.push('Item request body was not JSON.'); }
      const entry = { method: req.method, path: req.url, body: parsed, response: null }; requests.push(entry);
      const send = (value) => {
        entry.response = clone(value); const text = JSON.stringify(value);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) }); res.end(text);
      };
      if (!itemRouteAllowed(req.method, req.url) || req.method === 'GET' && body) {
        errors.push('Unapproved item route/method/body.'); send({ ret: 1, errCode: 77, data: null }); return;
      }
      const url = new URL(req.url, 'https://api.devfreelog.com'), p = url.pathname;
      if (req.method === 'POST') {
        state.draft = clone(f.final); posted = true;
        if (f.flags.postDisconnect) { entry.response = { disconnected: true }; deliberate = true; req.socket.destroy(); }
        else send(f.addReply);
        return;
      }
      if (p === '/v2/resources/local_collection') send({ ret: 0, errCode: 0, data: f.target });
      else if (p === '/v2/resources/catalogue/local_collection/items/collectRules') send(f.rules);
      else if (p.endsWith('/checkExists')) send(f.exists);
      else if (p.endsWith('/batchAuth')) send(f.auth);
      else if (p === '/v2/contracts/list') send(f.contracts);
      else if (p === '/v2/resources/catalogues/drafts/local_collection/items') send(itemPage(state.draft, Number(url.searchParams.get('skip')), false, posted && f.flags.readbackInvalid));
      else {
        const s = f.sources.find((source) => p === `/v2/resources/${encodeURIComponent(source.selectorValue)}`);
        if (s) send(s.response);
        else { errors.push('Unexpected synthetic source lookup.'); send({ ret: 1, errCode: 77, data: null }); }
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { state, requests, errors, port: server.address().port, close: () => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }) };
}
async function scenario(name, installed, env, evidenceDir) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  const o = { name, cwd, controls, argv: itemCommand(name) }; let server;
  try {
    mkdirSync(path.join(controls, 'home'));
    for (const e of itemInitialEntries()) {
      const file = path.join(cwd, e.path);
      if (e.kind === 'directory') mkdirSync(file, { recursive: true }); else writeFileSync(file, Buffer.from(e.bytes, 'base64'), { flag: 'wx' });
    }
    server = await localPlatform(itemFixture(name));
    const trace = path.join(controls, 'trace.jsonl'), control = path.join(controls, 'control.json');
    writeFileSync(trace, '', { flag: 'wx' }); writeFileSync(control, json({ cwd, fault: 'none', port: server.port, trace }), { flag: 'wx' });
    o.before = snapshot(cwd); o.remoteBefore = clone(server.state); o.startedAt = new Date().toISOString();
    Object.assign(o, await execute(installed, o.argv, cwd, environment(env, controls, control)));
    o.finishedAt = new Date().toISOString(); o.after = snapshot(cwd); o.remoteAfter = clone(server.state);
    o.requests = clone(server.requests); o.trace = readFileSync(trace, 'utf8'); o.apparatusErrors = clone(server.errors);
  } catch { o.apparatusErrors = [...(o.apparatusErrors ?? []), 'Owned item apparatus failed; retained for diagnosis.']; }
  finally { if (server) await server.close(); }
  const file = path.join(evidenceDir, `collection-items.${name}.json`), bytes = json(o);
  writeFileSync(file, bytes, { flag: 'wx' }); o.evidenceRef = { path: file, sha256: itemHash(bytes) };
  return o;
}
export async function runCollectionItemsCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const startedAt = new Date().toISOString();
  if (typeof output !== 'string' || !path.isAbsolute(output) || existsSync(output)) throw new Error('A new absolute FREELOG_TEST_SUITE_REPORT is required; existing evidence is never overwritten.');
  const evidenceDir = path.dirname(output);
  if (realpathSync(evidenceDir) !== evidenceDir || !lstatSync(evidenceDir).isDirectory() || lstatSync(evidenceDir).isSymbolicLink()) throw new Error('Item evidence requires a real candidate run directory.');
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '') || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new Error('Item run ID must match the evidence-writer process.');
  let installed;
  try { installed = requireInstalledCli(env); } catch (error) {
    const result = { id, status: 'BLOCKED', assertions: [], reason: error.message, observations: { runId: env.FREELOG_TEST_RUN_ID, startedAt, finishedAt: new Date().toISOString(), executed: false } };
    writeSuiteCases([result], output); return { cases: [result], exitCode: 3 };
  }
  const observed = { runId: env.FREELOG_TEST_RUN_ID, evidenceDir, ...installed, platform: process.platform, nodeVersion: process.version, startedAt,
    finishedAt: null, scenarios: [], apparatusErrors: [] }, deadline = Date.now() + 15 * 60_000;
  for (const name of itemScenarioNames) {
    if (Date.now() > deadline) { observed.apparatusErrors.push('Fixed item matrix deadline exceeded.'); break; }
    const o = await scenario(name, installed, env, evidenceDir); observed.scenarios.push(o);
    observed.apparatusErrors.push(...o.apparatusErrors.map((e) => `${name}: ${e}`));
  }
  observed.finishedAt = new Date().toISOString(); const result = evaluateCollectionItems(observed);
  // All original observations precede even successful owned cleanup. No failed scene is removed.
  writeSuiteCases([result], output);
  if (result.status === 'PASS') for (const o of observed.scenarios) {
    try {
      cleanupWorkspace(o.cwd, { success: true, prefixes: ['freelog-collection-recovery-work-'] });
      cleanupWorkspace(o.controls, { success: true, prefixes: ['freelog-collection-recovery-controls-'] });
    } catch { result.status = 'FAIL'; result.reason = 'Successful item workspace cleanup failed; remaining scenes retained.'; break; }
  }
  if (result.status !== 'PASS') {
    for (const o of observed.scenarios) console.log(`RETAIN item workspace: ${o.cwd}; controls: ${o.controls}`);
    writeSuiteCases([result], output);
  }
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : 1 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).filter((v) => v !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new Error('Installed collection items permits only --env dev; no real network option exists.');
    const result = await runCollectionItemsCases(); console.log(JSON.stringify({ producer, result: result.cases[0].status })); process.exitCode = result.exitCode;
  } catch (error) { console.error(error instanceof Error ? error.message : 'Installed collection items failed.'); process.exitCode = 1; }
}
