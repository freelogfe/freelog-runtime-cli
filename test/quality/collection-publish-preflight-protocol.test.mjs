/** C08 contract registration; synthetic controls do not approve installed behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceCatalog } from '../acceptance/catalog.mjs';
import { acceptanceScope } from '../run-final-acceptance.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { preflightNames, preflightSpec, preflightCommand, preflightEntries, preflightInitial, preflightMutated, preflightAfter, preflightBody,
  preflightRequests, preflightResult, preflightHash, evaluateCollectionPublishPreflight, validateCollectionPublishPreflightFiles } from '../acceptance/collection-publish-preflight-evidence.mjs';
import { recoveryFixture, recoveryPaths } from '../acceptance/collection-recovery-evidence.mjs';
import { recoveryRouteAllowed } from '../acceptance/collection-recovery-control.mjs';
test('C08 has a dedicated installed mode/recheck producer without deleting parent gaps', () => {
  const leaf = acceptanceCatalog.find(item => item.id === 'COLLECTION.PUBLISH.PREFLIGHT_INSTALLED');
  assert.ok(leaf, 'C08 installed preflight producer is missing');
  assert.equal(leaf.script, 'verify-collection-publish-preflight.mjs');
  assert.equal(leaf.assertionIds.length, 49);
  assert.equal(leaf.scenarioRules.length, 48);
  for (const row of leaf.scenarioRules) assert.match(row.ruleId, /^(?:C08\.(?:M(?:0[1-9]|1\d|2[0-4])|C(?:0[1-9]|1[0-2])|DEFAULT_AUTO)|C07\.P01)$/u);
  assert.equal(acceptanceCatalog.filter(item => item.gap).length, 7);
  assert.ok(deliveryRules.find(rule => rule.id === leaf.parentRule).caseIds.includes(leaf.id));
  assert.deepEqual(acceptanceScope('collection-publish-preflight'), { scope: 'collection-publish-preflight', scripts: [leaf.script], needsTty: false });
});
const fingerprint = value => preflightHash(JSON.stringify(value));
const directoryHash = rows => fingerprint(rows.map(({ itemId, mountResourceInfo, itemTitle, sortId }) => ({ itemId, resourceId: mountResourceInfo.resourceId, itemTitle, sortId })));
async function validator() {
  const at = new URL('../acceptance/protocol.mjs', import.meta.url), source = readFileSync(at, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, at).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {validateProductTrace};').toString('base64')}`)).validateProductTrace;
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-c08-protocol-')));
  t.after(() => { assert.equal(path.dirname(realpathSync(root)), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-c08-protocol-')); rmSync(root, { recursive: true, force: false }); });
  const cliBin = path.join(root, 'node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js');
  mkdirSync(path.dirname(cliBin), { recursive: true }); writeFileSync(cliBin, '// SYNTHETIC C08 VALIDATOR CONTROL; NOT EXECUTED\n');
  const begin = Date.now() - 20_000, at = offset => new Date(begin + offset).toISOString();
  const observations = { runId: 'synthetic-c08-control', evidenceDir: root, cliBin, packageName: '@freelog-cli/cli2', version: '0.5.8', binSha256: preflightHash(readFileSync(cliBin)),
    platform: process.platform, nodeVersion: process.version, startedAt: at(0), finishedAt: at(19_000), scenarios: [], apparatusErrors: [] };
  const rewrite = scene => { const { evidenceRef, ...raw } = scene, bytes = JSON.stringify(raw) + '\n'; writeFileSync(evidenceRef.path, bytes); evidenceRef.sha256 = preflightHash(bytes); };
  for (const [index, name] of preflightNames.entries()) {
    const start = 100 + index * 200, spec = preflightSpec(name), input = preflightInitial(name), f = recoveryFixture(), requests = preflightRequests(name);
    const trace = [{ schemaVersion: 1, event: 'ready', guard: 'collection-publish-preflight-local-v1' }];
    for (const request of requests) {
      if (request.method === 'PUT') {
        for (const [i, state] of ['prepared', 'sending'].entries()) {
          const draft = preflightEntries(name).find(entry => entry.path === recoveryPaths.draft), form = spec.hasDraft ? f.form : f.baseline;
          const value = { schemaVersion: 2, resourceId: 'local_collection', resourceName: 'alice/collection', resourceTypeCode: 'CT001', env: 'dev', userId: 7, state,
            baselineFingerprint: fingerprint(f.baseline), baselineAuthFingerprint: fingerprint(f.auth), baselineDirectoryFingerprint: directoryHash(input.published),
            expectedForm: form, expectedAuthExcludedItems: f.auth, merge: spec.merge, directoryFingerprint: directoryHash(input.draft),
            payloadSha256: fingerprint({ resourceId: 'local_collection', ...preflightBody(name) }), sourceDraftSha256: draft ? preflightHash(Buffer.from(draft.bytes, 'base64')) : null, sentAt: at(start + 30) };
          trace.push({ schemaVersion: 1, event: 'intent-persisted', at: at(start + 31 + i), bytes: Buffer.from(JSON.stringify(value)).toString('base64') });
        }
      }
      trace.push({ schemaVersion: 1, event: 'request', method: request.method, path: request.path });
    }
    trace.push({ schemaVersion: 1, event: 'finished' });
    const controlActions = [];
    if (name.startsWith('race-') || ['allow-no-draft', 'block-no-published'].includes(name)) {
      const before = preflightEntries(name).find(entry => entry.path === recoveryPaths.draft), after = preflightEntries(name, true).find(entry => entry.path === recoveryPaths.draft);
      controlActions.push({ kind: name, point: 'second-rules-get', requestIndex: requests.map((request, i) => request.path.endsWith('/collectRules') ? i : -1).filter(i => i >= 0)[1],
        at: at(start + 20), remoteBefore: input, remoteAfter: preflightMutated(name), local: name === 'race-local' ? { path: recoveryPaths.draft, before: before.bytes, after: after.bytes } : null });
    }
    const scene = { name, cwd: path.join(root, `work-${name}`), controls: path.join(root, `controls-${name}`), argv: preflightCommand(name), childPid: 1300 + index,
      startedAt: at(start), finishedAt: at(start + 100), before: preflightEntries(name), after: preflightEntries(name, true), homeBefore: [], homeAfter: [],
      remoteBefore: input, remoteAfter: preflightAfter(name), controlActions, requests, result: preflightResult(name), trace: trace.map(JSON.stringify).join('\n') + '\n',
      apparatusErrors: [], evidenceRef: { path: path.join(root, `raw-${name}.json`), sha256: '' } };
    rewrite(scene); observations.scenarios.push(scene);
  }
  const result = evaluateCollectionPublishPreflight(observations); assert.equal(result.status, 'PASS', result.reason); validateCollectionPublishPreflightFiles(observations);
  const file = path.join(root, 'outer.json');
  const save = () => { const bytes = JSON.stringify({ schemaVersion: 1, runId: observations.runId, caseId: result.id, assertions: result.assertions, observations }) + '\n';
    writeFileSync(file, bytes); result.evidenceRef = { runId: observations.runId, path: file, sha256: preflightHash(bytes) }; };
  save(); return { observations, result, save, rewrite, scene: name => observations.scenarios.find(scene => scene.name === name),
    report: { runId: observations.runId, evidenceDir: root, cliBin, startedAt: observations.startedAt, finishedAt: observations.finishedAt } };
}
test('synthetic C08 positive traverses nested raw/intent/semantic validation, not installed approval', async t => {
  const f = fixture(t), validate = await validator(); assert.doesNotThrow(() => validate(f.result, f.report));
});
const alterTrace = (f, name, run) => { const scene = f.scene(name), rows = scene.trace.trim().split('\n').map(JSON.parse); run(rows);
  scene.trace = rows.map(JSON.stringify).join('\n') + '\n'; f.rewrite(scene); };

for (const side of ['trace', 'wire']) for (const occurrence of [0, 1]) test(`parallel type GET pair may arrive reversed only in ${side}, phase ${occurrence}`, async t => {
  const f = fixture(t), validate = await validator(), scene = f.scene('mode-M01');
  const swap = rows => {
    const positions = rows.map((row, index) => row.method === 'GET' && row.path === '/v2/resources/types/listSimpleByGroup?category=1&status=1&subjectType=4' ? index : -1).filter(index => index >= 0);
    const index = positions[occurrence];
    assert.ok(Number.isInteger(index));
    assert.equal(rows[index + 1].path, '/v2/resources/types/getInfoByCode?code=CT001');
    [rows[index], rows[index + 1]] = [rows[index + 1], rows[index]];
  };
  if (side === 'trace') alterTrace(f, 'mode-M01', swap);
  else { swap(scene.requests); f.rewrite(scene); }
  f.save();
  assert.doesNotThrow(() => validate(f.result, f.report));
});

for (const [name, mutate] of [
  ['trace-metadata-order', f => alterTrace(f, 'mode-M01', rows => { const i = rows.findIndex(row => row.path?.startsWith('/v2/storages/files/info?')); [rows[i], rows[i + 3]] = [rows[i + 3], rows[i]]; })],
  ['trace-type-cross-boundary', f => alterTrace(f, 'mode-M01', rows => { const i = rows.findIndex(row => row.path === '/v2/resources/types/getInfoByCode?code=CT001'); const j = rows.findIndex(row => row.path?.startsWith('/v2/storages/files/info?')); [rows[i], rows[j]] = [rows[j], rows[i]]; })],
  ['trace-missing-type', f => alterTrace(f, 'mode-M01', rows => { rows.splice(rows.findIndex(row => row.path === '/v2/resources/types/getInfoByCode?code=CT001'), 1); })],
  ['trace-duplicate-type', f => alterTrace(f, 'mode-M01', rows => { const i = rows.findIndex(row => row.path === '/v2/resources/types/getInfoByCode?code=CT001'); rows.splice(i, 0, structuredClone(rows[i])); })],
  ['trace-wrong-type-query', f => alterTrace(f, 'mode-M01', rows => { rows.find(row => row.path === '/v2/resources/types/getInfoByCode?code=CT001').path = '/v2/resources/types/getInfoByCode?code=OTHER'; })],
  ['merge-body', f => { const s = f.scene('mode-M07'); s.requests.find(r => r.method === 'PUT').body.isMergeCatalogueDraft = 0; f.rewrite(s); }],
  ['missing-metadata', f => { const s = f.scene('mode-M07'); s.requests.splice(s.requests.findIndex(r => r.path.startsWith('/v2/storages/files/info?')), 1); f.rewrite(s); }],
  ['wrong-field-definition', f => { const s = f.scene('mode-M07'); s.requests.find(r => r.path.startsWith('/v2/resources/attrs/getInfoByKey?')).response.data.contentRule.maxLength = 141; f.rewrite(s); }],
  ['metadata-order', f => { const s = f.scene('mode-M07'), i = s.requests.findIndex(r => r.path.startsWith('/v2/storages/files/info?')); [s.requests[i], s.requests[i + 1]] = [s.requests[i + 1], s.requests[i]]; f.rewrite(s); }],
  ['missing-intent', f => alterTrace(f, 'mode-M07', rows => { const i = rows.findIndex(r => r.event === 'intent-persisted'); rows.splice(i, 2); })],
  ['late-intent', f => alterTrace(f, 'mode-M07', rows => { const events = rows.filter(r => r.event === 'intent-persisted'); for (let i = rows.length - 1; i >= 0; i--) if (rows[i].event === 'intent-persisted') rows.splice(i, 1); rows.splice(rows.length - 1, 0, ...events); })],
  ['intent-source', f => alterTrace(f, 'mode-M07', rows => { const event = rows.find(r => r.event === 'intent-persisted'), value = JSON.parse(Buffer.from(event.bytes, 'base64')); value.sourceDraftSha256 = '0'.repeat(64); event.bytes = Buffer.from(JSON.stringify(value)).toString('base64'); })],
  ['mutation-point', f => { const s = f.scene('race-description'); s.controlActions[0].requestIndex = 0; f.rewrite(s); }],
  ['missing-mutation', f => { const s = f.scene('race-local'); s.controlActions = []; f.rewrite(s); }],
  ['lost-local-draft', f => { const s = f.scene('race-local'); s.after = s.after.filter(e => e.path !== recoveryPaths.draft); f.rewrite(s); }],
  ['version-mismatch', f => { const s = f.scene('mode-M07'); s.requests.find(r => r.path.endsWith('/versions/snapshot_1')).response.data.version = 'snapshot_0'; f.rewrite(s); }],
  ['false-success', f => { const s = f.scene('race-rules'); s.result.status = 0; f.rewrite(s); }],
  ['replayed-put', f => { const s = f.scene('mode-M07'); s.requests.push(structuredClone(s.requests.find(r => r.method === 'PUT'))); f.rewrite(s); }],
  ['home-write', f => { const s = f.scene('mode-M07'); s.homeAfter = [{ path: 'unexpected', kind: 'file', bytes: 'AA==' }]; f.rewrite(s); }],
  ['signal', f => { const s = f.scene('mode-M07'); s.result.signal = 'SIGTERM'; f.rewrite(s); }],
  ['wrong-bin', f => { f.observations.binSha256 = '0'.repeat(64); }],
  ['missing-raw', f => unlinkSync(f.scene('mode-M07').evidenceRef.path)],
  ['missing-scene', f => { f.observations.scenarios.pop(); }],
]) test(`rewritten hashes and claimed PASS cannot hide preflight ${name}`, async t => {
  const f = fixture(t), validate = await validator(); assert.doesNotThrow(() => validate(f.result, f.report)); mutate(f); f.save();
  assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
});
test('all C08 fixed SDK requests fit the existing closed routes; independent expected objects do not alias', () => {
  for (const name of preflightNames) for (const request of preflightRequests(name)) assert.equal(recoveryRouteAllowed(request.method, request.path), true, request.path);
  const before = preflightRequests('mode-M07'), changed = preflightRequests('mode-M07');
  changed.find(r => r.method === 'PUT').body.customPropertyDescriptors[0].defaultValue = 'mutated'; changed[0].response.data.userId = 8;
  assert.deepEqual(preflightRequests('mode-M07'), before);
  assert.equal(preflightSpec('mode-M07').merge, 1); assert.equal(preflightSpec('mode-M08').hasDraft, false);
  const immutable = preflightInitial('race-description'), updated = preflightMutated('race-description');
  assert.equal(immutable.version.version, 'snapshot_0'); assert.equal(updated.version.version, 'snapshot_1');
});

test('C08 system configuration requests have fixed responses and respect each preflight cutoff', () => {
  for (const name of preflightNames) {
    const requests = preflightRequests(name), spec = preflightSpec(name);
    const count = spec.code && spec.code !== 'RECHECK' || name === 'race-rules' ? 1 : 2;
    const systemCount = name === 'race-options' ? 1 : count;
    const typeReads = requests.filter(request => request.path === '/v2/resources/types/getInfoByCode?code=CT001');
    const metaReads = requests.filter(request => request.path === '/v2/storages/files/info?resourceTypeCode=CT001');
    const fieldReads = requests.filter(request => request.path === '/v2/resources/attrs/getInfoByKey?key=display_artist');
    assert.equal(typeReads.length, count, name); assert.equal(metaReads.length, systemCount, name); assert.equal(fieldReads.length, systemCount, name);
    for (const request of typeReads) assert.deepEqual(request.response.data.attrs, [{ key: 'display_artist', name: '系统作者' }]);
    for (const request of metaReads) {
      assert.deepEqual(request.response, { ret: 0, errCode: 0, data: { metaInfoArray: [{ key: 'display_artist', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '' }] } });
      assert.equal(requests[requests.indexOf(request) - 1].path, '/v2/resources/types/getInfoByCode?code=CT001');
    }
    for (const request of fieldReads) {
      assert.deepEqual(request.response, { ret: 0, errCode: 0, data: { key: 'display_artist', format: 6, contentRule: { maxLength: 140 } } });
      assert.equal(requests[requests.indexOf(request) - 1].path, '/v2/storages/files/info?resourceTypeCode=CT001');
    }
  }
});
