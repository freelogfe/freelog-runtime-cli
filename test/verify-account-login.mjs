#!/usr/bin/env node
/** Installed account commands, synthetic authentication and native PTY; no real account. */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { itemChildEnvironment, itemWorkspaceSnapshot } from './acceptance/collection-workspace.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { loginNames, loginCommand, loginSteps, evaluateAccountLogin } from './acceptance/account-login-evidence.mjs';

const id = 'ACCOUNT.LOGIN.INSTALLED_MATRIX';
const loader = new URL('./acceptance/account-login-loader.mjs', import.meta.url).href;
const preload = new URL('./acceptance/account-login-preload.mjs', import.meta.url).href;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
function owned() {
  const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-login-work-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-login-controls-')));
  const home = path.join(controls, 'home'); mkdirSync(home);
  mkdirSync(path.join(cwd, '.freelog'));
  for (const name of ['1.json', '1.version.json', '2.json', '2.collection.json']) {
    writeFileSync(path.join(cwd, '.freelog', name), json({ preserve: name }), { flag: 'wx' });
  }
  writeFileSync(path.join(home, 'keep.txt'), 'Preserve isolated home.\n', { flag: 'wx' });
  writeFileSync(path.join(controls, 'store.json'), '{}', { flag: 'wx' });
  return { cwd, controls, home };
}
function childEnv(env, f, control, network) {
  const result = itemChildEnvironment(env, f.controls, control);
  delete result.FREELOG_TEST_RECOVERY_CONTROL;
  return { ...result, FREELOG_TEST_LOGIN_CONTROL: control, FREELOG_TEST_NETWORK_LOG: network };
}
async function stage(name, index, f, env, installed, runTty) {
  const trace = path.join(f.controls, `trace.${index}.jsonl`), network = path.join(f.controls, `network.${index}.jsonl`);
  const control = path.join(f.controls, `control.${index}.json`), store = path.join(f.controls, 'store.json');
  writeFileSync(trace, '', { flag: 'wx' }); writeFileSync(network, '', { flag: 'wx' });
  writeFileSync(control, json({ cwd: f.cwd, home: f.home, trace, store,
    mode: ['http-rejected', 'business-rejected'].includes(name) ? name : 'ok' }), { flag: 'wx' });
  const tty = name.startsWith('tty-') || name.startsWith('cancel-');
  const o = { argv: loginCommand(name, index), stdin: tty ? null : name === 'empty-password' ? '\n' : 'synthetic-login-password\n',
    tty, steps: tty ? loginSteps(name) : [], before: itemWorkspaceSnapshot(f.cwd), homeBefore: itemWorkspaceSnapshot(f.home),
    storeBefore: JSON.parse(readFileSync(store, 'utf8')), startedAt: new Date().toISOString() };
  const args = ['--no-warnings', '--experimental-loader', loader, '--import', preload, installed.cliBin, ...o.argv];
  const environment = childEnv(env, f, control, network);
  if (tty) {
    o.result = await runTty({ cwd: f.cwd, program: process.execPath, args, steps: o.steps, env: environment,
      timeoutSeconds: 20, maxOutputBytes: 1_000_000, onSpawn: (pid) => { o.childPid = pid; } });
  } else {
    const result = spawnSync(process.execPath, args, { cwd: f.cwd, env: environment, input: o.stdin,
      encoding: 'utf8', timeout: 20_000, maxBuffer: 1_000_000, windowsHide: true, shell: false });
    o.childPid = result.pid;
    o.result = { status: result.status, signal: result.signal, error: result.error ? 'Login child did not complete.' : null,
      timedOut: result.error?.code === 'ETIMEDOUT', stdout: result.stdout ?? '', stderr: result.stderr ?? '',
      completed: Number.isInteger(result.status) && !result.signal && !result.error };
  }
  o.finishedAt = new Date().toISOString();
  o.after = itemWorkspaceSnapshot(f.cwd); o.homeAfter = itemWorkspaceSnapshot(f.home);
  o.storeAfter = JSON.parse(readFileSync(store, 'utf8')); o.trace = readFileSync(trace, 'utf8'); o.networkTrace = readFileSync(network, 'utf8');
  return o;
}
export async function runAccountLoginCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  if (typeof output !== 'string' || !path.isAbsolute(output) || existsSync(output)
    || realpathSync(path.dirname(output)) !== path.dirname(output) || !lstatSync(path.dirname(output)).isDirectory()
    || !/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '') || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) {
    throw new Error('A new canonical login report and matching run ID are required.');
  }
  const blocked = (reason) => {
    const result = { id, status: 'BLOCKED', assertions: [], reason };
    writeSuiteCases([result], output); return { cases: [result], exitCode: 3 };
  };
  let installed, runTty;
  try { installed = requireInstalledCli(env); } catch { return blocked('An exact isolated installed CLI is required.'); }
  try { ({ runTty } = await import('./tty-driver.mjs')); } catch { return blocked('Native node-pty is unavailable.'); }
  const observed = { ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir: path.dirname(output), platform: process.platform, nodeVersion: process.version,
    startedAt: new Date().toISOString(), finishedAt: null, scenarios: [] };
  const probe = owned();
  observed.capability = { cwd: probe.cwd, home: probe.home };
  observed.capability.result = await runTty({ cwd: probe.cwd, program: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY}));process.exit(0);'],
    steps: [{ expect: '{"stdin":true,"stdout":true}' }], timeoutSeconds: 15, maxOutputBytes: 100_000,
    env: childEnv(env, probe, path.join(probe.controls, 'unused.json'), path.join(probe.controls, 'unused.jsonl')),
    onSpawn: (pid) => { observed.capability.childPid = pid; } });
  const capability = observed.capability.result;
  const roots = [probe];
  let probeOk = false;
  try {
    const flags = JSON.parse(stripVTControlCharacters(capability.stdout).trim());
    probeOk = capability.completed && capability.status === 0 && capability.signal === null && capability.stderr === '' && flags.stdin === true && flags.stdout === true;
  } catch { /* Retain the raw capability, never fabricate TTY availability. */ }
  if (probeOk) {
    const deadline = Date.now() + 3 * 60_000;
    for (const name of loginNames) {
      if (Date.now() > deadline) break;
      const f = owned(); roots.push(f);
      const scene = { name, cwd: f.cwd, home: f.home, stages: [] }; observed.scenarios.push(scene);
      try {
        for (let index = 0; index < (name === 'duplicate' ? 2 : 1); index++) {
          const o = await stage(name, index, f, env, installed, runTty); scene.stages.push(o);
          if (!o.result.completed) break;
        }
      } catch { scene.apparatusError = 'Owned login scene failed; files retained.'; }
      if (scene.apparatusError || scene.stages.some((s) => !s.result.completed)) break;
    }
  }
  observed.finishedAt = new Date().toISOString();
  const result = evaluateAccountLogin(observed);
  if (!probeOk) { result.status = 'BLOCKED'; result.assertions = []; result.reason = 'Native TTY capability was not established; raw probe retained.'; }
  // Preserve every raw observation before any cleanup; do not repair failed observations.
  writeSuiteCases([result], output);
  if (result.status === 'PASS') {
    try {
      for (const f of roots) {
        cleanupWorkspace(f.cwd, { success: true, prefixes: ['freelog-login-work-'], log: () => {} });
        cleanupWorkspace(f.controls, { success: true, prefixes: ['freelog-login-controls-'], log: () => {} });
      }
    } catch { result.status = 'FAIL'; result.reason = 'Owned login cleanup failed; remaining files retained.'; writeSuiteCases([result], output); }
  }
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : result.status === 'BLOCKED' ? 3 : 1 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = JSON.stringify(process.argv.slice(2));
    if (![[], ['--env', 'dev'], ['--skip-build'], ['--env', 'dev', '--skip-build']].some((allowed) => JSON.stringify(allowed) === args)) throw new Error();
    const result = await runAccountLoginCases();
    // ConPTY keeps parent helper handles alive; finish only after all child exits/raw writes are known.
    process.stdout.write(`Installed account login: ${result.cases[0].status}.\n`, () => process.exit(result.exitCode));
  } catch { process.stderr.write('Installed login validation failed; raw evidence is not approval.\n', () => process.exit(1)); }
}
