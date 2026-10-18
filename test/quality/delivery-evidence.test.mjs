import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateDeliveryReport, readDeliveryEvidence } from '../../scripts/release/delivery.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { sha256, seedDeliveryDesigns, writeDeliveryFixture, writeJson } from './fixtures/delivery.mjs';

function fixture(t) {
  const temporary = mkdtempSync(path.join(tmpdir(), 'freelog-delivery-'));
  t.after(() => { assert.equal(path.dirname(temporary), tmpdir()); rmSync(temporary, { recursive: true, force: true }); });
  const root = realpathSync(temporary);
  seedDeliveryDesigns(root);
  const now = Date.now();
  const verified = { candidateFile: path.join(root, '.artifacts/release/fixture/candidate.json'),
    candidate: { purpose: 'release', sourceRevision: { commit: 'c'.repeat(40), tree: 'd'.repeat(40), clean: true },
      sourceFingerprint: 'a'.repeat(64), tarballSha512: 'b'.repeat(128), createdAt: new Date(now - 1000).toISOString() } };
  const report = writeDeliveryFixture(verified, root, now);
  return { root, now, verified, report, expected: { ...verified, repoRoot: root, now } };
}
function rawReview(f, lane, change) {
  const entry = f.report.reviews.find((item) => item.lane === lane);
  const raw = JSON.parse(readFileSync(entry.evidenceRef.path));
  change(raw, entry);
  writeJson(entry.evidenceRef.path, raw);
  entry.evidenceRef.sha256 = sha256(readFileSync(entry.evidenceRef.path));
}

test('fixed design references exist in the real repository, not only seeded synthetic fixtures', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const file of new Set(deliveryRules.flatMap((rule) => rule.designPaths))) {
    const actual = path.join(root, file);
    assert.ok(existsSync(actual) && lstatSync(actual).isFile() && !lstatSync(actual).isSymbolicLink(), file);
    assert.ok(file.endsWith('.md') && !file.includes('/archive/'), file);
  }
});

test('valid local delivery binds all registered designs and both review records, but grants no product PASS', (t) => {
  const f = fixture(t);
  assert.deepEqual(validateDeliveryReport(f.report, f.expected), { valid: true, ruleCount: 9, productAcceptanceEvaluated: false });
  assert.equal(readDeliveryEvidence(f.verified, { repoRoot: f.root, now: f.now }).validation.valid, true);
});

test('missing delivery, bad JSON and non-schema reports hit their own rejection', (t) => {
  const f = fixture(t);
  const file = path.join(path.dirname(f.verified.candidateFile), 'delivery.json');
  rmSync(file);
  assert.throws(() => readDeliveryEvidence(f.verified, { repoRoot: f.root, now: f.now }), /DELIVERY_MISSING/u);
  writeFileSync(file, 'invalid json');
  assert.throws(() => readDeliveryEvidence(f.verified, { repoRoot: f.root, now: f.now }), /DELIVERY_JSON/u);
  assert.throws(() => validateDeliveryReport({ status: 'PASS' }, f.expected), /DELIVERY_SHAPE/u);
});

test('candidate, source, tarball and contract binding cannot be reused or supplied by the report', (t) => {
  const f = fixture(t);
  for (const key of ['candidateFile', 'purpose', 'sourceRevision', 'sourceFingerprint', 'tarballSha512', 'contractSha256']) {
    assert.throws(() => validateDeliveryReport({ ...f.report, [key]: 'wrong' }, f.expected), /DELIVERY_BINDING/u, key);
  }
});

test('legacy delivery/review schemas and malformed revision bindings are rejected', (t) => {
  const f = fixture(t);
  assert.throws(() => validateDeliveryReport({ ...f.report, schemaVersion: 1 }, f.expected), /DELIVERY_SCHEMA/u);
  assert.throws(() => validateDeliveryReport({ ...f.report, sourceRevision: { ...f.report.sourceRevision, extra: true } }, f.expected), /DELIVERY_BINDING/u);
  rawReview(f, 'code', (raw) => { raw.schemaVersion = 1; });
  assert.throws(() => validateDeliveryReport(f.report, f.expected), /DELIVERY_REVIEW_SCHEMA/u);
});

test('missing, duplicate, unknown or misassigned rules cannot masquerade as complete traceability', (t) => {
  const f = fixture(t);
  for (const rules of [[], f.report.rules.slice(1), [...f.report.rules, f.report.rules[0]], [{ ...f.report.rules[0], ruleId: 'unknown' }, ...f.report.rules.slice(1)]]) {
    assert.throws(() => validateDeliveryReport({ ...f.report, rules }, f.expected), /DELIVERY_RULES/u);
  }
  for (const caseIds of [['LEGACY.verify-commands'], ['unknown'], ['POLICY.TTY.REAL_PAGINATION'], []]) {
    const rules = [{ ...f.report.rules[0], caseIds }, ...f.report.rules.slice(1)];
    assert.throws(() => validateDeliveryReport({ ...f.report, rules }, f.expected), /DELIVERY_RULE_CASES/u);
  }
});

test('design path is fixed by source contract and its exact current digest is mandatory', (t) => {
  const f = fixture(t);
  const original = structuredClone(f.report);
  f.report.rules[0].designs[0].path = 'docs/archive/old.md';
  assert.throws(() => validateDeliveryReport(f.report, f.expected), /DELIVERY_DESIGNS/u);
  original.rules[0].designs[0].sha256 = '0'.repeat(64);
  assert.throws(() => validateDeliveryReport(original, f.expected), /DELIVERY_DESIGN_HASH/u);
});

test('two lanes and distinct author/reviewer records are mandatory', (t) => {
  const f = fixture(t);
  assert.throws(() => validateDeliveryReport({ ...f.report, reviews: f.report.reviews.slice(1) }, f.expected), /DELIVERY_REVIEW_LANES/u);
  rawReview(f, 'code', (raw, entry) => { raw.reviewerId = f.report.authorId; entry.reviewerId = raw.reviewerId; });
  assert.throws(() => validateDeliveryReport(f.report, f.expected), /DELIVERY_REVIEW_SELF/u);
});

test('different lane labels cannot hide the same reviewer', (t) => {
  const f = fixture(t);
  rawReview(f, 'code', (raw, entry) => { raw.reviewerId = '/fixture/architecture'; entry.reviewerId = raw.reviewerId; });
  assert.throws(() => validateDeliveryReport(f.report, f.expected), /DELIVERY_REVIEW_INDEPENDENCE/u);
});

test('identity whitespace cannot disguise author self-review as a distinct reviewer', (t) => {
  const f = fixture(t);
  rawReview(f, 'code', (raw, entry) => { raw.reviewerId = `${f.report.authorId} `; entry.reviewerId = raw.reviewerId; });
  assert.throws(() => validateDeliveryReport(f.report, f.expected), /DELIVERY_REVIEW_ID/u);
});

test('raw records must match summary, binding, scope and approving verdict', (t) => {
  for (const [change, code] of [
    [(raw) => { raw.verdict = 'REQUEST CHANGES'; }, /DELIVERY_REVIEW_RECORD/u],
    [(raw, entry) => { raw.verdict = 'REQUEST CHANGES'; entry.verdict = raw.verdict; }, /DELIVERY_REVIEW_VERDICT/u],
    [(raw) => { raw.sourceFingerprint = 'old'; }, /DELIVERY_BINDING/u],
    [(raw) => { raw.purpose = 'development'; }, /DELIVERY_BINDING/u],
    [(raw) => { raw.sourceRevision.commit = 'e'.repeat(40); }, /DELIVERY_BINDING/u],
    [(raw) => { raw.ruleIds = raw.ruleIds.slice(1); }, /DELIVERY_REVIEW_SCOPE/u],
    [(raw) => { raw.findings = [{ id: 'P1', description: 'Unresolved defect', status: 'OPEN' }]; }, /DELIVERY_REVIEW_FINDINGS/u],
  ]) {
    const f = fixture(t);
    rawReview(f, 'code', change);
    assert.throws(() => validateDeliveryReport(f.report, f.expected), code);
  }
});

test('review evidence cannot be missing, replaced or redirected outside the candidate', (t) => {
  for (const scenario of ['missing', 'bytes', 'outside']) {
    const f = fixture(t);
    const ref = f.report.reviews[0].evidenceRef;
    if (scenario === 'missing') rmSync(ref.path);
    if (scenario === 'bytes') writeFileSync(ref.path, 'replaced');
    if (scenario === 'outside') ref.path = path.join(f.root, 'README.md');
    assert.throws(() => validateDeliveryReport(f.report, f.expected), scenario === 'bytes' ? /DELIVERY_REVIEW_HASH/u : /DELIVERY_REVIEW_PATH/u);
  }
});

test('report/review timestamps cannot be stale, future, reversed or from before the candidate', (t) => {
  const f = fixture(t);
  assert.throws(() => validateDeliveryReport({ ...f.report, createdAt: new Date(f.now + 1).toISOString() }, f.expected), /DELIVERY_TIME/u);
  assert.throws(() => validateDeliveryReport(f.report, { ...f.expected, now: f.now + 24 * 60 * 60 * 1000 + 1 }), /DELIVERY_TIME/u);
  for (const [key, delta] of [['startedAt', -2000], ['finishedAt', -1], ['finishedAt', 1]]) {
    const local = fixture(t);
    rawReview(local, 'code', (raw) => { raw[key] = new Date(local.now + delta).toISOString(); });
    assert.throws(() => validateDeliveryReport(local.report, local.expected), /DELIVERY_TIME/u);
  }
});

test('review paths through directory aliases and oversized evidence are rejected', (t) => {
  const f = fixture(t);
  const reference = f.report.reviews[0].evidenceRef;
  const alias = path.join(path.dirname(f.verified.candidateFile), 'review-alias');
  symlinkSync(path.dirname(reference.path), alias, process.platform === 'win32' ? 'junction' : 'dir');
  const original = reference.path;
  reference.path = path.join(alias, path.basename(original));
  assert.throws(() => validateDeliveryReport(f.report, f.expected), /DELIVERY_REVIEW_PATH/u);
  reference.path = original;
  writeFileSync(original, 'x'.repeat(2_000_001));
  assert.throws(() => validateDeliveryReport(f.report, f.expected), /DELIVERY_REVIEW_PATH/u);
});

test('binding, mapping, time and verdict negatives fail if their target guard is removed in memory', async (t) => {
  const location = new URL('../../scripts/release/delivery.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu,
    (_, relative) => `from '${new URL(relative, location).href}'`);
  const scenarios = [
    { mutate: (value) => value.replace(/function binding\(value, expected\) \{[\s\S]*?\n\}/u, 'function binding() {}'),
      change: (f) => { f.report.sourceFingerprint = 'wrong'; }, error: /DELIVERY_BINDING/u },
    { mutate: (value) => value.replace(/function sameSet\(actual, expected, code\) \{[\s\S]*?\n\}/u, 'function sameSet() {}'),
      change: (f) => { f.report.rules[0].caseIds = ['LEGACY.verify-commands']; }, error: /DELIVERY_RULE_CASES/u },
    { mutate: (value) => value.replace(/function timeRange\(startedAt, finishedAt, lowerBound, upperBound, now\) \{[\s\S]*?\n\}/u, 'function timeRange() {}'),
      change: (f) => { f.report.createdAt = new Date(f.now + 1).toISOString(); }, error: /DELIVERY_TIME/u },
    { mutate: (value) => value.replace("requireValue(entry.verdict === verdict, 'DELIVERY_REVIEW_VERDICT');", ''),
      change: (f) => rawReview(f, 'code', (raw, entry) => { raw.verdict = 'REQUEST CHANGES'; entry.verdict = raw.verdict; }),
      error: /DELIVERY_REVIEW_VERDICT/u },
  ];
  for (const scenario of scenarios) {
    const f = fixture(t);
    scenario.change(f);
    assert.throws(() => validateDeliveryReport(f.report, f.expected), scenario.error);
    const changed = scenario.mutate(source);
    assert.notEqual(changed, source, 'the intended guard mutation must actually apply');
    const mutant = await import(`data:text/javascript;base64,${Buffer.from(changed).toString('base64')}`);
    assert.equal(mutant.validateDeliveryReport(f.report, f.expected).valid, true);
    assert.throws(() => assert.throws(() => mutant.validateDeliveryReport(f.report, f.expected), scenario.error), { code: 'ERR_ASSERTION' });
  }
});
