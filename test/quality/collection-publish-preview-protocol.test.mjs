/** C07 real-TTY registration and semantic controls; never candidate approval fixtures. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceCatalog } from '../acceptance/catalog.mjs';
import { acceptanceScope } from '../run-final-acceptance.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { previewNames, previewSpec, previewFixture, previewEntries, previewCommand, previewSteps, previewCapabilityCommand, previewModel,
  previewBody, previewRequests, expectedPreview, previewCanonical, previewHash, evaluateCollectionPublishPreview, validateCollectionPublishPreviewFiles } from '../acceptance/collection-publish-preview-evidence.mjs';
import { recoveryPaths } from '../acceptance/collection-recovery-evidence.mjs';
import { recoveryRouteAllowed } from '../acceptance/collection-recovery-control.mjs';
test('C07 has nine installed preview scenes and independent native probe without removing gaps', () => {
  const leaf = acceptanceCatalog.find(item => item.id === 'COLLECTION.PUBLISH.PREVIEW_TTY');
  assert.ok(leaf, 'C07 installed preview producer missing');
  assert.equal(leaf.script, 'verify-collection-publish-preview.mjs');
  assert.equal(leaf.scenarioRules.length, 9); assert.equal(leaf.assertionIds.length, 10);
  assert.equal(acceptanceCatalog.filter(item => item.gap).length, 7);
  assert.ok(deliveryRules.find(rule => rule.id === leaf.parentRule).caseIds.includes(leaf.id));
  assert.deepEqual(acceptanceScope('collection-publish-preview'), { scope: 'collection-publish-preview', scripts: [leaf.script], needsTty: false });
});
const fingerprint = value => previewHash(JSON.stringify(value));
const directoryHash = rows => fingerprint(rows.map(({ itemId, mountResourceInfo, itemTitle, sortId }) => ({ itemId, resourceId: mountResourceInfo.resourceId, itemTitle, sortId })));
async function validator() {
  const at = new URL('../acceptance/protocol.mjs', import.meta.url), source = readFileSync(at, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, at).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(source + '\nexport {validateProductTrace};').toString('base64')}`)).validateProductTrace;
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-c07-protocol-')));
  t.after(() => { assert.equal(path.dirname(realpathSync(root)), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-c07-protocol-')); rmSync(root, { recursive: true, force: false }); });
  const cliBin = path.join(root, 'node_modules', '@freelog-cli', 'cli2', 'dist', 'bin', 'index.js');
  mkdirSync(path.dirname(cliBin), { recursive: true }); writeFileSync(cliBin, '// SYNTHETIC C07 VALIDATOR CONTROL; NEVER EXECUTED\n');
  const start = Date.now() - 20_000, at = offset => new Date(start + offset).toISOString();
  const observations = { runId: 'synthetic-c07-control', evidenceDir: root, cliBin, packageName: '@freelog-cli/cli2', version: '0.5.8', binSha256: previewHash(readFileSync(cliBin)),
    platform: process.platform, nodeVersion: process.version, startedAt: at(0), finishedAt: at(15_000), scenarios: [], apparatusErrors: [] };
  const rewrite = scene => { const { evidenceRef, ...raw } = scene, bytes = JSON.stringify(raw) + '\n'; writeFileSync(evidenceRef.path, bytes); evidenceRef.sha256 = previewHash(bytes); };
  const header = tty => [{ schemaVersion: 1, event: 'ready', guard: 'collection-publish-preflight-local-v1' }, { schemaVersion: 1, event: 'preview-capture-ready', stdinTTY: tty, stdoutTTY: tty }];
  const stream = (name, text) => ({ schemaVersion: 1, event: 'stream-write', stream: name, bytes: Buffer.from(text).toString('base64') });
  const flags = '{"stdin":true,"stdout":true}\n';
  const probe = { name: 'capability', cwd: path.join(root, 'work-probe'), controls: path.join(root, 'controls-probe'), argv: previewCapabilityCommand(), requests: [], childPid: 1000,
    before: previewEntries('full-cancel'), after: previewEntries('full-cancel'), homeBefore: [], homeAfter: [], startedAt: at(100), finishedAt: at(300),
    result: { status: 0, signal: null, completed: true, stdout: flags, stderr: '', completedSteps: 1, matchedPrompts: ['{"stdin":true,"stdout":true}'] },
    trace: [...header(true), stream('stdout', flags), { schemaVersion: 1, event: 'finished' }].map(JSON.stringify).join('\n') + '\n',
    evidenceRef: { path: path.join(root, 'raw-capability.json'), sha256: '' } };
  rewrite(probe); observations.capability = probe;
  for (const [index, name] of previewNames.entries()) {
    const begin = 1000 + index * 500, spec = previewSpec(name), f = previewFixture(name), requests = previewRequests(name), preview = expectedPreview(name);
    const success = '合集变更已发布；未执行上架。\n', cancelled = '已取消\n', prompt = `? ${preview}\n确认写入？ (Y/n) ${spec.success ? 'y' : 'n'}\n`;
    const out = spec.tty && !spec.yes ? prompt + (spec.success ? success : '') : spec.success ? success : '';
    const err = spec.tty && spec.yes ? preview + '\n' : !spec.success ? cancelled : '';
    const trace = header(spec.tty), prefix = requests.findIndex(request => request.path.endsWith('/collectRules')) + 1;
    for (const [i, request] of requests.entries()) {
      if (request.method === 'PUT') {
        const source = previewEntries(name).find(entry => entry.path === recoveryPaths.draft);
        for (const [j, state] of ['prepared', 'sending'].entries()) {
          const intent = { schemaVersion: 2, resourceId: 'local_collection', resourceName: 'alice/collection', resourceTypeCode: 'CT001', env: 'dev', userId: 7, state,
            baselineFingerprint: fingerprint(f.baseline), baselineAuthFingerprint: fingerprint(f.auth), baselineDirectoryFingerprint: directoryHash(f.published), expectedForm: f.form,
            expectedAuthExcludedItems: f.auth, merge: spec.merge ? 1 : 0, directoryFingerprint: directoryHash(f.draft),
            payloadSha256: fingerprint({ resourceId: 'local_collection', ...previewBody(name) }), sourceDraftSha256: previewHash(Buffer.from(source.bytes, 'base64')), sentAt: at(begin + 150) };
          trace.push({ schemaVersion: 1, event: 'intent-persisted', at: at(begin + 151 + j), bytes: Buffer.from(JSON.stringify(intent)).toString('base64') });
        }
      }
      trace.push({ schemaVersion: 1, event: 'request', method: request.method, path: request.path });
      if (i + 1 === prefix && spec.tty) {
        trace.push(stream(spec.yes ? 'stderr' : 'stdout', spec.yes ? preview + '\n' : prompt));
        if (!spec.success) trace.push(stream('stderr', cancelled));
      }
    }
    if (spec.success) trace.push(stream('stdout', success)); trace.push({ schemaVersion: 1, event: 'finished' });
    const steps = spec.tty ? previewSteps(name) : [];
    const result = spec.tty ? { status: spec.success ? 0 : 1, signal: null, completed: true, stdout: spec.yes ? preview + '\n' + success : out + err,
      stderr: '', completedSteps: steps.length, matchedPrompts: steps.map(step => step.expect) }
      : { status: 0, signal: null, error: null, timedOut: false, stdout: success, stderr: '' };
    const scene = { name, cwd: path.join(root, `work-${name}`), controls: path.join(root, `controls-${name}`), argv: previewCommand(name), steps, childPid: 1300 + index,
      startedAt: at(begin), finishedAt: at(begin + 350), before: previewEntries(name), after: previewEntries(name, true), homeBefore: [], homeAfter: [],
      remoteBefore: previewModel(name), remoteAfter: previewModel(name, true), requests, result, trace: trace.map(JSON.stringify).join('\n') + '\n',
      apparatusErrors: [], evidenceRef: { path: path.join(root, `raw-${name}.json`), sha256: '' } };
    rewrite(scene); observations.scenarios.push(scene);
  }
  const result = evaluateCollectionPublishPreview(observations); assert.equal(result.status, 'PASS', result.reason); validateCollectionPublishPreviewFiles(observations);
  const file = path.join(root, 'outer.json');
  const save = () => { const bytes = JSON.stringify({ schemaVersion: 1, runId: observations.runId, caseId: result.id, assertions: result.assertions, observations }) + '\n';
    writeFileSync(file, bytes); result.evidenceRef = { runId: observations.runId, path: file, sha256: previewHash(bytes) }; };
  save(); return { observations, result, rewrite, save, scene: name => observations.scenarios.find(scene => scene.name === name),
    report: { runId: observations.runId, evidenceDir: root, cliBin, startedAt: observations.startedAt, finishedAt: observations.finishedAt } };
}
const alterTrace = (f, name, run) => { const scene = f.scene(name), rows = scene.trace.trim().split('\n').map(JSON.parse); run(rows);
  scene.trace = rows.map(JSON.stringify).join('\n') + '\n'; f.rewrite(scene); };
test('complete synthetic C07 raw/stream/intent positive traverses the actual protocol, not native approval', async t => {
  const f = fixture(t), validate = await validator(); assert.doesNotThrow(() => validate(f.result, f.report));
});
for (const [name, mutate] of [
  ['physical-missing', f => { const s = f.scene('full-cancel'); s.result.stdout = s.result.stdout.replace('【系统附加值】', '【missing】'); f.rewrite(s); }],
  ['captured-missing', f => alterTrace(f, 'full-cancel', rows => { const event = rows.find(r => r.event === 'stream-write'); event.bytes = Buffer.from('missing').toString('base64'); })],
  ['wrong-channel', f => alterTrace(f, 'tty-yes', rows => { rows.find(r => r.event === 'stream-write' && r.stream === 'stderr').stream = 'stdout'; })],
  ['late-preview', f => alterTrace(f, 'full-confirm', rows => { const i = rows.findIndex(r => r.event === 'stream-write'), [body] = rows.splice(i, 1); rows.splice(rows.length - 1, 0, body); })],
  ['quoted-space', f => { const s = f.scene('key-change-cancel'); s.result.stdout = s.result.stdout.replaceAll('renamed image', 'renamedimage');
    alterTrace(f, s.name, rows => { for (const r of rows.filter(r => r.event === 'stream-write')) r.bytes = Buffer.from(Buffer.from(r.bytes, 'base64').toString('utf8').replaceAll('renamed image', 'renamedimage')).toString('base64'); }); }],
  ['last-page-omitted', f => { const s = f.scene('pages-cancel'); s.result.stdout = s.result.stdout.replaceAll('item_100', 'missing'); f.rewrite(s); }],
  ['false-cancel', f => { const s = f.scene('full-cancel'); s.result.status = 0; f.rewrite(s); }],
  ['signal', f => { const s = f.scene('full-confirm'); s.result.signal = 'SIGTERM'; f.rewrite(s); }],
  ['missing-intent', f => alterTrace(f, 'full-confirm', rows => { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].event === 'intent-persisted') rows.splice(i, 1); })],
  ['wrong-request', f => { const s = f.scene('full-confirm'); s.requests.find(r => r.method === 'PUT').body.authExcludedItems = []; f.rewrite(s); }],
  ['missing-metadata', f => { const s = f.scene('full-confirm'); s.requests.splice(s.requests.findIndex(r => r.path.startsWith('/v2/storages/files/info?')), 1); f.rewrite(s); }],
  ['wrong-field-definition', f => { const s = f.scene('full-confirm'); s.requests.find(r => r.path.startsWith('/v2/resources/attrs/getInfoByKey?')).response.data.format = 7; f.rewrite(s); }],
  ['probe-flags', f => { const s = f.observations.capability, rows = s.trace.trim().split('\n').map(JSON.parse); rows.find(r => r.event === 'preview-capture-ready').stdoutTTY = false; s.trace = rows.map(JSON.stringify).join('\n') + '\n'; f.rewrite(s); }],
  ['missing-raw', f => unlinkSync(f.observations.capability.evidenceRef.path)],
  ['wrong-bin', f => { f.observations.binSha256 = '0'.repeat(64); }],
  ['old-window', f => { f.report.startedAt = new Date().toISOString(); }],
  ['missing-scene', f => { f.observations.scenarios.pop(); }],
  ['home-write', f => { const s = f.scene('full-confirm'); s.homeAfter = [{ path: 'unexpected', kind: 'file', bytes: 'AA==' }]; f.rewrite(s); }],
]) test(`rewritten hashes and claimed PASS cannot hide preview ${name}`, async t => {
  const f = fixture(t), validate = await validator(); assert.doesNotThrow(() => validate(f.result, f.report)); mutate(f); f.save();
  assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
});
test('UTF8 split writes remain lossless, and per-chunk decoding mutation fails', async t => {
  const f = fixture(t);
  alterTrace(f, 'full-confirm', rows => { const i = rows.findIndex(r => r.event === 'stream-write'), event = rows[i], bytes = Buffer.from(event.bytes, 'base64');
    rows.splice(i, 1, { ...event, bytes: bytes.subarray(0, 3).toString('base64') }, { ...event, bytes: bytes.subarray(3).toString('base64') }); });
  assert.equal(evaluateCollectionPublishPreview(f.observations).status, 'PASS');
  const at = new URL('../acceptance/collection-publish-preview-evidence.mjs', import.meta.url);
  const source = readFileSync(at, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, at).href}'`);
  const mutation = source.replace("Buffer.concat(chunks.stdout).toString('utf8')", "chunks.stdout.map(value=>value.toString('utf8')).join('')");
  assert.notEqual(mutation, source); const altered = await import(`data:text/javascript;base64,${Buffer.from(mutation).toString('base64')}`);
  assert.equal(altered.evaluateCollectionPublishPreview(f.observations).status, 'FAIL');
});
test('preview canonicalization preserves quoted spaces/escapes; fixed requests remain inside existing routes', () => {
  assert.equal(previewCanonical('  【字段】\r\n value："hello world" '), '【字段】value："hello world"');
  assert.notEqual(previewCanonical('"renamed image"'), previewCanonical('"renamedimage"'));
  assert.notEqual(previewCanonical('"a\\nb"'), previewCanonical('"ab"'));
  for (const name of previewNames) for (const request of previewRequests(name)) assert.equal(recoveryRouteAllowed(request.method, request.path), true, request.path);
  const before = previewRequests('full-confirm'), altered = previewRequests('full-confirm'); altered.find(r => r.method === 'PUT').body.description = 'mutated';
  assert.deepEqual(previewRequests('full-confirm'), before);
});

test('C07 reads current system metadata before preview and repeats it only after confirmation', () => {
  for (const name of previewNames) {
    const requests = previewRequests(name), count = previewSpec(name).success ? 2 : 1;
    const typeReads = requests.filter(request => request.path === '/v2/resources/types/getInfoByCode?code=CT001');
    const metaReads = requests.filter(request => request.path === '/v2/storages/files/info?resourceTypeCode=CT001');
    const fieldReads = requests.filter(request => request.path === '/v2/resources/attrs/getInfoByKey?key=display_artist');
    assert.equal(typeReads.length, count, name); assert.equal(metaReads.length, count, name); assert.equal(fieldReads.length, count, name);
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
