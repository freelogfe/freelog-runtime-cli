import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { acceptanceCatalog } from '../acceptance/catalog.mjs';
import { collectSuiteOutcome } from '../run-final-acceptance.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'freelog-producers-quality-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-producers-quality-'));
    rmSync(root, { recursive: true, force: true });
  });
  const catalog = ['FIRST', 'SECOND'].map((id) => ({ id: `SYNTHETIC.${id}`, kind: 'product-case', required: true,
    title: 'Synthetic producer contract only', assertionIds: ['exact-readback'], script: 'verify-commands.mjs' }));
  const cases = catalog.map(({ id }) => ({ id, status: 'PASS', assertions: [{ id: 'exact-readback', passed: true, expected: 0, actual: 0 }] }));
  const file = path.join(root, 'suite.json');
  const write = (items = cases) => writeFileSync(file, JSON.stringify({ schemaVersion: 1, cases: items }));
  return { catalog, cases, file, write };
}

test('one producer returns all owned cases without manufacturing a LEGACY process approval', (t) => {
  const f = fixture(t); f.write();
  const result = collectSuiteOutcome('verify-commands.mjs', { status: 0 }, f.file, f.catalog);
  assert.equal(result.outcome.status, 'PASS');
  assert.equal(Object.hasOwn(result, 'legacyCase'), false);
  assert.deepEqual(result.cases.map((item) => [item.id, item.status, item.process.exitCode]),
    [['SYNTHETIC.FIRST', 'PASS', 0], ['SYNTHETIC.SECOND', 'PASS', 0]]);
});

test('zero exit and PASS text cannot replace a missing business report', (t) => {
  const f = fixture(t);
  const result = collectSuiteOutcome('verify-commands.mjs', { status: 0, stdout: 'PASS all complete' }, f.file, f.catalog);
  assert.equal(result.outcome.status, 'FAIL');
  assert.match(result.outcome.reason, /Missing structured business report from verify-commands\.mjs/u);
  assert.deepEqual(result.cases.map((item) => item.status), ['FAIL', 'FAIL']);
});

test('missing, duplicate and unknown business cases hit the report defect, not an unrelated release gap', (t) => {
  const f = fixture(t);
  for (const [cases, error] of [
    [[f.cases[0]], /Missing cases from verify-commands\.mjs: SYNTHETIC.SECOND/u],
    [[f.cases[0], f.cases[0]], /Unknown\/duplicate case/u],
    [[f.cases[0], { ...f.cases[1], id: 'UNKNOWN' }], /Unknown\/duplicate case/u],
  ]) {
    f.write(cases);
    const result = collectSuiteOutcome('verify-commands.mjs', { status: 0 }, f.file, f.catalog);
    assert.equal(result.outcome.status, 'FAIL');
    assert.match(result.outcome.reason, error);
    assert.ok(result.cases.every((item) => item.status === 'FAIL'));
  }
});

test('producer crash, signal, nonzero exit and explicit blocked outcome cannot retain business PASS', (t) => {
  const f = fixture(t); f.write();
  for (const [child, expected] of [[{ status: null }, 'FAIL'], [{ status: 0, signal: 'SIGTERM' }, 'FAIL'],
    [{ status: 0, error: new Error('spawn failed') }, 'FAIL'], [{ status: 1 }, 'FAIL'], [{ status: 3 }, 'BLOCKED']]) {
    const result = collectSuiteOutcome('verify-commands.mjs', child, f.file, f.catalog);
    assert.equal(result.outcome.status, expected);
    assert.ok(result.cases.every((item) => item.status === expected));
    assert.ok(result.cases.every((item) => item.process.exitCode === (child.status ?? null)));
  }
});

test('legacy completion stays separate and does not conceal failures of its business report', (t) => {
  const f = fixture(t);
  const legacy = acceptanceCatalog.find((item) => item.id === 'LEGACY.verify-commands');
  const onlyProcess = collectSuiteOutcome('verify-commands.mjs', { status: 0 }, f.file, [legacy]);
  assert.equal(onlyProcess.legacyCase.status, 'PASS');
  assert.deepEqual(onlyProcess.cases, []);
  f.write([f.cases[0]]);
  const incomplete = collectSuiteOutcome('verify-commands.mjs', { status: 0 }, f.file, [legacy, ...f.catalog]);
  assert.equal(incomplete.legacyCase.status, 'FAIL');
  assert.ok(incomplete.cases.every((item) => item.status === 'FAIL'));
});

test('malformed report and unknown producer are rejected without executing anything', (t) => {
  const f = fixture(t);
  writeFileSync(f.file, '{');
  assert.equal(collectSuiteOutcome('verify-commands.mjs', { status: 0 }, f.file, f.catalog).outcome.status, 'FAIL');
  assert.throws(() => collectSuiteOutcome('unknown.mjs', { status: 0 }, f.file, f.catalog), /Unknown acceptance producer: unknown\.mjs/u);
});
