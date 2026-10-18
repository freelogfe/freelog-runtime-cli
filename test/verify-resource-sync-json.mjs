#!/usr/bin/env node
/** Three real-dev sync stages over two new shells; no version, policy, shelf or deletion operations. */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireInstalledCli } from './verify-command-parameters.mjs';
import { cleanupWorkspace } from './acceptance/cleanup.mjs';
import { redactEvidence } from './acceptance/evidence-redaction.mjs';
import { validateSuiteCases, writeSuiteCases } from './acceptance/protocol.mjs';
import { evaluateResourceSyncCase, initialResourceSyncCases, resourceSyncCases, resourceSyncProbeQualified, resourceSyncSdkProjection } from './acceptance/resource-sync-evidence.mjs';

const testRoot = fileURLToPath(new URL('.', import.meta.url));
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
class HarnessError extends Error { constructor(status, message) { super(message); this.status = status; } }
function snapshot(root) {
  const entries = [];
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const relative = path.relative(root, file).split(path.sep).join('/');
      const stat = lstatSync(file);
      if (stat.isDirectory()) { entries.push({ path: relative, kind: 'directory' }); walk(file); }
      else if (stat.isFile() && !stat.isSymbolicLink()) {
        const bytes = readFileSync(file);
        entries.push({ path: relative, kind: 'file', size: bytes.length, sha256: digest(bytes),
          ...(/^\.freelog\/[12]\.json$/u.test(relative) ? { utf8: bytes.toString('utf8') } : {}) });
      } else throw new HarnessError('FAIL', 'Unexpected link or special file in the owned sync fixture.');
    }
  }
  walk(root);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export async function runResourceSyncCases({ env = process.env, argv = process.argv.slice(2), output = env.FREELOG_TEST_SUITE_REPORT } = {}) {
  const cases = initialResourceSyncCases();
  const setup = { actions: [], originals: [], originalSdk: [] };
  const secrets = [];
  let installed, work, auth, sdk, helpers, active = 0, observed;
  const safe = (value) => redactEvidence(helpers ? helpers.redact(value) : value, secrets);
  const persist = () => {
    if (typeof output !== 'string' || !path.isAbsolute(output)) return;
    mkdirSync(path.dirname(output), { recursive: true });
    validateSuiteCases({ schemaVersion: 1, cases }, 'verify-resource-sync-json.mjs', resourceSyncCases);
    writeSuiteCases(cases, output);
  };
  const runCli = (label, args, input) => {
    let child;
    try { child = spawnSync(process.execPath, [installed.cliBin, ...args], { cwd: work, env, input,
      encoding: 'utf8', timeout: 60_000, maxBuffer: 2_000_000 }); }
    catch { child = { status: null, signal: null, error: { code: 'SPAWN_FAILED' } }; }
    return { label, argv: args.map((arg, index) => args[index - 1] === '--login-name' ? '<primary-login>' : arg),
      result: { status: child.status ?? null, signal: child.signal ?? null, error: child.error ? 'CLI process did not complete normally.' : null,
        timedOut: child.error?.code === 'ETIMEDOUT', stdout: safe(child.stdout ?? ''), stderr: safe(child.stderr ?? '') } };
  };
  const setupCommand = (label, args, input) => {
    const action = runCli(label, args, input); setup.actions.push(action);
    if (action.result.status !== 0 || action.result.signal || action.result.error || action.result.timedOut) {
      throw new HarnessError('FAIL', `Setup action ${label} failed; inspect its safe process evidence.`);
    }
  };
  const readSdk = async (resourceId) => {
    try { return resourceSyncSdkProjection(resourceId, await sdk.FServiceAPI.Resource.info({ resourceIdOrName: resourceId })); }
    catch (error) { return { kind: 'request-failed', requestedId: resourceId,
      httpStatus: Number.isInteger(error?.response?.status) ? error.response.status : null }; }
  };
  try {
    const args = argv.filter((arg) => arg !== '--skip-build');
    if (args.length && (args.length !== 2 || args[0] !== '--env' || args[1] !== 'dev')) throw new HarnessError('BLOCKED', 'This producer permits only --env dev; no build is performed.');
    if (typeof output !== 'string' || !path.isAbsolute(output) || !/^[A-Za-z0-9-]{1,80}$/u.test(env.FREELOG_TEST_RUN_ID ?? '')
      || env.FREELOG_TEST_RUN_ID !== process.env.FREELOG_TEST_RUN_ID) throw new HarnessError('BLOCKED', 'An absolute report path and the actual run-bound evidence ID are required.');
    try { installed = requireInstalledCli(env); } catch { throw new HarnessError('BLOCKED', 'A fixed installed candidate CLI is required; workspace fallback is forbidden.'); }
    const credentials = path.join(testRoot, '.freelog-test-credentials.local.json');
    const png = path.join(testRoot, 'fixtures/media/sample-image.png');
    if (!existsSync(credentials) || !existsSync(png)) throw new HarnessError('BLOCKED', 'The primary account fixture or real PNG fixture is unavailable.');
    let primary;
    try { primary = JSON.parse(readFileSync(credentials, 'utf8').replace(/^\uFEFF/u, '')).primary; }
    catch { throw new HarnessError('BLOCKED', 'The primary account fixture is invalid; its contents are not diagnostic evidence.'); }
    if (typeof primary?.loginName !== 'string' || !primary.loginName.startsWith('freelog') || typeof primary.password !== 'string' || !primary.password) {
      throw new HarnessError('BLOCKED', 'Only the authorized freelog primary account fixture is permitted.');
    }
    secrets.push(primary.password);
    helpers = await import('./dependency-declaration-helpers.mjs');
    sdk = await import('../packages/tools-lib/dist/node.mjs');
    work = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-resource-sync-')));
    setup.workspace = work; setup.installed = installed;
    cpSync(png, path.join(work, 'sync-a.png')); cpSync(png, path.join(work, 'sync-b.png'));
    setupCommand('login', ['login', '--login-name', primary.loginName, '--password-stdin', '--yes', '--env', 'dev'], `${primary.password}\n`);
    const selector = JSON.parse(readFileSync(path.join(work, '.freelog/auth'), 'utf8'));
    if (selector.schemaVersion !== 1 || selector.env !== 'dev' || !Number.isSafeInteger(selector.userId) || selector.userId <= 0
      || Object.keys(selector).some((key) => !['schemaVersion', 'credentialKey', 'env', 'userId', 'username', 'createdAt'].includes(key))) {
      throw new HarnessError('FAIL', 'The workspace login selector is not a valid non-secret dev owner reference.');
    }
    auth = { env: 'dev', userId: selector.userId };
    setup.auth = auth;
    await helpers.loginForApi(primary);
    setupCommand('init', ['init', '.', '--type', 'RT005001', '--artifact', 'sync-a.png', '--yes', '--env', 'dev']);
    const stamp = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
    for (let index = 0; index < 2; index += 1) {
      const shortName = `qa-sync-${stamp}-${index + 1}`;
      setupCommand(`create ${index + 1}`, ['create', '--title', shortName, '--name', shortName, '--type', 'RT005001',
        '--artifact', index ? 'sync-b.png' : 'sync-a.png', '--yes', '--env', 'dev']);
      const stateFile = `${index + 1}.json`;
      setup.originals.push({ stateFile, identity: JSON.parse(readFileSync(path.join(work, '.freelog', stateFile), 'utf8')) });
    }
    mkdirSync(path.join(work, 'keep-empty'));
    writeFileSync(path.join(work, '.freelog/sync-sentinel.txt'), 'Resource sync must preserve these exact bytes.\n');
    for (const item of setup.originals) setup.originalSdk.push(await readSdk(item.identity.resourceId));
    const baselineCheck = evaluateResourceSyncCase(resourceSyncCases[0].id, { auth, originals: setup.originals,
      originalSdk: setup.originalSdk, remoteBefore: setup.originalSdk }).assertions.find((item) => item.id === 'independent-sdk-baseline');
    if (!baselineCheck.passed) throw new HarnessError('FAIL', 'The initial independent SDK baseline is invalid; no sync or unavailable-ID lookup was issued.');
    for (active = 0; active < resourceSyncCases.length; active += 1) {
      const leaf = resourceSyncCases[active];
      observed = { ...installed, cwd: work, platform: process.platform, nodeVersion: process.version, auth,
        scope: leaf.technicalMapping.scope, setupActions: setup.actions, originals: setup.originals, originalSdk: setup.originalSdk,
        probes: [], argv: ['resource', 'sync', '--json', '--env', 'dev'], stdin: '', startedAt: new Date().toISOString() };
      for (let index = leaf.succeeded; index < 2; index += 1) {
        const resourceId = randomBytes(12).toString('hex');
        const lookup = await readSdk(resourceId);
        observed.probes.push({ stateFile: `${index + 1}.json`, resourceId, lookup });
        if (!resourceSyncProbeQualified(lookup)) throw new HarnessError('BLOCKED', 'The fixed random-ID lookup did not establish that no resource details were returned; preserve this sample without retrying or replacing it.');
      }
      for (let index = 0; index < 2; index += 1) {
        const original = setup.originals[index];
        writeFileSync(path.join(work, '.freelog', original.stateFile), `${JSON.stringify({ ...original.identity,
          resourceId: observed.probes.find((probe) => probe.stateFile === original.stateFile)?.resourceId ?? original.identity.resourceId,
          title: `qa-sync-stale-${leaf.stage}-${index + 1}` }, null, 2)}\n`);
      }
      observed.remoteBefore = await Promise.all(setup.originals.map((item) => readSdk(item.identity.resourceId)));
      observed.before = snapshot(work);
      const prerequisite = evaluateResourceSyncCase(leaf.id, observed).assertions.filter((item) => ['independent-sdk-baseline', 'stale-fixture'].includes(item.id));
      if (prerequisite.some((item) => !item.passed)) throw new HarnessError('FAIL', 'Independent SDK baseline or controlled stale fixture is invalid; no sync command was issued.');
      observed.result = runCli('resource sync', observed.argv, '').result;
      observed.after = snapshot(work);
      observed.remoteAfter = await Promise.all(setup.originals.map((item) => readSdk(item.identity.resourceId)));
      observed.finishedAt = new Date().toISOString();
      cases[active] = evaluateResourceSyncCase(leaf.id, observed);
      persist();
      if (cases[active].status !== 'PASS') break;
    }
    if (cases.every((item) => item.status === 'PASS')) {
      // All raw stage evidence has been persisted before any selector or project is removed.
      try {
        cleanupWorkspace(work, { success: true, prefixes: ['freelog-resource-sync-'], log: (line) => console.log(safe(line)), beforeRemove() {
          if (!existsSync(path.join(work, '.freelog/auth'))) return;
          const logout = runCli('logout local selector', ['logout', '--env', 'dev']);
          cases[2].observations.cleanup = logout;
          if (logout.result.status !== 0 || logout.result.signal || logout.result.error || logout.result.timedOut) throw new HarnessError('FAIL', 'Owned local logout did not complete.');
        } });
        cases[2].observations.cleanupResult = 'owned workspace removed; original remote shells retained';
      } catch { cases[2] = { ...cases[2], status: 'FAIL', reason: 'Owned-workspace cleanup failed after raw evidence was written; inspect and retain remaining local state.' }; }
    }
  } catch (error) {
    const index = Math.min(active, cases.length - 1);
    cases[index] = { id: cases[index].id, status: error instanceof HarnessError ? error.status : 'FAIL', assertions: [],
      reason: error instanceof HarnessError ? safe(error.message) : 'Sync acceptance apparatus failed; unknown exception details are withheld.',
      observations: observed ?? setup };
  }
  persist();
  if (work && cases.some((item) => item.status !== 'PASS')) console.log(safe(`RETAIN sync fixture: ${work}; created remote shells are retained without cleanup requests.`));
  return { cases, exitCode: cases.some((item) => item.status === 'FAIL') ? 1 : cases.some((item) => item.status !== 'PASS') ? 3 : 0 };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await runResourceSyncCases(); console.log(JSON.stringify({ producer: 'verify-resource-sync-json.mjs', cases: result.cases.map(({ id, status }) => ({ id, status })) })); process.exitCode = result.exitCode; }
  catch { console.error('Resource sync evidence could not be persisted; unknown diagnostic details are withheld.'); process.exitCode = 1; }
}
