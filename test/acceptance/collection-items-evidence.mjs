/** C03 source-fixed stimuli and independent public-contract oracles. No CLI domain imports. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { recoveryFixture, recoveryDraft } from './collection-recovery-evidence.mjs';

export const itemScenarioNames = Object.freeze(['add-plain', 'add-contract-128', 'contract-missing', 'contract-wrong-licensee', 'contract-envelope',
  'source-envelope', 'source-id', 'source-owner', 'source-metadata', 'exists-envelope', 'exists-set', 'exists-bool', 'exists-race-new', 'exists-race-removed',
  'already', 'aliases', 'no-yes', 'limit-100', 'limit-101', 'mixed-result', 'result-envelope', 'result-readback', 'post-disconnect',
  'auth-mixed', 'auth-pagination', 'auth-bool', 'auth-set', 'auth-invalid', 'auth-missing', 'auth-frozen', 'add-frozen', 'add-rss', 'add-auto']);
export const itemScenarioRules = Object.freeze(itemScenarioNames.map((scenario, index) => Object.freeze({ scenario, ruleId: `C03.I${String(index + 1).padStart(2, '0')}` })));
export const collectionItemsCases = Object.freeze([Object.freeze({ id: 'COLLECTION.ITEMS.INSTALLED_MATRIX', kind: 'product-case', required: true,
  parentRule: 'COLLECTION.MANAGEMENT_MATRIX', script: 'verify-collection-items.mjs', title: 'Installed explicit collection item add and read-only authorization matrix',
  assertionIds: Object.freeze(['installed-run-binding', ...itemScenarioNames.map((name) => `item-${name}`)]),
  layer: 'installed-candidate/local-loopback/not-real-dev/not-TTY', inputClass: 'C03.C/R/S/E and authorization, 33 fixed scenarios',
  scenarioRules: itemScenarioRules,
  preconditions: ['Exact installed CLI and SDK, isolated synthetic identity and loopback transport.'],
  action: ['Execute all fixed explicit commands and independently recompute exact outcomes and side effects.'],
  forbiddenSideEffects: ['real network', 'native keyring', 'payment/signing', 'publication', 'unknown POST replay', 'workspace bin fallback'],
  designRefs: [{ path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/单品/01-添加单品.md', section: '3–5' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/单品/03-编辑移除排序与授权状态.md', section: '授权状态' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md', section: '8.10' }],
})]);
export const itemHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const copy = (value) => structuredClone(value);
const envelope = (data) => ({ ret: 0, errCode: 0, data });
const range = (count) => Array.from({ length: count }, (_, index) => `range_${String(index).padStart(3, '0')}`);
const itemRow = (suffix, index = 0) => ({ itemId: `item_${suffix}`, itemTitle: suffix, sortId: index + 1,
  mountResourceInfo: { resourceId: `source_${suffix}`, resourceName: `alice/${suffix}`, resourceTitle: suffix } });
const draftsPath = '/v2/resources/catalogues/drafts/local_collection/items';
const targetPath = '/v2/resources/local_collection';
const rulesPath = '/v2/resources/catalogue/local_collection/items/collectRules';
const noWrites = new Set(['contract-missing', 'contract-wrong-licensee', 'contract-envelope', 'source-envelope', 'source-id', 'source-owner', 'source-metadata',
  'exists-envelope', 'exists-set', 'exists-bool', 'exists-race-new', 'exists-race-removed', 'already', 'no-yes', 'limit-101', 'add-frozen', 'add-rss', 'add-auto']);
const contractNames = new Set(['add-contract-128', 'contract-missing', 'contract-wrong-licensee', 'contract-envelope']);
const sourceNames = new Set(['source-envelope', 'source-id', 'source-owner', 'source-metadata']);
const existsNames = new Set(['exists-envelope', 'exists-set', 'exists-bool', 'exists-race-new', 'exists-race-removed']);

/** Only independent fixture inputs; source metadata is a read DTO, not a POST DTO. */
export function itemFixture(name) {
  if (!itemScenarioNames.includes(name)) throw new Error('Unknown fixed item scenario.');
  const authCase = name.startsWith('auth-');
  const suffixes = name.startsWith('limit-') ? range(name === 'limit-100' ? 100 : 101)
    : name === 'mixed-result' ? ['image', 'theme', 'other'] : name === 'exists-set' ? ['image', 'theme'] : ['image'];
  const source = (suffix) => ({ resourceId: `source_${suffix}`, resourceName: `alice/${suffix}`, resourceTitle: suffix,
    userId: 7, subjectType: 1, status: 1, latestVersion: '1.0.0', baseUpcastResources: contractNames.has(name) ? [{ resourceId: 'upstream_image' }] : [] });
  const sources = suffixes.map((suffix) => ({ selectorKind: 'id', selectorValue: `source_${suffix}`, response: envelope(source(suffix)) }));
  if (name === 'aliases') sources.push({ selectorKind: 'name', selectorValue: 'alice/image', response: envelope(source('image')) });
  if (name === 'source-envelope') sources[0].response.ret = 1;
  if (name === 'source-id') sources[0].response.data.resourceId = 'wrong_source';
  if (name === 'source-owner') sources[0].response.data.userId = 8;
  if (name === 'source-metadata') delete sources[0].response.data.baseUpcastResources;
  const target = { resourceId: 'local_collection', resourceName: 'alice/collection', resourceTitle: 'Local recovery', userId: 7,
    subjectType: 4, resourceTypeCode: 'CT001', status: name.endsWith('frozen') ? 2 : 0, latestVersion: 'snapshot_0', rssSource: name === 'add-rss' ? 'yes' : 'no' };
  let initial = ['already', 'exists-race-removed'].includes(name) ? [itemRow('image')] : [];
  if (authCase) initial = name === 'auth-pagination' ? range(101).map(itemRow) : [itemRow('image'), itemRow('theme', 1)];
  const final = name === 'mixed-result' ? [itemRow('image'), itemRow('other', 1)] : suffixes.map(itemRow);
  const exists = envelope(suffixes.map((suffix) => ({ resourceId: `source_${suffix}`, isExists: initial.some((row) => row.mountResourceInfo.resourceId === `source_${suffix}`) })).reverse());
  if (name === 'exists-envelope') exists.ret = 1;
  if (name === 'exists-set') exists.data = [copy(exists.data[0]), copy(exists.data[0])];
  if (name === 'exists-bool') exists.data[0].isExists = 'false';
  if (name === 'exists-race-new') exists.data[0].isExists = true;
  if (name === 'exists-race-removed') exists.data[0].isExists = false;
  const contracts = envelope([{ contractId: 'contract_upstream', subjectId: 'upstream_image', subjectType: 1, licenseeId: 'local_collection',
    licenseeIdentityType: 4, status: 0, authStatus: 128 }]);
  if (name === 'contract-missing') contracts.data = [];
  if (name === 'contract-wrong-licensee') contracts.data[0].licenseeId = 'wrong_collection';
  if (name === 'contract-envelope') contracts.ret = 1;
  const selected = name === 'auth-pagination' ? ['item_range_000', 'item_range_100']
    : name === 'auth-invalid' ? ['bad,item'] : name === 'auth-missing' ? ['item_absent'] : ['item_image', 'item_theme'];
  const auth = envelope(selected.map((itemId, index) => ({ itemId, isAuth: index === 0 })).reverse());
  if (name === 'auth-bool') auth.data[0].isAuth = 1;
  if (name === 'auth-set') auth.data = [copy(auth.data[0]), copy(auth.data[0])];
  const addReply = envelope({ addSuccessfulItems: suffixes.map((suffix) => ({ resourceId: `source_${suffix}`, itemTitle: suffix })), addFailedItems: [], ignoreItems: [] });
  if (name === 'mixed-result') addReply.data = { addSuccessfulItems: [{ resourceId: 'source_image', itemTitle: 'image' }],
    addFailedItems: [{ resourceId: 'source_theme', reason: 'synthetic refusal' }], ignoreItems: [{ resourceId: 'source_other', itemId: 'item_other', itemTitle: 'other' }] };
  if (name === 'result-envelope') addReply.ret = 1;
  return { target, sources, initial, final, published: [itemRow('published_sentinel')], selected,
    rules: envelope(name === 'add-auto' ? { status: 1, conditionType: 1, filterConditions: [] } : null), contracts, exists, auth, addReply,
    flags: { readbackInvalid: name === 'result-readback', postDisconnect: name === 'post-disconnect' }, writes: !authCase && !noWrites.has(name) };
}

export function itemCommand(name) {
  const f = itemFixture(name), auth = name.startsWith('auth-');
  return ['collection', 'item', ...(auth ? ['auth', 'status', ...f.selected, ...(name === 'auth-mixed' ? ['item_image'] : [])]
    : ['add', ...f.sources.map((s) => `${s.selectorKind}:${s.selectorValue}`)]), '--resource', 'id:local_collection', '--env', 'dev', '--json',
  ...(auth || name === 'no-yes' ? [] : ['--yes'])];
}
export function itemInitialEntries() {
  const f = recoveryFixture(), json = (v) => Buffer.from(`${JSON.stringify(v, null, 2)}\n`).toString('base64');
  return [
    ...['.freelog', '.freelog/collection-forms', '.freelog/collection-forms/dev', '.freelog/collection-forms/intents', 'empty-dir'].map((p) => ({ path: p, kind: 'directory' })),
    { path: '.freelog/1.json', kind: 'file', bytes: json(f.identity) }, { path: '.freelog/auth', kind: 'file', bytes: json(f.selector) },
    { path: '.freelog/.sequence', kind: 'file', bytes: Buffer.from('1\n').toString('base64') },
    { path: '.freelog/collection-forms/dev/local_collection.json', kind: 'file', bytes: json(recoveryDraft(f.form)) },
    { path: 'keep.bin', kind: 'file', bytes: Buffer.from([0, 255, 254]).toString('base64') },
  ].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function itemPostBody(name) {
  const f = itemFixture(name), ids = [...new Set(f.sources.map((s) => s.response.data.resourceId))];
  return { addCollectionItems: ids.filter((id) => !f.initial.some((r) => r.mountResourceInfo.resourceId === id)).map((id) => {
    const s = f.sources.find((entry) => entry.response.data.resourceId === id).response.data;
    return { resourceId: id, itemTitle: s.resourceTitle, authExcludedItems: contractNames.has(name)
      ? [{ resourceId: 'upstream_image', excludedType: 'contractId', excludedValue: 'contract_upstream' }] : [] };
  }), isPublish: 0 };
}
export function itemPage(rows, skip, latest = false, invalid = false) {
  return invalid ? envelope(null) : envelope({ skip, limit: 100, totalItem: rows.length, dataList: copy(rows.slice(skip, skip + 100)) });
}
const request = (method, pathname, params, body, response) => ({ method, path: pathname + (Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''), body, response });
/** Independent expected sequence, not the server dispatcher: extra/repeated reads and writes fail. */
export function itemExpectedRequests(name) {
  const f = itemFixture(name), rows = [], auth = name.startsWith('auth-');
  const get = (pathname, params, response) => rows.push(request('GET', pathname, params, null, response));
  const target = () => get(targetPath, { isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }, envelope(f.target));
  const page = (draft, latest, bad = false) => {
    for (let skip = 0; skip === 0 || skip < draft.length; skip += 100) get(draftsPath,
      { skip, limit: 100, sortField: 'sortId', sortType: 1, ...(latest ? { isLoadLatestVersionInfo: 1 } : {}) }, itemPage(draft, skip, latest, bad));
  };
  if (name === 'auth-invalid') return rows;
  target();
  if (auth) {
    page(f.initial, false);
    if (name !== 'auth-missing') get(`${draftsPath}/batchAuth`, { itemIds: f.selected.join(',') }, f.auth);
    return rows;
  }
  if (name === 'add-frozen' || name === 'add-rss') return rows;
  get(rulesPath, {}, f.rules);
  if (name === 'add-auto') return rows;
  target(); page(f.initial, true);
  for (const source of f.sources) get(`/v2/resources/${encodeURIComponent(source.selectorValue)}`, { isLoadLatestVersionInfo: 1 }, source.response);
  if (sourceNames.has(name) || name === 'limit-101') return rows;
  get(`${draftsPath}/checkExists`, { resourceIds: [...new Set(f.sources.map((s) => s.response.data.resourceId))].join(',') }, f.exists);
  if (existsNames.has(name) || name === 'already') return rows;
  if (contractNames.has(name)) get('/v2/contracts/list', { subjectIds: 'upstream_image', subjectType: 1, licenseeId: 'local_collection', licenseeIdentityType: 4, isLoadPolicyInfo: 1 }, f.contracts);
  if (!f.writes) return rows;
  rows.push(request('POST', draftsPath, {}, itemPostBody(name), f.flags.postDisconnect ? { disconnected: true } : f.addReply));
  if (name === 'post-disconnect' || name === 'result-envelope') return rows;
  target(); page(f.final, true, f.flags.readbackInvalid);
  return rows;
}
const errorMessages = {
  COLLECTION_CONTRACT_RESPONSE_INVALID: '平台合同查询返回格式无法识别',
  COLLECTION_ITEM_BROWSER_AUTH_REQUIRED: '单品上游资源缺少当前合集合同，请先到网页端以合集 local_collection 身份处理授权/支付后重试：upstream_image',
  COLLECTION_ITEM_SOURCE_RESPONSE_INVALID: '平台单品来源详情的成功信封、精确身份或必要字段无效，未提交添加；请先核对资源详情。',
  COLLECTION_ITEM_SOURCE_INVALID: '单品必须是当前账号已上架且已有版本的单资源，未提交添加。',
  COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID: '平台草稿单品判重响应不完整或无效，未提交添加。',
  COLLECTION_ITEM_CATALOGUE_CHANGED: '草稿判重与完整目录读取不一致；请先重新运行 collection item list 核对，再决定是否添加，本次未提交。',
  COLLECTION_ITEM_LIMIT: '一次最多添加100个不同来源资源，请明确拆分后分别执行；本次未提交。', FORM_NEED_YES: '请加 --yes 确认预览',
  COLLECTION_ITEM_RESULT_UNKNOWN: '目录添加结果无法确认；请先用 collection item list 及网页核对实际结果，勿直接重复执行。',
  COLLECTION_ITEM_ADD_PARTIAL: '已添加：source_image；未变更：source_other；失败：source_theme "synthetic refusal"',
  COLLECTION_ITEM_AUTH_RESPONSE_INVALID: '平台单品授权状态响应不完整或无效', COLLECTION_ITEM_ID_INVALID: 'itemId不能为空或包含空白、逗号或控制字符',
  COLLECTION_ITEM_NOT_FOUND: '目录草稿中不存在该 itemId', COLLECTION_FROZEN: '冻结合集不能修改目录草稿',
  COLLECTION_RSS_READONLY: 'RSS 合集不能手工修改目录', COLLECTION_AUTO_COLLECTING: '自动收录开启时不能手工修改目录',
};
export function itemExpectedResult(name) {
  const codes = { 'contract-missing': 'COLLECTION_ITEM_BROWSER_AUTH_REQUIRED', 'contract-wrong-licensee': 'COLLECTION_ITEM_BROWSER_AUTH_REQUIRED', 'contract-envelope': 'COLLECTION_CONTRACT_RESPONSE_INVALID',
    'source-envelope': 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID', 'source-id': 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID', 'source-owner': 'COLLECTION_ITEM_SOURCE_INVALID', 'source-metadata': 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID',
    'exists-envelope': 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID', 'exists-set': 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID', 'exists-bool': 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID',
    'exists-race-new': 'COLLECTION_ITEM_CATALOGUE_CHANGED', 'exists-race-removed': 'COLLECTION_ITEM_CATALOGUE_CHANGED', 'no-yes': 'FORM_NEED_YES', 'limit-101': 'COLLECTION_ITEM_LIMIT',
    'mixed-result': 'COLLECTION_ITEM_ADD_PARTIAL', 'result-envelope': 'COLLECTION_ITEM_RESULT_UNKNOWN', 'result-readback': 'COLLECTION_ITEM_RESULT_UNKNOWN', 'post-disconnect': 'COLLECTION_ITEM_RESULT_UNKNOWN',
    'auth-bool': 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID', 'auth-set': 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID', 'auth-invalid': 'COLLECTION_ITEM_ID_INVALID', 'auth-missing': 'COLLECTION_ITEM_NOT_FOUND',
    'add-frozen': 'COLLECTION_FROZEN', 'add-rss': 'COLLECTION_RSS_READONLY', 'add-auto': 'COLLECTION_AUTO_COLLECTING' };
  const code = codes[name];
  if (code) return { status: 1, stdout: `${JSON.stringify({ code, message: errorMessages[code] })}\n` };
  if (name.startsWith('auth-')) return { status: 0, stdout: name === 'auth-pagination'
    ? 'item_range_000\tsource_range_000\t已授权\nitem_range_100\tsource_range_100\t未授权\n'
    : 'item_image\tsource_image\t已授权\nitem_theme\tsource_theme\t未授权\n' };
  return { status: 0, stdout: name === 'already' ? '已添加：无；未变更：source_image\n'
    : `已添加：${name === 'limit-100' ? range(100).map((id) => `source_${id}`).join('、') : 'source_image'}；未变更：无\n` };
}
const check = (condition, message) => { if (!condition) throw new Error(message); };
const absolute = (v) => typeof v === 'string' && path.isAbsolute(v) && path.resolve(v) === v;
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const normalizeRequest = ({ method, path: raw, body, response }) => {
  check(typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//'), 'Invalid request path.');
  const u = new URL(raw, 'https://api.devfreelog.com');
  check(!u.hash && u.origin === 'https://api.devfreelog.com', 'Invalid request origin.');
  return { method, path: u.pathname, query: [...u.searchParams].sort(([a], [b]) => a.localeCompare(b)), body, response };
};
function validateScenario(o, name, observed) {
  check(o && o.name === name && equal(o.argv, itemCommand(name)), 'Scenario/argv differs.');
  check(iso(o.startedAt) && iso(o.finishedAt) && Date.parse(observed.startedAt) <= Date.parse(o.startedAt)
    && Date.parse(o.startedAt) <= Date.parse(o.finishedAt) && Date.parse(o.finishedAt) <= Date.parse(observed.finishedAt)
    && Number.isSafeInteger(o.childPid) && o.childPid > 0, 'Actual child/window missing.');
  const expected = itemExpectedResult(name);
  check(equal(o.result, { ...expected, signal: null, error: null, timedOut: false, stderr: '' }), 'Exact process result differs.');
  check(equal(o.before, itemInitialEntries()) && equal(o.after, o.before), 'Full local bytes changed/missing.');
  check(Array.isArray(o.requests) && equal(o.requests.map(normalizeRequest), itemExpectedRequests(name).map(normalizeRequest)), 'Exact ordered request/response/body matrix differs.');
  const f = itemFixture(name);
  check(equal(o.remoteBefore, { draft: f.initial, published: f.published })
    && equal(o.remoteAfter, { draft: f.writes ? f.final : f.initial, published: f.published }), 'Exact remote side effects differ.');
  check(equal(o.apparatusErrors, []) && typeof o.trace === 'string' && o.trace.endsWith('\n'), 'Apparatus failed.');
  const trace = o.trace.trim().split('\n').map(JSON.parse);
  check(trace.every((e) => e.schemaVersion === 1 && ['ready', 'finished', 'keyring-replaced', 'keyring-get', 'request'].includes(e.event))
    && trace.filter((e) => e.event === 'ready' && e.guard === 'collection-items-local-v1').length === 1
    && trace.filter((e) => e.event === 'keyring-replaced').length >= 1
    && trace.at(-1).event === 'finished' && trace.filter((e) => e.event === 'finished').length === 1
    && equal(trace.filter((e) => e.event === 'request').map(({ method, path }) => ({ method, path })), o.requests.map(({ method, path }) => ({ method, path }))), 'Transport trace differs or contains prohibited IO.');
}
export function evaluateCollectionItems(observed) {
  const assertions = [], add = (id, action) => { try { action(); assertions.push({ id, passed: true, expected: true, actual: true }); }
    catch (error) { assertions.push({ id, passed: false, expected: true, actual: false, reason: error.message }); } };
  add('installed-run-binding', () => check(observed && /^[A-Za-z0-9-]{1,80}$/u.test(observed.runId ?? '') && absolute(observed.evidenceDir) && absolute(observed.cliBin)
    && observed.cliBin.endsWith(path.join('node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js')) && observed.packageName === '@freelog-cli/cli2'
    && typeof observed.version === 'string' && observed.version.length > 0 && /^[a-f0-9]{64}$/u.test(observed.binSha256 ?? '')
    && ['win32', 'linux', 'darwin'].includes(observed.platform) && /^v(20|22)\./u.test(observed.nodeVersion ?? '')
    && iso(observed.startedAt) && iso(observed.finishedAt) && Date.parse(observed.startedAt) <= Date.parse(observed.finishedAt) && Date.parse(observed.finishedAt) <= Date.now()
    && equal(observed.apparatusErrors, []) && equal(observed.scenarios?.map((s) => s.name), itemScenarioNames), 'Installed run/scenario binding differs.'));
  for (const [i, name] of itemScenarioNames.entries()) add(`item-${name}`, () => validateScenario(observed?.scenarios?.[i], name, observed));
  const status = assertions.every((a) => a.passed) ? 'PASS' : 'FAIL';
  return { id: collectionItemsCases[0].id, status, assertions, observations: observed,
    ...(status === 'FAIL' ? { reason: assertions.filter((a) => !a.passed).map((a) => `${a.id}: ${a.reason}`).join('; ') } : {}) };
}
export function validateCollectionItemsFiles(observed) {
  check(absolute(observed?.evidenceDir) && Array.isArray(observed.scenarios), 'Missing item raw binding.');
  const seen = new Set();
  for (const scenario of observed.scenarios) {
    const { evidenceRef, ...raw } = scenario, file = evidenceRef?.path, relative = typeof file === 'string' ? path.relative(observed.evidenceDir, file) : '';
    check(absolute(file) && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && !seen.has(file)
      && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file && lstatSync(file).size <= 1_000_000, 'Unsafe/missing item raw file.');
    seen.add(file); const bytes = readFileSync(file);
    check(itemHash(bytes) === evidenceRef.sha256 && equal(JSON.parse(bytes.toString('utf8')), raw), 'Item raw hash/content differs.');
  }
  check(seen.size === itemScenarioNames.length, 'Missing/duplicate item raw files.');
}
