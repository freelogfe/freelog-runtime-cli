/** Local synthetic controls: exact raw-file rejection, not real-dev PASS evidence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { managementFixture } from './fixtures/resource-management.mjs';
import { evaluateResourceManagementCase, resourceManagementCases } from '../acceptance/resource-management-evidence.mjs';
import { evaluateVersionLifecycle } from '../acceptance/version-lifecycle-evidence.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value)}\n`);
async function traceValidator() {
  const location = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace };`).toString('base64')}`)).validateProductTrace;
}
async function fixture(t, kind = 'theme') {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-management-protocol-')));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-management-protocol-')); rmSync(root, { recursive: true, force: true }); });
  const observed = await managementFixture(kind);
  const evidenceDir = path.join(root, 'evidence'); mkdirSync(evidenceDir);
  const cliBin = path.join(root, 'synthetic-installed-bin.js'); writeFileSync(cliBin, '// Synthetic non-executable bin identity\n');
  observed.evidenceDir = evidenceDir; observed.cliBin = cliBin; observed.binSha256 = hash(readFileSync(cliBin));
  const raw = JSON.parse(observed.prerequisite.rawText), source = raw.observations;
  source.cliBin = cliBin; source.cliBinSha256 = observed.binSha256;
  source.retainedArtifact.copyPath = path.join(evidenceDir, 'lifecycle-artifacts', kind, kind === 'theme' ? 'dist' : 'photo-v2.png');
  const artifactFile = kind === 'theme' ? path.join(source.retainedArtifact.copyPath, 'index.html') : source.retainedArtifact.copyPath;
  mkdirSync(path.dirname(artifactFile), { recursive: true }); writeFileSync(artifactFile, kind === 'theme' ? 'synthetic theme' : 'synthetic PNG');
  const lifecycle = evaluateVersionLifecycle(kind, source); assert.equal(lifecycle.status, 'PASS', lifecycle.reason);
  raw.assertions = lifecycle.assertions;
  const rawText = `${JSON.stringify(raw)}\n`;
  const rawFile = path.join(evidenceDir, `verify-theme-image-full-lifecycle.mjs.json.${lifecycle.id.replaceAll('.', '_')}.evidence.json`);
  const suiteCase = { id: lifecycle.id, status: 'PASS', assertions: lifecycle.assertions, evidenceRef: { runId: observed.runId, path: rawFile, sha256: hash(rawText) } };
  observed.prerequisite = { runId: observed.runId, suiteFile: path.join(evidenceDir, 'verify-theme-image-full-lifecycle.mjs.json'),
    rawFile, rawText, rawSha256: hash(rawText), suiteCase };
  writeFileSync(rawFile, rawText); writeJson(observed.prerequisite.suiteFile, { schemaVersion: 1, cases: [suiteCase] });
  const leaf = resourceManagementCases.find((c) => c.resourceKind === kind);
  const result = evaluateResourceManagementCase(leaf.id, observed); assert.equal(result.status, 'PASS', result.reason);
  const file = path.join(evidenceDir, 'management.evidence.json');
  const save = () => {
    const bytes = `${JSON.stringify({ schemaVersion: 1, runId: observed.runId, caseId: result.id, assertions: result.assertions, observations: result.observations })}\n`;
    writeFileSync(file, bytes); result.evidenceRef = { path: file, sha256: hash(bytes), runId: observed.runId };
  };
  save();
  return { result, observed, report: { runId: observed.runId, evidenceDir, cliBin }, file, artifactFile, save };
}

test('both management leaves require their actual same-run lifecycle files, retained bytes and installed bin', async (t) => {
  const validate = await traceValidator();
  for (const kind of ['theme', 'image']) { const f = await fixture(t, kind); assert.doesNotThrow(() => validate(f.result, f.report)); }
});
test('a self-written successful summary cannot override command, SDK, version or local-byte observations', async (t) => {
  const validate = await traceValidator();
  for (const change of [
    (o) => { o.steps[3].result.stdout = 'all passed'; },
    (o) => { o.steps[10].remoteAfter.data.status = 4; },
    (o) => { o.steps[4].versionsAfter[0].data.dependencies = []; },
    (o) => { o.steps[5].after.find((e) => e.path === 'sentinel.txt').sha256 = '0'.repeat(64); },
    (o) => { o.setupActions[1].argv = ['--help']; },
  ]) { const f = await fixture(t); change(f.observed); f.save(); assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u); }
});
test('missing or changed raw, prerequisites, artifact or bin are rejected even if embedded copies remain', async (t) => {
  const validate = await traceValidator();
  for (const change of [
    (f) => rmSync(f.file), (f) => writeFileSync(f.file, '{}'),
    (f) => rmSync(f.observed.prerequisite.rawFile), (f) => writeFileSync(f.observed.prerequisite.rawFile, '{}'),
    (f) => writeJson(f.observed.prerequisite.suiteFile, { schemaVersion: 1, cases: [] }),
    (f) => writeFileSync(f.artifactFile, 'modified artifact'), (f) => rmSync(f.artifactFile),
    (f) => writeFileSync(f.observed.cliBin, '// different bin'),
  ]) { const f = await fixture(t); change(f); assert.throws(() => validate(f.result, f.report), /product evidence|Product evidence|SOURCE_CASE_EVIDENCE/u); }
});
test('cross-run/bin observations and forged boolean assertions cannot be converted into a management PASS', async (t) => {
  const validate = await traceValidator();
  for (const [change, expected] of [
    [(f) => { f.observed.runId = 'old-run'; }, /Missing run-bound product evidence/u],
    [(f) => { f.observed.cliBin = path.resolve('other-bin.js'); }, /SOURCE_CASE_EVIDENCE/u],
    [(f) => { f.observed.binSha256 = 'f'.repeat(64); }, /SOURCE_CASE_EVIDENCE/u],
    [(f) => { f.result.assertions = f.result.assertions.map(({ id }) => ({ id, passed: true, expected: true, actual: true })); }, /SOURCE_CASE_EVIDENCE/u],
  ]) { const f = await fixture(t); change(f); f.save(); assert.throws(() => validate(f.result, f.report), expected); }
});
