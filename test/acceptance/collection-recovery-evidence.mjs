/** Source-fixed installed recovery obligations; local fault evidence is never real-dev coverage. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { recoveryFaultExit, recoveryResource, recoveryRouteAllowed } from './collection-recovery-control.mjs';

export const recoveryScenarios = Object.freeze(['prepared', 'sending', 'uncommitted', 'committed', 'changed', 'broken', 'new-draft',
  'wrong-resource', 'wrong-version', 'wrong-form', 'wrong-auth', 'wrong-directory', 'cleanup', 'rejected', 'legacy', 'invalid-intent',
  'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type', 'readonly-txn']);
const assertionIds = Object.freeze(['installed-run-binding', ...recoveryScenarios.map((name) => `recovery-${name}`)]);
export const collectionRecoveryCases = Object.freeze([Object.freeze({ id: 'COLLECTION.RECOVERY.INSTALLED_MATRIX',
  kind: 'product-case', required: true, parentRule: 'COLLECTION.MANAGEMENT_MATRIX', script: 'verify-collection-recovery.mjs', assertionIds,
  title: 'Installed collection recovery: fixed isolated SDK/transport faults and exact restart/local-state matrix',
  layer: 'installed-candidate/local-loopback-faults/not-real-dev', inputClass: 'C09.F01-F12, 21 fixed scenarios, full nonempty form/auth and two-item merge',
  preconditions: ['Fixed installed bin only; synthetic owner, isolated temporary workspace and replacement keyring.', 'Source-fixed loopback transport and exact intent fault preloads; all other IO denied.'],
  action: ['Run publish once, reject repeat, inspect without writes, explicitly apply with yes.', 'Recompute each fixed outcome from exact child results, server requests/snapshots, trace and complete local bytes.'],
  forbiddenSideEffects: ['real dev/prod/node access', 'payment/signing', 'native keyring access', 'unknown-result PUT replay', 'workspace bin fallback', 'failed or pending workspace deletion'],
  designRefs: [{ path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/发布/01-发布合集变更与恢复.md', section: '3/4 明确拒绝、未知与本地收尾' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md', section: '8.4 安装包可控中断与恢复' }],
})]);
export const recoveryHash = (value) => createHash('sha256').update(value).digest('hex');
const fingerprint = (value) => recoveryHash(JSON.stringify(value));
const parse = (value) => { try { return JSON.parse(value); } catch { return null; } };
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const absolute = (value) => typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value;
const iso = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const recoveryPaths = Object.freeze({ draft: `.freelog/collection-forms/dev/${recoveryResource}.json`,
  intent: `.freelog/collection-forms/intents/${recoveryResource}.json`, lock: '.freelog/.lock', txn: '.freelog/.txn.json', sequence: '.freelog/.sequence' });

/** Independent fixed inputs and public read/write DTO mapping, not imports of CLI domain functions. */
export function recoveryFixture() {
  const form = (update) => ({ $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'display_artist', value: update ? '更新作者' : '原作者' }],
    properties: [{ key: 'qaAuthor', name: '作者', value: update ? 'second' : 'first', description: '属性说明' }],
    options: [{ key: 'qaText', name: '文本', kind: 'input', value: update ? '' : '原文本', description: '文本说明' },
      { key: 'qaSelect', name: '下拉', kind: 'select', values: update ? ['second', 'first'] : ['first', 'second'], description: '下拉说明' }],
    description: update ? '本次完整更新' : '原始完整快照',
    display: update ? { sort: 'descending', title: 'custom', number: false, image: false, description: false, view: 'card' }
      : { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' },
    dependencies: [{ resourceId: 'source_image', versionRange: update ? '^1.1.0' : '^1.0.0' }] });
  const published = ['image', 'theme'].map((name, index) => ({ itemId: `item_${name}`, itemTitle: name, sortId: index + 1,
    mountResourceInfo: { resourceId: `source_${name}`, resourceName: `alice/${name}`, resourceTitle: name } }));
  return { resourceId: recoveryResource, resourceName: 'alice/collection', typeCode: 'CT001', userId: 7, baseline: form(false), form: form(true),
    auth: [{ resourceId: 'source_image', excludedType: 'contractId', excludedValue: 'contract_upstream' }], published,
    draft: [structuredClone(published[1]), { ...structuredClone(published[0]), itemTitle: 'renamed image', sortId: 3 }],
    selector: { schemaVersion: 1, credentialKey: 'v1/dev/7', env: 'dev', userId: 7, username: 'alice', createdAt: '2026-10-20T00:00:00.000Z' },
    identity: { schemaVersion: 1, subject: 'collection', resourceId: recoveryResource, resourceName: 'alice/collection', name: 'collection', title: 'Local recovery', typeCode: 'CT001', env: 'dev' } };
}
export function recoveryBody(form, merge, auth = recoveryFixture().auth) {
  const display = form.display;
  return { inputAttrs: form.inputs, customPropertyDescriptors: [
    ...form.properties.map((item) => ({ key: item.key, name: item.name, defaultValue: item.value, type: 'readonlyText', remark: item.description })),
    ...form.options.map((item) => ({ key: item.key, name: item.name, defaultValue: item.kind === 'input' ? item.value : item.values[0],
      type: item.kind === 'input' ? 'editableText' : 'select', ...(item.kind === 'select' ? { candidateItems: item.values } : {}), remark: item.description })),
  ], description: form.description, catalogueProperty: { collection_sort_list: `collection_sort_${display.sort}`,
    collection_item_title: { 'resource-title': 'collection_item_title_rtitle', custom: 'collection_item_title_custom' }[display.title],
    collection_item_no_display: `collection_item_no_display_${display.number ? 'show' : 'hide'}`,
    collection_item_image_display: `collection_item_image_display_${display.image ? 'show' : 'hide'}`,
    collection_item_descr_display: `collection_item_descr_display_${display.description ? 'show' : 'hide'}`, collection_view: `collection_view_${display.view}` },
  dependencies: form.dependencies, authExcludedItems: auth, isMergeCatalogueDraft: merge };
}
export function recoveryVersion(form, version, auth = recoveryFixture().auth) {
  const { inputAttrs, isMergeCatalogueDraft, ...body } = recoveryBody(form, 0, auth);
  return { resourceId: recoveryResource, version, systemPropertyDescriptors: inputAttrs.map(({ key, value }) => ({ key, insertMode: 2, valueDisplay: value })), ...body };
}
export function recoveryDraft(form) {
  const f = recoveryFixture();
  return { schemaVersion: 1, resourceId: recoveryResource, resourceTypeCode: 'CT001', env: 'dev',
    publishedBaselineFingerprint: fingerprint(f.baseline), baseline: f.baseline, form, authExcludedItems: f.auth, authState: 'unknown',
    createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z' };
}

function files(snapshot) {
  if (!Array.isArray(snapshot) || snapshot.length === 0) throw new Error('Missing complete local byte snapshot.');
  const map = new Map();
  for (const entry of snapshot) {
    if (!plain(entry) || typeof entry.path !== 'string' || !entry.path || entry.path.startsWith('/') || entry.path.includes('\\')
      || entry.path.split('/').some((part) => !part || part === '.' || part === '..') || map.has(entry.path)
      || !['directory', 'file'].includes(entry.kind) || (entry.kind === 'file'
        ? typeof entry.bytes !== 'string' || Buffer.from(entry.bytes, 'base64').toString('base64') !== entry.bytes
        : Object.hasOwn(entry, 'bytes'))) throw new Error('Invalid local snapshot entry.');
    // Compare preservation using canonical lossless bytes; distinct invalid UTF-8 must not collapse.
    map.set(entry.path, entry.kind === 'file' ? entry.bytes : null);
  }
  if (!equal([...map.keys()], [...map.keys()].sort())) throw new Error('Local snapshot order differs.');
  return map;
}
const read = (snapshot, file) => {
  const bytes = files(snapshot).get(file);
  return typeof bytes === 'string' ? Buffer.from(bytes, 'base64').toString('utf8') : bytes;
};
const data = (snapshot, file) => parse(read(snapshot, file));
const directoryFingerprint = (rows) => fingerprint(rows.map(({ itemId, mountResourceInfo, itemTitle, sortId }) => ({ itemId, resourceId: mountResourceInfo.resourceId, itemTitle, sortId })));
const diagnosis = (state, verification, localDraft, applied) => ({ schemaVersion: 1, resourceId: recoveryResource, env: 'dev', intentState: state, verification, localDraft, applied });
const command = (stage) => ['collection', 'publish', ...(stage === 'inspect' || stage === 'apply' ? ['resume'] : []),
  ...(stage === 'apply' ? ['--apply'] : []), ...(stage === 'publish' || stage === 'repeat' ? ['--include-items', 'auto'] : []),
  '--resource', `id:${recoveryResource}`, '--env', 'dev', '--json', ...(stage === 'inspect' ? [] : ['--yes'])];
export const recoveryCommand = command;

function check(condition, message) { if (!condition) throw new Error(message); }
function completed(stage, status) {
  const value = stage.result;
  return plain(value) && value.status === status && value.signal === null && value.error === null && value.timedOut === false && value.stderr === '';
}
function errorCode(stage, code, name) {
  const value = parse(stage.result?.stdout);
  const messages = {
    COLLECTION_PUBLISH_PENDING: '合集有未决发布；请先 collection publish resume 核验，不能覆盖记录或重发',
    COLLECTION_PUBLISH_RESULT_UNKNOWN: '合集发布结果未知；请 collection publish resume 核验，不要重发',
    COLLECTION_PUBLISH_CLEANUP_FAILED: '线上已确认发布，但本地收尾未完成；请 collection publish resume 核验，不要重发',
    COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED: '平台已明确拒绝且旧快照未变，但本地记录清理失败；请 collection publish resume 核验',
    COLLECTION_FORM_RESPONSE_INVALID: '已发布合集快照身份或版本不匹配',
    COLLECTION_RECOVER_UNCONFIRMED: '线上完整快照尚未确认；已保留发布记录和当前稿，不会重发',
    COLLECTION_PUBLISH_INTENT_LEGACY: '旧发布记录缺少可验证快照，已保留，不能自动收尾',
    COLLECTION_PUBLISH_INTENT_INVALID: name === 'invalid-intent' ? '发布 intent 无法解析'
      : name === 'payload-mismatch' ? '发布 intent 的预期快照或摘要无效' : '发布 intent 的环境、账号或合集身份不匹配',
  };
  return completed(stage, 1) && equal(value, { code, message: messages[code] });
}
function expectedError(name, stage) {
  if (stage === 'repeat') return 'COLLECTION_PUBLISH_PENDING';
  if (stage === 'publish') return name === 'cleanup' ? 'COLLECTION_PUBLISH_CLEANUP_FAILED'
    : name === 'rejected' ? 'COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED' : 'COLLECTION_PUBLISH_RESULT_UNKNOWN';
  if (['wrong-resource', 'wrong-version'].includes(name)) return 'COLLECTION_FORM_RESPONSE_INVALID';
  if (['invalid-intent', 'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name)) return 'COLLECTION_PUBLISH_INTENT_INVALID';
  if (stage === 'apply') return name === 'legacy' ? 'COLLECTION_PUBLISH_INTENT_LEGACY' : 'COLLECTION_RECOVER_UNCONFIRMED';
}
function remoteState(name, stageName) {
  const f = recoveryFixture();
  const committed = !['prepared', 'sending', 'uncommitted', 'rejected'].includes(name);
  const form = committed && name !== 'new-draft' ? f.form : f.baseline;
  const version = recoveryVersion(form, committed ? 'snapshot_1' : 'snapshot_0', f.auth);
  const published = structuredClone(committed ? f.draft : f.published);
  if (stageName === 'inspect' || stageName === 'apply') {
    if (name === 'wrong-resource') version.resourceId = 'other_collection';
    if (name === 'wrong-version') version.version = 'snapshot_other';
    if (name === 'wrong-form') version.description = 'different remote form';
    if (name === 'wrong-auth') version.authExcludedItems[0].excludedValue = 'wrong_exclusion';
    if (name === 'wrong-directory') published[0].itemTitle = 'wrong published item title';
  }
  return { version, published, draft: f.draft };
}
export const recoveryExpectedRemote = remoteState;

function validateTrace(stage, name) {
  check(equal(stage.apparatusErrors, []), 'Stage apparatus errors were not empty.');
  check(typeof stage.trace === 'string', 'Missing original preload trace.');
  const trace = stage.trace.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  check(trace.every((event) => event.schemaVersion === 1) && !trace.some((event) => event.event === 'blocked'), 'Blocked or invalid apparatus IO.');
  check(trace.every((event) => ['ready', 'finished', 'keyring-replaced', 'keyring-get', 'request', 'fault'].includes(event.event))
    && !stage.trace.includes('local-recovery-synthetic-token'), 'Unknown trace event or credential spill.');
  check(trace.filter((event) => event.event === 'ready' && event.guard === 'collection-recovery-local-v1').length === 1
    && trace.filter((event) => event.event === 'finished').length === 1 && trace.at(-1).event === 'finished', 'Missing apparatus lifecycle.');
  check(trace.some((event) => event.event === 'keyring-replaced') && trace.some((event) => event.event === 'keyring-get'), 'Synthetic credential proof missing.');
  const expectedFault = stage.name === 'publish' && ['prepared', 'sending'].includes(name) ? name
    : stage.name === 'publish' && ['cleanup', 'rejected'].includes(name) ? 'intent-unlink' : null;
  const faults = trace.filter((event) => event.event === 'fault');
  check(expectedFault === null ? faults.length === 0 : faults.length === 1 && faults[0].kind === expectedFault
    && (['prepared', 'sending'].includes(name) ? faults[0].exitCode === recoveryFaultExit : true), 'Unexpected or missing exact fault.');
  check(Array.isArray(stage.requests) && stage.requests.every((request) => recoveryRouteAllowed(request.method, request.path)), 'Unknown server request.');
  const requestKeys = (values) => values.map(({ method, path }) => `${method} ${path}`).sort();
  check(equal(requestKeys(trace.filter((event) => event.event === 'request')), requestKeys(stage.requests)), 'Client/server request observations differ.');
  check(stage.requests.every((request) => request.method !== 'GET' || request.body === null), 'Unexpected GET body.');
}

/** Required reads are fixed independently of the trace; two equally incomplete streams cannot pass. */
function validateReads(stage, name) {
  const info = `/v2/resources/${recoveryResource}?isLoadLatestVersionInfo=1&isLoadPolicyInfo=1`;
  const version = (value) => `/v2/resources/${recoveryResource}/versions/${value}`;
  const published = `/v2/resources/catalogue/${recoveryResource}/items?skip=0&limit=100&sortField=sortId&sortType=1`;
  const draft = `/v2/resources/catalogues/drafts/${recoveryResource}/items?skip=0&limit=100&sortField=sortId&sortType=1`;
  const observed = (value) => [info, version(value), published, draft];
  let expected;
  if (stage.name === 'publish') {
    // Initial target, two complete preflight snapshots, and two rule/type rechecks.
    expected = [info, ...observed('snapshot_0'), ...observed('snapshot_0'), info, info,
      ...Array(2).fill(`/v2/resources/catalogue/${recoveryResource}/items/collectRules`),
      ...Array(2).fill('/v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=4'),
      ...Array(2).fill('/v2/resources/types/getInfoByCode?code=CT001'),
      ...Array(2).fill('/v2/storages/files/info?resourceTypeCode=CT001'),
      ...Array(2).fill('/v2/resources/attrs/getInfoByKey?key=display_artist')];
    if (name === 'cleanup' || name === 'rejected') expected.push(...observed(name === 'cleanup' ? 'snapshot_1' : 'snapshot_0'));
  } else if (stage.name === 'repeat' || ['legacy', 'invalid-intent', 'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name)) expected = [info];
  else if (name === 'wrong-resource' || name === 'wrong-version') expected = [info, info, version('snapshot_1')];
  else expected = [info, ...observed(['prepared', 'sending', 'uncommitted', 'rejected'].includes(name) ? 'snapshot_0' : 'snapshot_1')];
  const canonical = (route) => {
    const url = new URL(route, 'https://api.devfreelog.com');
    url.searchParams.sort();
    return `${url.pathname}${url.search}`;
  };
  check(equal(stage.requests.filter((request) => request.method === 'GET').map((request) => canonical(request.path)).sort(),
    expected.map(canonical).sort()), 'Required GET read set differs.');
}

function validateScenario(scenario, index, root) {
  const name = recoveryScenarios[index], f = recoveryFixture();
  check(scenario?.name === name && absolute(scenario.cwd) && absolute(scenario.controls) && scenario.cwd !== scenario.controls, 'Scenario identity/workspace differs.');
  check(Array.isArray(scenario.stages) && equal(scenario.stages.map((stage) => stage.name), ['publish', 'repeat', 'inspect', 'apply']), 'Missing or reordered recovery commands.');
  const stages = scenario.stages, first = stages[0];
  for (let i = 1; i < stages.length; i += 1) check(Date.parse(stages[i - 1].finishedAt) <= Date.parse(stages[i].startedAt), 'Child stages overlap or are reordered.');
  const draftBefore = read(first.before, recoveryPaths.draft);
  check(name === 'new-draft' ? draftBefore === undefined : equal(parse(draftBefore), recoveryDraft(f.form)), 'Initial full local form differs.');
  check(equal(data(first.before, '.freelog/auth'), f.selector) && equal(data(first.before, '.freelog/1.json'), f.identity)
    && read(first.before, 'keep.txt') === 'local recovery sentinel\n' && read(first.before, recoveryPaths.sequence) === '1\n'
    && read(first.before, recoveryPaths.intent) === undefined && read(first.before, recoveryPaths.txn) === undefined
    && read(first.before, recoveryPaths.lock) === undefined, 'Synthetic initial/protected state differs.');
  const protectedState = (snapshot) => [...files(snapshot)].filter(([file]) => !Object.values(recoveryPaths).includes(file));
  const protectedBefore = protectedState(first.before);
  const expectedForm = name === 'new-draft' ? f.baseline : f.form;
  const marker = data(first.after, recoveryPaths.intent);
  const state = ['prepared', 'sending'].includes(name) ? name : name === 'cleanup' ? 'sending' : name === 'rejected' ? 'rejected' : 'unknown';
  check(plain(marker) && equal(marker, { schemaVersion: 2, resourceId: recoveryResource, resourceName: f.resourceName, resourceTypeCode: f.typeCode,
    env: 'dev', userId: f.userId, state, baselineFingerprint: fingerprint(f.baseline), baselineAuthFingerprint: fingerprint(f.auth),
    baselineDirectoryFingerprint: directoryFingerprint(f.published), expectedForm, expectedAuthExcludedItems: f.auth, merge: 1,
    directoryFingerprint: directoryFingerprint(f.draft), payloadSha256: fingerprint({ resourceId: recoveryResource, ...recoveryBody(expectedForm, 1, f.auth) }),
    sourceDraftSha256: draftBefore === undefined ? null : recoveryHash(draftBefore), sentAt: marker.sentAt,
    ...(name === 'rejected' ? { rejection: { ret: 1, errCode: 77 } } : {}) }) && iso(marker.sentAt)
    && Date.parse(marker.sentAt) >= Date.parse(first.startedAt) && Date.parse(marker.sentAt) <= Date.parse(first.finishedAt), 'Initial intent lacks the full same-request snapshot.');
  check(read(first.after, recoveryPaths.draft) === (name === 'cleanup' ? undefined : draftBefore)
    && read(first.after, recoveryPaths.sequence) === '1\n' && read(first.after, recoveryPaths.txn) === undefined, 'Initial failure changed current draft or unrelated state.');
  for (const stage of stages) {
    check(equal(stage.argv, command(stage.name)) && iso(stage.startedAt) && iso(stage.finishedAt)
      && Date.parse(stage.startedAt) >= Date.parse(root.startedAt) && Date.parse(stage.startedAt) <= Date.parse(stage.finishedAt)
      && Date.parse(stage.finishedAt) <= Date.parse(root.finishedAt) && Number.isSafeInteger(stage.childPid) && stage.childPid > 0, 'Child command/time/process binding differs.');
    check(equal(protectedState(stage.before), protectedBefore) && equal(protectedState(stage.after), protectedBefore), 'Unrelated local bytes changed.');
    validateTrace(stage, name);
    validateReads(stage, name);
    const puts = stage.requests.filter((request) => request.method === 'PUT');
    check(puts.length === (stage.name === 'publish' && !['prepared', 'sending'].includes(name) ? 1 : 0), 'Publish was missing or repeated.');
    if (puts.length) check(equal(puts[0].body, recoveryBody(expectedForm, 1, f.auth)), 'Incomplete or incorrect full update body.');
    check(equal(stage.remote, remoteState(name, stage.name)), 'Independent platform form/catalogue differs.');
    if (stage.name === 'publish' && ['prepared', 'sending'].includes(name)) {
      const lock = data(stage.after, recoveryPaths.lock);
      check(completed(stage, recoveryFaultExit) && stage.result.stdout === '' && plain(lock)
        && equal(Object.keys(lock).sort(), ['command', 'pid', 'startedAt']) && lock.pid === stage.childPid && lock.command === 'collection-publish'
        && iso(lock.startedAt) && Date.parse(lock.startedAt) >= Date.parse(stage.startedAt)
        && Date.parse(lock.startedAt) <= Date.parse(stage.finishedAt), 'Unexpected process death or lock identity.');
    } else if (stage.name === 'publish' || stage.name === 'repeat') check(errorCode(stage, expectedError(name, stage.name), name), 'Wrong initial/repeat rejection.');
  }
  const repeat = stages[1], inspect = stages[2], apply = stages[3];
  check(equal(repeat.before, first.after) && equal(apply.before, inspect.after), 'Stage byte observations are discontinuous.');
  check(read(repeat.after, recoveryPaths.lock) === undefined && read(inspect.before, recoveryPaths.lock) === undefined
    && read(apply.after, recoveryPaths.lock) === undefined, 'Transient lock leaked after restart.');
  check(read(repeat.before, recoveryPaths.intent) === read(repeat.after, recoveryPaths.intent)
    && read(repeat.before, recoveryPaths.draft) === read(repeat.after, recoveryPaths.draft), 'Repeat publish changed pending state.');
  const without = (snapshot, ignored) => [...files(snapshot)].filter(([file]) => !ignored.includes(file));
  check(equal(without(repeat.before, [recoveryPaths.lock]), without(repeat.after, [recoveryPaths.lock])), 'Repeated publish changed unrelated state.');
  const mutatesDraft = ['changed', 'broken', 'new-draft'].includes(name);
  const mutatesIntent = ['legacy', 'invalid-intent', 'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name);
  const allowedMutation = mutatesDraft ? recoveryPaths.draft : mutatesIntent ? recoveryPaths.intent : name === 'readonly-txn' ? recoveryPaths.txn : undefined;
  check(equal(without(repeat.after, allowedMutation ? [allowedMutation] : []), without(inspect.before, allowedMutation ? [allowedMutation] : [])), 'Unexplained between-stage local mutation.');
  if (name === 'broken') check(read(inspect.before, recoveryPaths.draft) === '{broken local draft\n', 'Broken-draft stimulus missing.');
  if (name === 'changed' || name === 'new-draft') {
    const expected = recoveryDraft(f.form);
    if (name === 'changed') expected.form.description = 'edited after unknown publish';
    check(equal(data(inspect.before, recoveryPaths.draft), expected)
      && read(inspect.before, recoveryPaths.draft) !== draftBefore, 'Changed/new-draft stimulus missing.');
  }
  if (mutatesIntent) {
    const expected = structuredClone(marker);
    if (name === 'legacy') check(equal(data(inspect.before, recoveryPaths.intent), { schemaVersion: 1, resourceId: recoveryResource, state: 'unknown' }), 'Legacy stimulus missing.');
    else if (name === 'invalid-intent') check(read(inspect.before, recoveryPaths.intent) === '{"schemaVersion":2,\n', 'Invalid JSON stimulus missing.');
    else {
      if (name === 'payload-mismatch') expected.payloadSha256 = '0'.repeat(64);
      if (name === 'wrong-env') expected.env = 'test';
      if (name === 'wrong-owner') expected.userId = 8;
      if (name === 'wrong-type') expected.resourceTypeCode = 'CT999';
      check(equal(data(inspect.before, recoveryPaths.intent), expected), 'Invalid intent stimulus differs.');
    }
  }
  if (name === 'readonly-txn') check(equal(data(inspect.before, recoveryPaths.txn), { schemaVersion: 1, entries: [{ path: '.sequence',
    before: '1\n', beforeSha256: recoveryHash('1\n'), after: '2\n', afterSha256: recoveryHash('2\n') }] }), 'Readonly transaction stimulus missing.');
  check(equal(inspect.before, inspect.after), 'Default resume changed local bytes.');
  const invalid = ['wrong-resource', 'wrong-version', 'invalid-intent', 'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type'].includes(name);
  const unconfirmed = ['prepared', 'sending', 'uncommitted', 'wrong-form', 'wrong-auth', 'wrong-directory'].includes(name);
  const verification = name === 'legacy' ? 'legacy-unverifiable' : name === 'rejected' ? 'rejected' : unconfirmed ? 'unconfirmed' : 'confirmed';
  const localDraft = name === 'cleanup' ? 'absent' : ['changed', 'broken', 'new-draft', 'legacy'].includes(name) ? 'changed' : 'unchanged';
  if (invalid) check(errorCode(inspect, expectedError(name, 'inspect'), name), 'Invalid readback/intent diagnosed as success.');
  else check(completed(inspect, 0) && equal(parse(inspect.result.stdout), diagnosis(state, verification, localDraft, false)), 'Wrong readonly recovery diagnosis.');
  if (invalid || unconfirmed || name === 'legacy') {
    check(errorCode(apply, expectedError(name, 'apply'), name) && equal(apply.before, apply.after), 'Unconfirmed apply changed state or claimed success.');
  } else {
    check(completed(apply, 0) && equal(parse(apply.result.stdout), diagnosis(state, verification, localDraft, true))
      && read(apply.after, recoveryPaths.intent) === undefined, 'Confirmed/rejected explicit cleanup failed.');
    const preserve = ['changed', 'broken', 'new-draft', 'rejected'].includes(name);
    check(preserve ? read(apply.after, recoveryPaths.draft) === read(apply.before, recoveryPaths.draft)
      : read(apply.after, recoveryPaths.draft) === undefined, 'Cleanup deleted a changed draft or retained a same-request draft.');
  }
  const expectedSequence = name === 'readonly-txn' ? '2\n' : '1\n';
  check(read(apply.after, recoveryPaths.sequence) === expectedSequence && read(apply.after, recoveryPaths.txn) === undefined, 'Unrelated transaction outcome differs.');
  return true;
}

/** Actual observations are re-evaluated; report booleans and process exits cannot supply missing cases. */
export function evaluateCollectionRecovery(observed) {
  const assertions = [];
  const add = (id, action) => {
    let actual = true, reason;
    try { action(); } catch (error) { actual = false; reason = error.message; }
    assertions.push({ id, passed: actual, expected: true, actual, ...(reason ? { reason } : {}) });
  };
  add('installed-run-binding', () => {
    check(plain(observed) && /^[A-Za-z0-9-]{1,80}$/u.test(observed.runId ?? '') && absolute(observed.evidenceDir)
      && absolute(observed.cliBin) && observed.cliBin.endsWith(path.join('node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js'))
      && observed.packageName === '@freelog-cli/cli2' && typeof observed.version === 'string' && observed.version.length > 0
      && /^[a-f0-9]{64}$/u.test(observed.binSha256 ?? '') && ['win32', 'darwin', 'linux'].includes(observed.platform)
      && /^v(20|22)\./u.test(observed.nodeVersion ?? '') && iso(observed.startedAt) && iso(observed.finishedAt)
      && Date.parse(observed.startedAt) <= Date.parse(observed.finishedAt) && Date.parse(observed.finishedAt) <= Date.now()
      && equal(observed.apparatusErrors, [])
      && Array.isArray(observed.scenarios) && equal(observed.scenarios.map((scenario) => scenario.name), recoveryScenarios), 'Installed run/scenario binding differs.');
  });
  for (const [index, name] of recoveryScenarios.entries()) add(`recovery-${name}`, () => validateScenario(observed?.scenarios?.[index], index, observed));
  const passed = assertions.every((assertion) => assertion.passed);
  return { id: collectionRecoveryCases[0].id, status: passed ? 'PASS' : 'FAIL', assertions,
    ...(passed ? {} : { reason: assertions.filter((assertion) => !assertion.passed).map((assertion) => `${assertion.id}: ${assertion.reason}`).join('; ') }), observations: observed };
}

/** Retained run-bound raw stage files must still match the embedded exact observations. */
export function validateCollectionRecoveryFiles(observed) {
  check(plain(observed) && absolute(observed.evidenceDir) && Array.isArray(observed.scenarios), 'Missing recovery raw-file binding.');
  const seen = new Set();
  for (const scenario of observed.scenarios) for (const stage of scenario.stages ?? []) {
    const { evidenceRef, ...raw } = stage;
    const file = evidenceRef?.path, relative = typeof file === 'string' ? path.relative(observed.evidenceDir, file) : '';
    check(absolute(file) && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
      && !seen.has(file) && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file && lstatSync(file).size <= 500_000,
    'Unsafe/missing recovery stage evidence.');
    seen.add(file);
    const bytes = readFileSync(file);
    check(recoveryHash(bytes) === evidenceRef.sha256 && equal(parse(bytes.toString('utf8')), raw), 'Recovery stage evidence changed.');
  }
  check(seen.size === recoveryScenarios.length * 4, 'Missing/duplicate recovery stage evidence.');
}
