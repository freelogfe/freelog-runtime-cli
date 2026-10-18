/** Three fixed sync DTO leaves. The wider resource-management obligation remains unresolved. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const design = 'docs/一期/产品方案/脚手架设计/ARCHITECTURE';
const assertions = Object.freeze(['setup-command-binding', 'command-input', 'process-result', 'stdout-dto', 'stderr-empty',
  'independent-sdk-baseline', 'stale-fixture', 'local-title-only', 'remote-unchanged']);
const files = ['1.json', '2.json'];
const artifacts = ['sync-a.png', 'sync-b.png'];
export const resourceSyncCases = Object.freeze(['ALL_SUCCESS', 'PARTIAL_FAILURE', 'ALL_FAILURE'].map((stage, index) => Object.freeze({
  id: `RESOURCE.SYNC.JSON.${stage}`, stage, succeeded: 2 - index,
  kind: 'product-case', required: true, parentRule: 'RESOURCE.MANAGEMENT_MATRIX', script: 'verify-resource-sync-json.mjs',
  title: `Two isolated resource title caches: ${stage.toLowerCase().replaceAll('_', ' ')}`,
  layer: 'installed-candidate/real-dev-cli-and-independent-sdk', assertionIds: assertions,
  inputClass: index === 0 ? 'two real bound IDs and two genuinely stale cache titles'
    : `two stale titles; ${index} controlled local IDs replaced with preobserved unavailable random IDs`,
  preconditions: Object.freeze(['Use only dev, a fixed installed candidate and the authorized freelog primary account.',
    'Create two fresh ordinary PNG resource shells in a new owned project; never bind or mutate pool resources.',
    'Independently check successful ret=0/errCode=0 SDK envelopes, matching IDs, selector owner, title and numeric status.',
    'Qualify random fault IDs only by HTTP 404 or ret=0/errCode=0 with dataShape=null and data=null; any other result stops without replacing the sample.']),
  action: Object.freeze(['Initialize the first artifact, create two shells with distinct artifact anchors, and retain their IDs.',
    'Before each stage restore only owned identities, set fixed stale titles and inject only the designated unavailable local IDs.',
    'Snapshot the full project, execute resource sync --json --env dev once, snapshot again and reread both original remote resources.']),
  forbiddenSideEffects: Object.freeze(['prod or test requests', 'pool mutation', 'publishing a version or policy', 'shelf changes',
    'remote deletion', 'contract signing/payment', 'retrying a failed request', 'cleaning a failed/incomplete project', 'global logout']),
  designRefs: Object.freeze([
    Object.freeze({ path: `${design}/08-多资源本地状态、选择与产物路径.md`, section: '4.1 标题同步的边界与失败 / 4.2 标题同步的机器结果' }),
    Object.freeze({ path: `${design}/01-账号.md`, section: '2.1 秘密 / resource sync具名批次例外 / 2.2 非秘密选择器' }),
  ]),
  technicalMapping: Object.freeze({ api: 'FServiceAPI.Resource.info after existing loginForApi dev configuration',
    scope: 'SDK evidence projects envelope shape and only resourceId/userId/resourceTitle/status; unchanged does not mean the full remote object is unchanged.',
    fixture: 'Random IDs with no resource details returned are injected only into this owned fixture; this is not a user recovery procedure. Qualification is HTTP 404 or ret=0/errCode=0/dataShape=null/data=null, not an inferred backend not-exists code.',
    fixtureBasis: 'Independent dev SDK Resource.info random-24hex read at 2026-10-16T22:18:37.783Z observed ret=0, errCode=0, data=null without HTTP exception; this single shape observation does not establish other HTTP or business-error meanings.' }),
})));

export function initialResourceSyncCases() {
  return resourceSyncCases.map(({ id }) => ({ id, status: 'NOT_TESTED', assertions: [], reason: 'This ordered stage has not executed in this run.' }));
}

/** Keep malformed shape evidence without copying HTTP errors, headers or arbitrary nested response fields. */
export function resourceSyncSdkProjection(requestedId, response) {
  const shape = (value) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  const scalar = (value) => value === undefined ? null : value && typeof value === 'object' ? { invalidType: shape(value) } : value;
  const data = response?.data;
  return { kind: 'response', requestedId, envelope: { ret: scalar(response?.ret), errCode: scalar(response?.errCode),
    dataShape: shape(data), data: shape(data) === 'object' ? Object.fromEntries(['resourceId', 'userId', 'resourceTitle', 'status'].map((key) => [key, scalar(data[key])])) : null } };
}

export function resourceSyncProbeError(lookup) {
  if (lookup?.kind === 'request-failed' && Number.isInteger(lookup.httpStatus) && lookup.httpStatus >= 400 && lookup.httpStatus <= 599) {
    return { code: 'RESOURCE_SYNC_REQUEST_FAILED', message: '请求失败' };
  }
  if (lookup?.kind === 'response' && (lookup.envelope?.ret !== 0 || lookup.envelope?.errCode !== 0
    || lookup.envelope?.dataShape !== 'object' || !lookup.envelope?.data || Array.isArray(lookup.envelope.data))) {
    return { code: 'RESOURCE_SYNC_RESPONSE_INVALID', message: '平台详情响应不是成功信封或缺少有效对象' };
  }
  return null;
}

/** Qualify the controlled fixture narrowly; mapping a request error does not prove absent details. */
export function resourceSyncProbeQualified(lookup) {
  return lookup?.kind === 'request-failed' && lookup.httpStatus === 404
    || lookup?.kind === 'response' && lookup.envelope?.ret === 0 && lookup.envelope?.errCode === 0
      && lookup.envelope?.dataShape === 'null' && lookup.envelope?.data === null;
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const title = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 100;
function identityAt(snapshot, stateFile) {
  try { const value = JSON.parse(snapshot.find((entry) => entry.path === `.freelog/${stateFile}`).utf8); return object(value) ? value : null; }
  catch { return null; }
}
function validSnapshot(snapshot) {
  return Array.isArray(snapshot) && new Set(snapshot.map((entry) => entry?.path)).size === snapshot.length
    && ['.freelog/auth', '.freelog/sync-sentinel.txt', 'keep-empty', ...artifacts, ...files.map((file) => `.freelog/${file}`)].every((name) => snapshot.some((entry) => entry.path === name))
    && snapshot.filter((entry) => /^\.freelog\/\d+\.json$/u.test(entry.path)).length === 2
    && snapshot.every((entry) => typeof entry?.path === 'string' && entry.path.length > 0
      && (entry.kind === 'directory' ? Object.keys(entry).length === 2 : entry.kind === 'file'
        && Number.isInteger(entry.size) && entry.size >= 0 && /^[a-f0-9]{64}$/u.test(entry.sha256 ?? '')
        && (entry.utf8 === undefined || typeof entry.utf8 === 'string' && entry.size === Buffer.byteLength(entry.utf8) && entry.sha256 === hash(entry.utf8))))
    && files.every((file) => identityAt(snapshot, file))
    && !snapshot.some((entry) => /pending|\.txn|\.transaction/u.test(entry.path));
}

/** Rebuild all expected DTO/state facts from source constants, independent SDK observations and exact local bytes. */
export function evaluateResourceSyncCase(id, observed) {
  const leaf = resourceSyncCases.find((item) => item.id === id);
  if (!leaf) throw new Error('Unknown resource sync case.');
  const original = Array.isArray(observed.originals) ? observed.originals : [];
  const baseline = Array.isArray(observed.originalSdk) ? observed.originalSdk : [];
  const probes = Array.isArray(observed.probes) ? observed.probes : [];
  const before = Array.isArray(observed.before) ? observed.before : [];
  const after = Array.isArray(observed.after) ? observed.after : [];
  const sdkIssues = [];
  if (observed.auth?.env !== 'dev' || !Number.isSafeInteger(observed.auth?.userId) || observed.auth.userId <= 0) sdkIssues.push('invalid non-secret dev owner selector');
  if (original.length !== 2 || baseline.length !== 2 || new Set(original.map((item) => item?.identity?.resourceId)).size !== 2) sdkIssues.push('exactly two original resources required');
  for (let index = 0; index < 2; index += 1) {
    const local = original[index]?.identity;
    const remote = baseline[index];
    const data = remote?.envelope?.data;
    if (original[index]?.stateFile !== files[index] || local?.schemaVersion !== 1 || local?.subject !== 'resource' || local?.env !== 'dev'
      || local?.typeCode !== 'RT005001' || local?.filePath !== artifacts[index] || !/^[a-f0-9]{24}$/u.test(local?.resourceId ?? '')
      || !title(local?.title) || typeof local?.resourceName !== 'string' || !local.resourceName) sdkIssues.push(`invalid original ${files[index]}`);
    if (remote?.kind !== 'response' || remote.requestedId !== local?.resourceId || remote.envelope?.ret !== 0 || remote.envelope?.errCode !== 0
      || remote.envelope?.dataShape !== 'object' || !object(data) || data.resourceId !== local?.resourceId || data.userId !== observed.auth?.userId
      || data.resourceTitle !== local?.title || !title(data.resourceTitle) || !Number.isInteger(data.status)) sdkIssues.push(`invalid independent SDK baseline ${files[index]}`);
  }
  const fixtureIssues = [];
  if (probes.length !== 2 - leaf.succeeded) fixtureIssues.push('wrong unavailable-ID probe count');
  const expectedBefore = [];
  const results = [];
  for (let index = 0; index < 2; index += 1) {
    const stateFile = files[index];
    const succeeded = index < leaf.succeeded;
    const probe = probes.find((item) => item.stateFile === stateFile);
    const resourceId = succeeded ? original[index]?.identity?.resourceId : probe?.resourceId;
    const error = succeeded ? null : resourceSyncProbeError(probe?.lookup);
    if (!succeeded && (!/^[a-f0-9]{24}$/u.test(resourceId ?? '') || original.some((item) => item.identity?.resourceId === resourceId)
      || probe?.lookup?.requestedId !== resourceId || !resourceSyncProbeQualified(probe?.lookup) || !error)) fixtureIssues.push(`unproven missing-detail ID ${stateFile}`);
    if (succeeded && probe) fixtureIssues.push(`unexpected probe ${stateFile}`);
    expectedBefore.push({ ...original[index]?.identity, resourceId: resourceId ?? null, title: `qa-sync-stale-${leaf.stage}-${index + 1}` });
    if (identityAt(before, stateFile)?.title === baseline[index]?.envelope?.data?.resourceTitle) fixtureIssues.push(`cache title is not stale ${stateFile}`);
    results.push({ stateFile, resourceId: resourceId ?? null, ...(succeeded ? { status: 'synced', title: baseline[index]?.envelope?.data?.resourceTitle ?? null }
      : { status: 'failed', error: error ?? { invalidProbe: true } }) });
  }
  if (new Set(expectedBefore.map((item) => item.resourceId)).size !== 2) fixtureIssues.push('duplicate fixture IDs');
  let dto;
  try { dto = JSON.parse(observed.result?.stdout); } catch { dto = { invalidJson: true }; }
  const changedFiles = files.slice(0, leaf.succeeded).map((name) => `.freelog/${name}`);
  const expectedAfter = expectedBefore.map((item, index) => index < leaf.succeeded ? { ...item, title: baseline[index]?.envelope?.data?.resourceTitle ?? null } : item);
  const child = observed.result ?? {};
  // The two live IDs must come from the successful installed-CLI setup, not a relabelled
  // --help call or an unrelated saved identity. Login input itself is never retained.
  const setup = Array.isArray(observed.setupActions) ? observed.setupActions : [];
  const setupCommands = [
    { label: 'login', argv: ['login', '--login-name', '<primary-login>', '--password-stdin', '--yes', '--env', 'dev'] },
    { label: 'init', argv: ['init', '.', '--type', 'RT005001', '--artifact', 'sync-a.png', '--yes', '--env', 'dev'] },
    ...original.map(({ identity }, index) => ({ label: `create ${index + 1}`, argv: ['create', '--title', identity.title,
      '--name', identity.name, '--type', 'RT005001', '--artifact', artifacts[index], '--yes', '--env', 'dev'] })),
  ];
  const setupProcess = setup.map(({ result = {} }) => ({ exitCode: result.status ?? null, signal: result.signal ?? null,
    error: result.error ?? null, timedOut: result.timedOut === true, stderr: result.stderr ?? null }));
  const pairs = [
    ['setup-command-binding', { commands: setupCommands, processes: Array.from({ length: 4 }, () => ({ exitCode: 0, signal: null, error: null, timedOut: false, stderr: '' })),
      createdIds: original.map(({ identity }) => identity.resourceId) },
    { commands: setup.map(({ label, argv }) => ({ label, argv })), processes: setupProcess,
      createdIds: setup.slice(2).map(({ result }) => typeof result?.stdout === 'string' ? result.stdout.trim() : null) }],
    ['command-input', { argv: ['resource', 'sync', '--json', '--env', 'dev'], stdin: '' }, { argv: observed.argv ?? null, stdin: observed.stdin ?? null }],
    ['process-result', { exitCode: leaf.succeeded === 2 ? 0 : 1, signal: null, error: null, timedOut: false },
      { exitCode: child.status ?? null, signal: child.signal ?? null, error: child.error ?? null, timedOut: child.timedOut === true }],
    ['stdout-dto', { schemaVersion: 1, env: 'dev', summary: { total: 2, succeeded: leaf.succeeded, failed: 2 - leaf.succeeded }, results }, dto],
    ['stderr-empty', '', child.stderr ?? null],
    ['independent-sdk-baseline', { issues: [], envelopes: baseline }, { issues: sdkIssues, envelopes: observed.remoteBefore ?? null }],
    ['stale-fixture', { issues: [], identities: expectedBefore }, { issues: fixtureIssues, identities: files.map((file) => identityAt(before, file)) }],
    ['local-title-only', { snapshot: 'complete-and-consistent', identities: expectedAfter, unchanged: before.filter((entry) => !changedFiles.includes(entry.path)) },
      { snapshot: validSnapshot(before) && validSnapshot(after) ? 'complete-and-consistent' : 'invalid', identities: files.map((file) => identityAt(after, file)), unchanged: after.filter((entry) => !changedFiles.includes(entry.path)) }],
    ['remote-unchanged', baseline, observed.remoteAfter ?? null],
  ];
  const evaluated = pairs.map(([id, expected, actual]) => ({ id, passed: isDeepStrictEqual(expected, actual), expected, actual }));
  const failed = evaluated.filter((item) => !item.passed);
  return { id, status: failed.length ? 'FAIL' : 'PASS', assertions: evaluated, observations: observed,
    ...(failed.length ? { reason: `Resource sync evidence mismatched: ${failed.map((item) => item.id).join(', ')}` } : {}) };
}
