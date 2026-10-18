/** Synthetic controls prove fail-closed protocol behavior, never real Console acceptance. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acceptanceCatalog, acceptanceScripts } from '../acceptance/catalog.mjs';
import { deliveryRules } from '../../scripts/release/delivery-contract.mjs';
import { consoleCaptureRequest, consoleRoundtripCases, evaluateConsoleRoundtripCase } from '../acceptance/console-roundtrip-evidence.mjs';
import { evaluateVersionLifecycle } from '../acceptance/version-lifecycle-evidence.mjs';
import { artifactManifest } from '../acceptance/lifecycle-artifact.mjs';
import { consoleRoundtripFixture } from './fixtures/console-roundtrip.mjs';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value)}\n`);
async function traceValidator(symbol = 'validateProductTrace') {
  const location = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu,
    (_, relative) => `from '${new URL(relative, location).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace, validateCaseShape };\n//# sourceURL=console-protocol-test.mjs`).toString('base64')}`))[symbol];
}

async function fixture(t, leaf = consoleRoundtripCases[0]) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-console-protocol-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-console-protocol-'));
    rmSync(root, { recursive: true, force: true });
  });
  const evidenceDir = path.join(root, 'evidence'); mkdirSync(evidenceDir);
  const cliBin = path.join(root, 'synthetic-installed-bin.js');
  writeFileSync(cliBin, '// Synthetic bin bytes, never executable dev evidence.\n');
  const artifactBytes = leaf.resourceKind === 'theme' ? Buffer.from('<html>Synthetic retained theme</html>\n')
    : readFileSync(new URL('../fixtures/media/sample-image.png', import.meta.url));
  let observed = await consoleRoundtripFixture(leaf.resourceKind);
  if (leaf.resourceKind === 'image') {
    // Keep every claimed PNG SHA-1 consistent with this control's real retained bytes.
    const fileSha1 = createHash('sha1').update(artifactBytes).digest('hex');
    observed = JSON.parse(JSON.stringify(observed).replaceAll('2'.repeat(40), fileSha1));
  }
  observed.evidenceDir = evidenceDir; observed.cliBin = cliBin; observed.binSha256 = sha256(readFileSync(cliBin));
  const raw = JSON.parse(observed.prerequisite.rawText);
  raw.observations.cliBin = cliBin; raw.observations.cliBinSha256 = observed.binSha256;
  raw.observations.retainedArtifact.copyPath = path.join(evidenceDir, 'lifecycle-artifacts', leaf.resourceKind,
    leaf.resourceKind === 'theme' ? 'dist' : 'photo-v2.png');
  const retained = raw.observations.retainedArtifact;
  const artifactFile = leaf.resourceKind === 'theme' ? path.join(retained.copyPath, 'index.html') : retained.copyPath;
  mkdirSync(path.dirname(artifactFile), { recursive: true }); writeFileSync(artifactFile, artifactBytes);
  retained.manifest = artifactManifest(retained.copyPath);
  observed.reverse.artifact.manifest = structuredClone(retained.manifest);
  const source = evaluateVersionLifecycle(leaf.resourceKind, raw.observations);
  assert.equal(source.status, 'PASS', source.reason);
  raw.assertions = source.assertions;
  const rawText = `${JSON.stringify(raw)}\n`;
  const rawFile = path.join(evidenceDir, `verify-theme-image-full-lifecycle.mjs.json.${source.id.replaceAll('.', '_')}.evidence.json`);
  const suiteCase = { id: source.id, status: 'PASS', assertions: source.assertions,
    evidenceRef: { runId: observed.runId, path: rawFile, sha256: sha256(rawText) } };
  observed.prerequisite = { runId: observed.runId, suiteFile: path.join(evidenceDir, 'verify-theme-image-full-lifecycle.mjs.json'),
    rawFile, rawSha256: sha256(rawText), rawText, suiteCase };
  writeFileSync(rawFile, rawText);
  writeJson(observed.prerequisite.suiteFile, { schemaVersion: 1, cases: [suiteCase] });
  for (const entry of observed.browser) {
    entry.request = consoleCaptureRequest({ ...observed, stage: entry.request.stage,
      nonce: entry.request.nonce, requestedAt: entry.request.requestedAt });
    for (const key of ['runId', 'nonce', 'cliBin', 'binSha256', 'resourceId', 'resourceKind', 'version', 'stage']) {
      entry.capture[key] = entry.request[key];
    }
    const base = `console-roundtrip-${observed.runId}-${leaf.resourceKind}-${entry.request.stage}-${entry.request.nonce}`;
    entry.requestFile = path.join(evidenceDir, `${base}.request.json`);
    entry.captureFile = path.join(evidenceDir, `${base}.capture.json`);
    writeJson(entry.requestFile, entry.request); writeJson(entry.captureFile, entry.capture);
  }
  const result = evaluateConsoleRoundtripCase(leaf.id, observed);
  assert.equal(result.status, 'PASS', result.reason);
  const report = { runId: observed.runId, evidenceDir, cliBin };
  const suiteFile = path.join(evidenceDir, 'verify-console-roundtrip.mjs.json');
  const save = () => {
    const file = path.join(evidenceDir, 'console-case.evidence.json');
    const bytes = `${JSON.stringify({ schemaVersion: 1, runId: report.runId, caseId: result.id,
      assertions: result.assertions, observations: result.observations })}\n`;
    writeFileSync(file, bytes);
    result.evidenceRef = { path: file, runId: report.runId, sha256: sha256(bytes) };
    const { producerProcess: ignored, ...sourceCase } = result;
    const producer = 'verify-console-roundtrip.mjs';
    writeJson(suiteFile, { schemaVersion: 1,
      cases: consoleRoundtripCases.map((entry) => entry.id === result.id ? sourceCase
        : { id: entry.id, status: 'NOT_TESTED', assertions: [], reason: 'Synthetic unexecuted companion case.' }),
      completion: { schemaVersion: 1, producer, runId: report.runId, state: 'COMPLETED', exitCode: 3 } });
    result.producerProcess = { producer, runId: report.runId,
      process: { exitCode: 3, signal: null, error: null, timedOut: false },
      evidenceRef: { path: suiteFile, runId: report.runId, sha256: sha256(readFileSync(suiteFile)) } };
  };
  save();
  return { root, observed, result, report, save, artifactFile, suiteFile };
}

test('four Console leaves have one registered producer and separate parent-rule trace, while seven broad gaps remain', () => {
  assert.equal(acceptanceCatalog.filter((item) => item.gap).length, 7);
  assert.equal(acceptanceScripts().filter((script) => script === 'verify-console-roundtrip.mjs').length, 1);
  for (const leaf of consoleRoundtripCases) {
    assert.deepEqual(acceptanceCatalog.find((item) => item.id === leaf.id), leaf);
    assert.ok(acceptanceCatalog.find((item) => item.id === leaf.parentRule)?.gap);
    assert.ok(deliveryRules.find((rule) => rule.id === leaf.parentRule)?.caseIds.includes(leaf.id));
    assert.equal(deliveryRules.filter((rule) => rule.caseIds.includes(leaf.id)).length, 1);
  }
});

test('all four source-valid controls pass only with their actual nested files and installed bin bytes', async (t) => {
  const validate = await traceValidator();
  for (const leaf of consoleRoundtripCases) {
    const f = await fixture(t, leaf);
    assert.doesNotThrow(() => validate(f.result, f.report));
  }
});

test('recomputed owner qualification rejects raw metadata override even when raw digest is rewritten', async (t) => {
  const validate = await traceValidator();
  const f = await fixture(t);
  f.observed.ownerIdentity.currentUser.data.userId = '<positive-user-id>';
  f.observed.ownerIdentity.resource.data.userId = '<positive-user-id>';
  f.observed.ownerIdentity.idShape = 'positive-safe-integer';
  f.result.assertions = evaluateConsoleRoundtripCase(f.result.id, f.observed).assertions;
  f.save();
  assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
});

test('a successful Console case retains exact completed producer exit 3 without concealing failed case commands', async (t) => {
  const f = await fixture(t);
  const validate = await traceValidator(); const validateShape = await traceValidator('validateCaseShape');
  assert.equal(f.result.producerProcess.process.exitCode, 3);
  assert.equal(Object.hasOwn(f.result, 'process'), false);
  assert.doesNotThrow(() => validateShape(f.result, consoleRoundtripCases[0]));
  assert.doesNotThrow(() => validate(f.result, f.report));
  f.result.process = { exitCode: 3, signal: null, error: null, timedOut: false };
  assert.throws(() => validateShape(f.result, consoleRoundtripCases[0]), /PASS conceals a failed child process/u);
});

test('producer completion and this case are re-read from the original report, not trusted as metadata or an intermediate persist', async (t) => {
  const validate = await traceValidator();
  const missing = await fixture(t); rmSync(missing.suiteFile);
  assert.throws(() => validate(missing.result, missing.report), /SOURCE_CASE_EVIDENCE/u);
  for (const change of [
    (original) => { delete original.completion; },
    (original) => { original.completion.runId = 'old-run'; },
    (original) => { original.completion.exitCode = 0; },
    (original) => { original.cases.pop(); },
    (original) => { original.cases[0].observations.resourceId = 'f'.repeat(24); },
  ]) {
    const f = await fixture(t); const original = JSON.parse(readFileSync(f.suiteFile, 'utf8'));
    change(original); writeJson(f.suiteFile, original);
    // Even a new matching file digest cannot bless an incomplete/contradictory final report.
    f.result.producerProcess.evidenceRef.sha256 = sha256(readFileSync(f.suiteFile));
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
  for (const change of [
    (f) => { delete f.result.producerProcess; },
    (f) => { f.result.producerProcess.producer = 'verify-commands.mjs'; },
    (f) => { f.result.producerProcess.runId = 'other-run'; },
    (f) => { f.result.producerProcess.process.signal = 'SIGTERM'; },
    (f) => { f.result.producerProcess.process.exitCode = 0; },
    (f) => { f.result.producerProcess.evidenceRef.path = f.observed.prerequisite.suiteFile; },
    (f) => { f.result.producerProcess.evidenceRef.sha256 = '0'.repeat(64); },
  ]) {
    const f = await fixture(t); change(f);
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('embedded lifecycle/browser copies cannot substitute for missing original suite, sidecar, request or capture', async (t) => {
  const validate = await traceValidator();
  for (const target of [(o) => o.prerequisite.suiteFile, (o) => o.prerequisite.rawFile,
    (o) => o.browser[0].requestFile, (o) => o.browser[0].captureFile]) {
    const f = await fixture(t); rmSync(target(f.observed));
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('rewritten original lifecycle/browser files invalidate an unchanged embedded copy', async (t) => {
  const validate = await traceValidator();
  for (const target of [(o) => o.prerequisite.suiteFile, (o) => o.prerequisite.rawFile,
    (o) => o.browser[0].requestFile, (o) => o.browser[0].captureFile]) {
    const f = await fixture(t); const file = target(f.observed);
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(value.cases)) value.cases[0].status = 'FAIL';
    else value.unrecordedChange = 'not the recorded source bytes';
    writeJson(file, value);
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('missing or changed retained artifact bytes cannot be hidden behind an unchanged lifecycle manifest', async (t) => {
  const validate = await traceValidator();
  for (const leaf of consoleRoundtripCases) {
    for (const mutate of [(file) => rmSync(file), (file) => writeFileSync(file, 'Different artifact bytes.\n')]) {
      const f = await fixture(t, leaf); mutate(f.artifactFile);
      assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
    }
  }
});

test('report binding rejects cross-run/directory/bin and rewritten successful assertion booleans', async (t) => {
  const validate = await traceValidator();
  for (const change of [
    (f) => { f.report.runId = 'other-run'; },
    (f) => { f.observed.evidenceDir = f.root; },
    (f) => { f.observed.cliBin = path.join(f.root, 'other-bin.js'); },
    (f) => { f.observed.binSha256 = '0'.repeat(64); },
    (f) => { writeFileSync(f.report.cliBin, '// Different installed candidate bytes.\n'); },
    (f) => { f.result.assertions = f.result.assertions.map(({ id }) => ({ id, passed: true, expected: true, actual: true })); },
  ]) {
    const f = await fixture(t); change(f); f.save();
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('an unknown Console-like business ID still has no semantic validator', async (t) => {
  const validate = await traceValidator(); const f = await fixture(t);
  f.result.id = 'INTEROP.CLI_TO_CONSOLE.UNREGISTERED'; f.save();
  assert.throws(() => validate(f.result, f.report), /PRODUCT_VALIDATOR_UNREGISTERED/u);
});
