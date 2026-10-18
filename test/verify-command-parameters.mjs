#!/usr/bin/env node
/** Five design-bound local rejection leaves, always executed through the installed candidate. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateCommandCase } from './acceptance/command-parameter-evidence.mjs';
export { evaluateCommandCase } from './acceptance/command-parameter-evidence.mjs';
import { commandParameterCases } from './acceptance/command-parameter-cases.mjs';
import { resolveCliBin } from './acceptance/cli-bin.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { validateSuiteCases, writeSuiteCases } from './acceptance/protocol.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const guard = new URL('./acceptance/deny-network.mjs', import.meta.url).href;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function requireInstalledCli(env = process.env) {
  if (!Object.hasOwn(env, 'FREELOG_TEST_CLI_BIN')) throw new Error('FREELOG_TEST_CLI_BIN is required; workspace fallback is forbidden.');
  const cliBin = resolveCliBin(repoRoot, env);
  const packageRoot = path.resolve(path.dirname(cliBin), '../..');
  if (path.resolve(cliBin) !== cliBin || realpathSync(cliBin) !== cliBin || lstatSync(cliBin).isSymbolicLink()
    || cliBin !== path.join(packageRoot, 'dist/bin/index.js') || path.basename(packageRoot) !== 'cli2'
    || path.basename(path.dirname(packageRoot)) !== '@freelog-cli'
    || path.basename(path.dirname(path.dirname(packageRoot))) !== 'node_modules') {
    throw new Error('The parameter producer requires an installed @freelog-cli/cli2 bin, never workspace dist.');
  }
  const packageFile = path.join(packageRoot, 'package.json');
  if (!lstatSync(packageFile).isFile() || lstatSync(packageFile).isSymbolicLink() || realpathSync(packageFile) !== packageFile) {
    throw new Error('The installed package identity is not a regular file.');
  }
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
  if (pkg.name !== '@freelog-cli/cli2' || typeof pkg.version !== 'string' || !pkg.bin
    || Object.keys(pkg.bin).length !== 1 || !['dist/bin/index.js', './dist/bin/index.js'].includes(pkg.bin['freelog-cli'])) {
    throw new Error('The installed package executable identity differs.');
  }
  return { cliBin, packageName: pkg.name, version: pkg.version, binSha256: digest(readFileSync(cliBin)) };
}

/** Includes empty directories and exact file bytes, not just known state filenames. */
function snapshot(root) {
  const entries = [];
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error('Unexpected symlink in the isolated parameter workspace.');
      if (stat.isDirectory()) { entries.push({ path: relative, kind: 'directory' }); walk(file); }
      else if (stat.isFile()) entries.push({ path: relative, kind: 'file', size: stat.size, sha256: digest(readFileSync(file)) });
      else throw new Error('Unexpected special file in the isolated parameter workspace.');
    }
  }
  walk(root);
  return entries;
}


export function validateCommandResults(cases) {
  return validateSuiteCases({ schemaVersion: 1, cases }, 'verify-command-parameters.mjs', commandParameterCases);
}

function childEnvironment(env, controls, logFile) {
  const inherited = Object.fromEntries(Object.entries(env).filter(([key, value]) =>
    /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|LANG|LC_ALL|TZ)$/iu.test(key) && typeof value === 'string'));
  const home = path.join(controls, 'home');
  mkdirSync(home);
  return { ...inherited, HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
    XDG_CONFIG_HOME: home, NODE_OPTIONS: '', FREELOG_ENV: 'dev', NO_COLOR: '1',
    FREELOG_TEST_NETWORK_LOG: logFile };
}

function executeLeaf(leaf, installed, env) {
  const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-command-parameters-')));
  const controls = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-command-controls-')));
  const observed = { ...installed, cwd: work, controls, nodeVersion: process.version, platform: process.platform,
    argv: [...leaf.action.argv], stdin: leaf.action.stdin, inputClass: leaf.inputClass, startedAt: new Date().toISOString() };
  try {
    mkdirSync(path.join(work, '.freelog'));
    mkdirSync(path.join(work, 'keep-empty'));
    writeFileSync(path.join(work, 'artifact.txt'), 'Local parameter rejection artifact.\n');
    writeFileSync(path.join(work, '.freelog/1.json'), `${JSON.stringify({ schemaVersion: 1, subject: 'resource', typeCode: 'RT006003', filePath: 'artifact.txt' }, null, 2)}\n`);
    // Credential lookup walks every ancestor independently of HOME. This non-secret invalid
    // selector makes an accidental auth-first regression stop before any system keyring read.
    writeFileSync(path.join(work, '.freelog/auth'), 'LOCAL_PARAMETER_AUTH_MUST_NOT_BE_READ\n');
    const logFile = path.join(controls, 'network.jsonl');
    writeFileSync(logFile, '', { flag: 'wx' });
    observed.before = snapshot(work);
    observed.result = spawnSync(process.execPath, ['--import', guard, installed.cliBin, ...leaf.action.argv], {
      cwd: work, env: childEnvironment(env, controls, logFile), input: leaf.action.stdin,
      encoding: 'utf8', timeout: 30_000, maxBuffer: 1_000_000,
    });
    // Keep the raw child streams and guard bytes, including unexpected outcomes.
    observed.result = { status: observed.result.status, signal: observed.result.signal,
      error: observed.result.error ?? null, stdout: observed.result.stdout ?? '', stderr: observed.result.stderr ?? '' };
    observed.after = snapshot(work);
    observed.networkLog = readFileSync(logFile, 'utf8');
    observed.finishedAt = new Date().toISOString();
    return { result: evaluateCommandCase(leaf, observed), work, controls };
  } catch (error) {
    observed.finishedAt = new Date().toISOString();
    return { result: { id: leaf.id, status: 'FAIL', assertions: [], reason: `Local parameter apparatus failed: ${error.message}`, observations: observed }, work, controls };
  }
}

export function runCommandParameterCases({ env = process.env, output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  let installed;
  let setupError;
  try {
    if (typeof output !== 'string' || !path.isAbsolute(output)) throw new Error('An absolute FREELOG_TEST_SUITE_REPORT is required for raw case evidence.');
    if (!/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '')) throw new Error('FREELOG_TEST_RUN_ID is required for run-bound case evidence.');
    if (env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new Error('The run ID must match the actual evidence writer process.');
    installed = requireInstalledCli(env);
  } catch (error) { setupError = error.message; }
  const runs = setupError ? commandParameterCases.map((leaf) => ({ result: { id: leaf.id, status: 'BLOCKED', assertions: [],
    reason: setupError, observations: { setupError, executed: false } } })) : commandParameterCases.map((leaf) => executeLeaf(leaf, installed, env));
  const cases = validateCommandResults(runs.map((run) => run.result));
  // Persist evidence before deleting any proven successful workspace. Incomplete/failed runs
  // remain available; a report-write failure cannot silently discard the only observations.
  if (typeof output === 'string' && path.isAbsolute(output)) writeSuiteCases(cases, output);
  for (const run of runs) {
    if (!run.work) continue;
    if (run.result.status !== 'PASS') { console.log(`RETAIN local parameter workspace: ${run.work}; controls: ${run.controls}`); continue; }
    try {
      cleanupWorkspace(run.work, { success: true, prefixes: ['freelog-command-parameters-'] });
      cleanupWorkspace(run.controls, { success: true, prefixes: ['freelog-command-controls-'] });
    } catch (error) {
      run.result.status = 'FAIL';
      run.result.reason = `Successful assertions could not complete owned-workspace cleanup: ${error.message}`;
      if (typeof output === 'string' && path.isAbsolute(output)) writeSuiteCases(cases, output);
    }
  }
  return { cases, exitCode: cases.some((item) => item.status === 'FAIL') ? 1 : cases.some((item) => item.status !== 'PASS') ? 3 : 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2).filter((arg) => arg !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new Error('Local parameter acceptance permits only --env dev and no workspace build.');
    const result = runCommandParameterCases();
    console.log(JSON.stringify({ producer: 'verify-command-parameters.mjs', counts: Object.fromEntries(['PASS', 'FAIL', 'BLOCKED'].map((status) => [status, result.cases.filter((item) => item.status === status).length])) }));
    process.exitCode = result.exitCode;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
