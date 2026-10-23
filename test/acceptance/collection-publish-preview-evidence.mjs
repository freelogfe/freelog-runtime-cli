/** C07 fixed preview expectations; never imports the production formatter. */
import { isDeepStrictEqual as equal, stripVTControlCharacters } from 'node:util';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { itemHash, itemInitialEntries } from './collection-items-evidence.mjs';
import { recoveryFixture, recoveryBody, recoveryVersion, recoveryDraft, recoveryPaths } from './collection-recovery-evidence.mjs';
import { preflightInitial, preflightRules } from './collection-publish-preflight-evidence.mjs';
export { itemHash as previewHash };
export const previewNames = Object.freeze(['full-cancel', 'full-confirm', 'tty-yes', 'no-merge-cancel', 'directory-only-cancel',
  'key-change-cancel', 'order-only-cancel', 'pages-cancel', 'non-tty-yes']);
const rules = ['C07.P01', 'C07.P01', 'C07.P05', 'C07.P02', 'C07.P03', 'C07.P01', 'C07.P04', 'C07.P06', 'C07.P05'];
const design = 'docs/一期/产品方案/脚手架设计/PHASE/合集';
export const collectionPublishPreviewCases = Object.freeze([{
  id: 'COLLECTION.PUBLISH.PREVIEW_TTY', kind: 'product-case', required: true, parentRule: 'COLLECTION.MANAGEMENT_MATRIX',
  title: 'Installed complete publication preview, real confirmation/cancellation and actual stream routing', script: 'verify-collection-publish-preview.mjs',
  assertionIds: ['installed-preview-binding', ...previewNames.map(name => `preview-${name}`)],
  layer: 'installed-candidate/native-node-pty/local-loopback/not-real-dev', inputClass: 'C07.P01–P06, nine fixed scenes and actual native probe',
  designRefs: [{ path: `${design}/发布/01-发布合集变更与恢复.md`, sections: ['1', '2', '5'] },
    { path: `${design}/测试/00-功能拓扑与证据驱动测试门禁.md`, sections: ['8.18'] }],
  scenarioRules: previewNames.map((scenario, index) => ({ scenario, ruleId: rules[index] })),
  preconditions: ['Exact installed candidate; actual native TTY flags and keystrokes; isolated synthetic owner and closed loopback.'],
  action: ['Retain whole physical terminal and independent actual stream writes, process, SDK, model and local/home bytes.'],
  forbiddenSideEffects: ['real network', 'native keyring', 'signing/payment', 'cancellation PUT/intent', 'automatic retry', 'workspace bin fallback'],
}]);
const copy = value => structuredClone(value), json = value => `${JSON.stringify(value, null, 2)}\n`;
// Fixed hostile fixture characters; escaping follows the product contract, not an imported implementation.
const J = value => JSON.stringify(value).replaceAll('\u009b', '\\u009b').replaceAll('\u202e', '\\u202e');
const projected = row => ({ itemId: row.itemId, resourceId: row.mountResourceInfo.resourceId, itemTitle: row.itemTitle, sortId: row.sortId });
export function previewSpec(name) {
  if (!previewNames.includes(name)) throw new Error('Unknown fixed preview scene.');
  return { tty: name !== 'non-tty-yes', yes: ['tty-yes', 'non-tty-yes'].includes(name), hasDraft: name !== 'directory-only-cancel',
    merge: !['no-merge-cancel', 'order-only-cancel'].includes(name), mode: name === 'no-merge-cancel' ? 'no' : 'auto',
    success: ['full-confirm', 'tty-yes', 'non-tty-yes'].includes(name) };
}
export function previewFixture(name) {
  const f = recoveryFixture(), spec = previewSpec(name), form = copy(spec.hasDraft ? f.form : f.baseline);
  let published = copy(f.published), draft = copy(f.draft);
  if (name === 'order-only-cancel') { Object.assign(form, copy(f.baseline)); form.options.reverse(); draft = copy(published); }
  if (name === 'key-change-cancel') {
    form.properties[0].key = 'qaNew'; form.options.reverse();
    form.dependencies = [{ resourceId: 'source_video', versionRange: '^1.0.0' }, { resourceId: 'source_other', versionRange: '^2.0.0' }];
    draft = [{ itemId: 'item_image', itemTitle: 'renamed image', sortId: 3, mountResourceInfo: { resourceId: 'source_video' } },
      { itemId: 'item_new', itemTitle: 'new', sortId: 4, mountResourceInfo: { resourceId: 'source_other' } }];
  }
  if (name === 'pages-cancel') {
    published = Array.from({ length: 101 }, (_, i) => ({ itemId: `item_${i}`, itemTitle: `Title ${i}`, sortId: i + 1, mountResourceInfo: { resourceId: `source_${i}` } }));
    draft = copy(published); draft[100].itemTitle = 'hostile\n\u009b\u202e';
  }
  return { ...f, form, published, draft };
}
export function previewEntries(name, after = false) {
  const spec = previewSpec(name), f = previewFixture(name), entries = itemInitialEntries().filter(entry => entry.path !== recoveryPaths.draft || spec.hasDraft && !(after && spec.success));
  const entry = entries.find(value => value.path === recoveryPaths.draft);
  if (entry) entry.bytes = Buffer.from(json(recoveryDraft(f.form))).toString('base64');
  return entries;
}
export function previewCommand(name) {
  const spec = previewSpec(name);
  return ['collection', 'publish', '--include-items', spec.mode, '--resource', 'id:local_collection', '--env', 'dev',
    ...(spec.tty ? [] : ['--json']), ...(spec.yes ? ['--yes'] : [])];
}
export const previewSteps = name => previewSpec(name).yes ? [] : [{ expect: '确认写入？', send: name === 'full-confirm' ? 'y\r' : 'n\r' }];
export const previewCapabilityCommand = () => ['-e', 'console.log(JSON.stringify({stdin:process.stdin.isTTY===true,stdout:process.stdout.isTTY===true}));process.exit(0);'];
export function previewModel(name, after = false) {
  const spec = previewSpec(name), f = previewFixture(name), state = preflightInitial('mode-M07');
  state.version = recoveryVersion(f.baseline, 'snapshot_0', f.auth); state.published = copy(f.published); state.draft = copy(f.draft);
  if (after && spec.success) { state.puts = 1; state.target.latestVersion = 'snapshot_1'; state.version = recoveryVersion(f.form, 'snapshot_1', f.auth);
    if (spec.merge) state.published = copy(state.draft); }
  return state;
}
export const previewBody = name => { const f = previewFixture(name); return recoveryBody(f.form, previewSpec(name).merge ? 1 : 0, f.auth); };

/** Literal fixture-driven lines for every changed domain; no general diff engine shared with production. */
export function expectedPreview(name) {
  const f = previewFixture(name), spec = previewSpec(name), b = f.baseline, a = f.form;
  const normal = !['directory-only-cancel', 'order-only-cancel'].includes(name), keyChange = name === 'key-change-cancel';
  const section = (title, lines) => `【${title}】\n${lines.length ? lines.join('\n') : '无变化'}`;
  const modify = (key, before, after) => `修改 ${J(key)}：${J(before)} → ${J(after)}`;
  const options = name === 'order-only-cancel' ? [`顺序：${J(['qaText', 'qaSelect'])} → ${J(['qaSelect', 'qaText'])}`]
    : normal ? a.options.map(option => modify(option.key, b.options.find(value => value.key === option.key), option)) : [];
  if (keyChange) options.push(`顺序：${J(['qaText', 'qaSelect'])} → ${J(['qaSelect', 'qaText'])}`);
  const properties = keyChange ? [`删除 ${J('qaAuthor')}：${J(b.properties[0])}`, `新增 ${J('qaNew')}：${J(a.properties[0])}`,
    `顺序：${J(['qaAuthor'])} → ${J(['qaNew'])}`] : normal ? [modify('qaAuthor', b.properties[0], a.properties[0])] : [];
  const dependencies = keyChange ? [`删除 ${J('source_image')}：${J(b.dependencies[0])}`,
    ...a.dependencies.map(value => `新增 ${J(value.resourceId)}：${J(value)}`), `顺序：${J(['source_image'])} → ${J(['source_video', 'source_other'])}`]
    : normal ? [modify('source_image', b.dependencies[0], a.dependencies[0])] : [];
  const directory = [];
  if (keyChange) {
    directory.push(`移除单品 ${J('item_theme')}：${J(projected(f.published[1]))}`,
      `修改单品 ${J('item_image')} resourceId：${J('source_image')} → ${J('source_video')}`,
      `修改单品 ${J('item_image')} itemTitle：${J('image')} → ${J('renamed image')}`,
      `修改单品 ${J('item_image')} sortId：1 → 3`, `新增单品 ${J('item_new')}：${J(projected(f.draft[1]))}`);
  } else if (name === 'pages-cancel') directory.push(`修改单品 ${J('item_100')} itemTitle：${J('Title 100')} → ${J('hostile\n\u009b\u202e')}`);
  else if (name === 'order-only-cancel') directory.push('无变化');
  else directory.push(`修改单品 ${J('item_image')} itemTitle：${J('image')} → ${J('renamed image')}`, `修改单品 ${J('item_image')} sortId：1 → 3`);
  directory.push(`目录顺序：${J(f.published.map(value => value.itemId))} → ${J(f.draft.map(value => value.itemId))}`);
  const display = normal ? ['sort', 'title', 'number', 'image', 'description', 'view'].map(key => `${key}：${J(b.display[key])} → ${J(a.display[key])}`) : [];
  return ['发布合集变更', '环境："dev"', '目标："alice/collection"', 'resourceId："local_collection"', `目录：${spec.merge ? '合并服务端目录草稿' : '不合并目录'}`,
    section('系统附加值', normal ? [modify('display_artist', b.inputs[0], a.inputs[0])] : []), section('自定义属性', properties),
    section('可选配置（select候选首项为默认值）', options), `简介：${normal ? `${J(b.description)} → ${J(a.description)}` : '无变化'}`,
    section('展示设置', display), section('直接依赖', dependencies), section(spec.merge ? '目录草稿差异（本次合并）' : '目录草稿差异（本次不发布）', directory),
    `授权排除映射：原样保留 ${J(f.auth)}`, '未查询实时消费授权；此预览不代表单品当前可访问。'].join('\n');
}
/** Remove only physical layout whitespace; quoted JSON spaces and escapes remain significant. */
export function previewCanonical(value) {
  const text = stripVTControlCharacters(String(value)).replace(/[\r\n]/gu, ''); let quoted = false, escaped = false, result = '';
  for (const char of text) {
    if (quoted) { result += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; }
    else if (char === '"') { quoted = true; result += char; } else if (!/\s/u.test(char)) result += char;
  }
  return result;
}
export function previewRequests(name) {
  const spec = previewSpec(name), initial = previewModel(name), after = previewModel(name, true), result = [], ok = data => ({ ret: 0, errCode: 0, data: copy(data) });
  const get = (route, data) => result.push({ method: 'GET', path: route, body: null, response: ok(data) });
  const info = state => get('/v2/resources/local_collection?isLoadLatestVersionInfo=1&isLoadPolicyInfo=1', state.target);
  const observe = state => { info(state); get(`/v2/resources/local_collection/versions/${state.target.latestVersion}`, state.version);
    for (const [route, rows] of [['/v2/resources/catalogue/local_collection/items', state.published], ['/v2/resources/catalogues/drafts/local_collection/items', state.draft]])
      for (let skip = 0; skip < rows.length; skip += 100) get(`${route}?skip=${skip}&limit=100&sortField=sortId&sortType=1`, { skip, limit: 100, totalItem: rows.length, dataList: rows.slice(skip, skip + 100) }); };
  const type = () => { get('/v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=4', [{ code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true }]);
    get('/v2/resources/types/getInfoByCode?code=CT001', { code: 'CT001', name: 'Local collection', subjectType: 4, status: 1, isTerminate: true,
      attrs: [{ key: 'display_artist', name: '系统作者' }], resourceConfig: { supportOptionalConfig: 2 } });
    get('/v2/storages/files/info?resourceTypeCode=CT001', { metaInfoArray: [{ key: 'display_artist', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '' }] });
    get('/v2/resources/attrs/getInfoByKey?key=display_artist', { key: 'display_artist', format: 6, contentRule: { maxLength: 140 } }); };
  info(initial); observe(initial); type(); info(initial); get('/v2/resources/catalogue/local_collection/items/collectRules', preflightRules(0));
  if (!spec.success) return result;
  info(initial); get('/v2/resources/catalogue/local_collection/items/collectRules', preflightRules(0)); type(); observe(initial);
  result.push({ method: 'PUT', path: '/v2/resources/catalogue/local_collection', body: previewBody(name), response: ok({ resourceId: 'local_collection', version: 'snapshot_1' }) });
  observe(after); return result;
}
const fingerprint = value => itemHash(JSON.stringify(value));
const directoryHash = rows => fingerprint(rows.map(projected));
const absolute = value => typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value;
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function check(value, reason) { if (!value) throw new Error(reason); }
function wire(values) {
  const result = values.map(({ method, path: raw, body, response }) => { check(typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//'), 'Invalid preview request path.');
    const url = new URL(raw, 'https://api.devfreelog.com'); check(url.origin === 'https://api.devfreelog.com' && !url.hash, 'Invalid preview request origin.');
    return { method, path: url.pathname, query: [...url.searchParams].sort(([a], [b]) => a.localeCompare(b)), body, response }; });
  for (let i = 0; i < result.length - 1; i++) if (result[i].method === 'GET' && result[i + 1].method === 'GET'
    && result[i].path.startsWith('/v2/resources/types/') && result[i + 1].path.startsWith('/v2/resources/types/')) {
    result.splice(i, 2, ...result.slice(i, i + 2).sort((a, b) => a.path.localeCompare(b.path))); i++;
  }
  return result;
}
function traceOf(scene, tty) {
  const trace = scene.trace.trim().split('\n').map(JSON.parse);
  check(trace.every(entry => entry.schemaVersion === 1 && ['keyring-replaced', 'keyring-get', 'ready', 'finished', 'request', 'intent-persisted', 'preview-capture-ready', 'stream-write'].includes(entry.event))
    && trace.filter(entry => entry.event === 'ready' && entry.guard === 'collection-publish-preflight-local-v1').length === 1 && trace.at(-1).event === 'finished', 'Preview isolation trace incomplete/blocked.');
  const flags = trace.filter(entry => entry.event === 'preview-capture-ready');
  check(flags.length === 1 && flags[0].stdinTTY === tty && flags[0].stdoutTTY === tty, 'Actual stream TTY flags differ.');
  const chunks = { stdout: [], stderr: [] }; let bytes = 0;
  for (const event of trace.filter(entry => entry.event === 'stream-write')) {
    check(['stdout', 'stderr'].includes(event.stream) && typeof event.bytes === 'string', 'Invalid stream event.');
    const value = Buffer.from(event.bytes, 'base64'); check(value.toString('base64') === event.bytes, 'Invalid stream encoding.');
    bytes += value.length; chunks[event.stream].push(value);
  }
  check(bytes <= 1_000_000, 'Stream evidence exceeds capture bound.');
  const streams = { stdout: Buffer.concat(chunks.stdout).toString('utf8'), stderr: Buffer.concat(chunks.stderr).toString('utf8') };
  check(equal(trace.filter(entry => entry.event === 'request').map(({ method, path }) => ({ method, path })), (scene.requests ?? []).map(({ method, path }) => ({ method, path }))), 'Preview request trace differs.');
  return { trace, streams };
}
function intentTrace(name, scene, trace) {
  const spec = previewSpec(name), events = trace.filter(event => event.event === 'intent-persisted');
  check(events.length === (spec.success ? 2 : 0), 'Preview intent persistence count differs.');
  if (!spec.success) return;
  const f = previewFixture(name), source = previewEntries(name).find(entry => entry.path === recoveryPaths.draft), putIndex = previewRequests(name).findIndex(request => request.method === 'PUT');
  const values = events.map(event => { check(iso(event.at) && Date.parse(scene.startedAt) <= Date.parse(event.at) && Date.parse(event.at) <= Date.parse(scene.finishedAt), 'Preview intent event outside command.');
    check(trace.slice(0, trace.indexOf(event)).filter(entry => entry.event === 'request').length === putIndex, 'Preview intent outside PUT boundary.');
    return JSON.parse(Buffer.from(event.bytes, 'base64').toString('utf8')); });
  check(iso(values[0].sentAt) && Date.parse(scene.startedAt) <= Date.parse(values[0].sentAt) && Date.parse(values[0].sentAt) <= Date.parse(scene.finishedAt), 'Preview intent request time invalid.');
  for (const [index, value] of values.entries()) check(equal(value, { schemaVersion: 2, resourceId: 'local_collection', resourceName: 'alice/collection', resourceTypeCode: 'CT001', env: 'dev', userId: 7,
    state: index === 0 ? 'prepared' : 'sending', baselineFingerprint: fingerprint(f.baseline), baselineAuthFingerprint: fingerprint(f.auth), baselineDirectoryFingerprint: directoryHash(f.published),
    expectedForm: f.form, expectedAuthExcludedItems: f.auth, merge: spec.merge ? 1 : 0, directoryFingerprint: directoryHash(f.draft),
    payloadSha256: fingerprint({ resourceId: 'local_collection', ...previewBody(name) }), sourceDraftSha256: itemHash(Buffer.from(source.bytes, 'base64')), sentAt: values[0].sentAt }), 'Preview persisted intent fields differ.');
}
export function evaluateCollectionPublishPreview(observed) {
  const assertions = [], add = (id, run) => { try { run(); assertions.push({ id, passed: true, expected: true, actual: true }); }
    catch (error) { assertions.push({ id, passed: false, expected: true, actual: false, reason: error.message }); } };
  add('installed-preview-binding', () => {
    check(observed && /^[A-Za-z0-9-]{1,80}$/u.test(observed.runId ?? '') && absolute(observed.evidenceDir) && absolute(observed.cliBin)
      && observed.cliBin.endsWith(path.join('node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js')) && observed.packageName === '@freelog-cli/cli2'
      && typeof observed.version === 'string' && observed.version && /^[a-f0-9]{64}$/u.test(observed.binSha256 ?? '') && ['win32', 'darwin', 'linux'].includes(observed.platform)
      && /^v(20|22)\./u.test(observed.nodeVersion ?? '') && iso(observed.startedAt) && iso(observed.finishedAt) && Date.parse(observed.startedAt) <= Date.parse(observed.finishedAt)
      && Date.parse(observed.finishedAt) <= Date.now() && equal(observed.apparatusErrors, []) && equal(observed.scenarios?.map(scene => scene.name), previewNames), 'Installed preview binding or scene set differs.');
    const probe = observed.capability;
    check(probe && equal(probe.argv, previewCapabilityCommand()) && Number.isSafeInteger(probe.childPid) && probe.childPid > 0 && iso(probe.startedAt) && iso(probe.finishedAt)
      && Date.parse(observed.startedAt) <= Date.parse(probe.startedAt) && Date.parse(probe.startedAt) <= Date.parse(probe.finishedAt)
      && Date.parse(probe.finishedAt) <= Date.parse(observed.finishedAt) && probe.result?.completed === true && probe.result.status === 0 && probe.result.signal === null && !probe.result.stderr
      && probe.result.completedSteps === 1 && equal(probe.result.matchedPrompts, ['{"stdin":true,"stdout":true}'])
      && stripVTControlCharacters(probe.result.stdout).trim() === '{"stdin":true,"stdout":true}' && equal(probe.before, previewEntries('full-cancel'))
      && equal(probe.before, probe.after) && equal(probe.homeBefore, []) && equal(probe.homeAfter, []), 'Actual preview native probe incomplete.');
    const { trace, streams } = traceOf(probe, true);
    check(streams.stdout.trim() === '{"stdin":true,"stdout":true}' && !streams.stderr && trace.filter(entry => entry.event === 'request' || entry.event === 'intent-persisted').length === 0, 'Native probe stream/network evidence differs.');
  });
  for (const [index, name] of previewNames.entries()) add(`preview-${name}`, () => {
    const scene = observed?.scenarios?.[index], spec = previewSpec(name), previous = index ? observed.scenarios[index - 1].finishedAt : observed.capability.finishedAt;
    check(scene && scene.name === name && equal(scene.argv, previewCommand(name)) && equal(scene.steps, spec.tty ? previewSteps(name) : [])
      && iso(scene.startedAt) && iso(scene.finishedAt) && Date.parse(previous) <= Date.parse(scene.startedAt) && Date.parse(scene.startedAt) <= Date.parse(scene.finishedAt)
      && Date.parse(scene.finishedAt) <= Date.parse(observed.finishedAt) && Number.isSafeInteger(scene.childPid) && scene.childPid > 0, 'Preview actual command/window differs.');
    check(equal(scene.before, previewEntries(name)) && equal(scene.after, previewEntries(name, true)) && equal(scene.homeBefore, []) && equal(scene.homeAfter, []), 'Preview local/home bytes differ.');
    check(equal(scene.remoteBefore, previewModel(name)) && equal(scene.remoteAfter, previewModel(name, true)) && equal(scene.apparatusErrors, []), 'Preview model/apparatus differs.');
    check(equal(wire(scene.requests), wire(previewRequests(name))), 'Exact preview SDK requests/responses differ.');
    const { trace, streams } = traceOf(scene, spec.tty); intentTrace(name, scene, trace);
    if (!spec.tty) {
      check(equal(scene.result, { status: 0, signal: null, error: null, timedOut: false, stdout: '合集变更已发布；未执行上架。\n', stderr: '' })
        && streams.stdout === scene.result.stdout && streams.stderr === '' && !streams.stdout.includes('发布合集变更'), 'Non-TTY yes output differs.'); return;
    }
    check(scene.result?.completed === true && scene.result.status === (spec.success ? 0 : 1) && scene.result.signal === null && scene.result.stderr === ''
      && scene.result.completedSteps === scene.steps.length && equal(scene.result.matchedPrompts, scene.steps.map(step => step.expect)), 'Physical preview TTY interaction incomplete.');
    const expected = previewCanonical(expectedPreview(name)), physical = previewCanonical(scene.result.stdout), captured = previewCanonical(streams.stdout + streams.stderr);
    check(physical.includes(expected) && captured.includes(expected) && !scene.result.stdout.includes('\u202e') && !(streams.stdout + streams.stderr).includes('\u202e'), 'Whole ordered preview/value content missing or unescaped.');
    if (spec.success) {
      const firstIntent = trace.findIndex(event => event.event === 'intent-persisted'), prefix = trace.slice(0, firstIntent);
      const beforeIntent = ['stdout', 'stderr'].map(stream => Buffer.concat(prefix.filter(event => event.event === 'stream-write' && event.stream === stream)
        .map(event => Buffer.from(event.bytes, 'base64'))).toString('utf8')).join('');
      check(previewCanonical(beforeIntent).includes(expected), 'Complete preview was not written before intent persistence.');
    }
    if (spec.yes) check(previewCanonical(streams.stderr).includes(expected) && streams.stdout === '合集变更已发布；未执行上架。\n'
      && !captured.includes(previewCanonical('确认写入？')), 'TTY yes stream routing/question differs.');
    else check(physical.indexOf(previewCanonical('确认写入？')) >= physical.indexOf(expected) + expected.length, 'Confirmation precedes complete preview.');
    check(stripVTControlCharacters(scene.result.stdout).trim().endsWith(spec.success ? '合集变更已发布；未执行上架。' : '已取消'), 'Preview final business outcome differs.');
  });
  const status = assertions.every(assertion => assertion.passed) ? 'PASS' : 'FAIL';
  return { id: collectionPublishPreviewCases[0].id, status, assertions, observations: observed,
    ...(status === 'FAIL' ? { reason: assertions.filter(assertion => !assertion.passed).map(assertion => `${assertion.id}: ${assertion.reason}`).join('; ') } : {}) };
}
export function validateCollectionPublishPreviewFiles(observed) {
  check(absolute(observed?.evidenceDir), 'Missing preview raw root.'); const seen = new Set();
  for (const scene of [observed.capability, ...observed.scenarios]) {
    const { evidenceRef, ...raw } = scene, file = evidenceRef?.path, relative = typeof file === 'string' ? path.relative(observed.evidenceDir, file) : '';
    check(absolute(file) && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && !seen.has(file)
      && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file && lstatSync(file).size <= 2_000_000, 'Missing/unsafe preview raw file.');
    seen.add(file); const bytes = readFileSync(file);
    check(itemHash(bytes) === evidenceRef.sha256 && equal(JSON.parse(bytes.toString('utf8')), raw), 'Preview raw hash/content differs.');
  }
  check(seen.size === previewNames.length + 1, 'Missing preview/probe raw scene.');
}
