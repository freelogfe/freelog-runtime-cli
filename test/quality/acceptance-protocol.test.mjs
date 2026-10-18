import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { acceptanceCatalog, manifestSha256 } from '../acceptance/catalog.mjs';
import { matchesCommandResult, processResult, validateAcceptanceReport, validateCandidateReport, validateSuiteCases } from '../acceptance/protocol.mjs';

const now = Date.parse('2026-10-15T08:00:00.000Z');
const candidateDir = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'freelog-acceptance-quality-')));
const runId = 'quality-run';
const evidenceDir = path.join(candidateDir, 'evidence', runId);
mkdirSync(evidenceDir, { recursive: true });
after(() => rmSync(candidateDir, { recursive: true, force: true }));
const binding = { sourceFingerprint: 'source-1', tarballSha512: 'package-1', cliBin: 'D:/isolated/dist/bin/index.js', candidateDir, now,
  purpose: 'release', sourceRevision: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), clean: true } };
function passingReport() {
  return {
    schemaVersion: 2, environment: 'dev', releaseEvidence: true, runId, evidenceDir,
    ...Object.fromEntries(Object.entries(binding).filter(([key]) => !['now', 'candidateDir'].includes(key))),
    manifestSha256: manifestSha256(),
    startedAt: new Date(now - 120_000).toISOString(), finishedAt: new Date(now - 60_000).toISOString(),
    cases: acceptanceCatalog.map(({ id, kind, assertionIds, gap, parentRule }) => {
      if (gap) return { id, status: 'NOT_TESTED', assertions: [], reason: gap };
      if (parentRule) return { id, status: 'NOT_TESTED', assertions: [], reason: 'This generic protocol fixture supplies no leaf execution observations.' };
      const result = { id, status: 'PASS', assertions: assertionIds.map((assertionId) => ({ id: assertionId, passed: true, expected: true, actual: true })),
        ...(kind === 'legacy-suite' ? { process: { exitCode: 0, signal: null, error: null, timedOut: false } } : {}) };
      if (id === 'POLICY.COLLECTION.SELECTED_TEMPLATES') {
        result.templateResults = [{ templateId: 'first', status: 'PASS', exitCode: 0 }, { templateId: 'second', status: 'PASS', exitCode: 0 }];
        result.assertions[0].expected = 2; result.assertions[0].actual = 2;
      }
      if (id === 'POLICY.TTY.REAL_PAGINATION') result.observations = { catalogCount: 21, completedSteps: 4, expectedSteps: 4,
        matchedPrompts: ['授权策略模板（第 1/', '授权策略模板（第 2/', '授权策略模板（第 1/', '编辑授权策略模板'] };
      if (kind === 'product-case') {
        const file = path.join(evidenceDir, `${id}.json`);
        const bytes = JSON.stringify({ schemaVersion: 1, runId, caseId: id, assertions: result.assertions,
          ...(result.templateResults ? { templateResults: result.templateResults } : {}),
          ...(result.observations ? { observations: result.observations } : {}) });
        writeFileSync(file, bytes);
        result.evidenceRef = { path: file, runId, sha256: createHash('sha256').update(bytes).digest('hex') };
      }
      return result;
    }),
  };
}

function protocolSource() {
  const file = new URL('../acceptance/protocol.mjs', import.meta.url);
  return readFileSync(file, 'utf8').replace(/from '(\.[^']+)'/gu,
    (_match, relative) => `from ${JSON.stringify(new URL(relative, file).href)}`);
}

async function protocolForTest() {
  return import(`data:text/javascript;base64,${Buffer.from(`${protocolSource()}\nexport { validateCaseShape, validateProductTrace };`).toString('base64')}`);
}

test('catalog has unique IDs and explicitly preserves uncovered product obligations', () => {
  assert.equal(new Set(acceptanceCatalog.map((item) => item.id)).size, acceptanceCatalog.length);
  for (const id of ['COMMAND.PARAMETER_CONTRACT', 'VERSION.UPDATE_MATRIX', 'RESOURCE.MANAGEMENT_MATRIX', 'INTEROP.CLI_TO_CONSOLE', 'INTEROP.CONSOLE_TO_CLI', 'POLICY.TTY.REAL_PAGINATION']) {
    assert.ok(acceptanceCatalog.some((item) => item.id === id && item.required));
  }
});

test('process completion is not inferred from PASS text or a nonzero comparison', () => {
  assert.equal(processResult({ status: 0, signal: null }).status, 'PASS');
  assert.equal(processResult({ status: 1, stdout: 'PASS' }).status, 'FAIL');
  assert.equal(processResult({ status: 0, stdout: '跳过' }).status, 'PASS');
  assert.equal(processResult({ status: 3 }).status, 'BLOCKED');
  for (const result of [{ status: null }, { status: 0, signal: 'SIGTERM' }, { status: 0, error: new Error('spawn failed') }, { status: 0, timedOut: true }]) {
    assert.equal(processResult(result).status, 'FAIL');
  }
});

test('matching rejection text does not turn null status, timeout or signal into a business rejection', () => {
  assert.equal(matchesCommandResult({ status: 1, stderr: 'expected rejection' }, 'expected rejection'), true);
  for (const result of [{ status: null }, { status: 1, signal: 'SIGTERM' }, { status: 1, error: new Error('spawn failed') }, { status: 1, timedOut: true }]) {
    assert.equal(matchesCommandResult(result, 'expected rejection', 'expected rejection PASS'), false);
    assert.equal(matchesCommandResult(result, undefined, 'PASS'), false);
  }
});

test('well-formed report retains actual current required gaps as release blockers', () => {
  assert.throws(() => validateAcceptanceReport(passingReport(), binding), /Required acceptance cases are not PASS/u);
});

test('unimplemented obligations cannot be forged green by filling assertion booleans', () => {
  const report = passingReport();
  const item = report.cases.find((result) => result.id === 'COMMAND.PARAMETER_CONTRACT');
  item.status = 'PASS';
  item.assertions = acceptanceCatalog.find((result) => result.id === item.id).assertionIds.map((id) => ({ id, passed: true, expected: true, actual: true }));
  assert.throws(() => validateAcceptanceReport(report, binding), /Unimplemented acceptance obligation/u);
});

test('removing a gap cannot weaken any required business case into a boolean-only PASS', async (t) => {
  // Expose the actual private validator in memory, without editing the approved catalog
  // or letting an unrelated outstanding gap make this precise negative test pass.
  const { validateCaseShape } = await protocolForTest();
  for (const descriptor of acceptanceCatalog.filter((item) => item.gap)) {
    await t.test(descriptor.id, () => {
      const migrated = { ...descriptor, script: 'verify-theme-image-full-lifecycle.mjs' };
      delete migrated.gap;
      const result = { id: descriptor.id, status: 'PASS',
        assertions: descriptor.assertionIds.map((id) => ({ id, passed: true })) };
      assert.throws(() => validateCaseShape(result, migrated),
        new RegExp(`Product PASS lacks exact expected/actual evidence: ${descriptor.id.replaceAll('.', '\\.')}`, 'u'));
    });
  }
});

test('removing a gap and matching raw assertions still cannot PASS without a registered semantic validator', async () => {
  const { validateCaseShape, validateProductTrace } = await protocolForTest();
  for (const descriptor of acceptanceCatalog.filter((item) => item.gap)) {
    const migrated = { ...descriptor, script: 'verify-theme-image-full-lifecycle.mjs' };
    delete migrated.gap;
    const result = { id: descriptor.id, status: 'PASS', assertions: descriptor.assertionIds.map((id) => ({
      id, passed: true, expected: { count: 0, text: '', values: [false] }, actual: { count: 0, text: '', values: [false] },
    })) };
    assert.doesNotThrow(() => validateCaseShape(result, migrated));
    assert.throws(() => validateProductTrace(result, { runId, evidenceDir }), /Missing run-bound product evidence/u);
    const file = path.join(evidenceDir, `${descriptor.id}.json`);
    const bytes = JSON.stringify({ schemaVersion: 1, runId, caseId: result.id, assertions: result.assertions });
    writeFileSync(file, bytes);
    result.evidenceRef = { path: file, runId, sha256: createHash('sha256').update(bytes).digest('hex') };
    assert.throws(() => validateProductTrace(result, { runId, evidenceDir }),
      new RegExp(`PRODUCT_VALIDATOR_UNREGISTERED: ${descriptor.id.replaceAll('.', '\\.')}`, 'u'));
    result.evidenceRef.runId = 'other-run';
    assert.throws(() => validateProductTrace(result, { runId, evidenceDir }), /Missing run-bound product evidence/u);
  }
});

test('a business producer must report its complete case set exactly once', () => {
  const catalog = ['FIRST', 'SECOND'].map((id) => ({ id: `SYNTHETIC.${id}`, kind: 'product-case', required: true,
    title: 'Synthetic producer contract, never release evidence', assertionIds: ['exact-readback'], script: 'verify-commands.mjs' }));
  const first = { id: 'SYNTHETIC.FIRST', status: 'PASS', assertions: [{ id: 'exact-readback', passed: true, expected: 0, actual: 0 }] };
  const second = { ...first, id: 'SYNTHETIC.SECOND' };
  const report = { schemaVersion: 1, cases: [first, second] };
  assert.deepEqual(validateSuiteCases(report, 'verify-commands.mjs', catalog), [first, second]);
  assert.throws(() => validateSuiteCases({ ...report, cases: [first] }, 'verify-commands.mjs', catalog),
    /Missing cases from verify-commands\.mjs: SYNTHETIC.SECOND/u);
  assert.throws(() => validateSuiteCases({ ...report, cases: [first, first] }, 'verify-commands.mjs', catalog), /Unknown\/duplicate case/u);
  assert.throws(() => validateSuiteCases({ ...report, cases: [first, { ...second, id: 'UNKNOWN' }] }, 'verify-commands.mjs', catalog), /Unknown\/duplicate case/u);
  assert.throws(() => validateSuiteCases(report, 'unknown.mjs', catalog), /Unknown business acceptance producer/u);
});

test('missing, duplicate, unknown cases and empty suites hit their own checks, not unrelated gaps', () => {
  for (const [mutate, message] of [
    [(report) => { report.cases = report.cases.filter((item) => item.id !== 'POLICY.TTY.REAL_PAGINATION'); }, /Missing acceptance cases: POLICY\.TTY\.REAL_PAGINATION/u],
    [(report) => report.cases.push(report.cases[0]), /Unknown\/duplicate acceptance case: LEGACY\.run-all-scenarios/u],
    [(report) => report.cases.push({ id: 'UNKNOWN', status: 'PASS', assertions: [{ id: 'a', passed: true }] }), /Unknown\/duplicate acceptance case: UNKNOWN/u],
    [(report) => { report.cases = []; }, /Acceptance case list is empty or missing/u],
  ]) {
    const report = passingReport(); mutate(report);
    assert.throws(() => validateAcceptanceReport(report, binding), message);
  }
});

test('a PASS without substantive successful assertions hits assertion validation', () => {
  for (const [assertions, message] of [
    [[], /PASS lacks successful required assertions: LEGACY\.run-all-scenarios/u],
    [[{ id: 'process-completed', passed: false }], /PASS lacks successful required assertions: LEGACY\.run-all-scenarios/u],
    [[{ id: 'process-completed', passed: 'true' }], /Malformed\/duplicate assertion: LEGACY\.run-all-scenarios/u],
    [[{ passed: true }], /Malformed\/duplicate assertion: LEGACY\.run-all-scenarios/u],
    [[{ id: 'unknown', passed: true }], /Malformed\/duplicate assertion: LEGACY\.run-all-scenarios/u],
    [[{ id: 'process-completed', passed: true }, { id: 'process-completed', passed: true }], /Malformed\/duplicate assertion: LEGACY\.run-all-scenarios/u],
  ]) {
    const report = passingReport(); report.cases[0].assertions = assertions;
    assert.throws(() => validateAcceptanceReport(report, binding), message);
  }
});

test('required FAIL, BLOCKED and NOT_TESTED remain release blockers', () => {
  for (const status of ['FAIL', 'BLOCKED', 'NOT_TESTED', 'SKIP']) {
    const report = passingReport();
    const item = report.cases.find((entry) => entry.id === 'POLICY.TTY.REAL_PAGINATION');
    item.status = status;
    item.reason = 'Explicit coverage gap';
    const message = status === 'SKIP' ? /Invalid case status: POLICY\.TTY\.REAL_PAGINATION/u
      : new RegExp(`Required acceptance cases are not PASS:.*POLICY\\.TTY\\.REAL_PAGINATION=${status}`, 'u');
    assert.throws(() => validateAcceptanceReport(report, binding), message);
  }
});

test('wrong package, source, bin, manifest, environment or development evidence cannot release', () => {
  for (const [key, value] of Object.entries({ sourceFingerprint: 'other', tarballSha512: 'other', cliBin: 'other', purpose: 'development',
    sourceRevision: { ...binding.sourceRevision, commit: 'c'.repeat(40) },
    manifestSha256: 'self-declared', environment: 'prod', releaseEvidence: false, schemaVersion: 1 })) {
    const report = passingReport(); report[key] = value;
    const message = ['sourceFingerprint', 'tarballSha512', 'cliBin', 'purpose', 'sourceRevision'].includes(key) ? new RegExp(`Acceptance candidate binding mismatch: ${key}`, 'u')
      : key === 'manifestSha256' ? /Acceptance manifest changed or is not the locally approved catalog/u
        : /Acceptance must be a schemaVersion 2 real-dev candidate report/u;
    assert.throws(() => validateAcceptanceReport(report, binding), message);
  }
});

test('invalid, future, reversed and stale report timestamps cannot release', () => {
  for (const mutate of [
    (report) => { report.startedAt = 'bad'; },
    (report) => { report.finishedAt = new Date(now + 1000).toISOString(); },
    (report) => { report.startedAt = new Date(now).toISOString(); },
    (report) => { report.startedAt = new Date(now - 86_400_001).toISOString(); },
  ]) {
    const report = passingReport(); mutate(report);
    assert.throws(() => validateAcceptanceReport(report, binding), /Acceptance evidence has invalid, future, reversed or stale timestamps/u);
  }
});

test('PASS cannot conceal a failed, killed, timed-out, or malformed child process', () => {
  for (const process of [{ exitCode: 1 }, { exitCode: null }, { signal: 'SIGTERM' }, { error: 'failed' }, { timedOut: true }]) {
    const report = passingReport(); report.cases[0].process = { exitCode: 0, signal: null, error: null, timedOut: false, ...process };
    assert.throws(() => validateAcceptanceReport(report, binding), /PASS conceals a failed child process: LEGACY\.run-all-scenarios/u);
  }
  const malformed = passingReport(); malformed.cases[0].process = { exitCode: 0 };
  assert.throws(() => validateAcceptanceReport(malformed, binding), /Malformed child process evidence: LEGACY\.run-all-scenarios/u);
});

test('reports do not grant themselves a custom manifest or validity period', () => {
  assert.throws(() => validateCandidateReport(passingReport(), {}), /Expected candidate binding must come from independent candidate verification/u);
  const report = passingReport(); report.maxAgeMs = Number.MAX_SAFE_INTEGER;
  report.startedAt = new Date(now - 2 * 86_400_000).toISOString();
  assert.throws(() => validateAcceptanceReport(report, binding), /Acceptance evidence has invalid, future, reversed or stale timestamps/u);
});

test('development evidence preserves exact binding but cannot become publication approval', () => {
  const expected = { ...binding, purpose: 'development', sourceRevision: { ...binding.sourceRevision, clean: false } };
  const report = { ...passingReport(), purpose: expected.purpose, sourceRevision: expected.sourceRevision, releaseEvidence: false };
  assert.throws(() => validateAcceptanceReport(report, expected), /development candidate cannot authorize publication/u);
  assert.throws(() => validateCandidateReport(report, expected), /Required acceptance cases are not PASS/u);
  report.releaseEvidence = true;
  assert.throws(() => validateCandidateReport(report, expected), /actual candidate purpose/u);
  assert.throws(() => validateCandidateReport(passingReport(), { ...binding, sourceRevision: { ...binding.sourceRevision, clean: false } }),
    /Expected candidate binding must come from independent candidate verification/u);
});

test('product case evidence must exist, match bytes, assertions and this candidate run', () => {
  for (const [mutate, message] of [
    [(item) => { delete item.evidenceRef; }, /Missing run-bound product evidence: POLICY\.COLLECTION\.SELECTED_TEMPLATES/u],
    [(item) => { item.evidenceRef.runId = 'other-run'; }, /Missing run-bound product evidence: POLICY\.COLLECTION\.SELECTED_TEMPLATES/u],
    [(item) => { item.evidenceRef.path = path.join(evidenceDir, 'missing.json'); }, /Unsafe\/missing product evidence file: POLICY\.COLLECTION\.SELECTED_TEMPLATES/u],
    [(item) => { item.evidenceRef.sha256 = '0'.repeat(64); }, /Product evidence changed: POLICY\.COLLECTION\.SELECTED_TEMPLATES/u],
    [(item) => { item.assertions[0].actual = false; }, /Product PASS lacks exact expected\/actual evidence: POLICY\.COLLECTION\.SELECTED_TEMPLATES/u],
    [(item) => { delete item.assertions[0].actual; }, /Product PASS lacks exact expected\/actual evidence: POLICY\.COLLECTION\.SELECTED_TEMPLATES/u],
  ]) {
    const report = passingReport();
    mutate(report.cases.find((item) => item.id === 'POLICY.COLLECTION.SELECTED_TEMPLATES'));
    assert.throws(() => validateAcceptanceReport(report, binding), message);
  }
});

test('individual failed template and missing real pagination observations cannot be hidden by summary assertions', () => {
  for (const id of ['POLICY.COLLECTION.SELECTED_TEMPLATES', 'POLICY.TTY.REAL_PAGINATION']) {
    const report = passingReport();
    const item = report.cases.find((entry) => entry.id === id);
    if (item.templateResults) item.templateResults[0].status = 'FAIL';
    if (item.observations) item.observations.catalogCount = 20;
    const bytes = JSON.stringify({ schemaVersion: 1, runId, caseId: id, assertions: item.assertions,
      ...(item.templateResults ? { templateResults: item.templateResults } : {}),
      ...(item.observations ? { observations: item.observations } : {}) });
    writeFileSync(item.evidenceRef.path, bytes);
    item.evidenceRef.sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.throws(() => validateAcceptanceReport(report, binding), /Selected-template failures|Real TTY pagination/u);
  }
});

test('binding/time negative assertions go red when their target validation is deleted in memory', async () => {
  const original = protocolSource();
  const mutations = [
    {
      remove: /    if \(report\[key\] !== expectedBinding\[key\]\) throw new Error\([^\n]+\);/u,
      mutate(report) { report.sourceFingerprint = 'wrong-source'; },
      expected: /Acceptance candidate binding mismatch: sourceFingerprint/u,
    },
    {
      remove: /  if \(!text\(report\.startedAt\)[\s\S]*?throw new Error\('Acceptance evidence has invalid, future, reversed or stale timestamps\.'\);\n  \}/u,
      mutate(report) { report.startedAt = 'bad'; },
      expected: /Acceptance evidence has invalid, future, reversed or stale timestamps/u,
    },
  ];
  for (const mutation of mutations) {
    const source = original.replace(mutation.remove, '');
    assert.notEqual(source, original, 'Mutation must actually delete the target guard');
    const changed = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const report = passingReport(); mutation.mutate(report);
    assert.throws(() => assert.throws(() => changed.validateAcceptanceReport(report, binding), mutation.expected),
      { code: 'ERR_ASSERTION' }, 'The precise negative assertion must fail after deleting its guard, despite remaining catalog gaps');
  }
});
