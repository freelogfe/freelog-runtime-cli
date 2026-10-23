/** Registration/routing controls only, never an installed recovery approval. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptanceCatalog, acceptanceScripts } from '../acceptance/catalog.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { acceptanceScope } from '../run-final-acceptance.mjs';

test('installed recovery matrix is registered once with explicit source designs and seven parent gaps intact', () => {
  const leaf = acceptanceCatalog.find((item) => item.id === 'COLLECTION.RECOVERY.INSTALLED_MATRIX');
  assert.ok(leaf, 'The installed recovery matrix needs its registered business descriptor.');
  assert.equal(leaf.script, 'verify-collection-recovery.mjs'); assert.equal(leaf.required, true);
  assert.equal(leaf.parentRule, 'COLLECTION.MANAGEMENT_MATRIX'); assert.equal(leaf.kind, 'product-case');
  assert.equal(acceptanceScripts().filter((script) => script === leaf.script).length, 1);
  assert.equal(acceptanceCatalog.filter((item) => item.gap).length, 7);
  const rule = deliveryRules.find((item) => item.id === leaf.parentRule);
  assert.ok(rule.caseIds.includes(leaf.id));
  for (const ref of leaf.designRefs) assert.ok(rule.designPaths.includes(ref.path));
});

test('recovery diagnosis has one fixed local producer, not lifecycle writes or arbitrary filters', () => {
  assert.deepEqual(acceptanceScope('collection-recovery'), { scope: 'collection-recovery', scripts: ['verify-collection-recovery.mjs'], needsTty: false });
  assert.deepEqual(acceptanceScope('collection-lifecycle').scripts, ['verify-theme-image-full-lifecycle.mjs', 'verify-collection-lifecycle.mjs']);
  assert.throws(() => acceptanceScope('collection-recovery,other'), /Unknown acceptance scope/u);
});
