/** Synthetic controls for the actual protocol branch; never installed-candidate approval. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectionRecoveryFixture } from './fixtures/collection-recovery.mjs';
import { evaluateCollectionRecovery } from '../acceptance/collection-recovery-evidence.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
async function traceValidator() {
  const location = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace };`).toString('base64')}`)).validateProductTrace;
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-recovery-protocol-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-recovery-protocol-'));
    rmSync(root, { recursive: true, force: true });
  });
  const observations = collectionRecoveryFixture(root);
  mkdirSync(path.dirname(observations.cliBin), { recursive: true });
  writeFileSync(observations.cliBin, '// Non-executable synthetic bin identity; never installed approval.\n');
  observations.binSha256 = hash(readFileSync(observations.cliBin));
  const result = evaluateCollectionRecovery(observations);
  assert.equal(result.status, 'PASS', result.reason);
  const file = path.join(observations.evidenceDir, 'synthetic-recovery.evidence.json');
  const save = () => {
    const bytes = `${JSON.stringify({ schemaVersion: 1, runId: observations.runId, caseId: result.id, assertions: result.assertions, observations })}\n`;
    writeFileSync(file, bytes);
    result.evidenceRef = { runId: observations.runId, path: file, sha256: hash(bytes) };
  };
  const rewriteStage = (stage) => {
    const { evidenceRef, ...original } = stage;
    const bytes = `${JSON.stringify(original)}\n`;
    writeFileSync(evidenceRef.path, bytes); evidenceRef.sha256 = hash(bytes);
  };
  save();
  return { observations, result, file, save, rewriteStage,
    report: { runId: observations.runId, evidenceDir: observations.evidenceDir, cliBin: observations.cliBin,
      startedAt: observations.startedAt, finishedAt: observations.finishedAt } };
}

test('complete synthetic recovery observations traverse the actual raw-file/semantic protocol branch', async (t) => {
  const validate = await traceValidator(), f = fixture(t);
  assert.doesNotThrow(() => validate(f.result, f.report));
});

test('rewritten raw hashes and summary PASS cannot hide recovery business corruption', async (t) => {
  const validate = await traceValidator();
  for (const mutate of [
    (f) => { const stage = f.observations.scenarios[3].stages[3]; stage.result.stdout = '{}\n'; f.rewriteStage(stage); },
    (f) => { const stage = f.observations.scenarios[3].stages[0]; stage.requests.find((entry) => entry.method === 'PUT').body.description = 'forged'; f.rewriteStage(stage); },
    (f) => { const stage = f.observations.scenarios[4].stages[3]; stage.after = stage.after.filter((entry) => !entry.path.endsWith('/dev/local_collection.json')); f.rewriteStage(stage); },
    (f) => { f.observations.scenarios[0].stages.pop(); },
    (f) => { const stage = f.observations.scenarios[3].stages[1]; stage.result.signal = 'SIGKILL'; f.rewriteStage(stage); },
  ]) {
    const f = fixture(t); mutate(f); f.save();
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('original recovery stage, outer evidence and installed bin files must remain unchanged', async (t) => {
  const validate = await traceValidator();
  for (const mutate of [
    (f) => rmSync(f.file),
    (f) => writeFileSync(f.file, '{}'),
    (f) => rmSync(f.observations.scenarios[0].stages[0].evidenceRef.path),
    (f) => writeFileSync(f.observations.scenarios[20].stages[3].evidenceRef.path, '{}'),
    (f) => writeFileSync(f.observations.cliBin, '// replaced synthetic identity\n'),
  ]) {
    const f = fixture(t); mutate(f);
    assert.throws(() => validate(f.result, f.report), /product evidence|Product evidence|SOURCE_CASE_EVIDENCE/u);
  }
});

test('cross-run/bin and non-source assertion sets cannot become recovery approval', async (t) => {
  const validate = await traceValidator();
  for (const mutate of [
    (f) => { f.observations.runId = 'other-run'; },
    (f) => { f.observations.binSha256 = 'f'.repeat(64); },
    (f) => { f.observations.cliBin = path.resolve('different-bin.js'); },
    (f) => { f.result.assertions = f.result.assertions.map(({ id }) => ({ id, passed: true, expected: true, actual: true })); f.result.assertions[0].id = 'forged-source-obligation'; },
    (f) => { f.result.assertions = [{ id: 'all-tests-passed', passed: true, expected: true, actual: true }]; },
  ]) {
    const f = fixture(t); mutate(f); f.save();
    assert.throws(() => validate(f.result, f.report), /Missing run-bound product evidence|SOURCE_CASE_EVIDENCE/u);
  }
});

test('old or unbounded recovery stages cannot be rebound to a fresh aggregate window', async (t) => {
  const validate = await traceValidator();
  for (const mutate of [
    (f) => { f.report.startedAt = '2026-10-20T00:00:00.000Z'; f.report.finishedAt = '2026-10-20T00:10:00.000Z'; },
    (f) => { delete f.report.startedAt; },
    (f) => { f.report.finishedAt = 'invalid'; },
    (f) => { f.report.finishedAt = f.observations.startedAt; },
  ]) {
    const f = fixture(t); mutate(f);
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});
