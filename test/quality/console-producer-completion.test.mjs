/** Synthetic aggregate controls, not product acceptance or actual browser evidence. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectSuiteOutcome } from '../run-final-acceptance.mjs';
import { consoleRoundtripCases } from '../acceptance/console-roundtrip-evidence.mjs';
import { writeSuiteCases } from '../acceptance/protocol.mjs';

const producer = 'verify-console-roundtrip.mjs';
const runId = 'synthetic-completion-run';
const completed = (exitCode) => ({ schemaVersion: 1, producer, runId, state: 'COMPLETED', exitCode });
function fixture(t, states = ['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED']) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-console-completion-')));
  t.after(() => {
    assert.equal(path.dirname(directory), realpathSync(tmpdir()));
    assert.ok(path.basename(directory).startsWith('freelog-console-completion-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const cases = consoleRoundtripCases.map((leaf, index) => ({ id: leaf.id, status: states[index],
    assertions: states[index] === 'PASS' ? leaf.assertionIds.map((id) => ({ id, passed: true, expected: 'synthetic value', actual: 'synthetic value' })) : [],
    ...(states[index] === 'PASS' ? {} : { reason: 'Synthetic business outcome only.' }) }));
  const exitCode = states.includes('FAIL') ? 1 : states.some((state) => state !== 'PASS') ? 3 : 0;
  const file = path.join(directory, `${producer}.json`);
  const report = { schemaVersion: 1, cases, completion: completed(exitCode) };
  const save = () => writeFileSync(file, JSON.stringify(report));
  save();
  return { cases, file, report, save, exitCode };
}

test('normally completed Console producer preserves independent case facts for derived exit 0, 1 and 3', (t) => {
  for (const states of [['PASS', 'FAIL', 'BLOCKED', 'NOT_TESTED'], ['PASS', 'BLOCKED', 'NOT_TESTED', 'PASS'], ['PASS', 'PASS', 'PASS', 'PASS']]) {
    const f = fixture(t, states);
    const result = collectSuiteOutcome(producer, { status: f.exitCode }, f.file, undefined, runId);
    assert.deepEqual(result.cases.map((item) => item.status), states);
    for (const item of result.cases) {
      assert.equal(Object.hasOwn(item, 'process'), false);
      assert.deepEqual(item.producerProcess, { producer, runId,
        process: { exitCode: f.exitCode, signal: null, error: null, timedOut: false },
        evidenceRef: { path: f.file, runId, sha256: createHash('sha256').update(readFileSync(f.file)).digest('hex') } });
    }
  }
});

test('missing or contradictory completion, incomplete cases, and missing parent run cannot preserve any Console PASS', (t) => {
  for (const change of [
    (f) => { delete f.report.completion; },
    (f) => { f.report.completion.state = 'RUNNING'; },
    (f) => { f.report.completion.producer = 'verify-commands.mjs'; },
    (f) => { f.report.completion.runId = 'previous-run'; },
    (f) => { f.report.completion.schemaVersion = 2; },
    (f) => { f.report.completion.exitCode = 0; },
    (f) => { f.report.cases.pop(); },
    (f) => { f.report.cases[3] = f.report.cases[0]; },
  ]) {
    const f = fixture(t); change(f); f.save();
    const result = collectSuiteOutcome(producer, { status: f.exitCode }, f.file, undefined, runId);
    assert.ok(result.cases.every((item) => item.status !== 'PASS'));
    assert.equal(result.outcome.status, 'FAIL');
  }
  const f = fixture(t);
  assert.ok(collectSuiteOutcome(producer, { status: f.exitCode }, f.file).cases.every((item) => item.status !== 'PASS'));
});

test('a complete-looking Console report cannot override crash, signal, spawn error, timeout or a contradictory actual exit', (t) => {
  const f = fixture(t);
  for (const child of [{ status: null }, { status: 1, signal: 'SIGTERM' }, { status: 1, error: new Error('synthetic spawn failure') },
    { status: 1, timedOut: true }, { status: 0 }, { status: 3 }, { status: 2 }]) {
    const result = collectSuiteOutcome(producer, child, f.file, undefined, runId);
    assert.ok(result.cases.every((item) => item.status !== 'PASS'));
    assert.equal(result.outcome.status, 'FAIL');
  }
});

test('only an explicit final write adds completion; an intermediate persist removes a previous final envelope', (t) => {
  const f = fixture(t);
  writeSuiteCases(f.cases, f.file, completed(f.exitCode));
  assert.deepEqual(JSON.parse(readFileSync(f.file, 'utf8')).completion, completed(f.exitCode));
  writeSuiteCases(f.cases, f.file);
  assert.equal(Object.hasOwn(JSON.parse(readFileSync(f.file, 'utf8')), 'completion'), false);
});

test('aggregate announces the run-owned evidence directory before synchronous producers start', () => {
  const source = readFileSync(new URL('../run-final-acceptance.mjs', import.meta.url), 'utf8');
  const created = source.indexOf('mkdirSync(evidenceDir, { recursive: true });');
  const announced = source.indexOf('log(`Run evidence directory: ${evidenceDir}`);');
  const producers = source.indexOf('for (const script of acceptanceScripts())');
  assert.ok(created >= 0 && announced > created && producers > announced);
});
