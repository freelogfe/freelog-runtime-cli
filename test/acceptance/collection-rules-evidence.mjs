/** C05 fixed stimuli and independent wire/state oracle; no production-domain imports. */
import { isDeepStrictEqual as equal } from 'node:util';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { itemHash, itemInitialEntries } from './collection-items-evidence.mjs';
export { itemHash as rulesHash };

export const rulesNames = Object.freeze(['get-null', 'get-manual', 'get-auto', 'get-failed', 'get-invalid', 'get-serialize-invalid',
  'serialize-completed', 'serialize-serial', 'off-preserve', 'auto-all', 'auto-any', 'auto-existing', 'missing-rules', 'empty-rules',
  'invalid-field', 'invalid-operator', 'invalid-value', 'invalid-type', 'dirty-101', 'bad-catalogue', 'bad-ack', 'missing-ack',
  'string-ack', 'disconnect', 'readback-mismatch', 'readback-invalid', 'no-yes', 'frozen', 'rss',
  'gate-add', 'gate-remove', 'gate-rename', 'gate-move', 'gate-sort']);
const design = 'docs/一期/产品方案/脚手架设计/PHASE/合集';
export const collectionRulesCases = Object.freeze([{
  id: 'COLLECTION.RULES.INSTALLED_MATRIX', kind: 'product-case', required: true, parentRule: 'COLLECTION.MANAGEMENT_MATRIX',
  title: 'Installed collection rule reads, explicit updates, uncertain writes and manual-write gates', script: 'verify-collection-rules.mjs',
  assertionIds: ['installed-rules-binding', ...rulesNames.map(name => `rules-${name}`)],
  layer: 'installed-candidate/local-loopback/non-TTY/not-real-dev', inputClass: 'C05.I01–I34 and C05.W01–W04',
  designRefs: [{ path: `${design}/单品/02-自动收录与手动目录.md`, sections: ['1', '2', '3', '4'] },
    { path: `${design}/测试/00-功能拓扑与证据驱动测试门禁.md`, sections: ['8.15', '8.16'] }],
  scenarioRules: rulesNames.map((scenario, index) => ({ scenario, ruleId: `C05.I${String(index + 1).padStart(2, '0')}` })),
  preconditions: ['Exact installed candidate; isolated synthetic owner/keyring and closed local transport.'],
  action: ['Execute fixed argv; retain exact process, requests/responses, all local/home bytes and remote model states.'],
  forbiddenSideEffects: ['real network', 'signing/payment', 'native keyring', 'automatic retry', 'publication', 'local draft mutation'],
}]);
export const rulesPath = '/v2/resources/catalogue/local_collection/items/collectRules';
export const rulesPublished = '/v2/resources/catalogue/local_collection/items';
export const rulesDraft = '/v2/resources/catalogues/drafts/local_collection/items';
export const rulesOk = data => ({ ret: 0, errCode: 0, data });
const copy = value => structuredClone(value);
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const baseConditions = [{ key: 'resourceTitle', limitOperatorType: 'ENDS_WITH', value: 'old' },
  { key: 'authIdentity', limitOperatorType: 'NOT_INCLUDES', value: 'alice/skip' }];
const enabling = name => ['auto-all', 'auto-any', 'auto-existing', 'dirty-101', 'bad-catalogue'].includes(name);
const fileInput = name => enabling(name) || ['empty-rules', 'invalid-field', 'invalid-operator', 'invalid-value', 'invalid-type'].includes(name);
const writes = new Set(['serialize-completed', 'serialize-serial', 'off-preserve', 'auto-all', 'auto-any', 'auto-existing',
  'bad-ack', 'missing-ack', 'string-ack', 'disconnect', 'readback-mismatch', 'readback-invalid']);
const ackFailure = name => ['bad-ack', 'missing-ack', 'string-ack', 'disconnect'].includes(name);
export const rulesType = { code: 'RT003011', name: '图片', isTerminate: true, status: 1, subjectType: [1] };
export function rulesInput(name) {
  if (name === 'empty-rules') return [];
  if (name === 'invalid-field') return [{ field: 'unknown', operator: 'INCLUDES', value: 'x' }];
  if (name === 'invalid-operator') return [{ field: 'title', operator: 'EQUAL', value: 'x' }];
  if (name === 'invalid-value') return [{ field: 'title', operator: 'INCLUDES', value: '  ' }];
  if (name === 'invalid-type') return [{ field: 'type', operator: 'EQUAL', value: 'RT003011' }];
  return [{ field: 'title', operator: 'INCLUDES', value: '旅行' }, { field: 'authIdentity', operator: 'STARTS_WITH', value: 'author' },
    { field: 'authIdentity', operator: 'INCLUDES', value: 'other/prefix' }, { field: 'type', operator: 'EQUAL', value: 'RT003011' }];
}
export function rulesEntries(name) {
  const entries = itemInitialEntries();
  if (fileInput(name)) entries.push({ path: 'rules.json', kind: 'file', bytes: Buffer.from(json(rulesInput(name))).toString('base64') });
  return entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function rulesCommand(name) {
  let args;
  if (name.startsWith('gate-')) {
    const operation = name.slice(5);
    const specific = { add: ['add', 'id:source_image'], remove: ['remove', 'item_one'], rename: ['rename', 'item_one', '--title', 'new'],
      move: ['move', 'item_one', '--before', 'item_two'], sort: ['sort', '--by', 'title', '--asc'] };
    args = ['collection', 'item', ...specific[operation]];
  } else {
    args = ['collection', 'collect-rules', name.startsWith('get-') ? 'get' : 'set'];
    if (!name.startsWith('get-')) {
      if (name.startsWith('serialize-')) args.push('--serialize', name === 'serialize-completed' ? 'completed' : 'serial');
      else args.push('--auto', fileInput(name) || name === 'missing-rules' ? name === 'auto-any' ? 'any' : 'all' : 'off');
      if (fileInput(name)) args.push('--rules', 'rules.json');
    }
  }
  args.push('--resource', 'id:local_collection', '--env', 'dev', '--json');
  if (name !== 'no-yes') args.push('--yes');
  return args;
}
export function rulesModel(name, after = false) {
  const target = { resourceId: 'local_collection', resourceName: 'alice/collection', resourceTitle: 'Rules matrix', userId: 7,
    subjectType: 4, resourceTypeCode: 'CT001', status: name === 'frozen' ? 2 : 0, serializeStatus: name === 'get-serialize-invalid' ? '1' : 1 };
  if (name === 'rss') target.rssSource = 'yes';
  let rules = name === 'get-null' ? null : { status: name === 'get-auto' || name === 'off-preserve' || name === 'auto-existing' || name.startsWith('gate-') ? 1 : 0,
    conditionType: 2, filterConditions: copy(baseConditions) };
  if (name === 'get-invalid') rules.status = '0';
  const published = Array.from({ length: name === 'dirty-101' ? 101 : 1 }, (_, index) => ({ itemId: `item_${index}`, itemTitle: `Title ${index}`,
    sortId: index + 1, mountResourceInfo: { resourceId: `source_${index}` } }));
  const draft = copy(published);
  if (name === 'dirty-101') draft[100].itemTitle = 'unpublished';
  if (after && writes.has(name)) {
    const payload = rulesPayload(name);
    target.serializeStatus = payload.serializeStatus;
    rules = { status: name === 'readback-mismatch' ? 1 : payload.status, conditionType: payload.conditionType, filterConditions: copy(payload.filterConditions) };
  }
  return { target, rules, published, draft };
}
export function rulesPayload(name) {
  return { serializeStatus: name === 'serialize-serial' ? 0 : 1, status: enabling(name) ? 1 : 0,
    conditionType: enabling(name) ? name === 'auto-any' ? 2 : 1 : 2,
    filterConditions: enabling(name) ? [
      { key: 'resourceTitle', limitOperatorType: 'INCLUDES', value: '旅行' },
      { key: 'authIdentity', limitOperatorType: 'STARTS_WITH', value: 'alice/author' },
      { key: 'authIdentity', limitOperatorType: 'INCLUDES', value: 'other/prefix' },
      { key: 'resourceTypeCode', limitOperatorType: 'EQUAL', value: 'RT003011' },
    ] : copy(baseConditions) };
}
export function rulesPage(rows, skip) { return rulesOk({ skip, limit: 100, totalItem: rows.length, dataList: copy(rows.slice(skip, skip + 100)) }); }
const errors = {
  'get-failed': ['COLLECTION_RULES_RESPONSE_INVALID', '平台收录规则不是完整的成功响应'],
  'get-invalid': ['COLLECTION_RULES_RESPONSE_INVALID', '平台收录规则缺少有效状态或完整条件数组'],
  'get-serialize-invalid': ['COLLECTION_RULES_RESPONSE_INVALID', '平台未明确返回有效完结状态，不能猜测或覆盖'],
  'missing-rules': ['COLLECTION_AUTO_RULES_REQUIRED', '开启自动收录必须同时提供非空 --rules'],
  'empty-rules': ['COLLECTION_AUTO_RULES_REQUIRED', '自动收录必须至少有一条规则'],
  'invalid-field': ['COLLECTION_RULES_JSON_INVALID', '规则仅支持 title/authIdentity/type、合法操作符和字符串 value'],
  'invalid-operator': ['COLLECTION_RULE_TITLE_INVALID', '标题规则仅支持 includes/not-includes/starts-with/ends-with，且不超过100字符'],
  'invalid-value': ['COLLECTION_RULE_VALUE_REQUIRED', '收录规则 value 不能为空'],
  'invalid-type': ['TYPE_NOT_LEAF', '必须是启用中的单资源最终叶子类型'],
  'dirty-101': ['COLLECTION_AUTO_DRAFT_DIRTY', '目录草稿与已发布目录不同；请先发布手工目录后再开启自动收录'],
  'bad-catalogue': ['COLLECTION_ITEMS_RESPONSE_INVALID', '平台目录响应不完整或格式无效，无法核验完整目录。'],
  'readback-mismatch': ['COLLECTION_RULES_VERIFY_FAILED', '收录规则写入后复核不一致；请重新读取后再继续'],
  'readback-invalid': ['COLLECTION_RULES_RESPONSE_INVALID', '平台收录规则不是完整的成功响应'],
  'no-yes': ['FORM_NEED_YES', '请加 --yes 确认预览'], 'frozen': ['COLLECTION_FROZEN', '冻结合集不能修改收录规则'],
  'rss': ['COLLECTION_RSS_READONLY', 'RSS 合集当前不支持 CLI 收录规则维护'],
};
export function rulesExpectedResult(name) {
  let failure = errors[name];
  if (ackFailure(name)) failure = ['COLLECTION_RULES_WRITE_UNCONFIRMED', '收录规则写入未获明确成功确认；请先运行 collection collect-rules get 核对实际结果，勿直接重发。'];
  if (name.startsWith('gate-')) failure = ['COLLECTION_AUTO_COLLECTING', '自动收录开启时不能手工修改目录'];
  const model = rulesModel(name, writes.has(name));
  const value = failure ? { code: failure[0], message: failure[1] } : { serializeStatus: model.target.serializeStatus,
    ...(model.rules ?? { status: 0, conditionType: 1, filterConditions: [] }) };
  return { status: failure ? 1 : 0, signal: null, error: null, timedOut: false,
    stdout: failure ? `${JSON.stringify(value)}\n` : json(value), stderr: '' };
}
export function rulesExpectedRequests(name) {
  if (name === 'missing-rules') return [];
  const before = rulesModel(name), after = rulesModel(name, true), result = [];
  const get = (url, response) => result.push({ method: 'GET', path: url, body: null, response: copy(response) });
  const info = model => get('/v2/resources/local_collection?isLoadLatestVersionInfo=1&isLoadPolicyInfo=1', rulesOk(model.target));
  info(before);
  if (name === 'frozen' || name === 'rss') return result;
  get(rulesPath, name === 'get-failed' ? { ret: 1, errCode: 0, data: before.rules } : rulesOk(before.rules));
  if (enabling(name) || name === 'invalid-type') get('/v2/resources/types/getInfoByCode?code=RT003011',
    rulesOk({ ...rulesType, isTerminate: name !== 'invalid-type' }));
  if (['auto-all', 'auto-any', 'dirty-101', 'bad-catalogue'].includes(name)) {
    for (const [url, rows] of [[rulesPublished, before.published], [rulesDraft, before.draft]]) {
      for (let skip = 0; skip < rows.length; skip += 100) get(`${url}?skip=${skip}&limit=100&sortField=sortId&sortType=1`,
        name === 'bad-catalogue' ? rulesOk({ skip: 0, limit: 100, totalItem: 1, dataList: [] }) : rulesPage(rows, skip));
    }
  }
  if (!writes.has(name)) return result;
  const response = name === 'bad-ack' ? { ret: 1, errCode: 0, data: null } : name === 'missing-ack' ? { data: null }
    : name === 'string-ack' ? { ret: '0', errCode: 0, data: null } : name === 'disconnect' ? { disconnected: true } : rulesOk(null);
  result.push({ method: 'POST', path: rulesPath, body: rulesPayload(name), response });
  if (ackFailure(name)) return result;
  info(after); get(rulesPath, name === 'readback-invalid' ? { ret: 1, errCode: 0, data: after.rules } : rulesOk(after.rules));
  return result;
}
function check(value, reason) { if (!value) throw new Error(reason); }
const absolute = value => typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function requests(values) {
  const normalized = values.map(({ method, path: raw, body, response }) => {
    check(typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//'), 'Invalid rules request path.');
    const url = new URL(raw, 'https://api.devfreelog.com');
    check(url.origin === 'https://api.devfreelog.com' && !url.hash, 'Invalid rules request origin.');
    return { method, path: url.pathname, query: [...url.searchParams].sort(([a], [b]) => a.localeCompare(b)), body, response };
  });
  // Only adjacent independent catalogue reads can interleave; never move one across POST or identity reads.
  for (let i = 0; i < normalized.length;) {
    const start = i;
    while (i < normalized.length && normalized[i].method === 'GET' && [rulesPublished, rulesDraft].includes(normalized[i].path)) i++;
    if (i > start) normalized.splice(start, i - start, ...normalized.slice(start, i).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
    else i++;
  }
  return normalized;
}
export function evaluateCollectionRules(observed) {
  const assertions = [], add = (id, run) => { try { run(); assertions.push({ id, passed: true, expected: true, actual: true }); }
    catch (error) { assertions.push({ id, passed: false, expected: true, actual: false, reason: error.message }); } };
  add('installed-rules-binding', () => check(observed && /^[A-Za-z0-9-]{1,80}$/u.test(observed.runId ?? '') && absolute(observed.evidenceDir)
    && absolute(observed.cliBin) && observed.cliBin.endsWith(path.join('node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js'))
    && observed.packageName === '@freelog-cli/cli2' && typeof observed.version === 'string' && observed.version.length > 0
    && /^[a-f0-9]{64}$/u.test(observed.binSha256 ?? '') && ['win32', 'darwin', 'linux'].includes(observed.platform) && /^v(20|22)\./u.test(observed.nodeVersion ?? '')
    && iso(observed.startedAt) && iso(observed.finishedAt) && Date.parse(observed.startedAt) <= Date.parse(observed.finishedAt) && Date.parse(observed.finishedAt) <= Date.now()
    && equal(observed.apparatusErrors, []) && equal(observed.scenarios?.map(scene => scene.name), rulesNames), 'Rules installed binding or complete scene set differs.'));
  for (const [index, name] of rulesNames.entries()) add(`rules-${name}`, () => {
    const scene = observed?.scenarios?.[index], previous = index === 0 ? observed.startedAt : observed.scenarios[index - 1].finishedAt;
    check(scene && scene.name === name && equal(scene.argv, rulesCommand(name)), 'Fixed rules argv differs.');
    check(iso(scene.startedAt) && iso(scene.finishedAt) && Date.parse(previous) <= Date.parse(scene.startedAt)
      && Date.parse(scene.startedAt) <= Date.parse(scene.finishedAt) && Date.parse(scene.finishedAt) <= Date.parse(observed.finishedAt)
      && Number.isSafeInteger(scene.childPid) && scene.childPid > 0, 'Actual rules process/window missing.');
    const expectedResult = rulesExpectedResult(name), { stdout, ...process } = scene.result;
    const { stdout: expectedStdout, ...expectedProcess } = expectedResult;
    check(equal(process, expectedProcess) && equal(JSON.parse(stdout), JSON.parse(expectedStdout)), 'Exact rules process/JSON differs.');
    check(equal(scene.before, rulesEntries(name)) && equal(scene.after, scene.before) && equal(scene.homeBefore, []) && equal(scene.homeAfter, []), 'Local/home bytes differ.');
    check(equal(scene.remoteBefore, rulesModel(name)) && equal(scene.remoteAfter, rulesModel(name, true)), 'Full rules model state differs.');
    check(equal(requests(scene.requests), requests(rulesExpectedRequests(name))) && equal(scene.apparatusErrors, []), 'Exact rules SDK request/response differs.');
    const trace = scene.trace.trim().split('\n').map(JSON.parse);
    check(trace.every(entry => entry.schemaVersion === 1 && ['keyring-replaced', 'keyring-get', 'ready', 'finished', 'request'].includes(entry.event))
      && trace.filter(entry => entry.event === 'ready' && entry.guard === 'collection-rules-local-v1').length === 1 && trace.at(-1).event === 'finished'
      && equal(trace.filter(entry => entry.event === 'request').map(({ method, path }) => ({ method, path })), scene.requests.map(({ method, path }) => ({ method, path }))), 'Rules transport trace missing/blocked.');
  });
  const status = assertions.every(assertion => assertion.passed) ? 'PASS' : 'FAIL';
  return { id: collectionRulesCases[0].id, status, assertions, observations: observed,
    ...(status === 'FAIL' ? { reason: assertions.filter(assertion => !assertion.passed).map(assertion => `${assertion.id}: ${assertion.reason}`).join('; ') } : {}) };
}
export function validateCollectionRulesFiles(observed) {
  check(absolute(observed?.evidenceDir), 'Missing rules evidence root.');
  const seen = new Set();
  for (const scene of observed.scenarios) {
    const { evidenceRef, ...raw } = scene, file = evidenceRef?.path, relative = typeof file === 'string' ? path.relative(observed.evidenceDir, file) : '';
    check(absolute(file) && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && !seen.has(file)
      && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file && lstatSync(file).size <= 2_000_000, 'Missing/unsafe rules raw file.');
    seen.add(file); const bytes = readFileSync(file);
    check(itemHash(bytes) === evidenceRef.sha256 && equal(JSON.parse(bytes.toString('utf8')), raw), 'Rules raw hash/content differs.');
  }
  check(seen.size === rulesNames.length, 'Missing rules raw scene.');
}
