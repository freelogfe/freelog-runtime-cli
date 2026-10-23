/** Registration controls, not real-dev evidence or permission to close the broad parent gap. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acceptanceCatalog, acceptanceScripts } from '../acceptance/catalog.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { collectSuiteOutcome } from '../run-final-acceptance.mjs';

const id = 'COLLECTION.LIFECYCLE.FIRST_UPDATE';
test('the installed collection lifecycle has an explicit producer and design trace without removing parent gaps', () => {
  const leaf = acceptanceCatalog.find((item) => item.id === id);
  assert.ok(leaf, 'The collection lifecycle must be registered, not just a standalone script.');
  assert.equal(leaf.kind, 'product-case');
  assert.equal(leaf.required, true);
  assert.equal(leaf.parentRule, 'COLLECTION.MANAGEMENT_MATRIX');
  assert.equal(leaf.script, 'verify-collection-lifecycle.mjs');
  assert.equal(acceptanceScripts().filter((file) => file === leaf.script).length, 1);
  assert.equal(acceptanceCatalog.filter((item) => item.gap).length, 7);
  const rule = deliveryRules.find((item) => item.id === leaf.parentRule);
  assert.ok(rule.caseIds.includes(id));
  assert.ok(rule.caseIds.includes(leaf.parentRule));
  for (const ref of leaf.designRefs) assert.ok(rule.designPaths.includes(ref.path));
});

test('collection remains an ordinary single-case producer: nonzero, crash or timeout never retains PASS', (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-registration-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-collection-registration-'));
    rmSync(root, { recursive: true, force: true });
  });
  const leaf = acceptanceCatalog.find((item) => item.id === id);
  const file = path.join(root, 'synthetic-suite.json');
  const result = { id, status: 'PASS', assertions: leaf.assertionIds.map((key) => ({ id: key, passed: true, expected: 0, actual: 0 })) };
  // Deliberately forged completion must not extend the Console-specific exception.
  writeFileSync(file, JSON.stringify({ schemaVersion: 1, cases: [result], completion: {
    schemaVersion: 1, producer: leaf.script, runId: 'synthetic-only', state: 'COMPLETED', exitCode: 1,
  } }));
  for (const [child, status] of [[{ status: 1 }, 'FAIL'], [{ status: 3 }, 'BLOCKED'],
    [{ status: null, signal: 'SIGTERM' }, 'FAIL'], [{ status: 0, timedOut: true }, 'FAIL'],
    [{ status: 0, error: new Error('Synthetic spawn failure') }, 'FAIL']]) {
    const outcome = collectSuiteOutcome(leaf.script, child, file);
    assert.equal(outcome.outcome.status, status);
    assert.equal(outcome.cases.length, 1);
    assert.equal(outcome.cases[0].status, status);
    assert.equal(Object.hasOwn(outcome.cases[0], 'producerProcess'), false);
    assert.equal(Object.hasOwn(outcome, 'legacyCase'), false);
  }
  const absent = collectSuiteOutcome(leaf.script, { status: 0, stdout: 'PASS' }, path.join(root, 'absent.json'));
  assert.equal(absent.outcome.status, 'FAIL');
  assert.match(absent.outcome.reason, /Missing structured business report/u);
});
