/** Finite S03 stimuli and independent public output/byte oracles; no CLI domain imports. */
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual as equal, stripVTControlCharacters } from 'node:util';
import { typeInitRouteAllowed } from './type-init-control.mjs';

export const typeInitNames = Object.freeze(['list-page', 'list-empty', 'search-filter', 'search-empty', 'info-capability', 'pick-explicit', 'pick-list',
  'info-missing', 'detail-parent', 'detail-disabled', 'detail-missing', 'detail-mismatch', 'tree-failed', 'search-failed', 'detail-shape',
  'init-plain', 'init-fixed-theme', 'init-artifact-missing', 'init-existing', 'tty-pages', 'tty-hierarchy', 'tty-search', 'tty-code', 'tty-cancel']);
export const typeInitTtyNames = new Set(typeInitNames.filter(name => name.startsWith('tty-')));
export const typeInitCases = Object.freeze([Object.freeze({ id: 'PROJECT.TYPE_INIT.INSTALLED_LOCAL', kind: 'product-case', required: true,
  parentRule: 'COMMAND.PARAMETER_CONTRACT', script: 'verify-type-init.mjs', title: 'Installed finite type queries and existing-artifact init, including actual TTY menus',
  assertionIds: Object.freeze(['installed-type-init-binding', ...typeInitNames.map(name => `type-init-${name}`)]),
  layer: 'installed-candidate/local-loopback/actual-TTY/not-real-dev', inputClass: 'S03 bounded read/plain-init, 24 fixed scenarios; template downloads excluded',
  preconditions: ['Exact installed CLI, synthetic read-only keyring and owned work/home.', 'Source-fixed subject-1 type GETs and actual native terminal capability.'],
  action: ['Execute the fixed commands and recompute exact output, requests and full local bytes.'],
  forbiddenSideEffects: ['real network', 'native keyring', 'credential writes', 'POST/PUT', 'template downloads', 'publication', 'workspace bin fallback'],
  designRefs: [{ path: 'docs/一期/产品方案/脚手架设计/ARCHITECTURE/03-init.md', section: '1/2.1/4/5 单资源类型与已有产物立项' }],
})]);
export const typeInitHash = value => createHash('sha256').update(value).digest('hex');
export const typeInitJson = value => `${JSON.stringify(value, null, 2)}\n`;
export const typeInitText = value => stripVTControlCharacters(value).replace(/\r/g, '');
const b64 = value => Buffer.from(value).toString('base64');
const sortEntries = entries => entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const entry = (name, content) => ({ path: name, kind: 'file', bytes: b64(content) });
const directory = name => ({ path: name, kind: 'directory' });
const identity = (code, artifact) => typeInitJson({ schemaVersion: 1, subject: 'resource', typeCode: code, filePath: artifact });
export function typeInitInitialEntries(name) {
  const entries = [directory('.freelog'), entry('.freelog/auth', typeInitJson({ schemaVersion: 1, credentialKey: 'v1/dev/7', env: 'dev', userId: 7, username: 'alice', createdAt: '2026-10-20T00:00:00.000Z' })), entry('keep.txt', 'keep whole workspace\n')];
  if (name.startsWith('init-') || name.startsWith('tty-') && name !== 'tty-pages') {
    entries.push(directory('project'), entry('project/video.mp4', 'synthetic video\n'), entry('project/keep.txt', 'preserve project\n'));
    if (name === 'init-fixed-theme') entries.push(directory('project/dist'));
    if (name === 'init-existing') entries.push(directory('project/.freelog'), entry('project/.freelog/1.json', identity('VIDEO', 'video.mp4')));
  }
  return sortEntries(entries);
}
export function typeInitAfterEntries(name) {
  const entries = typeInitInitialEntries(name);
  if (['init-plain', 'init-fixed-theme', 'tty-hierarchy', 'tty-search', 'tty-code'].includes(name)) entries.push(directory('project/.freelog'),
    entry('project/.freelog/1.json', identity(name === 'init-fixed-theme' ? 'RT001' : 'VIDEO', name === 'init-fixed-theme' ? 'dist' : 'video.mp4')), entry('project/.freelog/.sequence', '1\n'));
  return sortEntries(entries);
}
const leaf = (code, name, extra = {}) => ({ code, name, isTerminate: true, status: 1, subjectType: 1, ...extra });
export function typeInitTree(name) {
  if (name === 'list-empty') return [];
  const children = ['list-page', 'pick-list', 'tty-pages'].includes(name)
    ? Array.from({ length: 51 }, (_, index) => leaf(`TYPE_${index + 1}`, `叶子${index + 1}`))
    : [leaf('VIDEO', '视频', { nameChain: '伪造路径' }), leaf('OFF', '停用', { status: 0 }), leaf('COL', '合集', { subjectType: 4 })];
  return [{ code: 'GROUP', name: '祖父节点', children: [{ code: 'PARENT', name: '父节点', children }] }];
}
const envelope = data => ({ ret: 0, errCode: 0, data });
/** Controlled server input model, not a dispatcher of expected stdout. */
export function typeInitResponse(name, raw) {
  const url = new URL(raw, 'https://api.devfreelog.com');
  if (url.pathname.endsWith('/listSimpleByGroup')) return { ret: name === 'tree-failed' ? 1 : 0, errCode: 0, data: typeInitTree(name) };
  if (url.pathname.endsWith('/listSimpleByParentCode')) {
    const data = name === 'search-empty' ? [] : [{ code: 'VIDEO', name: '不信任名称', nameChain: '伪造' }, { code: 'VIDEO' }, { code: 'OFF' }, { code: 'COL' }, { code: 'OUTSIDE' }];
    return { ret: name === 'search-failed' ? 1 : 0, errCode: 0, data };
  }
  const code = url.searchParams.get('code');
  if (name === 'detail-shape') return envelope([]);
  if (code === 'MISSING') return envelope(null);
  if (code === 'PARENT') return envelope(leaf(code, '父节点', { isTerminate: false }));
  if (code === 'OFF') return envelope(leaf(code, '停用', { status: 0 }));
  return envelope(leaf(name === 'detail-mismatch' ? 'OTHER' : code, code === 'RT001' ? '主题' : '视频', { resourceConfig: { supportOptionalConfig: 2 } }));
}
export function typeInitCommand(name) {
  let argv;
  if (['list-page', 'list-empty', 'tree-failed', 'tty-pages'].includes(name)) argv = ['type', 'list'];
  else if (name.startsWith('search-')) argv = ['type', 'search', ...(name === 'search-empty' ? [] : ['视频'])];
  else if (name === 'pick-list') argv = ['type', 'pick'];
  else if (name === 'pick-explicit') argv = ['type', 'pick', '--type', 'VIDEO'];
  else if (name.startsWith('init-') || name.startsWith('tty-')) argv = ['init', 'project',
    ...(!name.startsWith('tty-') ? ['--type', name === 'init-fixed-theme' ? 'RT001' : 'VIDEO', '--yes'] : []),
    '--artifact', name === 'init-fixed-theme' ? 'dist' : name === 'init-artifact-missing' ? 'missing.mp4' : 'video.mp4'];
  else argv = ['type', 'info', ...(name === 'info-missing' ? [] : [name === 'detail-parent' ? 'PARENT' : name === 'detail-disabled' ? 'OFF' : name === 'detail-missing' ? 'MISSING' : name === 'info-capability' ? ' VIDEO ' : 'VIDEO'])];
  return [...argv, '--env', 'dev', '--json'];
}
const down = '\u001b[B';
export function typeInitSteps(name) {
  if (name === 'tty-pages') return [{ expect: '资源类型列表', send: '\r' }, { expect: '第 2/2 页，共 51 个可用最终叶子类型' },
    { expect: 'TYPE_51\t祖父节点 / 父节点 / 叶子51' }, { expect: '资源类型列表', send: '\r' },
    { expect: '第 1/2 页，共 51 个可用最终叶子类型' }, { expect: '资源类型列表', send: `${down}\r` }];
  if (name === 'tty-hierarchy') return [{ expect: '选择资源类型', send: '\r' }, { expect: '选择祖父节点', send: '\r' }, { expect: '选择父节点', send: '\r' }];
  if (name === 'tty-search') return [{ expect: '选择资源类型', send: `${down}\r` }, { expect: '? 搜索资源类型', send: '视频\r' }, { expect: '选择搜索结果', send: '\r' }];
  if (name === 'tty-code') return [{ expect: '选择资源类型', send: `${down}${down}\r` }, { expect: '输入最终叶子类型编号', send: 'VIDEO\r' }];
  if (name === 'tty-cancel') return [{ expect: '选择资源类型', send: '\r' }, { expect: '选择祖父节点', send: `${down}${down}${down}${down}\r` }];
  return [];
}
export const typeInitCapabilityCommand = () => ['-e', 'console.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY})); process.exit(0)'];
export function typeInitExpectedError(name, cwd) {
  if (name === 'info-missing') return { code: 'TYPE_CODE_REQUIRED', message: '请提供类型编号' };
  if (['detail-parent', 'detail-disabled'].includes(name)) return { code: 'TYPE_NOT_LEAF', message: '必须是启用中的单资源最终叶子类型' };
  if (['detail-missing', 'detail-mismatch'].includes(name)) return { code: 'TYPE_NOT_FOUND', message: `找不到类型 ${name === 'detail-missing' ? 'MISSING' : 'VIDEO'}` };
  if (['tree-failed', 'search-failed', 'detail-shape'].includes(name)) return { code: 'TYPE_RESPONSE_INVALID', message: '平台资源类型查询失败或响应不完整，请核对后重试' };
  if (name === 'init-artifact-missing') return { code: 'ARTIFACT_ANCHOR_MISSING', message: `本地产物不存在：${path.join(cwd, 'project/missing.mp4')}` };
  if (name === 'init-existing') return { code: 'INIT_TARGET_NOT_EMPTY', message: '目标目录不是空目录，拒绝覆盖' };
  if (name === 'tty-cancel') return { code: 'TYPE_PICK_CANCELLED', message: '已取消资源类型选择' };
  return null;
}
const page = (number, total, rows) => `第 ${number}/${Math.max(1, Math.ceil(total / 50))} 页，共 ${total} 个可用最终叶子类型\n${rows.length ? rows.join('\n') : '没有匹配的启用最终叶子类型'}\n`;
export function typeInitExpectedOutput(name) {
  if (name === 'list-empty' || name === 'search-empty') return page(1, 0, []);
  if (['list-page', 'pick-list'].includes(name)) return page(1, 51, Array.from({ length: 50 }, (_, i) => `TYPE_${i + 1}\t祖父节点 / 父节点 / 叶子${i + 1}`))
    + `还有 1 个资源类型；请在交互终端运行 ${name === 'pick-list' ? 'type pick' : 'type list'} 查看后续页\n`;
  if (name === 'search-filter') return page(1, 1, ['VIDEO\t祖父节点 / 父节点 / 视频']);
  if (['info-capability', 'pick-explicit'].includes(name)) return 'VIDEO\t祖父节点 / 父节点 / 视频\t可选配置：支持\n';
  return '已创建本地身份 1.json\n';
}
const treePath = '/v2/resources/types/listSimpleByGroup';
const searchPath = '/v2/resources/types/listSimpleByParentCode';
const detailPath = '/v2/resources/types/getInfoByCode';
function request(name, route, query) {
  const raw = `${route}?${new URLSearchParams(query)}`;
  return { method: 'GET', path: route, query: Object.entries(query).sort(([a], [b]) => a.localeCompare(b)), body: null, response: typeInitResponse(name, raw) };
}
export function typeInitExpectedRequests(name) {
  const tree = () => request(name, treePath, { category: '1', status: '1', subjectType: '1' });
  const detail = code => request(name, detailPath, { code });
  const search = keyword => request(name, searchPath, { category: '1', nameChain: keyword, isTerminate: 'true', status: '1', subjectType: '1' });
  if (name === 'info-missing') return [];
  if (name.startsWith('search-')) return [tree(), search(name === 'search-empty' ? '' : '视频')];
  if (name === 'tty-search') return [tree(), tree(), search('视频'), detail('VIDEO')];
  if (['tty-hierarchy', 'tty-code'].includes(name)) return [tree(), detail('VIDEO')];
  if (['list-page', 'list-empty', 'tree-failed', 'pick-list', 'tty-pages', 'tty-cancel'].includes(name)) return [tree()];
  const code = name === 'detail-parent' ? 'PARENT' : name === 'detail-disabled' ? 'OFF' : name === 'detail-missing' ? 'MISSING' : name === 'init-fixed-theme' ? 'RT001' : 'VIDEO';
  const rows = [detail(code)];
  if (['info-capability', 'pick-explicit'].includes(name)) rows.push(tree());
  return rows;
}
const check = (value, message) => { if (!value) throw new Error(message); };
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const absolute = value => typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value;
function normalizeRequests(rows, name) {
  const result = rows.map(row => {
    check(typeInitRouteAllowed(row.method, row.path), 'Forbidden SDK request.');
    const url = new URL(row.path, 'https://api.devfreelog.com');
    return { method: row.method, path: url.pathname, query: [...url.searchParams].sort(([a], [b]) => a.localeCompare(b)), body: row.body, response: row.response };
  });
  // Only tree/search started in the same Promise.all may commute; phase boundaries remain ordered.
  const start = name === 'tty-search' ? 1 : name.startsWith('search-') ? 0 : -1;
  if (start >= 0 && result.length >= start + 2) result.splice(start, 2, ...result.slice(start, start + 2).sort((a, b) => a.path.localeCompare(b.path)));
  return result;
}
function expectedRequests(name) {
  const rows = typeInitExpectedRequests(name);
  const start = name === 'tty-search' ? 1 : name.startsWith('search-') ? 0 : -1;
  if (start >= 0) rows.splice(start, 2, ...rows.slice(start, start + 2).sort((a, b) => a.path.localeCompare(b.path)));
  return rows;
}
function windowCheck(scene, run) {
  check(absolute(scene.cwd) && absolute(scene.controls) && scene.cwd !== scene.controls && Number.isSafeInteger(scene.childPid) && scene.childPid > 0
    && iso(scene.startedAt) && iso(scene.finishedAt) && Date.parse(run.startedAt) <= Date.parse(scene.startedAt)
    && Date.parse(scene.startedAt) <= Date.parse(scene.finishedAt) && Date.parse(scene.finishedAt) <= Date.parse(run.finishedAt), 'Missing actual child/window.');
}
function traceCheck(scene, authenticated = true) {
  const events = scene.trace.trim().split('\n').map(JSON.parse);
  check(events.every(event => event.schemaVersion === 1 && ['keyring-replaced', 'keyring-get', 'ready', 'request', 'finished'].includes(event.event))
    && events.filter(event => event.event === 'ready' && event.guard === 'type-init-local-v1').length === 1 && events.at(-1).event === 'finished'
    && events.filter(event => event.event === 'finished').length === 1
    && events.filter(event => event.event === 'keyring-replaced').length === 1
    && events.filter(event => event.event === 'keyring-get').length === (authenticated ? 1 + scene.requests.length * 2 : 0)
    && equal(events.filter(event => event.event === 'request').map(({ method, path: route }) => ({ method, path: route })), scene.requests.map(({ method, path: route }) => ({ method, path: route }))), 'Missing or forbidden isolation trace.');
}
function scenarioCheck(scene, name, run) {
  check(scene?.name === name && !scene.apparatusError && equal(scene.apparatusErrors, []) && scene.tty === typeInitTtyNames.has(name)
    && equal(scene.argv, typeInitCommand(name)) && equal(scene.steps, typeInitSteps(name)), 'Wrong fixed scene/argv/keys.');
  windowCheck(scene, run);
  const result = scene.result, error = typeInitExpectedError(name, scene.cwd);
  check(result && result.status === (error ? 1 : 0) && result.signal === null && result.stderr === '' && typeof result.stdout === 'string'
    && Buffer.byteLength(result.stdout) <= 1_000_000 && (scene.tty ? result.completed === true && result.completedSteps === scene.steps.length
      && equal(result.matchedPrompts, scene.steps.map(step => step.expect)) : result.error === null && result.timedOut === false), 'Incomplete or wrong process result.');
  const text = typeInitText(result.stdout);
  if (!scene.tty) check(text === (error ? `${JSON.stringify(error)}\n` : typeInitExpectedOutput(name)), 'Wrong exact complete output.');
  else {
    for (const step of scene.steps) check(text.includes(step.expect), 'Missing actual prompt/page.');
    if (name === 'tty-pages') {
      const page1 = page(1, 51, Array.from({ length: 50 }, (_, i) => `TYPE_${i + 1}\t祖父节点 / 父节点 / 叶子${i + 1}`));
      const page2 = page(2, 51, ['TYPE_51\t祖父节点 / 父节点 / 叶子51']);
      const first = text.indexOf(page1), second = text.indexOf(page2, first + page1.length), third = text.indexOf(page1, second + page2.length);
      check(first >= 0 && second > first && third > second, 'Missing full ordered next/previous pages.');
    } else check(text.trimEnd().endsWith(error ? JSON.stringify(error) : typeInitExpectedOutput(name).trimEnd()), 'Missing exact terminal result suffix.');
  }
  check(equal(scene.before, typeInitInitialEntries(name)) && equal(scene.after, typeInitAfterEntries(name)) && equal(scene.homeBefore, []) && equal(scene.homeAfter, []), 'Wrong full workspace/home byte effects.');
  check(equal(normalizeRequests(scene.requests, name), expectedRequests(name)), 'Wrong complete SDK requests/responses.');
  traceCheck(scene);
}
export function evaluateTypeInit(observed) {
  const assertions = [];
  const add = (id, test) => { try { test(); assertions.push({ id, passed: true, expected: true, actual: true }); }
    catch (error) { assertions.push({ id, passed: false, expected: true, actual: false, reason: error.message }); } };
  add('installed-type-init-binding', () => {
    check(observed && /^[A-Za-z0-9-]{1,80}$/u.test(observed.runId ?? '') && absolute(observed.evidenceDir) && absolute(observed.cliBin)
      && observed.cliBin.endsWith(path.join('node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js'))
      && observed.packageName === '@freelog-cli/cli2' && typeof observed.version === 'string' && observed.version.length > 0
      && /^[a-f0-9]{64}$/u.test(observed.binSha256 ?? '') && ['win32', 'darwin', 'linux'].includes(observed.platform) && /^v(20|22)\./u.test(observed.nodeVersion ?? '')
      && iso(observed.startedAt) && iso(observed.finishedAt) && Date.parse(observed.startedAt) <= Date.parse(observed.finishedAt) && Date.parse(observed.finishedAt) <= Date.now()
      && equal(observed.apparatusErrors, []) && equal(observed.scenarios?.map(scene => scene.name), typeInitNames), 'Wrong installed run binding or fixed set.');
    const capability = observed.capability;
    check(capability?.name === 'capability' && equal(capability.argv, typeInitCapabilityCommand()) && capability.result?.completed === true
      && capability.result.status === 0 && capability.result.signal === null && capability.result.stderr === '' && capability.result.completedSteps === 1
      && equal(capability.result.matchedPrompts, ['{"stdin":true,"stdout":true}']) && typeInitText(capability.result.stdout).trim() === '{"stdin":true,"stdout":true}'
      && equal(capability.before, typeInitInitialEntries('capability')) && equal(capability.after, capability.before)
      && equal(capability.homeBefore, []) && equal(capability.homeAfter, []) && equal(capability.requests, []), 'Missing actual isolated terminal capability.');
    windowCheck(capability, observed); traceCheck(capability, false);
    let end = Date.parse(capability.finishedAt);
    const seen = new Set([capability.cwd, capability.controls]);
    for (const scene of observed.scenarios) {
      check(Date.parse(scene.startedAt) >= end && !seen.has(scene.cwd) && !seen.has(scene.controls), 'Overlapping scenes or reused owned directories.');
      seen.add(scene.cwd); seen.add(scene.controls); end = Date.parse(scene.finishedAt);
    }
  });
  for (const [index, name] of typeInitNames.entries()) add(`type-init-${name}`, () => scenarioCheck(observed?.scenarios?.[index], name, observed));
  const status = assertions.every(assertion => assertion.passed) ? 'PASS' : 'FAIL';
  return { id: typeInitCases[0].id, status, assertions, observations: observed,
    ...(status === 'PASS' ? {} : { reason: assertions.filter(assertion => !assertion.passed).map(assertion => `${assertion.id}: ${assertion.reason}`).join('; ') }) };
}
export function validateTypeInitFiles(observed) {
  check(absolute(observed?.evidenceDir), 'Missing S03 raw root.');
  check(absolute(observed.cliBin) && observed.cliBin.endsWith(path.join('node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js'))
    && lstatSync(observed.cliBin).isFile() && !lstatSync(observed.cliBin).isSymbolicLink() && realpathSync(observed.cliBin) === observed.cliBin
    && typeInitHash(readFileSync(observed.cliBin)) === observed.binSha256, 'Missing or changed installed S03 bin bytes.');
  const seen = new Set();
  for (const scene of [observed.capability, ...observed.scenarios]) {
    const { evidenceRef, ...raw } = scene, file = evidenceRef?.path;
    const relative = typeof file === 'string' ? path.relative(observed.evidenceDir, file) : '';
    check(absolute(file) && relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) && !seen.has(file)
      && lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file) === file && lstatSync(file).size <= 2_000_000, 'Unsafe or missing S03 raw file.');
    seen.add(file); const bytes = readFileSync(file);
    check(typeInitHash(bytes) === evidenceRef.sha256 && equal(JSON.parse(bytes.toString('utf8')), raw), 'S03 raw digest/content differs.');
  }
  check(seen.size === typeInitNames.length + 1, 'Missing or duplicated S03 raw scenes.');
}
