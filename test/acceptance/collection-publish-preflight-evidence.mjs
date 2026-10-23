/** Independent C08 installed-input and wire/state contract; no production imports. */
import { isDeepStrictEqual as equal } from 'node:util';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { itemHash, itemInitialEntries } from './collection-items-evidence.mjs';
import { recoveryFixture, recoveryBody, recoveryVersion, recoveryPaths } from './collection-recovery-evidence.mjs';
export { itemHash as preflightHash };
const copy = value => structuredClone(value), json = value => `${JSON.stringify(value, null, 2)}\n`;
const modeRows = [
  ['auto', 0, false, 0], ['yes', 0, false, 'COLLECTION_MERGE_NOT_NEEDED'], ['no', 0, false, 0],
  ['auto', 0, true, 1], ['yes', 0, true, 1], ['no', 0, true, 0],
  ['auto', 1, false, 0], ['yes', 1, false, 'COLLECTION_AUTO_MERGE_FORBIDDEN'], ['no', 1, false, 0],
  ['auto', 1, true, 'COLLECTION_AUTO_MERGE_FORBIDDEN'], ['yes', 1, true, 'COLLECTION_AUTO_MERGE_FORBIDDEN'], ['no', 1, true, 0],
];
export const preflightRaces = Object.freeze(['rules', 'options', 'description', 'dependency', 'auth', 'published', 'draft', 'local', 'owner', 'name', 'type', 'frozen', 'rss']);
export const preflightNames = Object.freeze([
  ...modeRows.flatMap((_, index) => [1, 2].map(n => `mode-M${String(index * 2 + n).padStart(2, '0')}`)),
  ...[0, 1].flatMap(a => [0, 1].flatMap(d => ['local', 'remote'].map(s => `default-a${a}-d${d}-${s}`))),
  ...preflightRaces.map(name => `race-${name}`), 'allow-no-draft', 'block-no-published', 'no-confirm',
]);
const raceRule = { rules: '01', options: '02', description: '03', dependency: '03', auth: '04', published: '05', draft: '06',
  local: '07', owner: '08', name: '09', type: '10', frozen: '11', rss: '12' };
const design = 'docs/一期/产品方案/脚手架设计/PHASE/合集';
export const collectionPublishPreflightCases = Object.freeze([{
  id: 'COLLECTION.PUBLISH.PREFLIGHT_INSTALLED', kind: 'product-case', required: true, parentRule: 'COLLECTION.MANAGEMENT_MATRIX',
  title: 'Installed collection publication: explicit/default modes and write-before recheck matrix', script: 'verify-collection-publish-preflight.mjs',
  assertionIds: ['installed-preflight-binding', ...preflightNames.map(name => `preflight-${name}`)],
  layer: 'installed-candidate/local-loopback/non-TTY/not-real-concurrent-clients', inputClass: '24 explicit + 8 default modes, 15 rechecks, non-TTY confirmation',
  designRefs: [{ path: `${design}/发布/01-发布合集变更与恢复.md`, sections: ['1', '2', '5'] },
    { path: `${design}/测试/00-功能拓扑与证据驱动测试门禁.md`, sections: ['8.17'] }],
  scenarioRules: preflightNames.map(name => ({ scenario: name, ruleId: name.startsWith('mode-') ? `C08.${name.slice(5)}`
    : name.startsWith('default-') ? 'C08.DEFAULT_AUTO' : name === 'no-confirm' ? 'C07.P01'
      : name === 'allow-no-draft' ? 'C08.C06' : name === 'block-no-published' ? 'C08.C05' : `C08.C${raceRule[name.slice(5)]}` })),
  preconditions: ['Exact installed candidate, synthetic owner, owned work/home and closed loopback routes.'],
  action: ['Run each fixed command and retain complete local/model, intent persistence, HTTP and process observations.'],
  forbiddenSideEffects: ['real network', 'native keyring', 'signing/payment', 'version creation', 'shelf operation', 'automatic PUT replay'],
}]);
export function preflightSpec(name) {
  if (!preflightNames.includes(name)) throw new Error('Unknown fixed preflight scenario.');
  let mode = 'auto', automatic = 0, diff = true, hasDraft = true, merge = 1, code;
  if (name.startsWith('mode-')) {
    const id = Number(name.slice(6)), row = modeRows[Math.floor((id - 1) / 2)];
    [mode, automatic, diff] = row; hasDraft = id % 2 === 1;
    if (typeof row[3] === 'string') code = row[3]; else merge = row[3];
  } else if (name.startsWith('default-')) {
    automatic = Number(name[9]); diff = name[12] === '1'; hasDraft = name.endsWith('-local');
    if (automatic && diff) code = 'COLLECTION_AUTO_MERGE_FORBIDDEN'; else merge = diff ? 1 : 0;
  }
  if (name === 'allow-no-draft' || name === 'block-no-published') { mode = 'no'; merge = 0; }
  if (!code && !hasDraft && merge === 0) code = 'COLLECTION_PUBLISH_NOTHING_TO_DO';
  if (name.startsWith('race-') || name === 'block-no-published') code = 'RECHECK';
  if (name === 'no-confirm') code = 'FORM_NEED_YES';
  return { mode, automatic, diff, hasDraft, merge, code, omitted: name.startsWith('default-'), success: !code };
}
export function preflightCommand(name) {
  const spec = preflightSpec(name);
  return ['collection', 'publish', ...(spec.omitted ? [] : ['--include-items', spec.mode]),
    '--resource', 'id:local_collection', '--env', 'dev', '--json', ...(name === 'no-confirm' ? [] : ['--yes'])];
}
export function preflightEntries(name, after = false) {
  const spec = preflightSpec(name), entries = itemInitialEntries().filter(entry => spec.hasDraft && !(after && spec.success) || entry.path !== recoveryPaths.draft);
  if (after && name === 'race-local') {
    const entry = entries.find(value => value.path === recoveryPaths.draft), value = JSON.parse(Buffer.from(entry.bytes, 'base64').toString('utf8'));
    value.form.description = '外部编辑器'; entry.bytes = Buffer.from(`${JSON.stringify(value, null, 4)}\n`).toString('base64');
  }
  return entries;
}
export function preflightInitial(name) {
  const f = recoveryFixture(), spec = preflightSpec(name);
  return { target: { resourceId: f.resourceId, resourceName: f.resourceName, resourceTitle: 'Preflight model', resourceTypeCode: f.typeCode,
    subjectType: 4, userId: 7, status: 0, latestVersion: 'snapshot_0', serializeStatus: 0 },
    version: recoveryVersion(f.baseline, 'snapshot_0', f.auth), published: copy(f.published), draft: copy(spec.diff ? f.draft : f.published),
    automatic: spec.automatic, capability: 2, puts: 0 };
}
export function preflightMutated(name) {
  const state = preflightInitial(name), kind = name === 'allow-no-draft' ? 'draft' : name === 'block-no-published' ? 'published' : name.slice(5);
  if (kind === 'rules') state.automatic = 1;
  if (kind === 'options') state.capability = 1;
  if (kind === 'description') state.version.description = '其它客户端';
  if (kind === 'dependency') state.version.dependencies[0].versionRange = '^9.0.0';
  if (kind === 'auth') state.version.authExcludedItems[0].excludedValue = 'contract_other';
  if (kind === 'published') state.published[0].itemTitle = '其它客户端改名';
  if (kind === 'draft') state.draft[0].itemTitle = '确认后目录改名';
  if (kind === 'owner') state.target.userId = 8;
  if (kind === 'name') state.target.resourceName = 'alice/renamed';
  if (kind === 'type') state.target.resourceTypeCode = 'CT002';
  if (kind === 'frozen') state.target.status = 2;
  if (kind === 'rss') state.target.rssSource = 'yes';
  if (['race-description', 'race-dependency', 'race-auth', 'race-published', 'block-no-published'].includes(name)) {
    state.target.latestVersion = 'snapshot_1'; state.version.version = 'snapshot_1';
  }
  return state;
}
export function preflightBody(name) {
  const f = recoveryFixture(), spec = preflightSpec(name);
  return recoveryBody(spec.hasDraft ? f.form : f.baseline, spec.merge, f.auth);
}
export function preflightAfter(name) {
  const spec = preflightSpec(name), state = name.startsWith('race-') || ['allow-no-draft', 'block-no-published'].includes(name) ? preflightMutated(name) : preflightInitial(name);
  if (spec.success) {
    const f = recoveryFixture(); state.puts = 1; state.target.latestVersion = 'snapshot_1';
    state.version = recoveryVersion(spec.hasDraft ? f.form : f.baseline, 'snapshot_1', f.auth);
    if (spec.merge) state.published = copy(state.draft);
  }
  return state;
}
export const preflightRules = automatic => ({ status: automatic, conditionType: 1, filterConditions: [{ key: 'resourceTitle', limitOperatorType: 'INCLUDES', value: 'fixed' }] });
const ok = data => ({ ret: 0, errCode: 0, data });
export function preflightRequests(name) {
  const spec = preflightSpec(name), before = preflightInitial(name), changed = preflightMutated(name), after = preflightAfter(name), result = [];
  const get = (route, data) => result.push({ method: 'GET', path: route, body: null, response: ok(copy(data)) });
  const info = state => get('/v2/resources/local_collection?isLoadLatestVersionInfo=1&isLoadPolicyInfo=1', state.target);
  const page = (route, rows) => { for (let skip = 0; skip < rows.length; skip += 100) get(`${route}?skip=${skip}&limit=100&sortField=sortId&sortType=1`, { skip, limit: 100, totalItem: rows.length, dataList: rows.slice(skip, skip + 100) }); };
  const observe = state => { info(state); get(`/v2/resources/local_collection/versions/${state.target.latestVersion}`, state.version);
    page('/v2/resources/catalogue/local_collection/items', state.published); page('/v2/resources/catalogues/drafts/local_collection/items', state.draft); };
  const type = state => { get('/v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=4', [{ code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true }]);
    get('/v2/resources/types/getInfoByCode?code=CT001', { code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true,
      attrs: [{ key: 'display_artist', name: '系统作者' }], resourceConfig: { supportOptionalConfig: state.capability } }); };
  const system = () => { get('/v2/storages/files/info?resourceTypeCode=CT001', { metaInfoArray: [{ key: 'display_artist', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '' }] });
    get('/v2/resources/attrs/getInfoByKey?key=display_artist', { key: 'display_artist', format: 6, contentRule: { maxLength: 140 } }); };
  info(before); observe(before); type(before); system(); info(before); get('/v2/resources/catalogue/local_collection/items/collectRules', preflightRules(before.automatic));
  if (spec.code && spec.code !== 'RECHECK') return result;
  info(before); get('/v2/resources/catalogue/local_collection/items/collectRules', preflightRules(changed.automatic));
  if (name === 'race-rules') return result;
  type(changed);
  if (name === 'race-options') return result;
  system();
  if (['race-owner', 'race-name', 'race-type'].includes(name)) { info(changed); return result; }
  observe(changed);
  if (!spec.success) return result;
  result.push({ method: 'PUT', path: '/v2/resources/catalogue/local_collection', body: preflightBody(name), response: ok({ resourceId: 'local_collection', version: 'snapshot_1' }) });
  observe(after); return result;
}
const messages = {
  COLLECTION_MERGE_NOT_NEEDED: '目录草稿没有变化，无需 --include-items yes', COLLECTION_AUTO_MERGE_FORBIDDEN: '自动收录开启时不能手工合并目录草稿',
  COLLECTION_PUBLISH_NOTHING_TO_DO: '没有本地表单修改或目录差异，无需发布', FORM_NEED_YES: '请加 --yes 确认预览',
  COLLECTION_FORM_BASELINE_CHANGED: '确认期间线上表单、身份或目录基线改变，未发请求', COLLECTION_FORM_OPTIONS_UNSUPPORTED: '当前合集类型不支持可选配置',
  COLLECTION_FORM_CHANGED: '预检或确认期间当前稿已改变，未发请求', COLLECTION_NOT_OWNER: '只能管理当前账号的合集',
  COLLECTION_IDENTITY_MISMATCH: '平台详情与选中的合集身份不一致，已停止', COLLECTION_FROZEN: '冻结合集不能发布', COLLECTION_RSS_READONLY: 'RSS 合集当前不支持 CLI 发布',
};
export function preflightResult(name) {
  const spec = preflightSpec(name); let code = spec.code, message;
  if (code === 'RECHECK') code = { 'race-options': 'COLLECTION_FORM_OPTIONS_UNSUPPORTED', 'race-local': 'COLLECTION_FORM_CHANGED',
    'race-owner': 'COLLECTION_NOT_OWNER', 'race-name': 'COLLECTION_IDENTITY_MISMATCH', 'race-type': 'COLLECTION_IDENTITY_MISMATCH',
    'race-frozen': 'COLLECTION_FROZEN', 'race-rss': 'COLLECTION_RSS_READONLY' }[name] ?? 'COLLECTION_FORM_BASELINE_CHANGED';
  message = name === 'race-rules' ? '确认期间收录规则改变，未发请求' : messages[code];
  return { status: code ? 1 : 0, signal: null, error: null, timedOut: false, stdout: code ? `${JSON.stringify({ code, message })}\n` : '合集变更已发布；未执行上架。\n', stderr: '' };
}
function check(value, message) { if (!value) throw new Error(message); }
const absolute = value => typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function wire(values) {
  const result = values.map(({ method, path: raw, body, response }) => { check(typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//'), 'Bad preflight URL.');
    const url = new URL(raw, 'https://api.devfreelog.com'); check(url.origin === 'https://api.devfreelog.com' && !url.hash, 'Bad preflight origin.');
    return { method, path: url.pathname, query: [...url.searchParams].sort(([a], [b]) => a.localeCompare(b)), body, response }; });
  for (let i = 0; i < result.length - 1; i++) if (result[i].method === 'GET' && result[i + 1].method === 'GET'
    && result[i].path.startsWith('/v2/resources/types/') && result[i + 1].path.startsWith('/v2/resources/types/')) {
    result.splice(i, 2, ...result.slice(i, i + 2).sort((a, b) => a.path.localeCompare(b.path))); i++;
  }
  return result;
}
const fingerprint = value => itemHash(JSON.stringify(value));
const directoryHash = rows => fingerprint(rows.map(({ itemId, mountResourceInfo, itemTitle, sortId }) => ({ itemId, resourceId: mountResourceInfo.resourceId, itemTitle, sortId })));
function intents(name, scene, trace) {
  const events = trace.filter(event => event.event === 'intent-persisted'), spec = preflightSpec(name);
  check(events.length === (spec.success ? 2 : 0), 'Intent persistence count differs.');
  if (!spec.success) return;
  const f = recoveryFixture(), initial = preflightInitial(name), form = spec.hasDraft ? f.form : f.baseline;
  const source = preflightEntries(name).find(entry => entry.path === recoveryPaths.draft);
  const values = events.map(event => { check(iso(event.at) && Date.parse(scene.startedAt) <= Date.parse(event.at) && Date.parse(event.at) <= Date.parse(scene.finishedAt), 'Intent event outside command.');
    return JSON.parse(Buffer.from(event.bytes, 'base64').toString('utf8')); });
  const putIndex = preflightRequests(name).findIndex(request => request.method === 'PUT');
  for (const event of events) check(trace.slice(0, trace.indexOf(event)).filter(entry => entry.event === 'request').length === putIndex, 'Intent persisted outside the verified preflight/PUT boundary.');
  check(iso(values[0].sentAt) && Date.parse(scene.startedAt) <= Date.parse(values[0].sentAt) && Date.parse(values[0].sentAt) <= Date.parse(scene.finishedAt), 'Intent request time invalid.');
  for (const [index, value] of values.entries()) check(equal(value, { schemaVersion: 2, resourceId: 'local_collection', resourceName: 'alice/collection', resourceTypeCode: 'CT001',
    env: 'dev', userId: 7, state: index === 0 ? 'prepared' : 'sending', baselineFingerprint: fingerprint(f.baseline), baselineAuthFingerprint: fingerprint(f.auth),
    baselineDirectoryFingerprint: directoryHash(initial.published), expectedForm: form, expectedAuthExcludedItems: f.auth, merge: spec.merge,
    directoryFingerprint: directoryHash(initial.draft), payloadSha256: fingerprint({ resourceId: 'local_collection', ...preflightBody(name) }),
    sourceDraftSha256: source ? itemHash(Buffer.from(source.bytes, 'base64')) : null, sentAt: values[0].sentAt }), 'Actual persisted intent fields differ.');
}
export function evaluateCollectionPublishPreflight(observed) {
  const assertions = [], add = (id, fn) => { try { fn(); assertions.push({ id, passed: true, expected: true, actual: true }); }
    catch (error) { assertions.push({ id, passed: false, expected: true, actual: false, reason: error.message }); } };
  add('installed-preflight-binding', () => check(observed && /^[A-Za-z0-9-]{1,80}$/u.test(observed.runId ?? '') && absolute(observed.evidenceDir) && absolute(observed.cliBin)
    && observed.cliBin.endsWith(path.join('node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js')) && observed.packageName === '@freelog-cli/cli2'
    && typeof observed.version === 'string' && observed.version && /^[a-f0-9]{64}$/u.test(observed.binSha256 ?? '')
    && ['win32', 'darwin', 'linux'].includes(observed.platform) && /^v(20|22)\./u.test(observed.nodeVersion ?? '')
    && iso(observed.startedAt) && iso(observed.finishedAt) && Date.parse(observed.startedAt) <= Date.parse(observed.finishedAt) && Date.parse(observed.finishedAt) <= Date.now()
    && equal(observed.apparatusErrors, []) && equal(observed.scenarios?.map(scene => scene.name), preflightNames), 'Installed preflight binding/scenario set differs.'));
  for (const [index, name] of preflightNames.entries()) add(`preflight-${name}`, () => {
    const scene = observed?.scenarios?.[index], previous = index ? observed.scenarios[index - 1].finishedAt : observed.startedAt;
    check(scene && scene.name === name && equal(scene.argv, preflightCommand(name)) && iso(scene.startedAt) && iso(scene.finishedAt)
      && Date.parse(previous) <= Date.parse(scene.startedAt) && Date.parse(scene.startedAt) <= Date.parse(scene.finishedAt) && Date.parse(scene.finishedAt) <= Date.parse(observed.finishedAt)
      && Number.isSafeInteger(scene.childPid) && scene.childPid > 0, 'Actual preflight command/process/window missing.');
    check(equal(scene.result, preflightResult(name)), 'Exact preflight result differs.');
    check(equal(scene.before, preflightEntries(name)) && equal(scene.after, preflightEntries(name, true)) && equal(scene.homeBefore, []) && equal(scene.homeAfter, []), 'Local/home bytes differ.');
    check(equal(scene.remoteBefore, preflightInitial(name)) && equal(scene.remoteAfter, preflightAfter(name)), 'Preflight full model state differs.');
    check(equal(wire(scene.requests), wire(preflightRequests(name))) && equal(scene.apparatusErrors, []), 'Exact preflight SDK requests/responses differ.');
    const needsMutation = name.startsWith('race-') || ['allow-no-draft', 'block-no-published'].includes(name);
    check(Array.isArray(scene.controlActions) && scene.controlActions.length === (needsMutation ? 1 : 0), 'Missing/extra parent mutation.');
    if (needsMutation) {
      const action = scene.controlActions[0], expectedBefore = preflightEntries(name).find(entry => entry.path === recoveryPaths.draft), expectedAfter = preflightEntries(name, true).find(entry => entry.path === recoveryPaths.draft);
      check(action.kind === name && action.point === 'second-rules-get'
        && action.requestIndex === preflightRequests(name).map((request, i) => request.path.endsWith('/collectRules') ? i : -1).filter(i => i >= 0)[1]
        && iso(action.at) && Date.parse(scene.startedAt) <= Date.parse(action.at) && Date.parse(action.at) <= Date.parse(scene.finishedAt)
        && equal(action.remoteBefore, preflightInitial(name)) && equal(action.remoteAfter, preflightMutated(name))
        && equal(action.local, name === 'race-local' ? { path: recoveryPaths.draft, before: expectedBefore.bytes, after: expectedAfter.bytes } : null), 'Parent mutation fields differ.');
    }
    const trace = scene.trace.trim().split('\n').map(JSON.parse);
    check(trace.every(entry => entry.schemaVersion === 1 && ['keyring-replaced', 'keyring-get', 'ready', 'finished', 'request', 'intent-persisted'].includes(entry.event))
      && trace.filter(entry => entry.event === 'ready' && entry.guard === 'collection-publish-preflight-local-v1').length === 1 && trace.at(-1).event === 'finished'
      && equal(wire(trace.filter(entry => entry.event === 'request').map(({ method, path }) => ({ method, path }))), wire(scene.requests.map(({ method, path }) => ({ method, path })))), 'Preflight trace missing or forbidden IO.');
    intents(name, scene, trace);
  });
  const status = assertions.every(assertion => assertion.passed) ? 'PASS' : 'FAIL';
  return { id: collectionPublishPreflightCases[0].id, status, assertions, observations: observed,
    ...(status === 'FAIL' ? { reason: assertions.filter(assertion => !assertion.passed).map(assertion => `${assertion.id}: ${assertion.reason}`).join('; ') } : {}) };
}
export function validateCollectionPublishPreflightFiles(observed) {
  check(absolute(observed?.evidenceDir), 'Missing preflight raw root.'); const seen = new Set();
  for (const scene of observed.scenarios) {
    const { evidenceRef, ...raw } = scene, file = evidenceRef?.path, relative = typeof file === 'string' ? path.relative(observed.evidenceDir, file) : '';
    check(absolute(file) && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && !seen.has(file)
      && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file && lstatSync(file).size <= 2_000_000, 'Missing/unsafe preflight raw.');
    seen.add(file); const bytes = readFileSync(file);
    check(itemHash(bytes) === evidenceRef.sha256 && equal(JSON.parse(bytes.toString('utf8')), raw), 'Preflight raw hash/content differs.');
  }
  check(seen.size === preflightNames.length, 'Missing preflight raw scenario.');
}
