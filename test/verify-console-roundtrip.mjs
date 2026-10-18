#!/usr/bin/env node
/** Installed-package / actual-browser bridge. No browser authentication, payment, signing or HTTP UI simulation. */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { readPrivateJson } from './acceptance/read-private-json.mjs';
import { artifactManifest, validateRetainedArtifact } from './acceptance/lifecycle-artifact.mjs';
import { createConsoleBrowserRecorder, projectConsoleBrowserCapture } from './acceptance/console-browser-capture.mjs';
import { consoleCaptureRequest, consoleDraftProjection, consoleReverseCommands, consoleRoundtripCases, consoleRoundtripTiming,
  evaluateConsoleRoundtripCase, expectedConsoleDraft, expectedConsoleEditedVersion, expectedConsoleStageVersion,
  initialConsoleRoundtripCases, loadConsoleRoundtripPrerequisite, projectConsoleOwner, projectConsoleSdkResponse,
  validateConsoleRoundtripFiles } from './acceptance/console-roundtrip-evidence.mjs';

const testRoot = fileURLToPath(new URL('.', import.meta.url));
const stages = ['view-first', 'view-updated', 'edit-description', 'edit-text-option'];
const hash = (value, algorithm = 'sha256') => createHash(algorithm).update(value).digest('hex');
class HarnessError extends Error { constructor(status, message) { super(message); this.status = status; } }
const assert = (condition, message) => { if (!condition) throw new HarnessError('FAIL', message); };
const normal = (child) => child?.status === 0 && child.signal === null && child.error === null && child.timedOut === false;
/** Shared across both types; no browser wait, CLI call or SDK request may restart the budget. */
export function createConsoleRoundtripBudget({ now = Date.now, totalMs = consoleRoundtripTiming.totalMs } = {}) {
  if (!Number.isSafeInteger(totalMs) || totalMs <= 0 || totalMs > consoleRoundtripTiming.totalMs) throw new HarnessError('FAIL', 'The apparatus budget must be positive and cannot exceed twenty minutes.');
  const started = now();
  const deadline = started + totalMs;
  const timeout = (maximum) => {
    const remaining = Math.floor(deadline - now());
    if (remaining <= 0) throw new HarnessError('BLOCKED', 'The whole-run browser/CLI budget expired; no successor action was issued.');
    if (!Number.isSafeInteger(maximum) || maximum <= 0) throw new HarnessError('FAIL', 'The apparatus timeout must be a positive integer.');
    return Math.min(maximum, remaining);
  };
  return { startedAt: new Date(started).toISOString(), deadlineAt: new Date(deadline).toISOString(), timeout,
    async call(action) {
      const limit = timeout(consoleRoundtripTiming.sdkMs);
      let timer;
      try { return await Promise.race([Promise.resolve().then(() => action(limit)), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new HarnessError('BLOCKED', 'The bounded SDK observation did not finish; no successor write was issued.')), limit);
      })]); } finally { clearTimeout(timer); }
    } };
}
/** Reads are serial in this owned process. Abort also closes continuously active slow responses. */
export async function consoleSdkRead(budget, sdk, read) {
  const defaults = sdk.FUtil.Axios.defaults;
  const previousTimeout = defaults.timeout;
  const previousSignal = defaults.signal;
  const hadSignal = Object.hasOwn(defaults, 'signal');
  const controller = new AbortController();
  try {
    return await budget.call((timeout) => { defaults.timeout = timeout; defaults.signal = controller.signal; return read(); });
  } finally {
    controller.abort();
    defaults.timeout = previousTimeout;
    if (hadSignal) defaults.signal = previousSignal;
    else delete defaults.signal;
  }
}
function parseJson(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); }
  catch { throw new HarnessError('FAIL', 'An owned local JSON observation is unavailable or invalid; parser excerpts are withheld.'); }
}
function versionOutput(stdout) {
  try {
    const start = stdout.indexOf('{');
    if (start < 0) throw new Error();
    const value = JSON.parse(stdout.slice(start));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HarnessError('FAIL', 'The installed version show stdout is not a complete version DTO.'); }
}
function completedIdentity(work) {
  const identity = parseJson(path.join(work, '.freelog/1.json'));
  return { draft: existsSync(path.join(work, '.freelog/1.version.json')) ? 'present' : 'absent',
    pending: existsSync(path.join(work, '.freelog/.pending-operation.json')) ? 'present' : 'absent',
    identity: Object.fromEntries(['resourceId', 'typeCode', 'filePath'].map((key) => [key, identity[key] ?? null])) };
}
/** One fresh nonce/one response, at most five minutes. A timeout is not permission to retry a web write. */
export async function waitForCapture(entry, budget) {
  const limit = Date.parse(entry.request.expiresAt);
  while (Date.now() <= limit) {
    budget.timeout(consoleRoundtripTiming.browserMs);
    if (existsSync(entry.captureFile)) {
      const stat = lstatSync(entry.captureFile);
      if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(entry.captureFile) !== entry.captureFile || stat.size > 5_000_000) {
        throw new HarnessError('FAIL', 'The browser capture is not a safe regular evidence file.');
      }
      // The operator must publish an entire file, not append fragments to a live response.
      const capture = parseJson(entry.captureFile);
      if (capture.status === 'BLOCKED') throw new HarnessError('BLOCKED', 'The actual browser operator reported login/access/observation unavailable; no successor write was issued.');
      if (capture.status !== 'OBSERVED') throw new HarnessError('FAIL', 'The actual browser operator did not report an observed completed stage.');
      try { projectConsoleBrowserCapture(entry.request, capture); }
      catch { throw new HarnessError('FAIL', 'The raw browser profile was rejected; no successor browser request or write was issued.'); }
      return capture;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(250, budget.timeout(consoleRoundtripTiming.browserMs))));
  }
  throw new HarnessError('BLOCKED', 'No matching actual-browser capture arrived within 300 seconds; the nonce is not retried.');
}

export async function runConsoleRoundtripCases({ env = process.env, argv = process.argv.slice(2), output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const budget = createConsoleRoundtripBudget();
  const cases = initialConsoleRoundtripCases();
  const secrets = [];
  const safe = (value) => redactEvidence(value, secrets);
  const set = (id, result) => { const index = cases.findIndex((item) => item.id === id); cases[index] = result; };
  const persist = () => {
    if (typeof output !== 'string' || !path.isAbsolute(output)) return;
    mkdirSync(path.dirname(output), { recursive: true });
    writeSuiteCases(cases, output);
  };
  let installed, evidenceDir;
  const prerequisites = new Map();
  try {
    const args = argv.filter((arg) => arg !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new HarnessError('BLOCKED', 'Only the explicit dev environment is permitted; no build is performed.');
    if (typeof output !== 'string' || !path.isAbsolute(output) || !/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '')
      || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new HarnessError('BLOCKED', 'An absolute report and the actual run-bound evidence ID are required.');
    try { installed = requireInstalledCli(env); } catch { throw new HarnessError('BLOCKED', 'A fixed installed candidate entry is required; workspace fallback is forbidden.'); }
    evidenceDir = path.dirname(output);
    for (const kind of ['theme', 'image']) {
      try {
        const loaded = loadConsoleRoundtripPrerequisite({ evidenceDir, runId: env.FREELOG_TEST_RUN_ID, installed, kind });
        const retainedSource = validateRetainedArtifact(loaded.source.retainedArtifact, { evidenceDir, runId: env.FREELOG_TEST_RUN_ID });
        prerequisites.set(kind, { ...loaded, retainedSource });
      } catch {
        for (const leaf of consoleRoundtripCases.filter((item) => item.resourceKind === kind)) set(leaf.id, { id: leaf.id, status: 'BLOCKED', assertions: [],
          reason: 'The exact same-run installed lifecycle PASS and safe retained artifact are unavailable; no account was read and no resource was created for this type.' });
      }
    }
  } catch (error) {
    const reason = error instanceof HarnessError ? error.message : 'The installed/run prerequisite is unavailable; unknown diagnostics are withheld.';
    for (const leaf of consoleRoundtripCases) set(leaf.id, { id: leaf.id, status: 'BLOCKED', reason, assertions: [] });
  }
  // All installation/raw/artifact prerequisites are checked before account parsing, SDK import, network or temporary projects.
  if (!prerequisites.size) { persist(); return { cases, exitCode: 3 }; }
  // Operator executes this exact self-contained, read-only factory in cua_repl.
  // Never generate capture values, timestamps or AX strings on the operator's behalf.
  const recorderFile = path.join(evidenceDir, 'console-browser-recorder.js');
  try { writeFileSync(recorderFile, `const createConsoleBrowserRecorder = ${createConsoleBrowserRecorder.toString()};\n`, { flag: 'wx' }); }
  catch {
    for (const leaf of consoleRoundtripCases.filter((item) => prerequisites.has(item.resourceKind))) set(leaf.id, { id: leaf.id, status: 'FAIL', assertions: [],
      reason: 'The owned recorder source could not be exclusively created; no account or successor operation was read or issued.' });
    persist(); return { cases, exitCode: 1 };
  }
  let primary, helpers, sdk;
  try {
    primary = readPrivateJson(path.join(testRoot, '.freelog-test-credentials.local.json')).primary;
    if (typeof primary?.loginName !== 'string' || !primary.loginName.startsWith('freelog') || typeof primary.password !== 'string' || !primary.password) {
      throw new HarnessError('BLOCKED', 'The authorized freelog primary account is unavailable.');
    }
    secrets.push(primary.password);
    helpers = await import('./dependency-declaration-helpers.mjs');
    sdk = await import('../packages/tools-lib/dist/node.mjs');
    await budget.call(() => helpers.loginForApi(primary));
  } catch (error) {
    for (const leaf of consoleRoundtripCases.filter((item) => prerequisites.has(item.resourceKind))) set(leaf.id, { id: leaf.id, status: 'BLOCKED', assertions: [],
      reason: error instanceof HarnessError ? safe(error.message) : 'The dev account/API prerequisite did not complete; credentials and unknown exception details are withheld.' });
    persist(); return { cases, exitCode: 3 };
  }
  const sdkVersion = async (resourceId, version) => {
    try { return projectConsoleSdkResponse(await consoleSdkRead(budget, sdk, () => sdk.FServiceAPI.Resource.resourceVersionInfo1({ resourceId, version }))); }
    catch (error) { if (error instanceof HarnessError) throw error; throw new HarnessError('FAIL', 'The independent SDK version read did not complete; no raw transport exception is retained.'); }
  };
  const runCli = (work, label, args, input) => {
    const timeout = budget.timeout(consoleRoundtripTiming.cliMs);
    let result;
    try { result = spawnSync(process.execPath, [installed.cliBin, ...args], { cwd: work, env, input, encoding: 'utf8', timeout, maxBuffer: 4_000_000 }); }
    catch { result = { status: null, signal: null, error: { code: 'SPAWN_FAILED' } }; }
    return { label, argv: args.map((arg, index) => args[index - 1] === '--login-name' ? '<primary-login>' : arg),
      result: { status: result.status ?? null, signal: result.signal ?? null, error: result.error ? 'CLI process did not complete normally.' : null,
        timedOut: result.error?.code === 'ETIMEDOUT', stdout: safe(result.stdout ?? ''), stderr: safe(result.stderr ?? '') } };
  };
  for (const kind of ['theme', 'image']) {
    const setup = prerequisites.get(kind);
    if (!setup) continue;
    const forward = consoleRoundtripCases.find((item) => item.resourceKind === kind && item.direction === 'forward');
    const reverse = consoleRoundtripCases.find((item) => item.resourceKind === kind && item.direction === 'reverse');
    const observed = { ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir, resourceKind: kind, resourceId: setup.source.resourceId,
      prerequisite: setup.prerequisite, platform: process.platform, nodeVersion: process.version, browser: [], sdkStages: [],
      startedAt: budget.startedAt, deadlineAt: budget.deadlineAt };
    let work;
    let phase = 'forward';
    try {
      const current = await consoleSdkRead(budget, sdk, () => sdk.FServiceAPI.User.currentUserInfo({}));
      const resource = await consoleSdkRead(budget, sdk, () => sdk.FServiceAPI.Resource.info({ resourceIdOrName: observed.resourceId }));
      observed.ownerIdentity = projectConsoleOwner(current, resource);
      assert(evaluateConsoleRoundtripCase(forward.id, observed).assertions.find((item) => item.id === 'owner-identity').passed,
        'The authenticated account does not independently match the same-run resource owner; no browser request/write was issued.');
      const dependencyId = setup.source.dependency.resourceId;
      const response = await consoleSdkRead(budget, sdk, () => sdk.FServiceAPI.Resource.info({ resourceIdOrName: dependencyId }));
      observed.dependencyIdentity = { resourceId: dependencyId, resourceName: response?.data?.resourceName ?? null, resourceTitle: response?.data?.resourceTitle ?? null,
        raw: { ret: response?.ret ?? null, errCode: response?.errCode ?? null, data: { resourceId: response?.data?.resourceId ?? null,
          resourceName: response?.data?.resourceName ?? null, resourceTitle: response?.data?.resourceTitle ?? null } } };
      const identityCheck = evaluateConsoleRoundtripCase(forward.id, observed).assertions.find((item) => item.id === 'dependency-identity');
      assert(identityCheck.passed, 'The exact lifecycle dependency identity/name is not independently established.');
      for (const [index, stage] of stages.entries()) {
        const expectedBefore = expectedConsoleStageVersion(kind, index < 2 ? stage : stages[index - 1], setup.source.versions);
        const before = await sdkVersion(observed.resourceId, stage === 'view-first' ? '1.0.0' : '1.1.0');
        observed.sdkStages.push({ stage, before });
        assert(isDeepStrictEqual(before, { ret: 0, errCode: 0, data: expectedBefore }), `The independent SDK ${stage} baseline differs; no browser request/write was issued.`);
        const request = consoleCaptureRequest({ ...observed, stage, nonce: randomBytes(16).toString('hex'), requestedAt: new Date().toISOString() });
        const base = `console-roundtrip-${observed.runId}-${kind}-${stage}-${request.nonce}`;
        const entry = { requestFile: path.join(evidenceDir, `${base}.request.json`), captureFile: path.join(evidenceDir, `${base}.capture.json`), request };
        observed.browser.push(entry);
        writeFileSync(entry.requestFile, `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx' });
        console.log(`BROWSER_REQUEST ${JSON.stringify({ path: entry.requestFile, response: entry.captureFile, stage, kind, resourceId: observed.resourceId, version: request.version, expiresAt: request.expiresAt })}`);
        entry.capture = await waitForCapture(entry, budget);
        observed.sdkStages[index].after = await sdkVersion(observed.resourceId, request.version);
        // Check the completed prefix only. The suffix cannot be invented as a PASS, and a prefix failure stops subsequent writes.
        const checked = evaluateConsoleRoundtripCase(forward.id, observed);
        for (const assertion of checked.assertions) {
          if (assertion.id === 'browser-binding' || assertion.id === 'browser-fields') {
            assert(assertion.actual.issues.every((issue) => !stages.slice(0, index + 1).some((completed) => issue.startsWith(`${completed}:`))), `Actual browser ${stage} binding/fields mismatch; successor writes were not issued.`);
          }
          if (assertion.id === 'sdk-stage-invariants') assert(isDeepStrictEqual(assertion.expected.slice(0, index + 1), assertion.actual), `Actual web ${stage} save altered unexpected business fields; successor writes were not issued.`);
        }
      }
      validateConsoleRoundtripFiles(observed);
      const result = evaluateConsoleRoundtripCase(forward.id, observed);
      assert(result.status === 'PASS', result.reason);
      set(forward.id, result); persist(); phase = 'reverse';
      // Never create a reverse project until all actual UI stages and independent unchanged-field checks have succeeded.
      const artifactSource = validateRetainedArtifact(setup.source.retainedArtifact, { evidenceDir, runId: observed.runId });
      work = realpathSync(mkdtempSync(path.join(tmpdir(), `freelog-console-${kind}-`)));
      const anchor = kind === 'theme' ? 'dist' : 'photo-v2.png';
      const localArtifact = path.join(work, anchor);
      cpSync(artifactSource, localArtifact, { recursive: kind === 'theme', errorOnExist: true, force: false });
      observed.reverse = { cwd: work, actions: [], artifact: { path: anchor, kind: kind === 'theme' ? 'directory' : 'file', manifest: artifactManifest(localArtifact),
        sha1: kind === 'theme' ? null : hash(readFileSync(localArtifact), 'sha1') } };
      const expectedSaved = expectedConsoleStageVersion(kind, 'edit-text-option', setup.source.versions);
      for (const command of consoleReverseCommands(kind, observed.resourceId)) {
        const args = command.argv.map((arg) => arg === '<primary-login>' ? primary.loginName : arg);
        const action = runCli(work, command.label, args, command.label === 'login' ? `${primary.password}\n` : undefined);
        observed.reverse.actions.push(action);
        assert(normal(action.result) && action.result.stderr === '', `The installed CLI ${command.label} failed; no successor command was issued.`);
        if (command.label === 'bind') {
          observed.reverse.boundIdentity = parseJson(path.join(work, '.freelog/1.json'));
          assert(observed.reverse.boundIdentity.resourceId === observed.resourceId, 'Bind resolved a different resource.');
        }
        if (command.label === 'draft pull 1.1.0') {
          observed.reverse.pulledDraft = parseJson(path.join(work, '.freelog/1.version.json'));
          assert(isDeepStrictEqual(consoleDraftProjection(observed.reverse.pulledDraft), expectedConsoleDraft(kind, expectedSaved)), 'The pulled draft lost or changed web-saved business fields; publishing was not attempted.');
        }
        if (command.label === 'description set') {
          observed.reverse.beforeSubmitDraft = parseJson(path.join(work, '.freelog/1.version.json'));
          assert(isDeepStrictEqual(consoleDraftProjection(observed.reverse.beforeSubmitDraft), expectedConsoleDraft(kind, expectedConsoleEditedVersion(kind, setup.source.versions))), 'The edited draft differs from the precise inherited form; publishing was not attempted.');
        }
        if (command.label === 'version show 1.2.0') observed.reverse.cliReadback = versionOutput(action.result.stdout);
      }
      assert(isDeepStrictEqual(artifactManifest(localArtifact), observed.reverse.artifact.manifest), 'The artifact input bytes changed during reverse CLI commands.');
      observed.reverse.sdkReadback = await sdkVersion(observed.resourceId, '1.2.0');
      observed.reverse.firstVersionAfter = await sdkVersion(observed.resourceId, '1.0.0');
      observed.reverse.oldVersionAfter = await sdkVersion(observed.resourceId, '1.1.0');
      observed.reverse.finalization = completedIdentity(work);
      observed.finishedAt = new Date().toISOString();
      validateConsoleRoundtripFiles(observed);
      const reverseResult = evaluateConsoleRoundtripCase(reverse.id, observed);
      set(reverse.id, reverseResult); persist();
      if (reverseResult.status === 'PASS') {
        cleanupWorkspace(work, { success: true, prefixes: [`freelog-console-${kind}-`], log: (line) => console.log(safe(line)), beforeRemove() {
          const logout = runCli(work, 'logout owned selector', ['logout', '--env', 'dev']);
          observed.reverse.cleanup = logout;
          assert(normal(logout.result), 'Owned-selector logout failed; the remaining workspace is retained.');
        } });
        observed.reverse.cleanupResult = 'owned workspace removed; remote resource/versions retained';
      }
    } catch (error) {
      const status = error instanceof HarnessError ? error.status : 'FAIL';
      const reason = error instanceof HarnessError ? safe(error.message) : 'Console roundtrip apparatus failed; credentials and unknown exception details are withheld.';
      const leaf = phase === 'forward' ? forward : reverse;
      set(leaf.id, { id: leaf.id, status, reason, assertions: evaluateConsoleRoundtripCase(leaf.id, observed).assertions, observations: observed });
      if (phase === 'forward') set(reverse.id, { id: reverse.id, status: 'BLOCKED', assertions: [], observations: observed,
        reason: 'The required same-type forward web/SDK chain did not pass; no reverse project or successor remote write was issued.' });
      if (work) console.log(safe(`RETAIN Console reverse fixture: ${work}; local state and all remote resources are retained.`));
    }
    persist();
  }
  return { cases, exitCode: cases.some((item) => item.status === 'FAIL') ? 1 : cases.some((item) => item.status !== 'PASS') ? 3 : 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runConsoleRoundtripCases();
    // A partial checkpoint never carries this marker. Only a normally returned complete result does.
    writeSuiteCases(result.cases, process.env.FREELOG_TEST_SUITE_REPORT, { schemaVersion: 1, producer: 'verify-console-roundtrip.mjs',
      runId: process.env.FREELOG_TEST_RUN_ID, state: 'COMPLETED', exitCode: result.exitCode });
    console.log(JSON.stringify({ producer: 'verify-console-roundtrip.mjs', cases: result.cases.map(({ id, status }) => ({ id, status })) }));
    process.exitCode = result.exitCode;
  } catch { console.error('Console roundtrip evidence could not be persisted; unknown diagnostic details are withheld.'); process.exitCode = 1; }
}
