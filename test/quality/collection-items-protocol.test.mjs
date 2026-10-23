/** Exercises actual protocol with synthetic raw records; not candidate business approval. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { syntheticCollectionItems } from './fixtures/collection-items.mjs';
import { evaluateCollectionItems, itemHash, validateCollectionItemsFiles } from '../acceptance/collection-items-evidence.mjs';
async function validator() {
  const location = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace };`).toString('base64')}`)).validateProductTrace;
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-items-protocol-')));
  t.after(() => { assert.equal(path.dirname(realpathSync(root)), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-items-protocol-')); rmSync(root, { recursive: true, force: false }); });
  const observations = syntheticCollectionItems(root, true), result = evaluateCollectionItems(observations);
  assert.equal(result.status, 'PASS', result.reason); validateCollectionItemsFiles(observations);
  const file = path.join(root, 'synthetic.outer.evidence.json');
  const save = () => {
    const bytes = `${JSON.stringify({ schemaVersion: 1, runId: observations.runId, caseId: result.id, assertions: result.assertions, observations })}\n`;
    writeFileSync(file, bytes); result.evidenceRef = { runId: observations.runId, path: file, sha256: itemHash(bytes) };
  };
  const rewrite = (scenario) => {
    const { evidenceRef, ...raw } = scenario, bytes = `${JSON.stringify(raw)}\n`;
    writeFileSync(evidenceRef.path, bytes); evidenceRef.sha256 = itemHash(bytes);
  };
  save(); return { observations, result, file, save, rewrite, report: { runId: observations.runId, evidenceDir: root, cliBin: observations.cliBin,
    startedAt: observations.startedAt, finishedAt: observations.finishedAt } };
}
test('all original item files and semantics pass the actual source protocol branch as a validator control', async (t) => {
  const validate = await validator(), f = fixture(t); assert.doesNotThrow(() => validate(f.result, f.report));
});
for (const [name, mutate] of [
  ['output', (f) => { f.observations.scenarios[0].result.stdout = 'invented PASS\n'; f.rewrite(f.observations.scenarios[0]); }],
  ['body', (f) => { f.observations.scenarios[1].requests.find((r) => r.method === 'POST').body.addCollectionItems[0].authExcludedItems[0].excludedValue = 'policy-not-contract'; f.rewrite(f.observations.scenarios[1]); }],
  ['contract-role', (f) => { f.observations.scenarios[1].requests.find((r) => r.path.startsWith('/v2/contracts')).response.data[0].licenseeIdentityType = 3; f.rewrite(f.observations.scenarios[1]); }],
  ['before-bytes', (f) => { f.observations.scenarios[0].before.pop(); f.rewrite(f.observations.scenarios[0]); }],
  ['after-bytes', (f) => { f.observations.scenarios[0].after.find((e) => e.path === 'keep.bin').bytes = Buffer.from([0,255,255]).toString('base64'); f.rewrite(f.observations.scenarios[0]); }],
  ['missing-scenario', (f) => { f.observations.scenarios.pop(); }],
  ['missing-raw', (f) => { rmSync(f.observations.scenarios[0].evidenceRef.path); }],
  ['raw-content', (f) => { writeFileSync(f.observations.scenarios[0].evidenceRef.path, '{}'); }],
  ['raw-alias', (f) => { f.observations.scenarios[1].evidenceRef = f.observations.scenarios[0].evidenceRef; }],
  ['cross-run', (f) => { f.observations.runId = 'different-run'; }],
  ['bin', (f) => { writeFileSync(f.observations.cliBin, 'changed'); }],
  ['wrapper-window', (f) => { f.report.startedAt = new Date(Date.now()).toISOString(); }],
  ['assertion-set', (f) => { f.result.assertions = [{ id: 'self-reported-PASS', passed: true, expected: true, actual: true }]; }],
]) test(`rewriting hashes or claimed PASS cannot conceal ${name}`, async (t) => {
  const validate = await validator(), f = fixture(t); assert.doesNotThrow(() => validate(f.result, f.report));
  mutate(f); f.save();
  assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE|Product evidence|product evidence/u);
});
