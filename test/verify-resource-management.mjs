/** Shared installed-candidate executor. Each type has its own registered process/result. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { createConsoleRoundtripBudget, consoleSdkRead } from './verify-console-roundtrip.mjs';
import { projectConsoleOwner, projectConsoleSdkResponse, loadConsoleRoundtripPrerequisite } from './acceptance/console-roundtrip-evidence.mjs';
import { validateRetainedArtifact } from './acceptance/lifecycle-artifact.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { readPrivateJson } from './acceptance/read-private-json.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { writeSuiteCases } from './acceptance/protocol.mjs';
import { assertManagementBefore, evaluateResourceManagementCase, managementCommands, managementSdkProjection, managementSetupCommands,
  resourceManagementCases, validateManagementFiles } from './acceptance/resource-management-evidence.mjs';

const testRoot = fileURLToPath(new URL('.', import.meta.url));
const hash = (v) => createHash('sha256').update(v).digest('hex');
class HarnessError extends Error { constructor(status, message) { super(message); this.status = status; } }

/** Private parser excerpts never enter diagnostics, including before any secret can be registered. */
export function readManagementPrimary(file) {
  let primary;
  try { primary = readPrivateJson(file).primary; }
  catch { throw new HarnessError('BLOCKED', 'The private primary account input is unavailable or invalid; its contents are withheld.'); }
  if (typeof primary?.loginName !== 'string' || !primary.loginName.startsWith('freelog') || typeof primary.password !== 'string' || !primary.password) {
    throw new HarnessError('BLOCKED', 'Authorized freelog primary account unavailable.');
  }
  return primary;
}
function snapshot(root) {
  const entries = [];
  const walk = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name), stat = lstatSync(file);
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (stat.isSymbolicLink() || realpathSync(file) !== file) throw new HarnessError('FAIL', 'Unexpected aliased file in owned management workspace.');
      if (stat.isDirectory()) { entries.push({ path: relative, kind: 'directory' }); walk(file); }
      else if (stat.isFile()) { const bytes = readFileSync(file); entries.push({ path: relative, kind: 'file', size: bytes.length, sha256: hash(bytes),
        ...(relative === '.freelog/1.json' ? { utf8: bytes.toString('utf8') } : {}) }); }
      else throw new HarnessError('FAIL', 'Unexpected special file in owned management workspace.');
    }
  };
  walk(root); return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function runResourceManagementCase(kind, { env = process.env, argv = process.argv.slice(2), output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const leaf = resourceManagementCases.find((item) => item.resourceKind === kind);
  if (!leaf) throw new Error('Unknown management resource type.');
  let result = { id: leaf.id, status: 'NOT_TESTED', reason: 'This management chain has not executed.', assertions: [] };
  let installed, loaded, evidenceDir, observed, work, helpers;
  const secrets = [], bounded = createConsoleRoundtripBudget({ totalMs: 15 * 60_000 });
  const safe = (value) => redactEvidence(helpers ? helpers.redact(value) : value, secrets);
  const persist = () => { if (typeof output === 'string' && path.isAbsolute(output)) { mkdirSync(path.dirname(output), { recursive: true }); writeSuiteCases([result], output); } };
  try {
    const args = argv.filter((a) => a !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new HarnessError('BLOCKED', 'Only --env dev is permitted; no build is performed.');
    if (typeof output !== 'string' || !path.isAbsolute(output) || !/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '')
      || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new HarnessError('BLOCKED', 'The actual run-bound absolute report is required.');
    try {
      installed = requireInstalledCli(env); evidenceDir = path.dirname(output);
      loaded = loadConsoleRoundtripPrerequisite({ evidenceDir, runId: env.FREELOG_TEST_RUN_ID, installed, kind });
      validateRetainedArtifact(loaded.source.retainedArtifact, { evidenceDir, runId: env.FREELOG_TEST_RUN_ID });
    } catch { throw new HarnessError('BLOCKED', 'Same-run installed lifecycle PASS/retained artifact unavailable; no account or workspace was accessed.'); }
    observed = { ...installed, runId: env.FREELOG_TEST_RUN_ID, evidenceDir, resourceKind: kind, resourceId: loaded.source.resourceId,
      prerequisite: loaded.prerequisite, platform: process.platform, nodeVersion: process.version,
      startedAt: bounded.startedAt, deadlineAt: bounded.deadlineAt, setupActions: [], steps: [] };
    const primary = readManagementPrimary(path.join(testRoot, '.freelog-test-credentials.local.json'));
    secrets.push(primary.password);
    helpers = await import('./dependency-declaration-helpers.mjs');
    const sdk = await import('../packages/tools-lib/dist/node.mjs');
    await bounded.call(() => helpers.loginForApi(primary));
    const readResource = async () => managementSdkProjection(await consoleSdkRead(bounded, sdk, () => sdk.FServiceAPI.Resource.info({
      resourceIdOrName: observed.resourceId, isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 })));
    const readVersions = async () => {
      const values = [];
      for (const version of ['1.0.0', '1.1.0']) values.push(projectConsoleSdkResponse(await consoleSdkRead(bounded, sdk,
        () => sdk.FServiceAPI.Resource.resourceVersionInfo1({ resourceId: observed.resourceId, version }))));
      return values;
    };
    observed.baseline = await readResource(); observed.baselineVersions = await readVersions();
    const user = await consoleSdkRead(bounded, sdk, () => sdk.FServiceAPI.User.currentUserInfo({}));
    observed.currentUser = projectConsoleOwner(user, { ret: 0, errCode: 0, data: observed.baseline.data }).currentUser;
    observed.auth = { env: 'dev', userId: observed.currentUser?.data?.userId, username: observed.currentUser?.data?.username };
    const assertPartial = (ids) => {
      const checked = evaluateResourceManagementCase(leaf.id, observed);
      if (checked.assertions.some((a) => ids.includes(a.id) && !a.passed)) throw new HarnessError('FAIL', `Management prerequisite/evidence failed (${ids.join(', ')}); successor actions stopped.`);
    };
    assertPartial(['lifecycle-prerequisite', 'owner-baseline', 'published-baseline']);
    work = realpathSync(mkdtempSync(path.join(tmpdir(), `freelog-management-${kind}-`))); observed.cwd = work;
    const retained = validateRetainedArtifact(loaded.source.retainedArtifact, { evidenceDir, runId: observed.runId });
    cpSync(retained, path.join(work, kind === 'theme' ? 'dist' : 'photo-v2.png'), { recursive: kind === 'theme', force: false, errorOnExist: true });
    cpSync(path.join(testRoot, 'fixtures/media/sample-image.png'), path.join(work, 'cover.png'), { force: false, errorOnExist: true });
    writeFileSync(path.join(work, 'sentinel.txt'), 'Management commands must preserve this file.\n', { flag: 'wx' });
    const runCli = (spec) => {
      const args = spec.argv.map((a) => a === '<primary-login>' ? primary.loginName : a);
      let child;
      try { child = spawnSync(process.execPath, [installed.cliBin, ...args], { cwd: work, env, input: spec.label === 'login' ? `${primary.password}\n` : '',
        encoding: 'utf8', timeout: bounded.timeout(60_000), maxBuffer: 4_000_000 }); }
      catch { child = { status: null, signal: null, error: { code: 'SPAWN_FAILED' } }; }
      return { label: spec.label, argv: spec.argv, result: { status: child.status ?? null, signal: child.signal ?? null,
        error: child.error ? 'CLI did not complete normally.' : null, timedOut: child.error?.code === 'ETIMEDOUT', stdout: safe(child.stdout ?? ''), stderr: safe(child.stderr ?? '') } };
    };
    for (const spec of managementSetupCommands(kind, observed.resourceId)) {
      if (spec.label === 'bind repeated') observed.repeatBindBefore = snapshot(work);
      const action = runCli(spec); observed.setupActions.push(action);
      if (action.result.status !== 0 || action.result.signal || action.result.error || action.result.timedOut || action.result.stderr) throw new HarnessError('FAIL', 'Management login/bind did not complete; no successor command issued.');
      if (spec.label === 'login') { const auth = readPrivateJson(path.join(work, '.freelog/auth'));
        observed.cliAuth = Object.fromEntries(['schemaVersion', 'env', 'userId', 'username'].map((k) => [k, auth[k] ?? null]));
        if (!isDeepStrictEqual(observed.cliAuth, { schemaVersion: 1, ...observed.auth })) throw new HarnessError('FAIL', 'The actual CLI login selector differs from independent SDK owner; bind was not issued.'); }
      if (spec.label === 'bind') { observed.boundIdentity = readPrivateJson(path.join(work, '.freelog/1.json')); observed.boundSnapshot = snapshot(work); }
      if (spec.label === 'bind repeated') observed.repeatBindAfter = snapshot(work);
    }
    observed.boundRemote = await readResource();
    assertPartial(['setup-command-binding', 'bound-local-state']);
    for (const spec of managementCommands(kind, observed.resourceId)) {
      const entry = { label: spec.label, argv: spec.argv, remoteBefore: await readResource(), versionsBefore: await readVersions(), before: snapshot(work) };
      observed.steps.push(entry); persist();
      try { assertManagementBefore(leaf.id, observed); }
      catch { throw new HarnessError('FAIL', 'Current management resource/version/local snapshots drifted; this CLI action and successors were not issued.'); }
      entry.result = runCli(spec).result;
      entry.after = snapshot(work); entry.remoteAfter = await readResource(); entry.versionsAfter = await readVersions();
      const checked = evaluateResourceManagementCase(leaf.id, observed);
      // Missing suffix remains a failure, but must not stop a valid completed prefix.
      const count = observed.steps.length;
      for (const a of checked.assertions.filter((a) => ['step-process-output', 'remote-management-invariants', 'published-versions-unchanged', 'local-byte-invariants'].includes(a.id))) {
        if (!isEqualPrefix(a.expected, a.actual, count)) throw new HarnessError('FAIL', `Management ${spec.label} failed exact ${a.id}; no successor write issued.`);
      }
      result = { ...checked, status: 'NOT_TESTED', reason: 'The completed prefix is retained; remaining management steps have not completed.' }; persist();
    }
    observed.finishedAt = new Date().toISOString(); validateManagementFiles(observed);
    result = evaluateResourceManagementCase(leaf.id, observed); persist();
    if (result.status === 'PASS') {
      cleanupWorkspace(work, { success: true, prefixes: [`freelog-management-${kind}-`], log: (line) => console.log(safe(line)), beforeRemove() {
        observed.cleanupBefore = snapshot(work);
        if (!existsSync(path.join(work, '.freelog/auth')) || !isDeepStrictEqual(observed.cleanupBefore, observed.steps.at(-1).after)) {
          throw new HarnessError('FAIL', 'Owned management selector/state changed before cleanup; no logout or removal is permitted.');
        }
        const logout = runCli({ label: 'logout owned selector', argv: ['logout', '--env', 'dev'] });
        observed.cleanup = logout;
        if (logout.result.status !== 0 || logout.result.signal || logout.result.error || logout.result.timedOut || existsSync(path.join(work, '.freelog/auth'))) throw new HarnessError('FAIL', 'Owned management logout failed.');
      } });
      observed.cleanupResult = 'owned workspace removed; same-run remote resource retained offline';
    }
  } catch (error) {
    result = { id: leaf.id, status: error instanceof HarnessError ? error.status : 'FAIL', assertions: [],
      reason: error instanceof HarnessError ? safe(error.message) : 'Management apparatus failed; unknown exception details withheld.', ...(observed ? { observations: observed } : {}) };
  }
  persist();
  if (work && result.status !== 'PASS') console.log(safe(`RETAIN management fixture: ${work}; no cleanup requests sent to remote resources.`));
  return { cases: [result], exitCode: result.status === 'PASS' ? 0 : result.status === 'FAIL' ? 1 : 3 };
}
const isEqualPrefix = (a, b, n) => isDeepStrictEqual(a.slice(0, n), b.slice(0, n));
export async function managementProducerMain(kind) {
  try { const result = await runResourceManagementCase(kind); console.log(JSON.stringify({ producer: `verify-${kind}-resource-management.mjs`, cases: result.cases.map(({ id, status }) => ({ id, status })) })); process.exitCode = result.exitCode; }
  catch { console.error('Management evidence could not be persisted; unknown diagnostics withheld.'); process.exitCode = 1; }
}
