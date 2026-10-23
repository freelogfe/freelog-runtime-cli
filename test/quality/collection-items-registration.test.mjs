/** Registration only; parent obligations and full release refusal remain intact. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceCatalog, acceptanceScripts } from '../acceptance/catalog.mjs';
import { acceptanceScope } from '../run-final-acceptance.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { readFileSync } from 'node:fs';
test('C03 has one real producer, source rule mapping and all seven mandatory parent gaps', () => {
  const leaf = acceptanceCatalog.find((c) => c.id === 'COLLECTION.ITEMS.INSTALLED_MATRIX');
  assert.equal(leaf.required, true); assert.equal(leaf.script, 'verify-collection-items.mjs'); assert.equal(leaf.assertionIds.length, 34);
  assert.equal(acceptanceScripts().filter((s) => s === leaf.script).length, 1);
  assert.equal(acceptanceCatalog.filter((c) => c.gap).length, 7);
  const rule = deliveryRules.find((r) => r.id === leaf.parentRule); assert.ok(rule.caseIds.includes(leaf.id));
  for (const ref of leaf.designRefs) assert.ok(rule.designPaths.includes(ref.path));
  const spec = readFileSync(new URL('../../docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md', import.meta.url), 'utf8');
  assert.equal(leaf.scenarioRules.length, 33);
  for (const row of leaf.scenarioRules) assert.ok(spec.includes(`| \`${row.ruleId}\` | \`${row.scenario}\` |`), `${row.ruleId}: atomic design mapping missing`);
});
test('C03 diagnostic scope cannot select arbitrary scripts or replace lifecycle/recovery scope', () => {
  assert.deepEqual(acceptanceScope('collection-items'), { scope: 'collection-items', scripts: ['verify-collection-items.mjs'], needsTty: false });
  assert.deepEqual(acceptanceScope('collection-recovery').scripts, ['verify-collection-recovery.mjs']);
  assert.throws(() => acceptanceScope('collection-items,other'), /Unknown acceptance scope/u);
});
