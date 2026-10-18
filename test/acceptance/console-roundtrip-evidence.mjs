/** Source-bound evidence for two published-version round trips, not the entire interop matrices. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { evaluateVersionLifecycle, versionLifecycleCases } from './version-lifecycle-evidence.mjs';
import { validateRetainedArtifact } from './lifecycle-artifact.mjs';
import { projectConsoleBrowserCapture } from './console-browser-capture.mjs';

const design = 'docs/一期/产品方案/脚手架设计';
const stages = Object.freeze(['view-first', 'view-updated', 'edit-description', 'edit-text-option']);
export const consoleRoundtripTiming = Object.freeze({ totalMs: 1_200_000, browserMs: 300_000, sdkMs: 30_000, cliMs: 60_000 });
const forwardAssertions = ['lifecycle-prerequisite', 'owner-identity', 'dependency-identity', 'browser-binding', 'browser-fields', 'sdk-stage-invariants'];
const reverseAssertions = [...forwardAssertions, 'reverse-commands', 'bound-identity', 'pull-inheritance', 'edited-draft', 'raw-cli-readback', 'published-version', 'artifact-anchor', 'old-versions-unchanged', 'local-finalization'];
export const consoleRoundtripCases = Object.freeze(['forward', 'reverse'].flatMap((direction) => ['theme', 'image'].map((resourceKind) => Object.freeze({
  id: `INTEROP.${direction === 'forward' ? 'CLI_TO_CONSOLE' : 'CONSOLE_TO_CLI'}.${resourceKind === 'theme' ? 'THEME' : 'PNG'}_PUBLISHED`,
  kind: 'product-case', required: true, direction, resourceKind, parentRule: direction === 'forward' ? 'INTEROP.CLI_TO_CONSOLE' : 'INTEROP.CONSOLE_TO_CLI',
  script: 'verify-console-roundtrip.mjs', assertionIds: Object.freeze(direction === 'forward' ? forwardAssertions : reverseAssertions),
  title: `${resourceKind}: ${direction === 'forward' ? 'CLI 1.0.0/1.1.0 visible published forms and exact web saves' : 'web-saved 1.1.0 through CLI bind/pull/edit/1.2.0'}`,
  layer: 'installed-candidate/real-dev/actual-browser-visible-controls/independent-sdk',
  inputClass: `${resourceKind === 'theme' ? 'RT001 directory with bundleTool=vite and noderuntime_target_version=0.5' : 'RT005001 ordinary PNG with no system additional values'}; same-run isolated lifecycle resource`,
  preconditions: Object.freeze(['A fixed installed candidate and the dev primary account; no workspace fallback.',
    'The same run must have a source-revalidated PASS lifecycle chain for this exact resource/bin, including 1.0.0/1.1.0 and a retained updated artifact.',
    'An actual browser operator must return fresh nonce-bound visible-page/control captures; API data is never a browser observation.',
    'The authorized primary account must own this newly created resource; pool targets remain read-only.']),
  action: Object.freeze(direction === 'forward' ? ['Visit published 1.0.0 and 1.1.0 pages; inspect full visible custom/optional forms, defaults/remarks/order, SHA/name, additional values, dependency title/owner/range and description.',
    'Save an exact single-paragraph web description, then edit only text default/remark through the real UI. Independently read the full business DTO before/after each step.']
    : ['After the exact forward chain succeeds, copy only its retained artifact into a fresh temporary project, login, bind and pull published 1.1.0.',
      'Read inherited draft, edit author and description via CLI, publish explicit 1.2.0 using the ordinary upload/analyze path; --reuse-version selects the source only.',
      'Read exact CLI stdout and independent SDK result, both old versions and local finalization. Persist before owned-workspace logout/cleanup.']),
  forbiddenSideEffects: Object.freeze(['prod/test node access', 'pool mutation', 'payment or signing', 'remote deletion', 'automatic retry of unknown writes',
    'API simulation of browser actions', 'reading browser private store/tokens', 'editing a different resource/version', 'cleaning a failed or pending project']),
  designRefs: Object.freeze([{ path: `${design}/ARCHITECTURE/05-版本工作稿与独立命令.md`, section: '2.1 拉线上某一号盖进缓存 / 4. 提交' },
    { path: `${design}/ARCHITECTURE/06-发行物与压缩.md`, section: '2. 什么时候打 zip / 3.1 发版怎么定路径' },
    { path: `${design}/PHASE/单资源/版本表单/01-属性.md`, section: '系统附加 / 自定义属性 / 提交映射' },
    { path: `${design}/PHASE/单资源/版本表单/02-可选配置.md`, section: '文本默认值 / 下拉首项默认 / 提交映射' },
    { path: `${design}/PHASE/单资源/版本表单/03-依赖.md`, section: '版本范围 / 提交 / 更新版本' },
    { path: 'test/DEV-全流程测试计划.md', section: '7.2 Console双向已发布版本切片' }].map(Object.freeze)),
  technicalMapping: Object.freeze({ console: 'Console db7181ff published /resource/sidebar/versionInfo/:id?version=; never versionCreator or its browser draft',
    readApi: 'tools-lib Resource.resourceVersionInfo1, Resource.info (resource/dependency identity and title), User.currentUserInfo (owner guard)',
    scope: 'UI proves only displayed values, control fields, address/SHA/name and dependency title/owner/range. Full versionProperty, storage HTML and hidden IDs are independently proved by SDK and subsequent CLI pull, not invented as UI values.' }),
}))));

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
const absolute = (value) => typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value;
const sourcePath = (kind) => kind === 'theme' ? 'dist' : 'photo-v2.png';
function kindOf(id) {
  const leaf = consoleRoundtripCases.find((item) => item.id === id);
  if (!leaf) throw new Error('Unknown Console roundtrip leaf.');
  return leaf;
}
export function initialConsoleRoundtripCases(reason = 'This direction/type has not executed in this run.', status = 'NOT_TESTED') {
  return consoleRoundtripCases.map(({ id }) => ({ id, status, reason, assertions: [] }));
}
function descriptorProjection(items) {
  return Array.isArray(items) ? items.map((item) => Object.fromEntries(['key', 'name', 'type', 'defaultValue', 'remark', 'candidateItems'].map((key) => [key, item?.[key] ?? null]))) : null;
}
/** Explicit business projection: preserves descriptor/candidate/dependency order and the whole property map. */
export function consoleVersionProjection(value) {
  return { ...Object.fromEntries(['resourceId', 'resourceTypeCode', 'version', 'fileSha1', 'filename', 'description'].map((key) => [key, value?.[key] ?? null])),
    customPropertyDescriptors: descriptorProjection(value?.customPropertyDescriptors),
    systemAdditional: Array.isArray(value?.systemAdditional) ? clone(value.systemAdditional) : Array.isArray(value?.systemPropertyDescriptors)
      ? value.systemPropertyDescriptors.filter((item) => item?.insertMode === 2).map(({ key, insertMode, valueDisplay }) => ({ key, insertMode, valueDisplay })) : null,
    dependencies: Array.isArray(value?.dependencies) ? value.dependencies.map((item) => ({ resourceId: item?.resourceId ?? null, versionRange: item?.versionRange ?? null })) : null,
    versionProperty: object(value?.versionProperty) ? clone(value.versionProperty) : null };
}
export function consoleSdkObservation(value) {
  return { ret: 0, errCode: 0, data: consoleVersionProjection(value) };
}
export function projectConsoleSdkResponse(response) {
  return { ret: response?.ret ?? null, errCode: response?.errCode ?? null, data: object(response?.data) ? consoleVersionProjection(response.data) : null };
}
/** User and resource read DTOs have different names; do not invent a userName alias for username. */
export function projectConsoleOwner(current, resource) {
  const scalar = (value) => value === undefined || value === null ? null : ['string', 'number', 'boolean'].includes(typeof value)
    ? value : { invalidType: Array.isArray(value) ? 'array' : typeof value };
  return {
    currentUser: { ret: scalar(current?.ret), errCode: scalar(current?.errCode), data: { userId: scalar(current?.data?.userId), username: scalar(current?.data?.username) } },
    resource: { ret: scalar(resource?.ret), errCode: scalar(resource?.errCode), data: { resourceId: scalar(resource?.data?.resourceId),
      resourceName: scalar(resource?.data?.resourceName), userId: scalar(resource?.data?.userId) } },
  };
}
export function expectedConsoleStageVersion(kind, stage, versions) {
  const value = consoleVersionProjection(versions?.[stage === 'view-first' ? 0 : 1]);
  if (['edit-description', 'edit-text-option'].includes(stage)) value.description = `<p>${kind} 网页描述</p>`;
  if (stage === 'edit-text-option' && Array.isArray(value.customPropertyDescriptors)) {
    const item = value.customPropertyDescriptors.find((entry) => entry.key === `qa${kind}Text`);
    if (item) { item.defaultValue = `${kind}-console-text`; item.remark = '网页文本说明'; }
    if (object(value.versionProperty)) value.versionProperty[`qa${kind}Text`] = `${kind}-console-text`;
  }
  return value;
}
export function expectedConsoleEditedVersion(kind, versions) {
  const value = expectedConsoleStageVersion(kind, 'edit-text-option', versions);
  value.description = `<p>${kind} 网页描述</p><p>CLI 继承确认</p>`;
  const author = value.customPropertyDescriptors?.find((entry) => entry.key === `qa${kind}Author`);
  if (author) author.defaultValue = `${kind}-third`;
  if (object(value.versionProperty)) value.versionProperty[`qa${kind}Author`] = `${kind}-third`;
  return value;
}
export function expectedConsolePublishedVersion(kind, versions, artifact) {
  return { ...expectedConsoleEditedVersion(kind, versions), version: '1.2.0', fileSha1: artifact?.fileSha1 ?? null, filename: artifact?.filename ?? null };
}
/** Only source-known paragraph text is mapped; no general HTML equivalence/whitespace normalization. */
export function consoleVisibleProjection(version, dependencyIdentity) {
  const value = consoleVersionProjection(version);
  const kind = value.resourceTypeCode === 'RT001' ? 'theme' : 'image';
  const descriptionText = value.description === `<p>${kind} 网页描述</p>` ? `${kind} 网页描述` : value.description;
  return { resourceId: value.resourceId, version: value.version, fileSha1: value.fileSha1, filename: value.filename,
    descriptionText, customPropertyDescriptors: Array.isArray(value.customPropertyDescriptors) ? value.customPropertyDescriptors.map((item) => ({
      key: item.key, name: item.name, type: item.type === 'readonlyText' ? '自定义属性' : item.type === 'editableText' ? '文本输入框' : '下拉列表',
      defaultValue: item.defaultValue, remark: item.remark, ...(item.type === 'select' ? { candidateItems: item.candidateItems } : {}),
    })) : null,
    systemAdditional: Array.isArray(value.systemAdditional) ? value.systemAdditional.map(({ key, valueDisplay }) => ({ key, value: valueDisplay })) : null,
    dependencies: Array.isArray(value.dependencies) ? value.dependencies.map(({ versionRange }) => ({ title: dependencyIdentity?.resourceTitle ?? null,
      owner: typeof dependencyIdentity?.resourceName === 'string' ? dependencyIdentity.resourceName.split('/')[0] : null, versionRange })) : null };
}
/** Each expected leaf has a matching actual control/text reading; empty arrays/strings must be read explicitly too. */
export function consoleVisibleReadings(value, prefix = '') {
  if (Array.isArray(value)) return value.length ? value.flatMap((entry, index) => consoleVisibleReadings(entry, `${prefix}[${index}]`)) : [{ field: prefix, value: [] }];
  if (object(value)) return Object.entries(value).flatMap(([key, entry]) => consoleVisibleReadings(entry, prefix ? `${prefix}.${key}` : key));
  return [{ field: prefix, value }];
}
export function consoleCaptureRequest({ runId, cliBin, binSha256, resourceId, resourceKind, stage, nonce, requestedAt, deadlineAt }) {
  const version = stage === 'view-first' ? '1.0.0' : '1.1.0';
  return { schemaVersion: 1, runId, nonce, cliBin, binSha256, resourceId, resourceKind, version, stage, requestedAt,
    expiresAt: new Date(Math.min(Date.parse(requestedAt) + consoleRoundtripTiming.browserMs,
      Number.isFinite(Date.parse(deadlineAt)) ? Date.parse(deadlineAt) : Infinity)).toISOString(),
    url: `https://console.devfreelog.com/resource/sidebar/versionInfo/${resourceId}?version=${version}`,
    mutation: stage === 'edit-description' ? { descriptionText: `${resourceKind} 网页描述`, expectedStoredDescription: `<p>${resourceKind} 网页描述</p>` }
      : stage === 'edit-text-option' ? { key: `qa${resourceKind}Text`, defaultValue: `${resourceKind}-console-text`, remark: '网页文本说明' } : null };
}
export function consoleReverseCommands(kind, resourceId) {
  const env = ['--env', 'dev'];
  return [['login', ['login', '--login-name', '<primary-login>', '--password-stdin', '--yes', ...env]],
    ['bind', ['bind', resourceId, '--artifact', sourcePath(kind), '--yes', ...env]],
    ['draft pull 1.1.0', ['version', 'draft', 'pull', '--version', '1.1.0', '--yes', ...env]],
    ['author set', ['version', 'attr', 'set', `键=qa${kind}Author 值=${kind}-third`, '--yes', ...env]],
    ['description set', ['version', 'draft', 'description', '--description', `<p>${kind} 网页描述</p><p>CLI 继承确认</p>`, ...env]],
    ['update-version 1.2.0', ['update-version', '--version', '1.2.0', '--reuse-version', '1.1.0', '--yes', ...env]],
    ['version show 1.2.0', ['version', 'show', '--version', '1.2.0', ...env]],
  ].map(([label, argv]) => ({ label, argv }));
}
export function consoleDraftProjection(draft) {
  return { ...Object.fromEntries(['draftKind', 'fromVersion', 'resourceId', 'resourceTypeCode', 'fileSha1', 'filename', 'description'].map((key) => [key, draft?.[key] ?? null])),
    customPropertyDescriptors: descriptorProjection(draft?.customPropertyDescriptors),
    dependencies: Array.isArray(draft?.dependencies) ? draft.dependencies.map(({ resourceId, versionRange }) => ({ resourceId, versionRange })) : null,
    ...Object.fromEntries(['inputAttrs', 'orphanedInputAttrs', 'baseUpcastResources', 'authExcludedItems'].map((key) => [key, draft?.[key] ?? null])) };
}
export function expectedConsoleDraft(kind, version) {
  const value = consoleVersionProjection(version);
  return { draftKind: 'update', fromVersion: '1.1.0', resourceId: value.resourceId, resourceTypeCode: value.resourceTypeCode,
    fileSha1: value.fileSha1, filename: value.filename, description: value.description,
    customPropertyDescriptors: value.customPropertyDescriptors, dependencies: value.dependencies,
    inputAttrs: kind === 'theme' ? [{ key: 'bundleTool', value: 'vite' }, { key: 'noderuntime_target_version', value: '0.5' }] : [],
    orphanedInputAttrs: [], baseUpcastResources: [], authExcludedItems: [] };
}
export function lifecycleEvidence(observed) {
  const errors = [];
  const prerequisite = observed?.prerequisite;
  let raw;
  try { raw = JSON.parse(prerequisite?.rawText); } catch { errors.push('raw lifecycle sidecar cannot be parsed'); }
  const leaf = versionLifecycleCases.find((item) => item.resourceKind === observed?.resourceKind);
  const source = raw?.observations;
  const expectedFile = leaf && absolute(observed?.evidenceDir)
    ? path.join(observed.evidenceDir, `verify-theme-image-full-lifecycle.mjs.json.${leaf.id.replaceAll('.', '_')}.evidence.json`) : null;
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(observed?.runId ?? '') || !absolute(observed?.cliBin) || !/^[a-f0-9]{64}$/u.test(observed?.binSha256 ?? '')
    || !/^[a-f0-9]{24}$/u.test(observed?.resourceId ?? '')) errors.push('invalid run/bin/resource identity');
  if (!leaf || prerequisite?.runId !== observed.runId || prerequisite.suiteFile !== path.join(observed.evidenceDir ?? '', 'verify-theme-image-full-lifecycle.mjs.json')
    || prerequisite.rawFile !== expectedFile || prerequisite.rawSha256 !== hash(prerequisite?.rawText ?? '')
    || prerequisite.suiteCase?.id !== leaf.id || prerequisite.suiteCase?.status !== 'PASS'
    || !isDeepStrictEqual(prerequisite.suiteCase?.evidenceRef, { runId: observed.runId, path: expectedFile, sha256: prerequisite.rawSha256 })) errors.push('same-run source file binding differs');
  if (raw?.schemaVersion !== 1 || raw?.runId !== observed.runId || raw?.caseId !== leaf?.id || !object(source)
    || source.cliBin !== observed.cliBin || source.cliBinSha256 !== observed.binSha256 || source.candidateMode !== true
    || source.resourceId !== observed.resourceId || source.kind !== observed.resourceKind) errors.push('raw lifecycle identity differs');
  if (source && leaf) {
    try {
      const result = evaluateVersionLifecycle(observed.resourceKind, source);
      if (result.status !== 'PASS' || !isDeepStrictEqual(result.assertions, raw.assertions)
        || !isDeepStrictEqual(result.assertions, prerequisite.suiteCase?.assertions)) errors.push('source lifecycle semantic recomputation failed');
    } catch { errors.push('source lifecycle observations malformed'); }
  }
  return { errors, source };
}
function readSafeJson(file, evidenceDir) {
  const relative = path.relative(evidenceDir, file);
  if (!absolute(file) || !relative || relative.startsWith('..') || path.isAbsolute(relative) || realpathSync(file) !== file
    || lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile() || lstatSync(file).size > 5_000_000) throw new Error('Unsafe or missing run evidence file.');
  const rawText = readFileSync(file, 'utf8');
  let parsed; try { parsed = JSON.parse(rawText); } catch { throw new Error('Run evidence JSON is invalid; parser excerpts are withheld.'); }
  return { parsed, rawText };
}
/** Real file re-read, callable by the top-level protocol as well as the producer. */
export function loadConsoleRoundtripPrerequisite({ evidenceDir, runId, installed, kind }) {
  if (!absolute(evidenceDir) || realpathSync(evidenceDir) !== evidenceDir || lstatSync(evidenceDir).isSymbolicLink() || !lstatSync(evidenceDir).isDirectory()) throw new Error('A regular run evidence directory is required.');
  const suiteFile = path.join(evidenceDir, 'verify-theme-image-full-lifecycle.mjs.json');
  const suite = readSafeJson(suiteFile, evidenceDir).parsed;
  const definition = versionLifecycleCases.find((item) => item.resourceKind === kind);
  const matches = Array.isArray(suite?.cases) ? suite.cases.filter((item) => item.id === definition?.id) : [];
  if (suite.schemaVersion !== 1 || matches.length !== 1) throw new Error('The exact same-run lifecycle result is unavailable.');
  const suiteCase = matches[0];
  const rawFile = path.join(evidenceDir, `verify-theme-image-full-lifecycle.mjs.json.${definition.id.replaceAll('.', '_')}.evidence.json`);
  const rawText = readSafeJson(rawFile, evidenceDir).rawText;
  const prerequisite = { runId, suiteFile, rawFile, rawSha256: hash(rawText), rawText,
    suiteCase: Object.fromEntries(['id', 'status', 'assertions', 'evidenceRef'].map((key) => [key, suiteCase[key]])) };
  const raw = JSON.parse(rawText);
  const checked = lifecycleEvidence({ ...installed, runId, evidenceDir, resourceKind: kind, resourceId: raw.observations?.resourceId, prerequisite });
  if (checked.errors.length) throw new Error(`Same-run lifecycle prerequisite rejected: ${checked.errors.join('; ')}`);
  return { prerequisite, source: checked.source };
}
/** Re-read nested files before final acceptance; an embedded copy is not proof that the original still matches. */
export function validateConsoleRoundtripFiles(observed) {
  const loaded = loadConsoleRoundtripPrerequisite({ evidenceDir: observed.evidenceDir, runId: observed.runId,
    installed: { cliBin: observed.cliBin, binSha256: observed.binSha256 }, kind: observed.resourceKind });
  if (!isDeepStrictEqual(loaded.prerequisite, observed.prerequisite)) throw new Error('Lifecycle prerequisite files changed after browser evidence was recorded.');
  validateRetainedArtifact(loaded.source.retainedArtifact, { evidenceDir: observed.evidenceDir, runId: observed.runId });
  for (const entry of observed.browser ?? []) {
    const request = readSafeJson(entry.requestFile, observed.evidenceDir).parsed;
    const capture = readSafeJson(entry.captureFile, observed.evidenceDir).parsed;
    if (!isDeepStrictEqual(request, entry.request) || !isDeepStrictEqual(capture, entry.capture)) throw new Error('Browser request/capture files changed after recording.');
  }
  return true;
}
function parseReadback(stdout) {
  if (typeof stdout !== 'string') return null;
  const index = stdout.indexOf('{');
  if (index < 0) return null;
  try { const value = JSON.parse(stdout.slice(index)); return object(value) ? value : null; } catch { return null; }
}
export function evaluateConsoleRoundtripCase(id, observed = {}) {
  const leaf = kindOf(id);
  const checks = [];
  const check = (key, expected, actual) => checks.push({ id: key, passed: isDeepStrictEqual(expected, actual), expected, actual });
  const prerequisite = lifecycleEvidence(observed);
  const source = prerequisite.source ?? {};
  const kind = leaf.resourceKind;
  if (observed.resourceKind !== kind) prerequisite.errors.push('leaf type differs');
  check('lifecycle-prerequisite', { issues: [] }, { issues: prerequisite.errors });
  const owner = observed.ownerIdentity;
  const currentUserId = owner?.currentUser?.data?.userId;
  const ownerId = Number.isSafeInteger(currentUserId) && currentUserId > 0 ? currentUserId : '<positive-user-id>';
  check('owner-identity', { idShape: 'positive-safe-integer', currentUser: { ret: 0, errCode: 0, data: { userId: ownerId, username: source.resourceName?.split('/')[0] ?? null } },
    resource: { ret: 0, errCode: 0, data: { resourceId: observed.resourceId, resourceName: source.resourceName ?? null, userId: ownerId } } },
  { ...owner, idShape: Number.isSafeInteger(currentUserId) && currentUserId > 0 ? 'positive-safe-integer' : 'invalid' });
  const identity = observed.dependencyIdentity;
  const expectedDependencyId = source.dependency?.resourceId;
  check('dependency-identity', { resourceId: expectedDependencyId ?? null, nameShape: 'owner/name', titleShape: 'nonblank', raw: { ret: 0, errCode: 0,
    data: { resourceId: expectedDependencyId ?? null, resourceName: identity?.resourceName ?? null, resourceTitle: identity?.resourceTitle ?? null } } },
    { resourceId: identity?.resourceId ?? null, nameShape: typeof identity?.resourceName === 'string' && /^[^/\s]+\/[^/\s]+$/u.test(identity.resourceName) ? 'owner/name' : 'invalid',
      titleShape: typeof identity?.resourceTitle === 'string' && identity.resourceTitle.trim() ? 'nonblank' : 'invalid', raw: identity?.raw ?? null });
  const browser = Array.isArray(observed.browser) ? observed.browser : [];
  const sdk = Array.isArray(observed.sdkStages) ? observed.sdkStages : [];
  const bindingErrors = [];
  const fieldErrors = [];
  const expectedSdk = [];
  let previousObserved = -Infinity;
  const started = Date.parse(observed.startedAt);
  const deadline = Date.parse(observed.deadlineAt);
  if (!Number.isFinite(started) || deadline - started !== consoleRoundtripTiming.totalMs) bindingErrors.push('source-fixed total budget differs');
  if (browser.length !== stages.length) bindingErrors.push('exactly four ordered browser captures are required');
  for (const [index, stage] of stages.entries()) {
    const entry = browser[index] ?? {};
    const request = entry.request ?? {};
    const capture = entry.capture ?? {};
    let projected;
    try { projected = projectConsoleBrowserCapture(request, capture); }
    catch { bindingErrors.push(`${stage}: raw browser profile rejected`); }
    const requestedAt = Date.parse(request.requestedAt);
    const observedAt = Date.parse(projected?.observedAt);
    const expectedRequest = Number.isFinite(requestedAt) ? consoleCaptureRequest({ ...observed, stage, nonce: request.nonce, requestedAt: request.requestedAt }) : null;
    const base = `console-roundtrip-${observed.runId}-${kind}-${stage}-${request.nonce}`;
    const captureIdentity = Object.fromEntries(['runId', 'nonce', 'cliBin', 'binSha256', 'resourceId', 'resourceKind', 'version', 'stage'].map((key) => [key, capture[key] ?? null]));
    const requestIdentity = Object.fromEntries(Object.keys(captureIdentity).map((key) => [key, request[key] ?? null]));
    if (!expectedRequest || !isDeepStrictEqual(request, expectedRequest) || !/^[a-f0-9]{32}$/u.test(request.nonce ?? '') || !isDeepStrictEqual(captureIdentity, requestIdentity)
      || capture.schemaVersion !== 2 || capture.status !== 'OBSERVED' || projected?.actualUrl !== expectedRequest.url || !Number.isFinite(observedAt) || observedAt < requestedAt || observedAt > Date.parse(request.expiresAt)
      || requestedAt < started || requestedAt >= deadline || requestedAt < previousObserved
      || entry.requestFile !== path.join(observed.evidenceDir ?? '', `${base}.request.json`) || entry.captureFile !== path.join(observed.evidenceDir ?? '', `${base}.capture.json`)) bindingErrors.push(`${stage}: capture binding/order/time/page differs`);
    previousObserved = observedAt;
    const expectedVersion = expectedConsoleStageVersion(kind, stage, source.versions);
    const expectedVisible = consoleVisibleProjection(expectedVersion, identity);
    const expectedReadings = consoleVisibleReadings(expectedVisible);
    const actualReadings = projected?.readings ?? [];
    if (!isDeepStrictEqual(projected?.visible, expectedVisible) || !isDeepStrictEqual(actualReadings.map((reading) => ({ field: reading?.field, value: reading?.value })), expectedReadings)) fieldErrors.push(`${stage}: visible typed fields/control readings differ`);
    const before = expectedConsoleStageVersion(kind, index < 2 ? stage : stages[index - 1], source.versions);
    expectedSdk.push({ stage, before: consoleSdkObservation(before), after: consoleSdkObservation(expectedVersion) });
  }
  check('browser-binding', { issues: [] }, { issues: bindingErrors });
  check('browser-fields', { issues: [] }, { issues: fieldErrors });
  check('sdk-stage-invariants', expectedSdk, sdk);
  if (leaf.direction === 'reverse') {
    const reverse = observed.reverse ?? {};
    const actions = Array.isArray(reverse.actions) ? reverse.actions : [];
    const commands = consoleReverseCommands(kind, observed.resourceId);
    check('reverse-commands', commands.map((item) => ({ ...item, process: { status: 0, signal: null, error: null, timedOut: false, stderr: '' } })),
      actions.map((item) => ({ label: item?.label ?? null, argv: item?.argv ?? null, process: Object.fromEntries(['status', 'signal', 'error', 'timedOut', 'stderr'].map((key) => [key, item?.result?.[key] ?? null])) })));
    const identityProjection = (value) => Object.fromEntries(['schemaVersion', 'subject', 'env', 'resourceId', 'typeCode', 'filePath', 'resourceName'].map((key) => [key, value?.[key] ?? null]));
    check('bound-identity', { schemaVersion: 1, subject: 'resource', env: 'dev', resourceId: observed.resourceId, typeCode: kind === 'theme' ? 'RT001' : 'RT005001', filePath: sourcePath(kind), resourceName: source.resourceName ?? null }, identityProjection(reverse.boundIdentity));
    const saved = expectedConsoleStageVersion(kind, 'edit-text-option', source.versions);
    check('pull-inheritance', expectedConsoleDraft(kind, saved), consoleDraftProjection(reverse.pulledDraft));
    check('edited-draft', expectedConsoleDraft(kind, expectedConsoleEditedVersion(kind, source.versions)), consoleDraftProjection(reverse.beforeSubmitDraft));
    const readback = actions.filter((item) => item.label === 'version show 1.2.0');
    check('raw-cli-readback', reverse.cliReadback ?? null, readback.length === 1 ? parseReadback(readback[0].result?.stdout) : null);
    const actual = consoleVersionProjection(reverse.cliReadback);
    const artifact = reverse.artifact ?? {};
    const validThemeName = typeof actual.filename === 'string' && /^freelog-zip-[^/\\]+\.zip$/u.test(actual.filename);
    const expectedArtifact = { fileSha1: kind === 'theme' ? /^[a-f0-9]{40}$/u.test(actual.fileSha1 ?? '') ? actual.fileSha1 : '<valid-lowercase-sha1>' : source.versions?.[1]?.fileSha1,
      filename: kind === 'theme' ? validThemeName ? actual.filename : '<generated-zip-basename>' : sourcePath(kind) };
    const published = expectedConsolePublishedVersion(kind, source.versions, expectedArtifact);
    check('published-version', { cli: published, sdk: consoleSdkObservation(published) }, { cli: actual, sdk: reverse.sdkReadback ?? null });
    check('artifact-anchor', { path: sourcePath(kind), kind: kind === 'theme' ? 'directory' : 'file', manifest: source.retainedArtifact?.manifest ?? '<same-run retained artifact manifest>',
      sha1: kind === 'theme' ? null : source.versions?.[1]?.fileSha1 ?? null },
    { path: artifact.path ?? null, kind: artifact.kind ?? null, manifest: artifact.manifest ?? null, sha1: artifact.sha1 ?? null });
    check('old-versions-unchanged', { first: consoleSdkObservation(consoleVersionProjection(source.versions?.[0])), updated: consoleSdkObservation(saved) },
      { first: reverse.firstVersionAfter ?? null, updated: reverse.oldVersionAfter ?? null });
    check('local-finalization', { draft: 'absent', pending: 'absent', identity: { resourceId: observed.resourceId, typeCode: kind === 'theme' ? 'RT001' : 'RT005001', filePath: sourcePath(kind) } }, reverse.finalization ?? null);
  }
  const failed = checks.filter((item) => !item.passed);
  return { id, status: failed.length ? 'FAIL' : 'PASS', assertions: checks, observations: observed,
    ...(failed.length ? { reason: `Console roundtrip source assertions failed: ${failed.map((item) => item.id).join(', ')}` } : {}) };
}
