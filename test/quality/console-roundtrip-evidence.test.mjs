import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { consoleRoundtripFixture } from './fixtures/console-roundtrip.mjs';
const helper = new URL('../acceptance/console-roundtrip-evidence.mjs', import.meta.url);
const producer = new URL('../verify-console-roundtrip.mjs', import.meta.url);

test('four precise leaves keep both parent gaps and complete design/action/safety metadata', async () => {
  const { consoleRoundtripCases } = await import(helper);
  assert.equal(consoleRoundtripCases.length, 4);
  for (const leaf of consoleRoundtripCases) {
    assert.equal(leaf.script, 'verify-console-roundtrip.mjs');
    assert.equal(leaf.parentRule, leaf.direction === 'forward' ? 'INTEROP.CLI_TO_CONSOLE' : 'INTEROP.CONSOLE_TO_CLI');
    assert.ok(leaf.assertionIds.length >= 5 && leaf.action.length && leaf.preconditions.length && leaf.forbiddenSideEffects.length);
    for (const reference of leaf.designRefs) assert.ok(reference.section && existsSync(new URL(`../../${reference.path}`, import.meta.url)));
  }
});

test('legal synthetic two-type/two-direction observations have source-recomputed exact non-boolean assertions', async () => {
  const { evaluateConsoleRoundtripCase, consoleRoundtripCases } = await import(helper);
  for (const leaf of consoleRoundtripCases) {
    const observed = await consoleRoundtripFixture(leaf.resourceKind);
    const result = evaluateConsoleRoundtripCase(leaf.id, observed);
    assert.equal(result.status, 'PASS', result.reason);
    for (const item of result.assertions) { assert.equal(item.passed, true, item.id); assert.notEqual(typeof item.expected, 'boolean'); assert.deepEqual(item.actual, item.expected); }
  }
});

test('cross-run, cross-bin, resource substitution and failed lifecycle prerequisite are rejected at their guard', async () => {
  const { evaluateConsoleRoundtripCase } = await import(helper);
  for (const [change, guard] of [
    [(o) => { o.runId = 'previous-run'; }, 'lifecycle-prerequisite'],
    [(o) => { o.cliBin = '/another/bin.js'; }, 'lifecycle-prerequisite'],
    [(o) => { o.binSha256 = '0'.repeat(64); }, 'lifecycle-prerequisite'],
    [(o) => { o.resourceId = 'c'.repeat(24); }, 'lifecycle-prerequisite'],
    [(o) => { o.prerequisite.suiteCase.status = 'FAIL'; }, 'lifecycle-prerequisite'],
    [(o) => { o.prerequisite.rawSha256 = '0'.repeat(64); }, 'lifecycle-prerequisite'],
    [(o) => { o.prerequisite.rawFile = path.resolve('outside-evidence.json'); }, 'lifecycle-prerequisite'],
    [(o) => { o.prerequisite.rawText = o.prerequisite.rawText.replace('作者说明', '错误说明'); }, 'lifecycle-prerequisite'],
  ]) {
    const input = await consoleRoundtripFixture(); change(input);
    const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', input);
    assert.equal(result.status, 'FAIL', guard); assert.equal(result.assertions.find((a) => a.id === guard).passed, false, guard);
  }
});

test('missing/stale/mismatched browser observations, bad URL and booleans cannot replace raw fields', async () => {
  const { evaluateConsoleRoundtripCase } = await import(helper);
  for (const [change, guard] of [
    [(o) => { o.browser.pop(); }, 'browser-binding'],
    [(o) => { o.browser[0].capture.runId = 'old'; }, 'browser-binding'],
    [(o) => { o.browser[0].capture.nonce = '0'.repeat(32); }, 'browser-binding'],
    [(o) => { o.browser[0].capture.actualUrl = 'https://user.devfreelog.com/login'; }, 'browser-binding'],
    [(o) => { o.browser[0].capture.frames[0].axAfter = o.browser[0].capture.frames[0].axAfter.replaceAll('1.0.0', '1.1.0'); }, 'browser-binding'],
    [(o) => { o.browser[0].capture.finishedAt = '2020-01-01T00:00:00.000Z'; }, 'browser-binding'],
    [(o) => { o.browser[0].capture.frames[0].axAfter = ''; }, 'browser-binding'],
    [(o) => { o.browser[0].capture.visible = { passed: true }; }, 'browser-fields'],
    [(o) => { o.browser[0].capture.readings = []; }, 'browser-fields'],
    [(o) => { o.browser[0].capture.readings = [null]; }, 'browser-fields'],
    [(o) => { o.browser.reverse(); }, 'browser-binding'],
    [(o) => { o.browser[0].capture.readings = [{ field: 'descriptionText', value: '', source: 'private-store' }]; }, 'browser-fields'],
    [(o) => { o.browser[0].capture.readings = [{ field: 'descriptionText', value: 'wrong', source: 'contenteditable' }]; }, 'browser-fields'],
    [(o) => { o.browser[0].capture.frames.find((f) => f.kind === 'text-option').inputs.pop(); }, 'browser-fields'],
    [(o) => { const inputs = o.browser[1].capture.frames.find((f) => f.kind === 'select-option').inputs; [inputs[3].value, inputs[4].value] = [inputs[4].value, inputs[3].value]; }, 'browser-fields'],
  ]) {
    const input = await consoleRoundtripFixture(); change(input);
    const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', input);
    assert.equal(result.status, 'FAIL', guard); assert.equal(result.assertions.find((a) => a.id === guard).passed, false, guard);
  }
});

test('handwritten schema1 values and legal-but-wrong source labels cannot supply browser provenance', async () => {
  const { evaluateConsoleRoundtripCase, consoleVisibleProjection, consoleVisibleReadings } = await import(helper);
  for (const source of ['input', 'contenteditable']) {
    const observed = await consoleRoundtripFixture();
    const entry = observed.browser[1];
    const visible = consoleVisibleProjection(observed.sdkStages[1].after.data, observed.dependencyIdentity);
    entry.capture = { ...Object.fromEntries(['runId', 'nonce', 'cliBin', 'binSha256', 'resourceId', 'resourceKind', 'version', 'stage'].map((key) => [key, entry.request[key]])),
      schemaVersion: 1, status: 'OBSERVED', observedAt: new Date(Date.parse(entry.request.requestedAt) + 1234).toISOString(),
      actualUrl: entry.request.url, axSnapshot: 'A nonempty handwritten page string.', visible,
      readings: consoleVisibleReadings(visible).map((reading) => ({ ...reading, source, selector: 'invented nonempty locator' })) };
    const checked = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', observed);
    assert.equal(checked.status, 'FAIL', 'correct values cannot rescue the legacy hand-assembled capture');
    assert.equal(checked.assertions.find((item) => item.id === 'browser-binding').passed, false);
  }
});

test('web save must change only exact description and text default/remark while full SDK business data survives', async () => {
  const { evaluateConsoleRoundtripCase } = await import(helper);
  for (const change of [
    (o) => { o.sdkStages[2].after.data.description = 'theme 网页描述'; },
    (o) => { o.sdkStages[2].after.data.systemAdditional.pop(); },
    (o) => { o.sdkStages[3].after.data.customPropertyDescriptors[0].remark = 'lost'; },
    (o) => { o.sdkStages[3].after.data.dependencies = []; },
    (o) => { o.sdkStages[3].after.data.versionProperty.qathemeText = 'old'; },
    (o) => { o.sdkStages[3].after.data.fileSha1 = '0'.repeat(40); },
    (o) => { o.sdkStages[3].before = o.sdkStages[3].after; },
    (o) => { o.sdkStages[2].after.ret = 1; },
  ]) {
    const input = await consoleRoundtripFixture(); change(input);
    const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', input);
    assert.equal(result.status, 'FAIL'); assert.equal(result.assertions.find((a) => a.id === 'sdk-stage-invariants').passed, false);
  }
});

test('owner identity must match the current account and same-run source before a browser write', async () => {
  const { evaluateConsoleRoundtripCase } = await import(helper);
  for (const change of [
    (o) => { o.ownerIdentity.resource.data.userId += 1; },
    (o) => { o.ownerIdentity.currentUser.data.username = 'other-user'; },
    (o) => { o.ownerIdentity.currentUser.data.userId = o.ownerIdentity.resource.data.userId = '<positive-user-id>'; },
    (o) => { o.ownerIdentity.resource.errCode = 1; },
    (o) => { o.ownerIdentity.resource.data.resourceId = 'c'.repeat(24); },
  ]) {
    const input = await consoleRoundtripFixture(); change(input);
    const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', input);
    assert.equal(result.status, 'FAIL'); assert.equal(result.assertions.find((a) => a.id === 'owner-identity').passed, false);
  }
});

test('owner projection reads the real current-user username DTO, without a userName alias fallback', async () => {
  const { projectConsoleOwner } = await import(helper);
  const current = { ret: 0, errCode: 0, data: { userId: 50427, username: 'freelog-test11', privateIgnored: 'not part of the proof' } };
  const resource = { ret: 0, errCode: 0, data: { resourceId: 'a'.repeat(24), resourceName: 'freelog-test11/isolated', userId: 50427 } };
  assert.deepEqual(projectConsoleOwner(current, resource), {
    currentUser: { ret: 0, errCode: 0, data: { userId: 50427, username: 'freelog-test11' } },
    resource: { ret: 0, errCode: 0, data: { resourceId: 'a'.repeat(24), resourceName: 'freelog-test11/isolated', userId: 50427 } },
  });
  assert.equal(projectConsoleOwner({ ret: 0, errCode: 0, data: { userId: 50427, userName: 'must-not-be-used' } }, resource).currentUser.data.username, null);
});

test('raw owner metadata cannot override the source-computed positive numeric owner qualification', async () => {
  const { evaluateConsoleRoundtripCase, consoleRoundtripCases } = await import(helper);
  for (const leaf of consoleRoundtripCases) {
    const observed = await consoleRoundtripFixture(leaf.resourceKind);
    observed.ownerIdentity.currentUser.data.userId = '<positive-user-id>';
    observed.ownerIdentity.resource.data.userId = '<positive-user-id>';
    observed.ownerIdentity.idShape = 'positive-safe-integer';
    const checked = evaluateConsoleRoundtripCase(leaf.id, observed);
    assert.equal(checked.assertions.find((a) => a.id === 'owner-identity').passed, false, leaf.id);
    assert.equal(checked.status, 'FAIL', leaf.id);
  }
});

test('failed owner projection cannot carry nested HTTP diagnostics into its raw evidence file', async (t) => {
  const { projectConsoleOwner } = await import(helper);
  const { writeSuiteCases } = await import('../acceptance/protocol.mjs');
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-console-owner-safety-')));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-console-owner-safety-')); rmSync(root, { recursive: true, force: true }); });
  const marker = 'SYNTHETIC_OWNER_PRIVATE_DIAGNOSTIC';
  const nested = { config: { headers: { Authorization: marker } } };
  const owner = projectConsoleOwner({ ret: nested, errCode: nested, data: { userId: nested, username: nested } },
    { ret: nested, errCode: nested, data: { resourceId: nested, resourceName: nested, userId: nested } });
  const file = path.join(root, 'owner-raw.json');
  writeSuiteCases([{ id: 'INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', status: 'FAIL', assertions: [], reason: 'Synthetic malformed owner rejected.', observations: { ownerIdentity: owner } }], file);
  assert.doesNotMatch(readFileSync(file, 'utf8'), new RegExp(marker));
  assert.ok(JSON.stringify(owner).includes('invalidType'));
});

test('the producer owner projection preserves the actual username shape before its owner assertion', async () => {
  const { projectConsoleOwner } = await import(helper);
  const source = readFileSync(producer, 'utf8');
  for (const eol of ['\n', '\r\n']) {
    const checkout = source.replace(/\r?\n/gu, eol);
    const assignment = checkout.match(/observed\.ownerIdentity = [\s\S]+?;\r?\n/u)?.[0];
    assert.ok(assignment, 'execute the real producer projection assignment');
    const current = { ret: 0, errCode: 0, data: { userId: 50427, username: 'freelog-test11' } };
    const resource = { ret: 0, errCode: 0, data: { resourceId: 'a'.repeat(24), resourceName: 'freelog-test11/isolated', userId: 50427 } };
    const observed = {};
    new Function('observed', 'current', 'resource', 'projectConsoleOwner', assignment)(observed, current, resource, projectConsoleOwner);
    assert.deepEqual(observed.ownerIdentity.currentUser.data, { userId: 50427, username: 'freelog-test11' });
  }
});

test('reverse exact commands, original stdout, pull/draft/finalization and inherited data are independently checked', async () => {
  const { evaluateConsoleRoundtripCase } = await import(helper);
  for (const [change, guard] of [
    [(o) => { o.reverse.actions.reverse(); }, 'reverse-commands'],
    [(o) => { o.reverse.actions[1].argv = ['--help']; }, 'reverse-commands'],
    [(o) => { o.reverse.actions[1].result.status = 1; }, 'reverse-commands'],
    [(o) => { o.reverse.actions[1].result.timedOut = true; }, 'reverse-commands'],
    [(o) => { o.reverse.actions.at(-1).result.stdout = '{}'; }, 'raw-cli-readback'],
    [(o) => { o.reverse.pulledDraft.inputAttrs = []; }, 'pull-inheritance'],
    [(o) => { o.reverse.beforeSubmitDraft.customPropertyDescriptors[1].defaultValue = 'lost browser text'; }, 'edited-draft'],
    [(o) => { o.reverse.sdkReadback.data.customPropertyDescriptors[0].defaultValue = 'old'; }, 'published-version'],
    [(o) => { o.reverse.oldVersionAfter.data.description = 'mutated old'; }, 'old-versions-unchanged'],
    [(o) => { o.reverse.finalization.pending = 'present'; }, 'local-finalization'],
  ]) {
    const input = await consoleRoundtripFixture(); change(input);
    const result = evaluateConsoleRoundtripCase('INTEROP.CONSOLE_TO_CLI.THEME_PUBLISHED', input);
    assert.equal(result.status, 'FAIL', guard); assert.equal(result.assertions.find((a) => a.id === guard).passed, false, guard);
  }
});

test('actual preflight reports all four BLOCKED without credentials, network, build or GUI when no installed prerequisite exists', (t) => {
  const work = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-console-quality-')));
  t.after(() => { assert.equal(path.dirname(work), realpathSync(tmpdir())); assert.ok(path.basename(work).startsWith('freelog-console-quality-')); rmSync(work, { recursive: true }); });
  const output = path.join(work, 'cases.json');
  const result = spawnSync(process.execPath, [producer.pathname.replace(/^\/(\w:)/u, '$1'), '--env', 'dev'], { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, FREELOG_TEST_RUN_ID: 'synthetic-preflight', FREELOG_TEST_SUITE_REPORT: output, FREELOG_TEST_CLI_BIN: path.join(work, 'missing.js') } });
  assert.equal(result.status, 3, result.stderr);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(report.cases.length, 4); assert.ok(report.cases.every((item) => item.status === 'BLOCKED'));
  assert.doesNotMatch(result.stdout + result.stderr, /login|password|pnpm|request\.json/iu);
});

test('browser dependency evidence contains displayed title/owner, not a hidden API identifier', async () => {
  const { consoleVisibleProjection } = await import(helper);
  const input = await consoleRoundtripFixture();
  const projection = consoleVisibleProjection(input.sdkStages[0].before.data, input.dependencyIdentity);
  assert.deepEqual(projection.dependencies, [{ title: '合成依赖标题', owner: 'freelog-synthetic', versionRange: '^1.0.0' }]);
  assert.ok(!Object.hasOwn(projection.dependencies[0], 'resourceId'));
  assert.ok(!Object.hasOwn(projection.dependencies[0], 'resourceName'));
  assert.ok(!Object.hasOwn(projection.customPropertyDescriptors[1], 'candidateItems'));
  assert.equal(projection.customPropertyDescriptors[1].type, '文本输入框');
});

test('a browser request cannot outlive the source-fixed whole-run budget', async () => {
  const { consoleCaptureRequest } = await import(helper);
  const request = consoleCaptureRequest({ runId: 'test', stage: 'view-first', requestedAt: '2026-10-17T04:19:50.000Z',
    deadlineAt: '2026-10-17T04:20:00.000Z' });
  assert.equal(request.expiresAt, '2026-10-17T04:20:00.000Z');
});

test('total budget caps browser/CLI/SDK waits and refuses a successor action once expired', async () => {
  const { createConsoleRoundtripBudget } = await import(producer);
  let now = Date.parse('2026-10-17T04:00:00.000Z');
  const budget = createConsoleRoundtripBudget({ now: () => now });
  assert.equal(budget.deadlineAt, '2026-10-17T04:20:00.000Z');
  assert.equal(budget.timeout(60_000), 60_000);
  now += 20 * 60_000 - 10;
  assert.equal(budget.timeout(300_000), 10);
  now += 10;
  assert.throws(() => budget.timeout(60_000), /budget/u);
});

test('the actual producer records a failed SDK baseline before rejecting the successor browser action', async () => {
  const source = readFileSync(producer, 'utf8');
  const beforeRequest = source.match(/const expectedBefore = expectedConsoleStageVersion[\s\S]+?(?=const request = consoleCaptureRequest)/u)?.[0];
  assert.ok(beforeRequest, 'exercise the real producer baseline branch');
  const input = await consoleRoundtripFixture();
  const setup = { source: JSON.parse(input.prerequisite.rawText).observations };
  const observed = { resourceId: input.resourceId, sdkStages: [] };
  const actual = { ret: 0, errCode: 1, data: null };
  const { expectedConsoleStageVersion } = await import(helper);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const execute = new AsyncFunction('observed', 'setup', 'sdkVersion', 'expectedConsoleStageVersion', 'isDeepStrictEqual', 'assert',
    `const kind='theme', index=0, stage='view-first'; ${beforeRequest}`);
  const compare = (await import('node:util')).isDeepStrictEqual;
  await assert.rejects(execute(observed, setup, async () => actual, expectedConsoleStageVersion, compare,
    (condition, message) => { if (!condition) throw new Error(message); }), /baseline differs/u);
  assert.deepEqual(observed.sdkStages, [{ stage: 'view-first', before: actual }]);
});

test('SDK reads also bound the actual Axios transport, not only the surrounding await', async () => {
  const { createConsoleRoundtripBudget, consoleSdkRead } = await import(producer);
  let now = Date.parse('2026-10-17T04:00:00.000Z');
  const budget = createConsoleRoundtripBudget({ now: () => now });
  now += 1_200_000 - 100;
  const sdk = { FUtil: { Axios: { defaults: { timeout: 0 } } } };
  const result = await consoleSdkRead(budget, sdk, () => {
    assert.equal(sdk.FUtil.Axios.defaults.timeout, 100);
    return 'actual request factory saw the bounded transport';
  });
  assert.equal(result, 'actual request factory saw the bounded transport');
  now += 100;
  let requests = 0;
  await assert.rejects(consoleSdkRead(budget, sdk, () => { requests += 1; }), /budget/u);
  assert.equal(requests, 0);
});
