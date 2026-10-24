#!/usr/bin/env node
/** Bounded installed S03 read/plain-init producer. No template, production or real network calls. */
import { createServer } from 'node:http';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { itemWorkspaceSnapshot, itemChildEnvironment, itemChildExecute } from './acceptance/collection-workspace.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { typeInitRouteAllowed } from './acceptance/type-init-control.mjs';
import { typeInitNames, typeInitTtyNames, typeInitInitialEntries, typeInitCommand, typeInitSteps, typeInitResponse,
  typeInitCapabilityCommand, typeInitHash, typeInitJson, typeInitText, evaluateTypeInit } from './acceptance/type-init-evidence.mjs';

const producer = 'verify-type-init.mjs', id = 'PROJECT.TYPE_INIT.INSTALLED_LOCAL';
const loader = new URL('./acceptance/collection-recovery-loader.mjs', import.meta.url).href;
const preload = new URL('./acceptance/type-init-preload.mjs', import.meta.url).href;
function owned(name) {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-controls-')));
  mkdirSync(path.join(controls, 'home'));
  for (const entry of typeInitInitialEntries(name)) {
    const file = path.join(cwd, entry.path);
    if (entry.kind === 'directory') mkdirSync(file, { recursive: true });
    else writeFileSync(file, Buffer.from(entry.bytes, 'base64'), { flag: 'wx' });
  }
  return { cwd, controls };
}
function persist(observed, evidenceDir) {
  const file = path.join(evidenceDir, `type-init.${observed.name}.json`), bytes = typeInitJson(observed);
  writeFileSync(file, bytes, { flag: 'wx' });
  observed.evidenceRef = { path: file, sha256: typeInitHash(bytes) };
  return observed;
}
async function localPlatform(name) {
  const requests = [], errors = [];
  const server = createServer((request, response) => {
    let size = 0;
    request.on('data', chunk => { size += chunk.length; if (size > 1_000_000) request.destroy(); });
    request.on('error', () => errors.push('S03 request stream failed.'));
    request.on('end', () => {
      if (!typeInitRouteAllowed(request.method, request.url) || size !== 0) {
        errors.push('Unapproved S03 request/method/body.'); response.writeHead(400); response.end(); return;
      }
      const result = typeInitResponse(name, request.url);
      requests.push({ method: request.method, path: request.url, body: null, response: structuredClone(result) });
      const bytes = JSON.stringify(result);
      response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bytes) }); response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { requests, errors, port: server.address().port, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
async function execute(name, installed, env, evidenceDir, runTty) {
  const fixture = owned(name), observed = { name, ...fixture, argv: name === 'capability' ? typeInitCapabilityCommand() : typeInitCommand(name),
    tty: name === 'capability' || typeInitTtyNames.has(name), steps: name === 'capability' ? [{ expect: '{"stdin":true,"stdout":true}' }] : typeInitSteps(name),
    startedAt: new Date().toISOString(), before: itemWorkspaceSnapshot(fixture.cwd), homeBefore: itemWorkspaceSnapshot(path.join(fixture.controls, 'home')),
    requests: [], apparatusErrors: [] };
  let platform;
  try {
    platform = await localPlatform(name);
    const trace = path.join(fixture.controls, 'trace.jsonl'), control = path.join(fixture.controls, 'control.json');
    writeFileSync(trace, '', { flag: 'wx' });
    writeFileSync(control, typeInitJson({ cwd: fixture.cwd, port: platform.port, trace, fault: 'none' }), { flag: 'wx' });
    const childEnv = itemChildEnvironment(env, fixture.controls, control);
    if (observed.tty) observed.result = await runTty({ cwd: fixture.cwd, program: process.execPath,
      args: ['--no-warnings', '--experimental-loader', loader, '--import', preload, ...(name === 'capability' ? [] : [installed.cliBin]), ...observed.argv],
      env: childEnv, steps: observed.steps, timeoutSeconds: 30, maxOutputBytes: 1_000_000, onSpawn: pid => { observed.childPid = pid; } });
    else Object.assign(observed, await itemChildExecute(installed, observed.argv, fixture.cwd, childEnv, preload));
    observed.trace = readFileSync(trace, 'utf8');
  } catch { observed.apparatusError = 'Owned S03 execution failed; workspace retained.'; }
  finally {
    if (platform) { await platform.close(); observed.requests = platform.requests; observed.apparatusErrors = platform.errors; }
    observed.after = itemWorkspaceSnapshot(fixture.cwd); observed.homeAfter = itemWorkspaceSnapshot(path.join(fixture.controls, 'home'));
    observed.finishedAt = new Date().toISOString();
  }
  return persist(observed, evidenceDir);
}
export async function runTypeInitCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const startedAt = new Date().toISOString();
  if (typeof output !== 'string' || !path.isAbsolute(output) || existsSync(output)) throw new Error('A fresh absolute S03 report is required.');
  const evidenceDir = path.dirname(output);
  if (!lstatSync(evidenceDir).isDirectory() || lstatSync(evidenceDir).isSymbolicLink() || realpathSync(evidenceDir) !== evidenceDir) throw new Error('S03 evidence root must be canonical.');
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '') || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new Error('S03 run ID differs from writer process.');
  const blocked = (reason, observations = {}) => {
    const result = { id, status: 'BLOCKED', assertions: [], reason, observations: { runId: env.FREELOG_TEST_RUN_ID, startedAt, finishedAt: new Date().toISOString(), executed: false, ...observations } };
    writeSuiteCases([result], output); return { cases: [result], exitCode: 3 };
  };
  let installed, runTty;
  try { installed = requireInstalledCli(env); } catch { return blocked('Exact isolated installed candidate is required.'); }
  try { ({ runTty } = await import('./tty-driver.mjs')); } catch { return blocked('Native node-pty is unavailable.'); }
  const observed = { ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir, platform: process.platform, nodeVersion: process.version,
    startedAt, finishedAt: null, apparatusErrors: [], scenarios: [] };
  observed.capability = await execute('capability', installed, env, evidenceDir, runTty);
  const capability = observed.capability.result;
  if (!capability?.completed || capability.status !== 0 || capability.signal !== null || capability.stderr || typeInitText(capability.stdout).trim() !== '{"stdin":true,"stdout":true}') {
    observed.finishedAt = new Date().toISOString();
    return blocked('Actual isolated TTY probe failed; complete raw capability retained.', observed);
  }
  const deadline = Date.now() + 8 * 60_000;
  for (const name of typeInitNames) {
    if (Date.now() > deadline) { observed.apparatusErrors.push('S03 fixed execution deadline exceeded.'); break; }
    const scene = await execute(name, installed, env, evidenceDir, runTty); observed.scenarios.push(scene);
    if (scene.apparatusError || (scene.tty ? scene.result?.completed !== true : scene.result?.error || scene.result?.signal || scene.result?.timedOut)) {
      observed.apparatusErrors.push(`${name}: incomplete command; successors not executed.`); break;
    }
  }
  observed.finishedAt = new Date().toISOString();
  const result = evaluateTypeInit(observed); writeSuiteCases([result], output);
  if (result.status === 'PASS') for (const scene of [observed.capability, ...observed.scenarios]) {
    try {
      cleanupWorkspace(scene.cwd, { success: true, prefixes: ['freelog-collection-recovery-work-'] });
      cleanupWorkspace(scene.controls, { success: true, prefixes: ['freelog-collection-recovery-controls-'] });
    } catch { result.status = 'FAIL'; result.reason = 'Owned S03 cleanup failed; remaining workspaces retained.'; break; }
  }
  if (result.status !== 'PASS') writeSuiteCases([result], output);
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : 1 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter(arg => arg !== '--skip-build');
  if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) { console.error('Installed S03 permits only --env dev.'); process.exitCode = 1; }
  else try { const result = await runTypeInitCases(); process.stdout.write(`${JSON.stringify({ producer, result: result.cases[0].status })}\n`, () => process.exit(result.exitCode)); }
  catch { console.error('Installed S03 producer failed; existing evidence is never overwritten.'); process.exitCode = 1; }
}
