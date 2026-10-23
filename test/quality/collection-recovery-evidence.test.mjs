/** Synthetic rejection controls only; none of these observations approve a candidate. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectionRecoveryFixture, changeRecoverySnapshot } from './fixtures/collection-recovery.mjs';
import { evaluateCollectionRecovery, validateCollectionRecoveryFiles, recoveryHash, recoveryPaths } from '../acceptance/collection-recovery-evidence.mjs';

const roots = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'freelog-recovery-synthetic-test-'));
  roots.push(root);
  return collectionRecoveryFixture(root);
}
after(() => {
  for (const root of roots) {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('freelog-recovery-synthetic-test-'));
    rmSync(root, { recursive: true, force: true });
  }
});
const good = fixture();
test('synthetic evidence canonicalizes a temporary directory alias without accepting linked stage files', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'freelog-recovery-synthetic-test-'));
  roots.push(root);
  const alias = `${root}-alias`;
  symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  try {
    const observed = collectionRecoveryFixture(alias);
    assert.equal(observed.evidenceDir, path.join(realpathSync(root), 'raw'));
    validateCollectionRecoveryFiles(observed);
    const first = observed.scenarios[0].stages[0];
    const original = first.evidenceRef.path;
    first.evidenceRef.path = path.join(alias, 'raw', path.basename(original));
    assert.throws(() => validateCollectionRecoveryFiles(observed), /Unsafe\/missing/);
  } finally { rmSync(alias); }
});
const scenario = (observed, name) => observed.scenarios.find((item) => item.name === name);
const stage = (observed, name, action) => scenario(observed, name).stages.find((item) => item.name === action);
function rejects(mutator, id, reason) {
  const observed = structuredClone(good);
  mutator(observed);
  const result = evaluateCollectionRecovery(observed);
  assert.equal(result.status, 'FAIL');
  const assertion = result.assertions.find((item) => item.id === id);
  assert.equal(assertion?.passed, false, JSON.stringify(result.assertions));
  if (reason) assert.match(assertion.reason, reason);
}
function traceWithoutRequests(value, predicate) {
  value.trace = value.trace.trim().split('\n').map(JSON.parse).filter((event) => !(event.event === 'request' && predicate(event))).map(JSON.stringify).join('\n') + '\n';
}
function readonlyMutation(s, file, value) {
  s.stages[2].after = changeRecoverySnapshot(s.stages[2].after, file, value);
  s.stages[3].before = structuredClone(s.stages[2].after);
}

test('synthetic positive preserves all 21 independent scenarios and 84 original stage files', () => {
  const result = evaluateCollectionRecovery(good);
  assert.equal(result.status, 'PASS', result.reason);
  assert.equal(result.assertions.length, 22);
  assert.ok(result.assertions.every((item) => item.actual === true && item.passed));
  validateCollectionRecoveryFiles(good);
  const changed = stage(good, 'changed', 'inspect');
  const committed = stage(good, 'committed', 'inspect');
  assert.equal(changed.remote.version.description, '本次完整更新');
  assert.deepEqual(changed.remote.version.authExcludedItems, committed.remote.version.authExcludedItems);
  assert.equal(stage(good, 'readonly-txn', 'inspect').remote.version.authExcludedItems[0].excludedValue, 'contract_upstream');
});

test('self-consistent missing GET still cannot replace exact required recovery reads', () => {
  rejects((observed) => {
    const repeat = stage(observed, 'committed', 'repeat');
    repeat.requests = [];
    traceWithoutRequests(repeat, () => true);
  }, 'recovery-committed', /GET|read|request/i);
});

test('publish requires both current system configuration reads twice while resume keeps historical reads', () => {
  const metadata = '/v2/storages/files/info?resourceTypeCode=CT001', definition = '/v2/resources/attrs/getInfoByKey?key=display_artist';
  for (const s of good.scenarios) {
    for (const route of [metadata, definition]) {
      assert.equal(s.stages[0].requests.filter(request => request.path === route).length, 2, `${s.name} ${route}`);
      for (const action of s.stages.slice(1)) assert.equal(action.requests.some(request => request.path === route), false, `${s.name} ${action.name}`);
    }
  }
  for (const route of [metadata, definition]) rejects(observed => {
    const publish = stage(observed, 'committed', 'publish');
    publish.requests = publish.requests.filter(request => request.path !== route);
    traceWithoutRequests(publish, event => event.path === route);
  }, 'recovery-committed', /Required GET read set/);
  rejects(observed => {
    const inspect = stage(observed, 'committed', 'inspect');
    inspect.requests.push({ method: 'GET', path: metadata, body: null });
    inspect.trace = inspect.trace.replace('{"schemaVersion":1,"event":"finished"}',
      `${JSON.stringify({ schemaVersion: 1, event: 'request', method: 'GET', path: metadata })}\n{"schemaVersion":1,"event":"finished"}`);
  }, 'recovery-committed', /Required GET read set/);
});

test('unrelated binary bytes remain exact rather than replacement-character equivalent', () => {
  rejects((observed) => {
    const s = scenario(observed, 'committed');
    for (const action of s.stages) for (const position of ['before', 'after']) {
      const bytes = action.name === 'publish' && position === 'before' ? [0xff] : [0xfe];
      action[position] = changeRecoverySnapshot(action[position], 'opaque.bin', Buffer.from(bytes));
    }
  }, 'recovery-committed', /Unrelated local bytes/);
});

for (const [name, mutation] of [
  ['missing scenario', (o) => o.scenarios.pop()],
  ['reordered scenarios', (o) => [o.scenarios[0], o.scenarios[1]] = [o.scenarios[1], o.scenarios[0]]],
  ['wrong run identifier', (o) => o.runId = '../other-run'],
  ['workspace bin fallback', (o) => o.cliBin = path.resolve('packages/cli/dist/bin/index.js')],
  ['invalid package identity', (o) => o.packageName = '@freelog-cli/other'],
  ['missing bin hash', (o) => delete o.binSha256],
  ['invalid hash', (o) => o.binSha256 = 'not-a-hash'],
  ['future run window', (o) => o.finishedAt = '2999-01-01T00:00:00.000Z'],
  ['apparatus failure', (o) => o.apparatusErrors.push('unexpected IO')],
]) test(`rejects ${name}`, () => rejects(mutation, 'installed-run-binding'));

for (const [name, mutation, reason] of [
  ['missing stage', (s) => s.stages.pop(), /Missing or reordered/],
  ['reordered stages', (s) => [s.stages[1], s.stages[2]] = [s.stages[2], s.stages[1]], /Missing or reordered/],
  ['wrong command', (s) => s.stages[2].argv.push('--yes'), /command/],
  ['unknown child process', (s) => s.stages[2].childPid = 0, /process/],
  ['overlapping processes', (s) => s.stages[2].startedAt = s.stages[1].startedAt, /overlap/],
  ['missing original trace', (s) => delete s.stages[2].trace, /original preload trace/],
  ['invented trace boolean', (s) => s.stages[2].trace = JSON.stringify({ schemaVersion: 1, event: 'passed', passed: true }), /Unknown trace/],
  ['unrelated local mutation', (s) => s.stages[2].after = changeRecoverySnapshot(s.stages[2].after, 'keep.txt', 'changed'), /Unrelated local bytes/],
  ['readonly draft mutation', (s) => readonlyMutation(s, recoveryPaths.draft, '{}\n'), /Default resume changed/],
  ['readonly intent removal', (s) => readonlyMutation(s, recoveryPaths.intent, undefined), /Default resume changed/],
  ['client server mismatch', (s) => s.stages[2].requests.pop(), /Client\/server/],
  ['success summary without stages', (s) => { s.stages = []; s.passed = true; }, /Missing or reordered/],
]) test(`rejects ${name}`, () => rejects((o) => mutation(scenario(o, 'committed')), 'recovery-committed', reason));

for (const name of ['prepared', 'sending']) {
  test(`rejects arbitrary ${name} crash and wrong exact fault`, () => {
    rejects((o) => stage(o, name, 'publish').result.status = 1, `recovery-${name}`, /Unexpected process death/);
    rejects((o) => {
      const first = stage(o, name, 'publish');
      first.trace = first.trace.replace(`"kind":"${name}"`, '"kind":"unrelated"');
    }, `recovery-${name}`, /exact fault/);
  });
}

test('rejects repeat PUT even if client trace also claims the replay', () => {
  rejects((o) => {
    const s = stage(o, 'committed', 'repeat');
    const put = structuredClone(stage(o, 'committed', 'publish').requests.find((item) => item.method === 'PUT'));
    s.requests.push(put);
    s.trace = s.trace.replace('{"schemaVersion":1,"event":"finished"}', `${JSON.stringify({ schemaVersion: 1, event: 'request', method: put.method, path: put.path })}\n{"schemaVersion":1,"event":"finished"}`);
  }, 'recovery-committed', /missing or repeated/);
});

for (const name of ['changed', 'broken', 'new-draft', 'rejected']) test(`rejects cleanup deleting ${name} current draft`, () => {
  rejects((o) => {
    const apply = stage(o, name, 'apply');
    apply.after = changeRecoverySnapshot(apply.after, recoveryPaths.draft, undefined);
  }, `recovery-${name}`, /Cleanup deleted a changed draft/);
});

for (const [name, mutation] of [
  ['inputs', (body) => body.inputAttrs = []],
  ['property', (body) => body.customPropertyDescriptors[0].defaultValue = 'wrong'],
  ['optional text', (body) => body.customPropertyDescriptors[1].defaultValue = 'not-empty'],
  ['optional select order', (body) => body.customPropertyDescriptors[2].candidateItems.reverse()],
  ['description', (body) => body.description = 'wrong'],
  ['display', (body) => body.catalogueProperty.collection_view = 'collection_view_list'],
  ['dependency range', (body) => body.dependencies[0].versionRange = '*'],
  ['authorization exclusions', (body) => body.authExcludedItems = []],
  ['directory merge', (body) => body.isMergeCatalogueDraft = 0],
]) test(`rejects corrupted full publish ${name}`, () => rejects((o) => {
  mutation(stage(o, 'committed', 'publish').requests.find((item) => item.method === 'PUT').body);
}, 'recovery-committed', /full update body/));

for (const [name, mutation] of [
  ['form', (remote) => remote.version.description = 'wrong'],
  ['authorization', (remote) => remote.version.authExcludedItems = []],
  ['published directory', (remote) => remote.published[0].itemTitle = 'wrong'],
  ['draft directory', (remote) => remote.draft.pop()],
]) test(`rejects corrupt independent remote ${name}`, () => rejects((o) => mutation(stage(o, 'committed', 'inspect').remote), 'recovery-committed', /Independent platform/));

for (const name of ['invalid-intent', 'payload-mismatch', 'wrong-env', 'wrong-owner', 'wrong-type']) test(`rejects ${name} falsely reported successful`, () => {
  rejects((o) => {
    const inspect = stage(o, name, 'inspect');
    inspect.result.status = 0;
    inspect.result.stdout = JSON.stringify({ schemaVersion: 1, resourceId: 'local_collection', env: 'dev', intentState: 'unknown', verification: 'confirmed', localDraft: 'unchanged', applied: false }) + '\n';
  }, `recovery-${name}`, /diagnosed as success/);
});

test('rejects readonly legacy transaction front-roll', () => {
  rejects((o) => {
    const inspect = stage(o, 'readonly-txn', 'inspect');
    inspect.after = changeRecoverySnapshot(changeRecoverySnapshot(inspect.after, recoveryPaths.txn, undefined), recoveryPaths.sequence, '2\n');
    stage(o, 'readonly-txn', 'apply').before = structuredClone(inspect.after);
  }, 'recovery-readonly-txn', /Default resume changed/);
});

test('stage original changed bytes/hash/content are each rejected', () => {
  const observed = fixture();
  const inspect = stage(observed, 'committed', 'inspect');
  const original = readFileSync(inspect.evidenceRef.path);
  writeFileSync(inspect.evidenceRef.path, Buffer.concat([original, Buffer.from(' ')]));
  assert.throws(() => validateCollectionRecoveryFiles(observed), /evidence changed/);
  const changed = JSON.parse(original.toString('utf8'));
  changed.result.status = 99;
  const bytes = JSON.stringify(changed);
  writeFileSync(inspect.evidenceRef.path, bytes);
  inspect.evidenceRef.sha256 = recoveryHash(bytes);
  assert.throws(() => validateCollectionRecoveryFiles(observed), /evidence changed/);
});

test('missing, duplicate and escaping original stage references are rejected', () => {
  const observed = fixture();
  const inspect = stage(observed, 'committed', 'inspect');
  inspect.evidenceRef = { ...stage(observed, 'committed', 'repeat').evidenceRef };
  assert.throws(() => validateCollectionRecoveryFiles(observed), /Unsafe\/missing/);
  const missing = fixture();
  missing.scenarios[0].stages.pop();
  assert.throws(() => validateCollectionRecoveryFiles(missing), /Missing\/duplicate/);
  const escaped = fixture();
  stage(escaped, 'committed', 'inspect').evidenceRef.path = path.join(escaped.evidenceDir, '..', 'outside.json');
  assert.throws(() => validateCollectionRecoveryFiles(escaped), /Unsafe\/missing/);
});
