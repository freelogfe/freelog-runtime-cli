import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resourceSyncFixture as fixture, resourceSyncOriginals as originals, resourceSyncSdk as sdk,
  resourceSyncSnapshot as snapshot } from './fixtures/resource-sync.mjs';

const helper = new URL('../acceptance/resource-sync-evidence.mjs', import.meta.url);
const producer = fileURLToPath(new URL('../verify-resource-sync-json.mjs', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stages = ['ALL_SUCCESS', 'PARTIAL_FAILURE', 'ALL_FAILURE'];
function changeDto(value, mutate) { const dto = JSON.parse(value.result.stdout); mutate(dto); value.result.stdout = JSON.stringify(dto); }

test('three sync leaves bind the fixed design/input and retain the unresolved management parent', async () => {
  const { resourceSyncCases } = await import(helper);
  assert.deepEqual(resourceSyncCases.map((item) => item.id), stages.map((stage) => `RESOURCE.SYNC.JSON.${stage}`));
  for (const leaf of resourceSyncCases) {
    assert.equal(leaf.parentRule, 'RESOURCE.MANAGEMENT_MATRIX');
    assert.equal(leaf.script, 'verify-resource-sync-json.mjs');
    assert.equal(leaf.required, true);
    assert.ok(leaf.preconditions.length && leaf.forbiddenSideEffects.length && leaf.inputClass && leaf.layer);
    for (const ref of leaf.designRefs) assert.ok(ref.section && existsSync(new URL(`../../${ref.path}`, import.meta.url)), ref.path);
  }
});

test('fixed independent SDK and byte snapshots prove all three outcomes; expected command exit 1 is business PASS', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  for (const stage of stages) {
    const value = fixture(stage);
    const result = evaluateResourceSyncCase(`RESOURCE.SYNC.JSON.${stage}`, value);
    assert.equal(result.status, 'PASS', result.reason);
    for (const assertion of result.assertions) {
      assert.notEqual(typeof assertion.expected, 'boolean', assertion.id);
      assert.deepEqual(assertion.actual, assertion.expected, assertion.id);
    }
    assert.deepEqual(result.observations, value);
    assert.deepEqual(JSON.parse(JSON.stringify(result)).assertions, result.assertions);
  }
});

test('setup cannot omit creation, swap it for help, hide a failed process or return IDs from another fixture', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  for (const mutate of [
    (value) => { delete value.setupActions; },
    (value) => { value.setupActions = []; },
    (value) => { value.setupActions[2].argv = ['--help']; },
    (value) => { value.setupActions[2].result.status = 1; },
    (value) => { value.setupActions[2].result.stdout = 'c'.repeat(24); },
    (value) => { value.setupActions[2].result.signal = 'SIGTERM'; },
    (value) => { value.setupActions.reverse(); },
  ]) {
    const value = fixture('ALL_SUCCESS'); mutate(value);
    const result = evaluateResourceSyncCase('RESOURCE.SYNC.JSON.ALL_SUCCESS', value);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === 'setup-command-binding')?.passed, false);
  }
});

test('stdout must be one exact DTO with fixed counts, ordered targets and fixed errors, never summary text', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  for (const mutate of [
    (value) => changeDto(value, (dto) => { dto.summary.failed = 0; }),
    (value) => changeDto(value, (dto) => { dto.results.reverse(); }),
    (value) => changeDto(value, (dto) => { dto.results[1].title = 'forged success'; }),
    (value) => changeDto(value, (dto) => { dto.results[1].error.message = 'arbitrary HTTP error'; }),
    (value) => changeDto(value, (dto) => { dto.results[1].resourceId = originals[1].identity.resourceId; }),
    (value) => changeDto(value, (dto) => { dto.extra = 'not public DTO'; }),
    (value) => { value.result.stdout = 'PASS all complete'; },
    (value) => { value.result.stdout += '{}'; },
  ]) {
    const value = fixture('PARTIAL_FAILURE'); mutate(value);
    const result = evaluateResourceSyncCase('RESOURCE.SYNC.JSON.PARTIAL_FAILURE', value);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === 'stdout-dto').passed, false);
  }
});

test('wrong argv, crash, signal, timeout, wrong exit and nonempty stderr cannot pass', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  for (const [mutate, assertion] of [
    [(value) => { value.argv.push('--resource', 'file:1.json'); }, 'command-input'],
    [(value) => { value.stdin = 'unexpected'; }, 'command-input'],
    [(value) => { value.result.status = 0; }, 'process-result'],
    [(value) => { value.result.status = null; }, 'process-result'],
    [(value) => { value.result.signal = 'SIGTERM'; }, 'process-result'],
    [(value) => { value.result.error = 'spawn failed'; }, 'process-result'],
    [(value) => { value.result.timedOut = true; }, 'process-result'],
    [(value) => { value.result.stderr = 'warning'; }, 'stderr-empty'],
  ]) {
    const value = fixture('PARTIAL_FAILURE'); mutate(value);
    const result = evaluateResourceSyncCase('RESOURCE.SYNC.JSON.PARTIAL_FAILURE', value);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === assertion).passed, false, assertion);
  }
});

test('stale cache is mandatory and complete SDK success envelope, exact owner and title are independently required', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  for (const [mutate, assertion] of [
    [(value) => { value.originalSdk[0].envelope.ret = 1; }, 'independent-sdk-baseline'],
    [(value) => { value.remoteBefore[0].envelope.errCode = 1; }, 'independent-sdk-baseline'],
    [(value) => { value.originalSdk[0].envelope.dataShape = 'array'; }, 'independent-sdk-baseline'],
    [(value) => { value.originalSdk[0].envelope.data.userId = '42'; }, 'independent-sdk-baseline'],
    [(value) => { value.auth.userId = 7; }, 'independent-sdk-baseline'],
    [(value) => { value.originalSdk[0].envelope.data.resourceTitle = 123; }, 'independent-sdk-baseline'],
    [(value) => { const identities = value.originals.map((item) => item.identity); value.before = snapshot(identities); }, 'stale-fixture'],
  ]) {
    const value = fixture('ALL_SUCCESS'); mutate(value);
    const result = evaluateResourceSyncCase('RESOURCE.SYNC.JSON.ALL_SUCCESS', value);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === assertion).passed, false, assertion);
  }
});

test('success changes only title, failures keep original bytes, and other files/directories remain exact', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  for (const mutate of [
    (value) => { value.after.find((item) => item.path === 'sync-a.png').sha256 = 'f'.repeat(64); },
    (value) => { value.after = value.after.filter((item) => item.path !== 'keep-empty'); },
    (value) => { value.after.push({ path: '.freelog/.pending-operation.json', kind: 'file', size: 0, sha256: hash('') }); },
    (value) => { const entry = value.after.find((item) => item.path === '.freelog/2.json'); entry.utf8 += ' '; entry.size += 1; entry.sha256 = hash(entry.utf8); },
    (value) => { const entry = value.after.find((item) => item.path === '.freelog/1.json'); const identity = JSON.parse(entry.utf8); identity.filePath = 'changed.png'; entry.utf8 = JSON.stringify(identity); entry.size = Buffer.byteLength(entry.utf8); entry.sha256 = hash(entry.utf8); },
    (value) => { value.after.find((item) => item.path === '.freelog/1.json').sha256 = 'e'.repeat(64); },
    (value) => { value.before.push(value.before[0]); },
  ]) {
    const value = fixture('PARTIAL_FAILURE'); mutate(value);
    const result = evaluateResourceSyncCase('RESOURCE.SYNC.JSON.PARTIAL_FAILURE', value);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === 'local-title-only').passed, false);
  }
});

test('all four original remote fields remain unchanged across every phase', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  for (const field of ['resourceId', 'userId', 'resourceTitle', 'status']) {
    const value = fixture('ALL_FAILURE'); value.remoteAfter[0].envelope.data[field] = field === 'status' ? 1 : 'changed';
    const result = evaluateResourceSyncCase('RESOURCE.SYNC.JSON.ALL_FAILURE', value);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === 'remote-unchanged').passed, false);
  }
});

test('failure code comes from the actual independent absence observation, never a report-supplied expectation', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  const value = fixture('PARTIAL_FAILURE');
  value.probes[0].lookup = { kind: 'response', requestedId: value.probes[0].resourceId,
    envelope: { ret: 0, errCode: 0, dataShape: 'null', data: null } };
  assert.equal(evaluateResourceSyncCase('RESOURCE.SYNC.JSON.PARTIAL_FAILURE', value).status, 'FAIL');
  changeDto(value, (dto) => { dto.results[1].error = { code: 'RESOURCE_SYNC_RESPONSE_INVALID', message: '平台详情响应不是成功信封或缺少有效对象' }; });
  assert.equal(evaluateResourceSyncCase('RESOURCE.SYNC.JSON.PARTIAL_FAILURE', value).status, 'PASS');
  value.probes[0].lookup = structuredClone(sdk[1]);
  assert.equal(evaluateResourceSyncCase('RESOURCE.SYNC.JSON.PARTIAL_FAILURE', value).status, 'FAIL');
});

test('HTTP auth/server errors and nonzero or malformed responses cannot qualify a missing-detail fixture', async () => {
  const { evaluateResourceSyncCase, resourceSyncProbeError } = await import(helper);
  const lookups = [
    ...[400, 401, 403, 429, 500, 503].map((httpStatus) => ({ kind: 'request-failed', httpStatus })),
    ...[{ ret: 1, errCode: 0, dataShape: 'null', data: null }, { ret: 0, errCode: 1, dataShape: 'null', data: null },
      { ret: 0, errCode: 0, dataShape: 'array', data: null }, { ret: 0, errCode: 0, dataShape: 'null', data: {} }]
      .map((envelope) => ({ kind: 'response', envelope })),
  ];
  for (const lookup of lookups) {
    const value = fixture('PARTIAL_FAILURE');
    value.probes[0].lookup = { ...lookup, requestedId: value.probes[0].resourceId };
    changeDto(value, (dto) => { dto.results[1].error = resourceSyncProbeError(value.probes[0].lookup); });
    const result = evaluateResourceSyncCase('RESOURCE.SYNC.JSON.PARTIAL_FAILURE', value);
    assert.equal(result.status, 'FAIL', JSON.stringify(lookup));
    assert.equal(result.assertions.find((item) => item.id === 'stale-fixture').passed, false);
  }
});

test('initial and interrupted stages keep the complete ordered set without granting unexecuted PASS', async () => {
  const { initialResourceSyncCases } = await import(helper);
  const cases = initialResourceSyncCases();
  assert.deepEqual(cases.map((item) => item.status), ['NOT_TESTED', 'NOT_TESTED', 'NOT_TESTED']);
  cases[0] = { ...cases[0], status: 'FAIL', reason: 'synthetic setup interruption' };
  assert.deepEqual(cases.map((item) => item.status), ['FAIL', 'NOT_TESTED', 'NOT_TESTED']);
});

test('SDK evidence preserves failures and data shapes, while retaining only the four declared scalar fields', async () => {
  const { resourceSyncSdkProjection, resourceSyncProbeError } = await import(helper);
  const raw = { ret: 9, errCode: 123, config: { headers: { Cookie: 'synthetic-private-cookie' } }, data: null };
  assert.deepEqual(resourceSyncSdkProjection('1'.repeat(24), raw), { kind: 'response', requestedId: '1'.repeat(24),
    envelope: { ret: 9, errCode: 123, dataShape: 'null', data: null } });
  const response = resourceSyncSdkProjection('1'.repeat(24), { ret: 0, errCode: 0,
    data: { resourceId: '1'.repeat(24), userId: 42, resourceTitle: ' title ', status: 0, token: 'synthetic-private-token' } });
  assert.deepEqual(Object.keys(response.envelope.data), ['resourceId', 'userId', 'resourceTitle', 'status']);
  assert.equal(response.envelope.data.resourceTitle, ' title ');
  assert.equal(resourceSyncProbeError(response), null);
  for (const data of [[], null, undefined, 'not an object']) {
    assert.equal(resourceSyncProbeError(resourceSyncSdkProjection('1'.repeat(24), { ret: 0, errCode: 0, data })).code, 'RESOURCE_SYNC_RESPONSE_INVALID');
  }
  assert.equal(resourceSyncProbeError({ kind: 'request-failed', httpStatus: null }), null);
});

test('the raw title is preserved and a report-supplied boolean or expected DTO cannot bless incorrect stdout', async () => {
  const { evaluateResourceSyncCase } = await import(helper);
  const value = fixture('ALL_SUCCESS');
  const title = '  线上标题原文  ';
  value.originals[0].identity.title = title;
  value.setupActions[2].argv[2] = title;
  for (const collection of [value.originalSdk, value.remoteBefore, value.remoteAfter]) collection[0].envelope.data.resourceTitle = title;
  const after = value.originals.map((item) => item.identity); value.after = snapshot(after);
  changeDto(value, (dto) => { dto.results[0].title = title; });
  assert.equal(evaluateResourceSyncCase('RESOURCE.SYNC.JSON.ALL_SUCCESS', value).status, 'PASS');
  changeDto(value, (dto) => { dto.results[0].title = title.trim(); });
  value.expected = JSON.parse(value.result.stdout); value.passed = true;
  assert.equal(evaluateResourceSyncCase('RESOURCE.SYNC.JSON.ALL_SUCCESS', value).status, 'FAIL');
});

test('actual producer missing-candidate preflight reports all stages without reading accounts or using network', (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-sync-quality-')));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-sync-quality-')); rmSync(root, { recursive: true, force: true }); });
  const output = path.join(root, 'suite.json');
  const result = spawnSync(process.execPath, [producer, '--env', 'dev'], { env: { ...process.env,
    FREELOG_TEST_CLI_BIN: path.join(root, 'missing.js'), FREELOG_TEST_SUITE_REPORT: output, FREELOG_TEST_RUN_ID: 'synthetic-sync-preflight' }, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.status, 3, result.stderr);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.deepEqual(report.cases.map((item) => item.status), ['BLOCKED', 'NOT_TESTED', 'NOT_TESTED']);
  assert.ok(report.cases.every((item) => item.evidenceRef.runId === 'synthetic-sync-preflight'));
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /login-name|password|cookie|Authorization/u);
});
