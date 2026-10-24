/** Synthetic protocol controls only: no command is executed and no release is approved. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typeInitFixture } from './fixtures/type-init.mjs';
import { evaluateTypeInit, typeInitHash } from '../acceptance/type-init-evidence.mjs';

const location = new URL('../acceptance/protocol.mjs', import.meta.url);
const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu, (_, relative) => `from '${new URL(relative, location).href}'`);
const { validateProductTrace } = await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace };\n//# sourceURL=type-init-protocol-control.mjs`).toString('base64')}`);

for (const variant of ['valid', 'wrong-run', 'wrong-root', 'future-observation', 'wrong-bin-hash', 'missing-raw', 'rewritten-output']) {
  test(`source-fixed S03 trace ${variant}`, t => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-type-init-protocol-')));
    t.after(() => {
      assert.equal(path.dirname(realpathSync(root)), realpathSync(tmpdir()));
      assert.ok(path.basename(root).startsWith('freelog-type-init-protocol-'));
      rmSync(root, { recursive: true });
    });
    const observed = typeInitFixture(root);
    const result = evaluateTypeInit(observed);
    assert.equal(result.status, 'PASS', 'synthetic oracle control, never installed evidence');
    const report = { cliBin: observed.cliBin, runId: observed.runId, evidenceDir: observed.evidenceDir,
      startedAt: observed.startedAt, finishedAt: observed.finishedAt };
    if (variant === 'wrong-run') observed.runId = 'different-synthetic-run';
    if (variant === 'wrong-root') observed.evidenceDir = path.dirname(observed.evidenceDir);
    if (variant === 'future-observation') observed.finishedAt = new Date(Date.parse(report.finishedAt) + 1000).toISOString();
    if (variant === 'wrong-bin-hash') observed.binSha256 = '0'.repeat(64);
    if (variant === 'missing-raw') rmSync(observed.scenarios[0].evidenceRef.path);
    if (variant === 'rewritten-output') {
      const scene = observed.scenarios[0];
      scene.result.stdout = 'forged type output\n';
      const { evidenceRef, ...raw } = scene;
      const bytes = JSON.stringify(raw);
      writeFileSync(evidenceRef.path, bytes);
      evidenceRef.sha256 = typeInitHash(bytes);
    }
    const raw = path.join(root, 'raw-case.json');
    const bytes = JSON.stringify({ schemaVersion: 1, runId: report.runId, caseId: result.id,
      observations: observed, assertions: result.assertions });
    writeFileSync(raw, bytes);
    result.evidenceRef = { path: raw, sha256: typeInitHash(bytes), runId: report.runId };
    if (variant === 'valid') assert.doesNotThrow(() => validateProductTrace(result, report));
    else assert.throws(() => validateProductTrace(result, report), /SOURCE_CASE_EVIDENCE/u);
  });
}
