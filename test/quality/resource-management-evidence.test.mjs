import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { managementFixture } from './fixtures/resource-management.mjs';
import { isDeepStrictEqual } from 'node:util';

const helper = new URL('../acceptance/resource-management-evidence.mjs', import.meta.url);
const id = (kind) => `RESOURCE.MANAGEMENT.${kind === 'theme' ? 'THEME' : 'PNG'}_LISTING_SHELF`;
const step = (o, label) => o.steps.find((item) => item.label === label);
const rewriteJson = (o, label, mutate) => { const value = JSON.parse(step(o, label).result.stdout); mutate(value); step(o, label).result.stdout = JSON.stringify(value); };

test('two independent registered management producers retain seven gaps and exact design trace', async () => {
  const { resourceManagementCases } = await import(helper);
  const { acceptanceCatalog, acceptanceScripts } = await import('../acceptance/catalog.mjs');
  const { deliveryRules } = await import('../../scripts/release/delivery-contract.mjs');
  assert.equal(acceptanceCatalog.filter((item) => item.gap).length, 7);
  assert.equal(resourceManagementCases.length, 2);
  for (const leaf of resourceManagementCases) {
    assert.equal(leaf.parentRule, 'RESOURCE.MANAGEMENT_MATRIX');
    assert.deepEqual(acceptanceCatalog.find((item) => item.id === leaf.id), leaf);
    assert.ok(acceptanceScripts().includes(leaf.script));
    assert.ok(deliveryRules.find((item) => item.id === leaf.parentRule).caseIds.includes(leaf.id));
    assert.ok(leaf.preconditions.length && leaf.action.length && leaf.forbiddenSideEffects.length && leaf.inputClass && leaf.layer);
    for (const ref of leaf.designRefs) assert.ok(ref.section && existsSync(new URL(`../../${ref.path}`, import.meta.url)));
  }
});

test('source expectations accept both full synthetic controls without boolean summaries', async () => {
  const { evaluateResourceManagementCase } = await import(helper);
  for (const kind of ['theme', 'image']) {
    const result = evaluateResourceManagementCase(id(kind), await managementFixture(kind));
    assert.equal(result.status, 'PASS', result.reason);
    for (const a of result.assertions) { assert.notEqual(typeof a.expected, 'boolean'); assert.deepEqual(a.actual, a.expected, a.id); }
  }
});

test('same-run prerequisite cannot be replaced, cross-bound, failed, or relabelled', async () => {
  const { evaluateResourceManagementCase: evaluate } = await import(helper);
  for (const change of [
    (o) => { o.runId = 'old-run'; }, (o) => { o.binSha256 = '0'.repeat(64); }, (o) => { o.resourceId = 'c'.repeat(24); },
    (o) => { o.prerequisite.suiteCase.status = 'FAIL'; }, (o) => { o.prerequisite.rawText = '{}'; },
    (o) => { o.resourceKind = 'image'; }, (o) => { delete o.prerequisite; },
  ]) { const o = await managementFixture(); change(o); assert.equal(evaluate(id('theme'), o).status, 'FAIL'); }
});

test('owner, baseline, policy, RSS, frozen and full published versions must independently qualify before writes', async () => {
  const { evaluateResourceManagementCase: evaluate } = await import(helper);
  for (const change of [
    (o) => { o.currentUser.data.username = 'other'; }, (o) => { o.currentUser.data.userId = '12345'; },
    (o) => { o.baseline.errCode = 1; }, (o) => { o.baseline.data.resourceId = 'f'.repeat(24); },
    (o) => { o.baseline.data.isFrozen = true; }, (o) => { o.baseline.data.feedUrl = 'https://example.invalid/rss'; },
    (o) => { o.baseline.data.status = 2; }, (o) => { o.baseline.data.policies = []; },
    (o) => { o.baselineVersions[1].data.dependencies = []; },
  ]) { const o = await managementFixture(); change(o); assert.equal(evaluate(id('theme'), o).status, 'FAIL'); }
});

test('fixed command sequence cannot omit, reorder, substitute help, change flags or hide a crash', async () => {
  const { evaluateResourceManagementCase: evaluate } = await import(helper);
  for (const change of [
    (o) => { o.setupActions[1].argv = ['--help']; }, (o) => { o.steps.pop(); }, (o) => { o.steps.reverse(); },
    (o) => { step(o, 'update full').argv.push('--env', 'prod'); }, (o) => { step(o, 'online').result.status = 1; },
    (o) => { step(o, 'update full').result.signal = 'SIGTERM'; }, (o) => { step(o, 'offline').result.error = 'spawn error'; },
    (o) => { step(o, 'online repeated').result.timedOut = true; },
  ]) { const o = await managementFixture(); change(o); assert.equal(evaluate(id('theme'), o).status, 'FAIL'); }
});

test('JSON result must be one exact document with fixed changed/status/listing and errors', async () => {
  const { evaluateResourceManagementCase: evaluate } = await import(helper);
  for (const change of [
    (o) => rewriteJson(o, 'update full', (v) => { v.changed = false; }),
    (o) => rewriteJson(o, 'update repeated', (v) => { v.changed = true; }),
    (o) => rewriteJson(o, 'update clear', (v) => { v.listing.tags = ['old']; }),
    (o) => rewriteJson(o, 'offline', (v) => { v.status = 0; }),
    (o) => rewriteJson(o, 'reject empty', (v) => { v.code = 'CLI_ERROR'; }),
    (o) => rewriteJson(o, 'update intro', (v) => { v.extra = 'private'; }),
    (o) => { step(o, 'update cover').result.stdout += '{}'; },
    (o) => { step(o, 'online').result.stderr = 'prompt leaked'; },
  ]) { const o = await managementFixture(); change(o); assert.equal(evaluate(id('theme'), o).status, 'FAIL'); }
});

test('all unrequested public fields, policies and published version business data remain exact', async () => {
  const { evaluateResourceManagementCase: evaluate } = await import(helper);
  for (const change of [
    (o) => { step(o, 'update intro').remoteAfter.data.resourceTitle = 'surprise'; },
    (o) => { step(o, 'update cover').remoteAfter.data.policies[0].status = 0; },
    (o) => { step(o, 'online').remoteAfter.data.intro = 'surprise'; },
    (o) => { step(o, 'update full').versionsAfter[1].data.versionProperty.qathemeText = 'lost'; },
    (o) => { step(o, 'reject invalid tags').remoteAfter.data.coverImages = ['https://image.freelog.cn/new.png']; },
    (o) => { step(o, 'update cover').remoteAfter.data.coverImages = []; },
    (o) => { step(o, 'update cover').remoteAfter.data.coverImages = ['javascript:bad']; },
  ]) { const o = await managementFixture(); change(o); assert.equal(evaluate(id('theme'), o).status, 'FAIL'); }
});

test('exact local byte snapshots allow only the confirmed target title and preserve artifacts/auth/no pending', async () => {
  const { evaluateResourceManagementCase: evaluate } = await import(helper);
  for (const change of [
    (o) => { step(o, 'online').after.find((e) => e.path === 'cover.png').sha256 = '0'.repeat(64); },
    (o) => { step(o, 'update full').after.find((e) => e.path === '.freelog/1.json').utf8 += ' '; },
    (o) => { step(o, 'offline').after.push({ path: '.freelog/.pending-operation.json', kind: 'directory' }); },
    (o) => { step(o, 'update intro').before = []; },
    (o) => { o.repeatBindAfter.pop(); },
  ]) { const o = await managementFixture(); change(o); assert.equal(evaluate(id('theme'), o).status, 'FAIL'); }
});

test('copied artifact and actual CLI auth selector cannot diverge from retained source and independent owner', async () => {
  const { evaluateResourceManagementCase: evaluate } = await import(helper);
  for (const change of [
    (o) => { delete o.cliAuth; },
    (o) => { o.cliAuth = { schemaVersion: 1, env: 'dev', userId: 99, username: 'another' }; },
    (o) => { o.boundSnapshot.find((e) => e.path === 'dist/index.html').sha256 = '0'.repeat(64); },
  ]) { const o = await managementFixture(); change(o); assert.equal(evaluate(id('theme'), o).status, 'FAIL'); }
});

test('public projection never preserves arbitrary malformed nested objects or HTTP diagnostics', async () => {
  const { managementSdkProjection } = await import(helper);
  const secret = 'SYNTHETIC_PRIVATE_NOT_PUBLIC';
  const projected = managementSdkProjection({ ret: { Authorization: secret }, errCode: 0,
    data: { resourceTitle: { config: { password: secret } }, tags: [{ Cookie: secret }], coverImages: [{ data: secret }],
      resourceType: [{ secret }], policies: [{ policyText: { headers: secret } }], ignoredSecret: secret } });
  assert.doesNotMatch(JSON.stringify(projected), new RegExp(secret));
});

test('actual producer loop refuses current CLI action after observing any remote/version/local pre-snapshot drift', async () => {
  const { evaluateResourceManagementCase, managementCommands, assertManagementBefore } = await import(helper);
  const source = readFileSync(new URL('../verify-resource-management.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('for (const spec of managementCommands(kind, observed.resourceId)) {');
  const end = source.indexOf('observed.finishedAt =', start);
  assert.ok(start > 0 && end > start, 'exercise the actual producer loop, not a rewritten imitation');
  const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
  const run = new AsyncFunction('managementCommands', 'evaluateResourceManagementCase', 'assertManagementBefore', 'kind', 'observed', 'leaf',
    'readResource', 'readVersions', 'snapshot', 'work', 'persist', 'runCli', 'isEqualPrefix', 'HarnessError', `let result; ${source.slice(start, end)} return result;`);
  for (const fault of ['none', 'resource', 'version', 'local']) {
    const fixture = await managementFixture(); const all = fixture.steps; const observed = { ...fixture, steps: [] }; const invoked = [];
    let resourceRead = 0, versionRead = 0, snapshotRead = 0;
    const select = (count, fieldBefore, fieldAfter) => structuredClone(all[Math.floor(count / 2)][count % 2 === 0 ? fieldBefore : fieldAfter]);
    const readResource = async () => { const n = resourceRead++; const value = select(n, 'remoteBefore', 'remoteAfter'); if (fault === 'resource' && n === 6) value.data.intro = 'external drift'; return value; };
    const readVersions = async () => { const n = versionRead++; const value = select(n, 'versionsBefore', 'versionsAfter'); if (fault === 'version' && n === 6) value[1].data.description = 'external drift'; return value; };
    const snapshot = () => { const n = snapshotRead++; const value = select(n, 'before', 'after'); if (fault === 'local' && n === 6) value.find((e) => e.path === 'sentinel.txt').sha256 = '0'.repeat(64); return value; };
    const invoke = () => run(managementCommands, evaluateResourceManagementCase, assertManagementBefore, 'theme', observed, { id: id('theme') },
      readResource, readVersions, snapshot, 'unused-owned-path', () => {}, (spec) => { invoked.push(spec.label); return { result: structuredClone(all.find((s) => s.label === spec.label).result) }; },
      (a, b, n) => isDeepStrictEqual(a.slice(0, n), b.slice(0, n)), Error);
    if (fault === 'none') { await invoke(); assert.equal(invoked.length, 13); }
    else { await assert.rejects(invoke()); assert.deepEqual(invoked, ['reject empty', 'reject invalid tags', 'reject unconfirmed'], fault); }
  }
});

test('actual cleanup hook must refuse missing or changed owned selector before invoking logout', async () => {
  const source = readFileSync(new URL('../verify-resource-management.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('beforeRemove() {'); const end = source.indexOf('\n      } });', start);
  assert.ok(start > 0 && end > start);
  const hook = new Function('runCli', 'observed', 'existsSync', 'snapshot', 'isDeepStrictEqual', 'path', 'work', 'HarnessError', source.slice(start + 'beforeRemove() {'.length, end));
  for (const fault of ['missing', 'changed', 'none']) {
    const o = await managementFixture(); let calls = 0;
    const invoke = () => hook(() => { calls += 1; return { result: { status: 0, signal: null, error: null, timedOut: false } }; }, o,
      () => fault === 'missing' ? false : calls === 0, () => { const value = structuredClone(o.steps.at(-1).after); if (fault !== 'none') value.pop(); return value; },
      isDeepStrictEqual, path, 'unused-owned-workspace', Error);
    if (fault === 'none') { invoke(); assert.equal(calls, 1); }
    else { assert.throws(invoke); assert.equal(calls, 0, fault); }
  }
});

test('private-input read/parse failure is a fixed BLOCKED prerequisite, not a diagnostic leak or product FAIL', async () => {
  const location = new URL('../verify-resource-management.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8')
    .replace(/import \{ readPrivateJson \} from '[^']+';/u, "const readPrivateJson = () => { throw new Error('SYNTHETIC_PRIVATE_PARSE_EXCERPT'); };")
    .replaceAll('import.meta.url', JSON.stringify(location.href))
    .replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(typeof module.readManagementPrimary, 'function');
  assert.throws(() => module.readManagementPrimary('unused-private-input'), (error) => error.status === 'BLOCKED'
    && !String(error.message).includes('SYNTHETIC_PRIVATE_PARSE_EXCERPT'));
});

test('absent installed/run prerequisite blocks before credentials, workspace or dev access', async (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-management-guard-')));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-management-guard-')); rmSync(root, { recursive: true, force: true }); });
  for (const kind of ['theme', 'image']) {
    const report = path.join(root, `${kind}.json`);
    const env = { ...process.env, FREELOG_TEST_RUN_ID: 'guard-only', FREELOG_TEST_SUITE_REPORT: report };
    delete env.FREELOG_TEST_CLI_BIN;
    const producer = new URL(`../verify-${kind}-resource-management.mjs`, import.meta.url);
    const child = spawnSync(process.execPath, [producer.pathname.replace(/^\/(?:([A-Za-z]:))/u, '$1')], { env, encoding: 'utf8', timeout: 10_000 });
    assert.equal(child.status, 3, child.stderr); const result = JSON.parse(readFileSync(report, 'utf8')).cases[0];
    assert.equal(result.status, 'BLOCKED'); assert.equal(result.observations?.cwd, undefined);
    assert.doesNotMatch(JSON.stringify(result), /password|cookie|credentialKey/iu);
  }
});
