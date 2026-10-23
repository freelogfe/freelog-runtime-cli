/** Synthetic raw-file controls only, never registered as candidate approval or dev observations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectionLifecycleFixture } from './fixtures/collection-lifecycle.mjs';
import { evaluateCollectionLifecycleCase } from '../acceptance/collection-lifecycle-evidence.mjs';
import { evaluateVersionLifecycle } from '../acceptance/version-lifecycle-evidence.mjs';

const hash = (v) => createHash('sha256').update(v).digest('hex');
async function traceValidator() {
  const location = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace };`).toString('base64')}`)).validateProductTrace;
}
async function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-protocol-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-collection-protocol-'));
    rmSync(root, { recursive: true, force: true });
  });
  const o = await collectionLifecycleFixture();
  const evidenceDir = path.join(root, 'evidence'); mkdirSync(evidenceDir);
  const cliBin = path.join(root, 'synthetic-bin.js'); writeFileSync(cliBin, '// Non-executable synthetic identity\n');
  o.evidenceDir = evidenceDir; o.cliBin = cliBin; o.binSha256 = hash(readFileSync(cliBin));
  const suiteFile = path.join(evidenceDir, 'verify-theme-image-full-lifecycle.mjs.json'), cases = [], artifacts = [];
  for (const kind of ['theme', 'image']) {
    const entry = o.prerequisites[kind], raw = JSON.parse(entry.prerequisite.rawText), source = raw.observations;
    source.cliBin = cliBin; source.cliBinSha256 = o.binSha256;
    const artifact = source.retainedArtifact;
    artifact.copyPath = path.join(evidenceDir, 'lifecycle-artifacts', kind, artifact.sourcePath);
    const file = kind === 'theme' ? path.join(artifact.copyPath, 'index.html') : artifact.copyPath;
    const content = `Synthetic ${kind} artifact, never a real publication.`;
    mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); artifacts.push(file);
    artifact.manifest = [{ path: kind === 'theme' ? 'index.html' : '.', ...(kind === 'theme' ? { kind: 'file' } : {}), size: Buffer.byteLength(content), sha256: hash(content) }];
    const checked = evaluateVersionLifecycle(kind, source); assert.equal(checked.status, 'PASS', checked.reason);
    raw.assertions = checked.assertions;
    const rawText = `${JSON.stringify(raw)}\n`;
    const rawFile = path.join(evidenceDir, `verify-theme-image-full-lifecycle.mjs.json.${checked.id.replaceAll('.', '_')}.evidence.json`);
    const suiteCase = { id: checked.id, status: 'PASS', assertions: checked.assertions, evidenceRef: { runId: o.runId, path: rawFile, sha256: hash(rawText) } };
    entry.prerequisite = { runId: o.runId, suiteFile, rawFile, rawText, rawSha256: hash(rawText), suiteCase };
    writeFileSync(rawFile, rawText); cases.push(suiteCase);
  }
  writeFileSync(suiteFile, JSON.stringify({ schemaVersion: 1, cases }));
  const result = evaluateCollectionLifecycleCase('COLLECTION.LIFECYCLE.FIRST_UPDATE', o);
  assert.equal(result.status, 'PASS', result.reason);
  const file = path.join(evidenceDir, 'collection.evidence.json');
  const save = () => {
    const bytes = `${JSON.stringify({ schemaVersion: 1, runId: o.runId, caseId: result.id, assertions: result.assertions, observations: o })}\n`;
    writeFileSync(file, bytes); result.evidenceRef = { runId: o.runId, path: file, sha256: hash(bytes) };
  };
  save();
  return { o, result, file, artifacts, suiteFile, save, report: { runId: o.runId, evidenceDir, cliBin } };
}

test('a complete synthetic control traverses the real collection raw-file/semantic branch', async (t) => {
  const validate = await traceValidator(), f = await fixture(t);
  assert.doesNotThrow(() => validate(f.result, f.report));
});

test('rewriting hashes and a successful summary cannot hide mutated collection business observations', async (t) => {
  const validate = await traceValidator();
  for (const change of [
    (o) => { delete o.systemMetadata; },
    (o) => { o.systemDefinitions[3].data.contentRule.allowedElements = ['11', '22']; },
    (o) => { o.stages[0].exported.inputs = []; },
    (o) => { o.stages[0].published.version.data.authExcludedItems = [{ resourceId: 'x' }]; },
    (o) => { o.stages[1].published.version.data.customPropertyDescriptors[1].defaultValue = 'wrong'; },
    (o) => { o.stages[1].published.publishedPages[0].data.dataList.reverse(); },
    (o) => { o.stages[0].published.publishedPages[0].data.totalItem = 1; },
    (o) => { o.stages[1].localBefore.draft.utf8 += ' '; },
    (o) => {
      const file = o.stages[1].localBefore.draft, draft = JSON.parse(file.utf8);
      draft.baseline.description = 'A different published baseline';
      draft.publishedBaselineFingerprint = hash(JSON.stringify(draft.baseline));
      file.utf8 = `${JSON.stringify(draft)}\n`; file.size = Buffer.byteLength(file.utf8); file.sha256 = hash(file.utf8);
    },
    (o) => { o.actions[0].argv = ['--help']; },
    (o) => { o.sources[0].auth.createdAt = o.auth.createdAt; o.cleanupActions[0].authBefore = structuredClone(o.sources[0].auth); },
    (o) => { delete o.auth.credentialKey; o.cleanupActions[2].authBefore = structuredClone(o.auth); },
    (o) => { o.cleanupActions[0].authBefore = structuredClone(o.auth); },
    (o) => { o.actions.find((a) => a.label === 'first publish').result.status = 1; },
  ]) {
    const f = await fixture(t); change(f.o); f.save();
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('original prerequisite, artifact, raw and installed bin files must still match, not just embedded copies', async (t) => {
  const validate = await traceValidator();
  for (const change of [
    (f) => rmSync(f.file), (f) => writeFileSync(f.file, '{}'),
    (f) => writeFileSync(f.o.prerequisites.theme.prerequisite.rawFile, '{}'),
    (f) => rmSync(f.o.prerequisites.image.prerequisite.rawFile),
    (f) => writeFileSync(f.suiteFile, JSON.stringify({ schemaVersion: 1, cases: [] })),
    (f) => writeFileSync(f.artifacts[0], 'changed'), (f) => rmSync(f.artifacts[1]),
    (f) => writeFileSync(f.o.cliBin, '// replaced'),
  ]) {
    const f = await fixture(t); change(f);
    assert.throws(() => validate(f.result, f.report), /product evidence|Product evidence|SOURCE_CASE_EVIDENCE/u);
  }
});

test('cross-run/bin and forged boolean assertion sets cannot become candidate PASS', async (t) => {
  const validate = await traceValidator();
  for (const change of [
    (f) => { f.o.runId = 'old-run'; }, (f) => { f.o.binSha256 = 'f'.repeat(64); },
    (f) => { f.o.cliBin = path.resolve('different-bin.js'); },
    (f) => { f.result.assertions = f.result.assertions.map(({ id }) => ({ id, passed: true, expected: true, actual: true })); },
  ]) {
    const f = await fixture(t); change(f); f.save();
    assert.throws(() => validate(f.result, f.report), /Missing run-bound product evidence|SOURCE_CASE_EVIDENCE/u);
  }
});
