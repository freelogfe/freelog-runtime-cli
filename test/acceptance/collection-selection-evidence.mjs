/** Source-fixed real-PTY scenarios; synthetic validator controls never supply candidate approval. */
import { stripVTControlCharacters, isDeepStrictEqual as equal } from 'node:util';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { itemFixture, itemInitialEntries, itemHash, itemPage } from './collection-items-evidence.mjs';
export const selectionScenarios = Object.freeze(['cancel', 'submit', 'decline', 'pagination', 'search-filter', 'review-remove', 'ctrl-c', 'disabled', 'late-freeze', 'late-owner', 'limit-100', 'json-required']);
export const collectionSelectionCases = Object.freeze([Object.freeze({ id: 'COLLECTION.ITEMS.SELECTION_TTY', kind: 'product-case', required: true,
  parentRule: 'COLLECTION.MANAGEMENT_MATRIX', script: 'verify-collection-selection.mjs', title: 'Installed collection source selection through real node-pty and isolated SDK',
  assertionIds: Object.freeze(['installed-tty-binding', ...selectionScenarios.map((n) => `selection-${n}`)]),
  scenarioRules: Object.freeze(selectionScenarios.map((scenario, i) => Object.freeze({ scenario, ruleId: `C03.T${String(i + 1).padStart(2, '0')}` }))),
  layer: 'installed-candidate/real-node-pty/local-loopback/not-real-dev', inputClass: '12 fixed C03 selection scenarios; full raw terminal and exact SDK/state matrix',
  preconditions: ['Exact installed candidate; isolated env and replacement keyring; actual native node-pty capability.'],
  action: ['Drive actual keys through installed CLI and recompute transcript, process, request and byte/state outcomes.'],
  forbiddenSideEffects: ['real network', 'native credential store', 'payment/signing', 'publication', 'unknown POST replay', 'workspace fallback'],
  designRefs: [{ path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/单品/01-添加单品.md', section: '2/3' },
    { path: 'docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md', section: '8.11/8.12' }],
})]);
export const selectionHash = itemHash;
const copy = (v) => structuredClone(v), ok = (data) => ({ ret: 0, errCode: 0, data });
const draftPath = '/v2/resources/catalogues/drafts/local_collection/items', targetPath = '/v2/resources/local_collection';
const rulesPath = '/v2/resources/catalogue/local_collection/items/collectRules';
export const selectionTypes = [{ code: 'MEDIA', name: '素材', children: [{ code: 'IMAGE', name: '图片', children: [] }] }];
const catalogue = (source, i) => ({ itemId: `item_${source.resourceId.slice(7)}`, itemTitle: source.resourceTitle, sortId: i + 1,
  mountResourceInfo: { resourceId: source.resourceId, resourceName: source.resourceName, resourceTitle: source.resourceTitle } });
export function selectionFixture(name) {
  if (!selectionScenarios.includes(name)) throw new Error('Unknown fixed selection scenario.');
  const rows = itemFixture('limit-101').sources.slice(0, name === 'limit-100' ? 101 : 51).map((s) => ({ ...s.response.data,
    resourceType: ['素材', '图片'], resourceTypeCode: 'IMAGE' }));
  if (name === 'disabled') { rows[2].userId = 8; rows[3].subjectType = 4; rows[4].status = 4; rows[5].latestVersion = ''; }
  const indices = name === 'limit-100' ? Array.from({ length: 100 }, (_, i) => i)
    : ['pagination', 'search-filter'].includes(name) ? [0, 50] : name === 'review-remove' ? [50] : [0];
  const initial = name === 'disabled' ? [catalogue(rows[1], 0)] : [];
  const target = itemFixture('add-plain').target, published = itemFixture('add-plain').published;
  const selected = indices.map((i) => rows[i]);
  return { rows, selected, target, published, initial, final: [...copy(initial), ...selected.map((r, i) => catalogue(r, i + initial.length))],
    writes: ['submit', 'pagination', 'search-filter', 'review-remove', 'disabled', 'limit-100'].includes(name),
    body: { addCollectionItems: selected.map((r) => ({ resourceId: r.resourceId, itemTitle: r.resourceTitle, authExcludedItems: [] })), isPublish: 0 },
    reply: ok({ addSuccessfulItems: selected.map((r) => ({ resourceId: r.resourceId, itemTitle: r.resourceTitle })), addFailedItems: [], ignoreItems: [] }) };
}
export function selectionInitialEntries(name) {
  const rows = itemInitialEntries();
  if (name === 'json-required') rows.push({ path: '.freelog/.txn.json', kind: 'file', bytes: Buffer.from(`${JSON.stringify({ schemaVersion: 1,
    entries: [{ path: '.sequence', before: '1\n', beforeSha256: itemHash('1\n'), after: '2\n', afterSha256: itemHash('2\n') }] })}\n`).toString('base64') });
  return rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function selectionCommand(name) {
  return ['collection', 'item', 'add', '--resource', 'id:local_collection', '--env', 'dev', ...(name === 'json-required' ? ['--json', '--yes'] : [])];
}
export function selectionCapabilityCommand() {
  return ['--input-type=module','-e','console.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY}));process.exit(0);'];
}
const down = (count) => '\u001b[B'.repeat(count), up = (count) => '\u001b[A'.repeat(count);
const menu = (page, selected, pages = 2) => `线上单资源（第${page}/${pages}页，已选${selected}/100）`;
export function selectionSteps(name) {
  const steps = [], add = (expect, send) => steps.push({ expect, ...(send ? { send } : {}) });
  if (name === 'json-required') return steps;
  if (name === 'cancel' || name === 'ctrl-c') { add(menu(1, 0), name === 'cancel' ? `${up(1)}\r` : '\u0003'); add('已取消单品选择'); return steps; }
  add(menu(1, 0, name === 'limit-100' ? 3 : 2), '\r');
  if (name === 'limit-100') {
    for (let i = 1; i <= 100; i++) {
      add(menu(1, i, i === 1 ? 3 : 1), `${up(5)}\r`);
      add('搜索线上单资源（回车清除）', `range_${String(i).padStart(3, '0')}\r`);
      if (i < 100) add(menu(1, i, 1), '\r');
    }
    add(menu(1, 100, 1), `${up(2)}\r`);
  } else if (['pagination', 'review-remove'].includes(name)) {
    add(menu(1, 1), `${down(50)}\r`); add(menu(2, 1), '\r');
    if (name === 'pagination') { add(menu(2, 2), `${down(1)}\r`); add(menu(1, 2), `${up(2)}\r`); }
    else { add(menu(2, 2), `${up(3)}\r`); add('已选来源（选中可移除）', '\r');
      add('已选来源（选中可移除）', `${down(1)}\r`); add(menu(2, 1), `${up(2)}\r`); }
  } else if (name === 'search-filter') {
    add(menu(1, 1), `${up(5)}\r`); add('搜索线上单资源（回车清除）', 'needle\r');
    add(menu(1, 1, 1), `${up(4)}\r`); add('筛选资源类型 ""', `${down(1)}\r`); add('筛选资源类型 "素材"', `${down(1)}\r`);
    add(menu(1, 1, 1), '\r'); add(menu(1, 2, 1), `${up(2)}\r`);
  } else add(menu(1, 1), `${up(2)}\r`);
  if (name === 'late-freeze') add('冻结合集不能修改目录草稿');
  else if (name === 'late-owner') add('单品必须是当前账号已上架且已有版本的单资源，未提交添加。');
  else { add('确认写入？', name === 'decline' ? 'n\r' : '\r'); add(name === 'decline' ? '已取消' : '已添加：'); }
  return steps;
}
export function selectionRemoteState(name, after = false) {
  const f = selectionFixture(name), owners = Object.fromEntries(f.rows.map((r) => [r.resourceId, r.userId]));
  if (after && name === 'late-owner') owners.source_range_000 = 8;
  return { target: { ...f.target, ...(after && name === 'late-freeze' ? { status: 2 } : {}) }, draft: copy(after && f.writes ? f.final : f.initial), published: f.published, sourceOwners: owners };
}
export function selectionListing(f, query) {
  const skip = Number(query.get('skip')), keyword = query.get('keywords');
  const rows = query.has('resourceTypeCode') || keyword === 'needle' ? [f.rows[50]]
    : keyword ? f.rows.filter((r) => r.resourceTitle === keyword) : f.rows;
  return ok({ skip, limit: 50, totalItem: rows.length, dataList: copy(rows.slice(skip, skip + 50)) });
}
const req = (pathname, params, response, method = 'GET', body = null) => ({ method, path: pathname + (Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''), body, response });
/** Independent expected sequence, never used to dispatch platform responses. */
export function selectionExpectedRequests(name) {
  const f = selectionFixture(name), requests = [], get = (p, q, v) => requests.push(req(p, q, v));
  const target = (frozen = false) => get(targetPath, { isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 }, ok({ ...f.target, ...(frozen ? { status: 2 } : {}) }));
  const draft = (rows) => get(draftPath, { skip: 0, limit: 100, sortField: 'sortId', sortType: 1, isLoadLatestVersionInfo: 1 }, itemPage(rows, 0));
  const list = (query) => { const q = { skip: 0, limit: 50, isSelf: 1, subjectType: 1, ...query }; get('/v2/resources', q, selectionListing(f, new URLSearchParams(q))); };
  if (name === 'json-required') return requests;
  target(); get(rulesPath, {}, ok(null)); target(); draft(f.initial); list({});
  if (name === 'cancel' || name === 'ctrl-c') return requests;
  if (['pagination', 'review-remove'].includes(name)) list({ skip: 50 });
  if (name === 'search-filter') { list({ keywords: 'needle' }); get('/v2/resources/types/listSimpleByGroup', { category: 1, status: 1, subjectType: 1 }, ok(selectionTypes)); list({ keywords: 'needle', resourceTypeCode: 'IMAGE', resourceTypeCategory: 2 }); }
  if (name === 'limit-100') for (let i = 1; i <= 100; i++) list({ keywords: `range_${String(i).padStart(3, '0')}` });
  target(name === 'late-freeze'); if (name === 'late-freeze') return requests;
  get(rulesPath, {}, ok(null)); target(); draft(f.initial);
  for (const source of f.selected) get(`/v2/resources/${source.resourceId}`, { isLoadLatestVersionInfo: 1 }, ok({ ...source, ...(name === 'late-owner' ? { userId: 8 } : {}) }));
  if (name === 'late-owner') return requests;
  get(`${draftPath}/checkExists`, { resourceIds: f.selected.map((r) => r.resourceId).join(',') }, ok(f.selected.map((r) => ({ resourceId: r.resourceId, isExists: false }))));
  if (name === 'decline') return requests;
  requests.push(req(draftPath, {}, f.reply, 'POST', f.body)); target(); draft(f.final); return requests;
}
const check = (v, message) => { if (!v) throw new Error(message); };
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const absolute = (v) => typeof v === 'string' && path.isAbsolute(v) && path.resolve(v) === v;
const normalize = ({ method, path: p, body, response }) => { check(typeof p === 'string' && p.startsWith('/') && !p.startsWith('//'), 'Invalid raw path.'); const u = new URL(p, 'https://api.devfreelog.com');
  check(u.origin === 'https://api.devfreelog.com' && !u.hash, 'Invalid request origin.'); return { method, path: u.pathname, query: [...u.searchParams].sort(([a], [b]) => a.localeCompare(b)), body, response }; };
export function selectionText(raw) { return stripVTControlCharacters(raw).replace(/\r/g, ''); }
function validateStage(o, name, run) {
  check(o?.name === name && equal(o.argv, selectionCommand(name)) && equal(o.steps, selectionSteps(name)), 'Fixed argv/keys missing.');
  check(iso(o.startedAt) && iso(o.finishedAt) && Date.parse(run.startedAt) <= Date.parse(o.startedAt) && Date.parse(o.startedAt) <= Date.parse(o.finishedAt)
    && Date.parse(o.finishedAt) <= Date.parse(run.finishedAt) && Number.isSafeInteger(o.childPid) && o.childPid > 0, 'Actual pid/window missing.');
  const f = selectionFixture(name), success = f.writes;
  check(o.result?.completed === true && o.result.status === (success ? 0 : 1) && o.result.signal === null && o.result.stderr === ''
    && typeof o.result.stdout === 'string' && o.result.completedSteps === o.steps.length && equal(o.result.matchedPrompts, o.steps.map((s) => s.expect)), 'PTY incomplete, signal, timeout or process mismatch.');
  const flat = selectionText(o.result.stdout).replace(/\n/g, '').trimEnd();
  const errors = { cancel: '已取消单品选择', 'ctrl-c': '已取消单品选择', decline: '已取消', 'late-freeze': '冻结合集不能修改目录草稿',
    'late-owner': '单品必须是当前账号已上架且已有版本的单资源，未提交添加。', 'json-required': JSON.stringify({ code: 'COLLECTION_ITEM_SOURCE_REQUIRED', message: '非交互或JSON调用请明确提供来源单资源 id: 或 name:' }) };
  const tail = success ? `已添加：${f.selected.map((r) => r.resourceId).join('、')}；未变更：无` : errors[name];
  check(flat.endsWith(tail), 'Exact terminal outcome differs.');
  for (const step of o.steps) check(selectionText(o.result.stdout).includes(step.expect), 'Raw transcript lacks observed prompt.');
  if (name === 'disabled') for (const reason of ['非当前账号', '不是单资源', '未上架', '没有最新版本', '已在目录草稿']) check(flat.includes(reason), 'Disabled reason not rendered.');
  if (name === 'limit-100') check(flat.includes('已选满100项'), '101st candidate not visibly disabled.');
  check(equal(o.before, selectionInitialEntries(name)) && equal(o.after, o.before), 'Complete local bytes changed.');
  check(equal(o.remoteBefore, selectionRemoteState(name)) && equal(o.remoteAfter, selectionRemoteState(name, true)), 'Exact remote state differs.');
  check(equal(o.requests.map(normalize), selectionExpectedRequests(name).map(normalize)) && equal(o.apparatusErrors, []), 'Exact SDK request/response matrix differs.');
  const trace = o.trace.trim().split('\n').map(JSON.parse);
  check(trace.every((e) => e.schemaVersion === 1 && ['ready','finished','keyring-replaced','keyring-get','request'].includes(e.event))
    && trace.filter((e) => e.event === 'ready' && e.guard === 'collection-selection-local-v1').length === 1 && trace.at(-1).event === 'finished'
    && equal(trace.filter((e) => e.event === 'request').map(({method,path})=>({method,path})), o.requests.map(({method,path})=>({method,path}))), 'Unapproved or missing transport trace.');
}
export function evaluateCollectionSelection(observed) {
  const assertions = [], add = (id, action) => { try { action(); assertions.push({id,passed:true,expected:true,actual:true}); }
    catch (e) { assertions.push({id,passed:false,expected:true,actual:false,reason:e.message}); } };
  add('installed-tty-binding', () => {
    check(observed && /^[A-Za-z0-9-]{1,80}$/u.test(observed.runId ?? '') && absolute(observed.evidenceDir) && absolute(observed.cliBin)
      && observed.cliBin.endsWith(path.join('node_modules','@freelog-cli','cli2','dist','bin','index.js')) && observed.packageName === '@freelog-cli/cli2'
      && typeof observed.version === 'string' && observed.version.length > 0
      && /^[a-f0-9]{64}$/u.test(observed.binSha256 ?? '') && ['win32','darwin','linux'].includes(observed.platform) && /^v(20|22)\./u.test(observed.nodeVersion ?? '')
      && iso(observed.startedAt) && iso(observed.finishedAt) && Date.parse(observed.startedAt) <= Date.parse(observed.finishedAt) && Date.parse(observed.finishedAt) <= Date.now()
      && equal(observed.apparatusErrors, []) && equal(observed.scenarios?.map((s)=>s.name),selectionScenarios), 'Installed run binding differs.');
    const p = observed.capability;
    check(p && Number.isSafeInteger(p.childPid) && p.childPid > 0 && p.result?.status === 0 && p.result.completed === true && p.result.signal === null && p.result.stderr === ''
      && selectionText(p.result.stdout).trim() === '{"stdin":true,"stdout":true}' && equal(p.argv,selectionCapabilityCommand())
      && p.result.completedSteps === 1 && equal(p.result.matchedPrompts,['{"stdin":true,"stdout":true}'])
      && iso(p.startedAt) && iso(p.finishedAt) && Date.parse(observed.startedAt)<=Date.parse(p.startedAt) && Date.parse(p.startedAt)<=Date.parse(p.finishedAt)
      && Date.parse(p.finishedAt)<=Date.parse(observed.finishedAt) && equal(p.before,selectionInitialEntries('cancel')) && equal(p.after,p.before), 'Actual native TTY capability missing.');
    const trace=p.trace.trim().split('\n').map(JSON.parse);
    check(trace.every(e=>e.schemaVersion===1&&['keyring-replaced','ready','finished'].includes(e.event))
      &&trace.filter(e=>e.event==='ready'&&e.guard==='collection-selection-local-v1').length===1&&trace.at(-1).event==='finished','Capability transport was not isolated.');
  });
  for (const [i,n] of selectionScenarios.entries()) add(`selection-${n}`,()=>validateStage(observed?.scenarios?.[i],n,observed));
  const status=assertions.every(a=>a.passed)?'PASS':'FAIL'; return {id:collectionSelectionCases[0].id,status,assertions,observations:observed,
    ...(status==='FAIL'?{reason:assertions.filter(a=>!a.passed).map(a=>`${a.id}: ${a.reason}`).join('; ')}:{})};
}
export function validateCollectionSelectionFiles(observed) {
  check(absolute(observed?.evidenceDir), 'Missing raw selection root.'); const seen=new Set();
  for(const item of [observed.capability,...observed.scenarios]) {
    const {evidenceRef,...raw}=item, file=evidenceRef?.path, relative=typeof file==='string'?path.relative(observed.evidenceDir,file):'';
    check(absolute(file)&&relative&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative)&&!seen.has(file)
      &&lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink()&&realpathSync(file)===file&&lstatSync(file).size<=2_000_000,'Missing/unsafe selection raw file.');
    seen.add(file);const bytes=readFileSync(file);check(itemHash(bytes)===evidenceRef.sha256&&equal(JSON.parse(bytes.toString('utf8')),raw),'Selection original hash/content changed.');
  }
  check(seen.size===selectionScenarios.length+1,'Missing/duplicate selection raw files.');
}
