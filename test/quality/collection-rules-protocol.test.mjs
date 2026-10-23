/** C05 source contract and hostile evidence controls; fixtures never approve a candidate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceCatalog } from '../acceptance/catalog.mjs';
import { acceptanceScope } from '../run-final-acceptance.mjs';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectionRulesCases, rulesNames, rulesEntries, rulesCommand, rulesModel, rulesExpectedRequests, rulesExpectedResult,
  rulesHash, evaluateCollectionRules, validateCollectionRulesFiles } from '../acceptance/collection-rules-evidence.mjs';
import { rulesRouteAllowed } from '../acceptance/collection-rules-control.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';

test('C05 installed rules matrix is registered without deleting the seven parent gaps', () => {
  const leaf = acceptanceCatalog.find(item => item.id === 'COLLECTION.RULES.INSTALLED_MATRIX');
  assert.ok(leaf, 'C05 installed producer is missing');
  assert.equal(leaf.script, 'verify-collection-rules.mjs');
  assert.equal(leaf.scenarioRules.length, 34);
  assert.equal(leaf.assertionIds.length, 35);
  assert.equal(acceptanceCatalog.filter(item => item.gap).length, 7);
  assert.deepEqual(acceptanceScope('collection-rules'), { scope: 'collection-rules', scripts: ['verify-collection-rules.mjs'], needsTty: false });
  assert.ok(deliveryRules.find(rule => rule.id === leaf.parentRule).caseIds.includes(leaf.id));
});

async function validator() {
  const at = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(at, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, at).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {validateProductTrace};').toString('base64')}`)).validateProductTrace;
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-c05-protocol-')));
  t.after(() => { assert.equal(path.dirname(realpathSync(root)), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-c05-protocol-')); rmSync(root, { recursive: true, force: false }); });
  const cliBin = path.join(root, 'node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js');
  mkdirSync(path.dirname(cliBin), { recursive: true }); writeFileSync(cliBin, '// SYNTHETIC VALIDATOR CONTROL; NEVER EXECUTED\n');
  const begin = Date.now() - 10_000, at = offset => new Date(begin + offset).toISOString();
  const observations = { runId: 'synthetic-c05-control', evidenceDir: root, cliBin, packageName: '@freelog-cli/cli2', version: '0.5.8',
    binSha256: rulesHash(readFileSync(cliBin)), platform: process.platform, nodeVersion: process.version, startedAt: at(0), finishedAt: at(9000), apparatusErrors: [], scenarios: [] };
  const rewrite = scene => { const { evidenceRef, ...raw } = scene, bytes = JSON.stringify(raw) + '\n';
    writeFileSync(evidenceRef.path, bytes); evidenceRef.sha256 = rulesHash(bytes); };
  for (const [index, name] of rulesNames.entries()) {
    const requests = rulesExpectedRequests(name), scene = { name, cwd: path.join(root, `workspace-${name}`), controls: path.join(root, `controls-${name}`),
      argv: rulesCommand(name), childPid: 1234 + index, startedAt: at(100 + index * 200), finishedAt: at(200 + index * 200),
      result: rulesExpectedResult(name), before: rulesEntries(name), after: rulesEntries(name), homeBefore: [], homeAfter: [],
      remoteBefore: rulesModel(name), remoteAfter: rulesModel(name, true), requests, apparatusErrors: [],
      trace: [{ schemaVersion: 1, event: 'ready', guard: 'collection-rules-local-v1' },
        ...requests.map(({ method, path }) => ({ schemaVersion: 1, event: 'request', method, path })), { schemaVersion: 1, event: 'finished' }].map(JSON.stringify).join('\n') + '\n',
      evidenceRef: { path: path.join(root, `raw-${name}.json`), sha256: '' } };
    rewrite(scene); observations.scenarios.push(scene);
  }
  const result = evaluateCollectionRules(observations);
  assert.equal(result.status, 'PASS', result.reason); validateCollectionRulesFiles(observations);
  const file = path.join(root, 'outer.json');
  const save = () => { const bytes = JSON.stringify({ schemaVersion: 1, runId: observations.runId, caseId: result.id, assertions: result.assertions, observations }) + '\n';
    writeFileSync(file, bytes); result.evidenceRef = { runId: observations.runId, path: file, sha256: rulesHash(bytes) }; };
  save(); return { observations, result, save, rewrite, report: { runId: observations.runId, evidenceDir: root, cliBin, startedAt: observations.startedAt, finishedAt: observations.finishedAt } };
}
test('synthetic C05 positive traverses actual nested raw and semantic protocol, not candidate approval', async t => {
  const f = fixture(t), validate = await validator(); assert.doesNotThrow(() => validate(f.result, f.report));
});
for (const [name, mutate] of [
  ['post-body', f => { const s = f.observations.scenarios[9]; s.requests.find(r => r.method === 'POST').body.filterConditions[1].value = 'wrong/prefix'; f.rewrite(s); }],
  ['false-success', f => { const s = f.observations.scenarios[20]; s.result.status = 0; f.rewrite(s); }],
  ['replay', f => { const s = f.observations.scenarios[23]; s.requests.push(structuredClone(s.requests.at(-1))); f.rewrite(s); }],
  ['local-byte', f => { const s = f.observations.scenarios[6]; s.after.find(e => e.path === 'keep.bin').bytes = 'AA=='; f.rewrite(s); }],
  ['home-write', f => { const s = f.observations.scenarios[6]; s.homeAfter = [{ path: 'unexpected', kind: 'file', bytes: 'AA==' }]; f.rewrite(s); }],
  ['remote-state', f => { const s = f.observations.scenarios[8]; s.remoteAfter.rules.filterConditions = []; f.rewrite(s); }],
  ['missing-page', f => { const s = f.observations.scenarios[18]; s.requests = s.requests.filter(r => !r.path.includes('skip=100')); f.rewrite(s); }],
  ['signal', f => { const s = f.observations.scenarios[0]; s.result.signal = 'SIGTERM'; f.rewrite(s); }],
  ['hidden-transport', f => { const s = f.observations.scenarios[0]; s.trace += '{"schemaVersion":1,"event":"blocked"}\n'; f.rewrite(s); }],
  ['missing-raw', f => unlinkSync(f.observations.scenarios[0].evidenceRef.path)],
  ['wrong-bin', f => { f.observations.binSha256 = '0'.repeat(64); }],
  ['old-window', f => { f.report.startedAt = new Date().toISOString(); }],
  ['missing-scene', f => { f.observations.scenarios.pop(); }],
]) test(`claimed PASS and rewritten hashes cannot hide rules ${name}`, async t => {
  const f = fixture(t), validate = await validator(); assert.doesNotThrow(() => validate(f.result, f.report));
  mutate(f); f.save(); assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
});
test('C05 routes accept exact source requests only, and expected wire objects never alias the oracle', () => {
  for (const name of rulesNames) for (const request of rulesExpectedRequests(name)) assert.equal(rulesRouteAllowed(request.method, request.path), true, request.path);
  for (const [method, route] of [['POST', '/v2/resources'], ['POST', '/v2/contracts'], ['GET', '/v2/resources/local_collection?token=bad'],
    ['POST', '/v2/resources/catalogues/drafts/local_collection/items'], ['GET', '/v2/resources/types/getInfoByCode?code=CT001']]) assert.equal(rulesRouteAllowed(method, route), false);
  const before = rulesExpectedRequests('auto-all'), changed = rulesExpectedRequests('auto-all');
  changed.find(r => r.method === 'POST').body.filterConditions[0].value = 'mutated';
  changed[0].response.data.serializeStatus = 0;
  assert.deepEqual(rulesExpectedRequests('auto-all'), before);
  const spec = readFileSync(new URL('../../docs/一期/产品方案/脚手架设计/PHASE/合集/测试/00-功能拓扑与证据驱动测试门禁.md', import.meta.url), 'utf8');
  for (const row of collectionRulesCases[0].scenarioRules) assert.ok(spec.includes(`| ${row.ruleId} | ${row.scenario} |`));
});
