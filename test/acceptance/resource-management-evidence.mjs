/** Fixed listing/shelf leaves, not the entire resource-management matrix. */
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import { lifecycleEvidence, loadConsoleRoundtripPrerequisite, consoleSdkObservation } from './console-roundtrip-evidence.mjs';
import { validateRetainedArtifact } from './lifecycle-artifact.mjs';

const design = 'docs/一期/产品方案/脚手架设计';
const assertionIds = Object.freeze(['lifecycle-prerequisite', 'owner-baseline', 'published-baseline', 'setup-command-binding',
  'bound-local-state', 'step-commands', 'step-process-output', 'remote-management-invariants', 'published-versions-unchanged', 'local-byte-invariants']);
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };
const scalar = (v) => v === null || v === undefined ? null : ['string', 'number', 'boolean'].includes(typeof v)
  ? v : { invalidType: Array.isArray(v) ? 'array' : typeof v };
const projection = (v, keys) => Object.fromEntries(keys.map((key) => [key, scalar(v?.[key])]));
const arrayScalars = (v) => Array.isArray(v) ? v.map(scalar) : scalar(v);
const strings = (v) => Array.isArray(v) && v.every((item) => typeof item === 'string');
const digestFormat = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v);
const remoteKeys = ['resourceId', 'resourceName', 'userId', 'resourceTypeCode', 'resourceType', 'resourceTitle', 'intro',
  'tags', 'coverImages', 'status', 'isFrozen', 'latestVersion', 'feedUrl', 'rssGuid', 'rssPubDate'];
export const resourceManagementCases = Object.freeze(['theme', 'image'].map((kind) => Object.freeze({
  id: `RESOURCE.MANAGEMENT.${kind === 'theme' ? 'THEME' : 'PNG'}_LISTING_SHELF`, resourceKind: kind,
  script: `verify-${kind}-resource-management.mjs`, kind: 'product-case', required: true, parentRule: 'RESOURCE.MANAGEMENT_MATRIX',
  title: `Published ${kind}: installed bind, exact listing edits and idempotent shelf changes`, assertionIds,
  layer: 'installed-candidate/real-dev-cli-and-independent-sdk', inputClass: 'single bound file:1.json; explicit flags, non-TTY, existing 1.0.0/1.1.0 and one enabled policy',
  preconditions: Object.freeze(['Same candidate/run lifecycle PASS, safe retained artifact and exact installed bin bytes.',
    'Primary dev owner must match resource ID/name; offline, non-RSS, non-frozen resource with an enabled policy.',
    'Fresh owned workspace, no resource-pool writes or fallback to old resources.']),
  action: Object.freeze(['login, bind by ID and repeat unchanged bind', 'reject empty, invalid tags with cover and absent confirmation',
    'edit full listing, repeat, edit intro, clear intro/tags, upload a PNG cover', 'validate, online twice, offline twice']),
  forbiddenSideEffects: Object.freeze(['prod/test/node access', 'contract signing/payment', 'remote deletion', 'version or policy mutation',
    'unknown-result retry', 'failed workspace cleanup', 'nonselected user-resource mutation']),
  designRefs: Object.freeze([
    { path: `${design}/ARCHITECTURE/04-bind.md`, section: '1–3 接入与幂等' },
    { path: `${design}/ARCHITECTURE/08-多资源本地状态、选择与产物路径.md`, section: '1/3.1/4 缓存、选择及副作用' },
    { path: `${design}/PHASE/单资源/管理/02-资源信息.md`, section: '0–6 资料、确认、读回及JSON' },
    { path: `${design}/PHASE/单资源/管理/05-上下架.md`, section: '0–4 门禁、幂等、确认、读回及JSON' },
  ].map(Object.freeze)),
  technicalMapping: Object.freeze({ info: 'FServiceAPI.Resource.info with latest/policy flags',
    versions: 'Resource.resourceVersionInfo1, same exact business projection as lifecycle/Console',
    scope: 'Whitelisted public management fields/policyId,policyName,status,policyText plus both published business versions, not all backend fields or HTTP request counts.' }),
})));

/** No arbitrary response objects, auth headers or unknown nested fields enter evidence. */
export function managementSdkProjection(response) {
  const data = plain(response?.data) ? response.data : null;
  return { ret: scalar(response?.ret), errCode: scalar(response?.errCode), data: data ? {
    ...projection(data, remoteKeys), ...Object.fromEntries(['resourceType', 'tags', 'coverImages'].map((k) => [k, arrayScalars(data[k])])), policies: Array.isArray(data.policies)
      ? data.policies.map((p) => projection(p, ['policyId', 'policyName', 'status', 'policyText'])) : null,
  } : null };
}
export function managementCommands(kind, resourceId) {
  const env = ['--env', 'dev'];
  const suffix = ['--resource', 'file:1.json', '--json', ...env];
  return [
    ['reject empty', ['update', '--yes', ...suffix], { code: 'UPDATE_NO_FLAGS', message: '请提供修改字段；交互编辑请在终端执行不带 --yes 的 update' }],
    ['reject invalid tags', ['update', '--cover', 'cover.png', '--tags', 'dup,dup', '--yes', ...suffix], { code: 'UPDATE_TAG_DUPLICATE', message: '该标签已添加' }],
    ['reject unconfirmed', ['update', '--intro', 'unconfirmed', ...suffix], { code: 'FORM_NEED_YES', message: '请加 --yes 确认预览' }],
    ['update full', ['update', '--title', `管理验收-${kind}`, '--intro', '管理验收简介', '--tags', '#验收,管理', '--yes', ...suffix]],
    ['update repeated', ['update', '--title', `管理验收-${kind}`, '--intro', '管理验收简介', '--tags', '#验收,管理', '--yes', ...suffix]],
    ['update intro', ['update', '--intro', '只修改简介', '--yes', ...suffix]],
    ['update clear', ['update', '--intro', '', '--tags', '', '--yes', ...suffix]],
    ['update cover', ['update', '--cover', 'cover.png', '--yes', ...suffix]],
    ['validate', ['validate', '--for', 'online', '--resource', 'file:1.json', ...env]],
    ['online', ['online', '--yes', ...suffix]], ['online repeated', ['online', '--yes', ...suffix]],
    ['offline', ['offline', '--yes', ...suffix]], ['offline repeated', ['offline', '--yes', ...suffix]],
  ].map(([label, argv, error]) => ({ label, argv, ...(error ? { error } : {}) }));
}
export function managementSetupCommands(kind, resourceId) {
  const env = ['--env', 'dev'];
  return [
    { label: 'login', argv: ['login', '--login-name', '<primary-login>', '--password-stdin', '--yes', ...env] },
    ...['bind', 'bind repeated'].map((label) => ({ label, argv: ['bind', resourceId, '--artifact', kind === 'theme' ? 'dist' : 'photo-v2.png', '--yes', ...env] })),
  ];
}
const processShape = (r) => ({ exitCode: r?.status ?? null, signal: r?.signal ?? null, error: r?.error ?? null, timedOut: r?.timedOut === true });
function identityAt(snapshot) { return json(snapshot?.find((e) => e.path === '.freelog/1.json')?.utf8); }
function validSnapshot(snapshot, kind) {
  const artifact = kind === 'theme' ? 'dist/index.html' : 'photo-v2.png';
  return Array.isArray(snapshot) && new Set(snapshot.map((e) => e.path)).size === snapshot.length
    && ['.freelog', '.freelog/1.json', '.freelog/auth', '.freelog/.sequence', 'cover.png', 'sentinel.txt', artifact].every((p) => snapshot.some((e) => e.path === p))
    && !snapshot.some((e) => /pending|\.version\.json|\.txn|\.transaction/u.test(e.path))
    && snapshot.filter((e) => /^\.freelog\/\d+\.json$/u.test(e.path)).length === 1
    && snapshot.every((e) => typeof e?.path === 'string' && (e.kind === 'directory' ? Object.keys(e).length === 2
      : e.kind === 'file' && Number.isSafeInteger(e.size) && e.size >= 0 && digestFormat(e.sha256)
        && (e.utf8 === undefined || typeof e.utf8 === 'string' && Buffer.byteLength(e.utf8) === e.size && sha256(e.utf8) === e.sha256)));
}
const sha256 = (v) => createHash('sha256').update(v).digest('hex');
export function validateManagementFiles(observed) {
  const loaded = loadConsoleRoundtripPrerequisite({ evidenceDir: observed.evidenceDir, runId: observed.runId,
    installed: { cliBin: observed.cliBin, binSha256: observed.binSha256 }, kind: observed.resourceKind });
  if (!isDeepStrictEqual(loaded.prerequisite, observed.prerequisite)) throw new Error('Management lifecycle prerequisite changed.');
  validateRetainedArtifact(loaded.source.retainedArtifact, { evidenceDir: observed.evidenceDir, runId: observed.runId });
  return true;
}

/** Check the current observations before allowing their command, not after its write. */
export function assertManagementBefore(id, observed) {
  const index = observed.steps.length - 1;
  if (index < 0 || index >= managementCommands(observed.resourceKind, observed.resourceId).length) throw new Error('Invalid current management step.');
  const checked = evaluateResourceManagementCase(id, observed);
  for (const key of ['remote-management-invariants', 'published-versions-unchanged', 'local-byte-invariants']) {
    const assertion = checked.assertions.find((a) => a.id === key);
    if (!assertion || !isDeepStrictEqual(assertion.expected[index]?.before, assertion.actual[index]?.before)) {
      throw new Error('Current management pre-snapshot differs; no CLI action is permitted.');
    }
  }
}

/** Recompute expected transitions from fixed design inputs, not the report's pass flags. */
export function evaluateResourceManagementCase(id, observed = {}) {
  const leaf = resourceManagementCases.find((c) => c.id === id);
  if (!leaf) throw new Error('Unknown resource management case.');
  const assertions = [];
  const check = (id, expected, actual) => assertions.push({ id, passed: isDeepStrictEqual(expected, actual), expected, actual });
  const prefix = lifecycleEvidence(observed);
  check('lifecycle-prerequisite', { issues: [], kind: leaf.resourceKind }, { issues: prefix.errors, kind: observed.resourceKind ?? null });
  const source = prefix.source;
  const remote = observed.baseline?.data;
  const user = observed.currentUser;
  const issues = [];
  if (!plain(remote) || observed.baseline?.ret !== 0 || observed.baseline?.errCode !== 0
    || !isDeepStrictEqual(observed.baseline, managementSdkProjection(observed.baseline))) issues.push('invalid projected resource envelope');
  if (user?.ret !== 0 || user?.errCode !== 0 || !Number.isSafeInteger(user?.data?.userId) || user.data.userId <= 0
    || typeof user?.data?.username !== 'string' || !user.data.username.startsWith('freelog')
    || !isDeepStrictEqual(observed.auth, { env: 'dev', userId: user?.data?.userId, username: user?.data?.username })) issues.push('invalid independent current dev user');
  if (remote?.resourceId !== source?.resourceId || remote?.resourceName !== source?.resourceName || remote?.userId !== user?.data?.userId
    || remote?.resourceName?.split('/')[0] !== user?.data?.username
    || !(remote?.resourceTypeCode === source?.typeCode || Array.isArray(remote?.resourceType) && remote.resourceType.includes(source?.typeCode))) issues.push('owner/resource/type differs');
  if (remote?.status !== 4 || remote?.isFrozen === true || remote?.latestVersion !== '1.1.0'
    || ['feedUrl', 'rssGuid', 'rssPubDate'].some((k) => typeof remote?.[k] === 'string' && remote[k].trim())
    || typeof remote?.resourceTitle !== 'string' || !remote.resourceTitle.trim() || typeof remote?.intro !== 'string'
    || !strings(remote?.tags) || !strings(remote?.coverImages)
    || !Array.isArray(remote?.policies) || !remote.policies.some((p) => p.status === 1 && typeof p.policyId === 'string' && p.policyId)) issues.push('listing/shelf prerequisite unavailable');
  check('owner-baseline', [], issues);
  const versions = (source?.versions ?? []).map(consoleSdkObservation);
  check('published-baseline', versions, observed.baselineVersions ?? null);
  const setup = Array.isArray(observed.setupActions) ? observed.setupActions : [];
  check('setup-command-binding', { commands: managementSetupCommands(leaf.resourceKind, observed.resourceId), processes: Array.from({ length: 3 }, () => ({ exitCode: 0, signal: null, error: null, timedOut: false, stderr: '' })),
    bindOutputs: ['bind 成功，可用 status 查看', 'bind 成功，可用 status 查看'] },
  { commands: setup.map(({ label, argv }) => ({ label, argv })), processes: setup.map(({ result }) => ({ ...processShape(result), stderr: result?.stderr ?? null })), bindOutputs: setup.slice(1).map((s) => s.result?.stdout?.trim() ?? null) });
  const initialIdentity = { schemaVersion: 1, subject: 'resource', env: 'dev', resourceId: observed.resourceId,
    resourceName: source?.resourceName ?? null, name: source?.resourceName?.split('/')[1] ?? null, title: remote?.resourceTitle ?? null,
    typeCode: source?.typeCode ?? null, filePath: leaf.resourceKind === 'theme' ? 'dist' : 'photo-v2.png' };
  const artifact = leaf.resourceKind === 'theme' ? 'dist' : 'photo-v2.png';
  const copiedManifest = (observed.boundSnapshot ?? []).filter((e) => e.path === artifact || e.path.startsWith(`${artifact}/`))
    .filter((e) => !(e.path === artifact && e.kind === 'directory')).map((e) => ({ path: leaf.resourceKind === 'theme' ? e.path.slice(artifact.length + 1) : '.',
      ...(leaf.resourceKind === 'theme' ? { kind: e.kind } : {}), ...(e.kind === 'file' ? { size: e.size, sha256: e.sha256 } : {}) }));
  check('bound-local-state', { identity: initialIdentity, repeat: observed.boundSnapshot ?? null, remote: observed.baseline ?? null, snapshot: 'valid',
    cliAuth: { schemaVersion: 1, ...observed.auth }, artifact: source?.retainedArtifact?.manifest ?? null },
    { identity: observed.boundIdentity ?? null, repeat: observed.repeatBindAfter ?? null, remote: observed.boundRemote ?? null,
      snapshot: validSnapshot(observed.boundSnapshot, leaf.resourceKind) && isDeepStrictEqual(identityAt(observed.boundSnapshot), initialIdentity)
        && isDeepStrictEqual(observed.repeatBindBefore, observed.boundSnapshot) ? 'valid' : 'invalid', cliAuth: observed.cliAuth ?? null, artifact: copiedManifest });
  const specs = managementCommands(leaf.resourceKind, observed.resourceId);
  const steps = Array.isArray(observed.steps) ? observed.steps : [];
  check('step-commands', specs.map(({ label, argv }) => ({ label, argv })), steps.map(({ label, argv }) => ({ label, argv })));
  const outputs = [], actualOutputs = [], expectedRemotes = [], actualRemotes = [], expectedLocals = [], actualLocals = [], versionActual = [];
  let expectedRemote = remote ? structuredClone(remote) : {};
  let expectedLocal = observed.boundSnapshot ?? [];
  for (const [index, spec] of specs.entries()) {
    const step = steps[index];
    const before = structuredClone(expectedRemote);
    if (spec.label === 'update full') { expectedRemote.resourceTitle = `管理验收-${leaf.resourceKind}`; expectedRemote.intro = '管理验收简介'; expectedRemote.tags = ['验收', '管理']; }
    if (spec.label === 'update intro') expectedRemote.intro = '只修改简介';
    if (spec.label === 'update clear') { expectedRemote.intro = ''; expectedRemote.tags = []; }
    if (spec.label === 'update cover') {
      const urls = step?.remoteAfter?.data?.coverImages;
      expectedRemote.coverImages = strings(urls) && urls.length === 1 && /^https:\/\/[^/\s]+\/.+/u.test(urls[0]) ? urls : ['<one-valid-HTTPS-cover-URL>'];
    }
    if (spec.label.startsWith('online')) expectedRemote.status = 1;
    if (spec.label.startsWith('offline')) expectedRemote.status = 4;
    const listing = { resourceName: expectedRemote.resourceName ?? null, title: expectedRemote.resourceTitle ?? null,
      intro: expectedRemote.intro ?? null, tags: expectedRemote.tags ?? null, coverImages: expectedRemote.coverImages ?? null, status: expectedRemote.status ?? null };
    const stdout = spec.error ?? (spec.label === 'validate' ? '可以上架' : spec.label.startsWith('update')
      ? { resourceId: observed.resourceId, changed: spec.label !== 'update repeated', listing }
      : { resourceId: observed.resourceId, status: expectedRemote.status, changed: !spec.label.endsWith(' repeated') });
    outputs.push({ label: spec.label, exitCode: spec.error ? 1 : 0, signal: null, error: null, timedOut: false, stdout, stderr: '' });
    actualOutputs.push({ label: step?.label ?? null, ...processShape(step?.result),
      stdout: spec.label === 'validate' ? step?.result?.stdout?.trim() ?? null : json(step?.result?.stdout), stderr: step?.result?.stderr ?? null });
    expectedRemotes.push({ label: spec.label, before: { ret: 0, errCode: 0, data: before }, after: { ret: 0, errCode: 0, data: structuredClone(expectedRemote) } });
    actualRemotes.push({ label: step?.label ?? null, before: step?.remoteBefore ?? null, after: step?.remoteAfter ?? null });
    const previousLocal = expectedLocal;
    if (spec.label === 'update full') {
      expectedLocal = (step?.after ?? []).filter((e) => e.path === '.freelog/1.json').length === 1
        ? previousLocal.map((e) => e.path === '.freelog/1.json' ? step.after.find((x) => x.path === e.path) : e) : [];
    }
    expectedLocals.push({ label: spec.label, before: previousLocal, after: expectedLocal, identity: { ...initialIdentity, ...(index >= 3 ? { title: `管理验收-${leaf.resourceKind}` } : {}) }, snapshots: 'valid' });
    actualLocals.push({ label: step?.label ?? null, before: step?.before ?? null, after: step?.after ?? null, identity: identityAt(step?.after),
      snapshots: validSnapshot(step?.before, leaf.resourceKind) && validSnapshot(step?.after, leaf.resourceKind) ? 'valid' : 'invalid' });
    versionActual.push({ before: step?.versionsBefore ?? null, after: step?.versionsAfter ?? null });
  }
  check('step-process-output', outputs, actualOutputs);
  check('remote-management-invariants', expectedRemotes, actualRemotes);
  check('published-versions-unchanged', specs.map(() => ({ before: versions, after: versions })), versionActual);
  check('local-byte-invariants', expectedLocals, actualLocals);
  const failed = assertions.filter((a) => !a.passed);
  return { id, status: failed.length ? 'FAIL' : 'PASS', assertions, observations: observed,
    ...(failed.length ? { reason: `Resource management evidence differs: ${failed.map((a) => a.id).join(', ')}` } : {}) };
}
