import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { commandParameterCases } from '../acceptance/command-parameter-cases.mjs';
import { evaluateCommandCase } from '../acceptance/command-parameter-evidence.mjs';
import { versionLifecycleCases } from '../acceptance/version-lifecycle-evidence.mjs';
import { evaluateResourceSyncCase, resourceSyncCases } from '../acceptance/resource-sync-evidence.mjs';
import { resourceSyncFixture } from './fixtures/resource-sync.mjs';

async function traceValidator() {
  const location = new URL('../acceptance/protocol.mjs', import.meta.url);
  const source = readFileSync(location, 'utf8').replace(/from '(\.[^']+)'/gu,
    (_, relative) => `from '${new URL(relative, location).href}'`);
  return (await import(`data:text/javascript;base64,${Buffer.from(`${source}\nexport { validateProductTrace };\n//# sourceURL=protocol-trace-test.mjs`).toString('base64')}`)).validateProductTrace;
}

function fixture(t, result) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-source-case-')));
  t.after(() => {
    assert.equal(path.dirname(directory), realpathSync(tmpdir()));
    assert.ok(path.basename(directory).startsWith('freelog-source-case-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const file = path.join(directory, 'raw.json');
  const bytes = JSON.stringify({ schemaVersion: 1, runId: 'synthetic-source-case', caseId: result.id,
    assertions: result.assertions, observations: result.observations });
  writeFileSync(file, bytes);
  result.evidenceRef = { path: file, runId: 'synthetic-source-case', sha256: createHash('sha256').update(bytes).digest('hex') };
  return { result, report: { runId: 'synthetic-source-case', evidenceDir: directory, cliBin: 'synthetic-installed-bin' } };
}

function validCommand() {
  const leaf = commandParameterCases.find((item) => item.id === 'COMMAND.PARAMETER.ENV_STAGING_REJECTED');
  const entries = [{ path: 'sentinel', kind: 'file', size: 1, sha256: 'a'.repeat(64) }];
  return evaluateCommandCase(leaf, { cliBin: 'synthetic-installed-bin', argv: [...leaf.action.argv], stdin: leaf.action.stdin, before: entries, after: entries,
    result: { status: 1, signal: null, error: null, stdout: JSON.stringify(leaf.expected.errorJson), stderr: '' },
    networkLog: '{"schemaVersion":1,"event":"ready","guard":"local-parameter-no-network-v1"}\n{"schemaVersion":1,"event":"finished","attempts":0}\n' });
}

test('source recomputation accepts a valid control, but cannot trust a rewritten assertion over contradictory raw output', async (t) => {
  const validate = await traceValidator();
  const good = fixture(t, validCommand());
  assert.doesNotThrow(() => validate(good.result, good.report));
  const forged = validCommand();
  forged.observations.result.stdout = '{"code":"AUTH_REQUIRED","message":"wrong command branch"}';
  const bad = fixture(t, forged);
  assert.throws(() => validate(bad.result, bad.report), /SOURCE_CASE_EVIDENCE/u);
});

test('leaf evidence cannot change its own expected values or claim a different installed bin', async (t) => {
  const validate = await traceValidator();
  for (const change of [
    (result) => { result.assertions = result.assertions.map((item) => ({ id: item.id, expected: true, actual: true, passed: true })); },
    (result) => { result.observations.cliBin = 'other-installed-bin'; },
  ]) {
    const result = validCommand(); change(result);
    const bad = fixture(t, result);
    assert.throws(() => validate(bad.result, bad.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('version leaves cannot turn missing actual DTOs into PASS by filling successful assertion booleans', async (t) => {
  const validate = await traceValidator();
  for (const leaf of versionLifecycleCases) {
    const f = fixture(t, { id: leaf.id, status: 'PASS', observations: { cliBin: 'synthetic-installed-bin' },
      assertions: leaf.assertionIds.map((id) => ({ id, passed: true, expected: true, actual: true })) });
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('sync leaves cannot claim PASS with self-written booleans and no SDK, command or byte observations', async (t) => {
  const validate = await traceValidator();
  for (const leaf of resourceSyncCases) {
    const f = fixture(t, { id: leaf.id, status: 'PASS', observations: { cliBin: 'synthetic-installed-bin' },
      assertions: leaf.assertionIds.map((id) => ({ id, passed: true, expected: true, actual: true })) });
    assert.throws(() => validate(f.result, f.report), /SOURCE_CASE_EVIDENCE/u);
  }
});

test('all three registered sync leaves accept matching raw controls, but reject forged stdout, SDK, file or bin observations', async (t) => {
  const validate = await traceValidator();
  for (const leaf of resourceSyncCases) {
    const observed = resourceSyncFixture(leaf.stage);
    observed.cliBin = 'synthetic-installed-bin';
    const result = evaluateResourceSyncCase(leaf.id, observed);
    assert.equal(result.status, 'PASS', result.reason);
    const good = fixture(t, result);
    assert.doesNotThrow(() => validate(good.result, good.report));
    for (const mutate of [
      (item) => { item.observations.result.stdout = 'all successful'; },
      (item) => { item.observations.remoteAfter[0].envelope.data.userId = 99; },
      (item) => { item.observations.after.find((entry) => entry.path === 'sync-a.png').sha256 = '0'.repeat(64); },
      (item) => { item.observations.cliBin = 'other-bin'; },
      (item) => { item.assertions = item.assertions.map(({ id }) => ({ id, passed: true, expected: true, actual: true })); },
    ]) {
      const forged = structuredClone(result); mutate(forged);
      const bad = fixture(t, forged);
      assert.throws(() => validate(bad.result, bad.report), /SOURCE_CASE_EVIDENCE/u);
    }
  }
});
