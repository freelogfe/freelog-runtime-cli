import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkNativeCredentialEntry, runNativeCredentialProbe } from '../verify-native-credentials.mjs';

const records = (file) => readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
function fake({ fail, partial = false, wrong = false, observe = () => {} } = {}) {
  const calls = []; let value = null, sets = 0, gets = 0, deletes = 0;
  class Entry {
    constructor(service, account) { observe('construct'); calls.push({ op: 'construct', service, account }); if (fail === 'construct') throw new Error('SYNTHETIC_PRIVATE_ERROR'); }
    setPassword(next) {
      observe('set'); calls.push({ op: 'set' }); sets++;
      if (partial) value = next;
      if (fail === `set${sets}`) throw new Error('SYNTHETIC_PRIVATE_ERROR');
      value = next;
    }
    getPassword() {
      observe('get'); calls.push({ op: 'get' }); gets++;
      if (fail === `get${gets}`) throw new Error('SYNTHETIC_PRIVATE_ERROR');
      return wrong && gets === 1 ? 'synthetic-wrong' : value;
    }
    deleteCredential() {
      observe('delete'); calls.push({ op: 'delete' }); deletes++;
      if (fail === `delete${deletes}`) throw new Error('SYNTHETIC_PRIVATE_ERROR');
      const existed = value !== null; value = null; return existed;
    }
  }
  return { Entry, calls, absent: () => value === null };
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-native-quality-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-native-quality-'));
    rmSync(root, { recursive: true, force: true });
  });
  const pkg = path.join(root, 'node_modules', '@freelog-cli', 'cli2');
  mkdirSync(path.join(pkg, 'dist', 'bin'), { recursive: true });
  const bin = path.join(pkg, 'dist', 'bin', 'index.js');
  writeFileSync(bin, '// synthetic installed entry, never executed\n');
  writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: '@freelog-cli/cli2', version: '0.0.0', bin: { 'freelog-cli': 'dist/bin/index.js' } }));
  return { root, bin, env: { FREELOG_TEST_CLI_BIN: bin }, output: path.join(root, 'report.jsonl') };
}

test('probe only constructs its random isolated key and checks exact save/overwrite/delete readbacks', () => {
  const one = fake(), two = fake();
  const result = checkNativeCredentialEntry(one.Entry); checkNativeCredentialEntry(two.Entry);
  assert.equal(result.status, 'PASS');
  assert.deepEqual(Object.values(result.checks), [true, true, true, true, true]);
  assert.deepEqual(result.cleanup, { attempted: true, deleted: true, absent: true });
  assert.deepEqual(one.calls.map(({ op }) => op), ['construct', 'set', 'get', 'set', 'get', 'delete', 'get', 'delete', 'get']);
  assert.match(one.calls[0].service, /^freelog-cli-native-probe-[0-9a-f-]{36}$/u);
  assert.equal(one.calls[0].account, 'synthetic-probe');
  assert.notEqual(one.calls[0].service, two.calls[0].service);
  assert.equal(JSON.stringify(result).includes('freelog-public-synthetic-probe-'), false);
});
for (const fail of ['set1', 'get1', 'set2', 'get2', 'delete1', 'get3']) {
  test(`${fail} cannot pass and independently cleans its own key`, () => {
    const store = fake({ fail, partial: true }), result = checkNativeCredentialEntry(store.Entry);
    assert.equal(result.status, fail === 'set1' ? 'BLOCKED' : 'FAIL');
    assert.equal(result.cleanup.attempted, true);
    assert.equal(result.cleanup.absent, true); assert.equal(store.absent(), true);
    assert.equal(store.calls.filter(({ op }) => op === 'construct').length, 1);
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_ERROR'), false);
  });
}
test('readback mismatch fails; cleanup failure preserves only the exact probe service', () => {
  assert.equal(checkNativeCredentialEntry(fake({ wrong: true }).Entry).status, 'FAIL');
  for (const fail of ['delete2', 'get4']) {
    const store = fake({ fail }), result = checkNativeCredentialEntry(store.Entry);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.cleanup.service, store.calls[0].service);
  }
  const store = fake({ fail: 'construct' }), result = checkNativeCredentialEntry(store.Entry);
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.cleanup.attempted, false);
  assert.equal(store.calls.length, 1);
});
test('runner binds real installed bin/hash and writes a new isolated value-free report', (t) => {
  const input = fixture(t), store = fake(); let loaded;
  const result = runNativeCredentialProbe({ ...input, loadEntry: (bin) => { loaded = bin; return store.Entry; } });
  assert.equal(result.status, 'PASS'); assert.equal(loaded, input.bin);
  assert.equal(result.binSha256, createHash('sha256').update(readFileSync(input.bin)).digest('hex'));
  assert.deepEqual(records(input.output).at(-1), result);
  assert.equal(Object.hasOwn(result, 'value'), false);
  assert.throws(() => runNativeCredentialProbe({ ...input, loadEntry: () => { throw new Error(); } }));
});
test('invalid/missing/workspace entries block before load; native loader failures remain safe', (t) => {
  const input = fixture(t); let loads = 0, index = 0;
  const other = path.join(input.root, 'not-installed.js'); writeFileSync(other, '');
  for (const env of [{}, { FREELOG_TEST_CLI_BIN: other }, { FREELOG_TEST_CLI_BIN: path.join(input.root, 'missing') }]) {
    const result = runNativeCredentialProbe({ env, output: path.join(input.root, `blocked-${index++}.json`), loadEntry: () => { loads++; return fake().Entry; } });
    assert.equal(result.status, 'BLOCKED'); assert.equal(result.phase, 'installed-bin');
  }
  assert.equal(loads, 0);
  const result = runNativeCredentialProbe({ ...input, loadEntry: () => { throw new Error('SYNTHETIC_PRIVATE_ERROR'); } });
  assert.equal(result.status, 'BLOCKED'); assert.equal(result.phase, 'construct');
  assert.equal(readFileSync(input.output, 'utf8').includes('SYNTHETIC_PRIVATE_ERROR'), false);
  assert.throws(() => runNativeCredentialProbe({ env: input.env, output: 'relative.json' }));
});
test('default createRequire resolves the synthetic package adjacent to the installed bin', (t) => {
  const input = fixture(t), moduleRoot = path.join(input.root, 'node_modules', '@napi-rs', 'keyring');
  mkdirSync(moduleRoot, { recursive: true });
  writeFileSync(path.join(moduleRoot, 'index.js'), `exports.Entry = class {
    constructor() { this.value = null; }
    setPassword(value) { this.value = value; }
    getPassword() { return this.value; }
    deleteCredential() { const present = this.value !== null; this.value = null; return present; }
  };`);
  assert.equal(runNativeCredentialProbe(input).status, 'PASS');
});
test('ownership and each native mutation phase are already in the append-only report', (t) => {
  const input = fixture(t), observed = [];
  const store = fake({ observe: (op) => { observed.push({ op, journal: records(input.output) }); } });
  let beforeLoad;
  const result = runNativeCredentialProbe({ ...input, loadEntry: () => { beforeLoad = records(input.output); return store.Entry; } });
  assert.equal(result.status, 'PASS');
  for (const journal of [beforeLoad, ...observed.map(({ journal }) => journal)]) {
    const ownership = journal.find(({ phase }) => phase === 'ownership');
    assert.equal(ownership.service, result.service); assert.equal(ownership.account, 'synthetic-probe');
    assert.equal(journal.at(-1).status === 'PASS', false);
  }
  assert.deepEqual(observed.filter(({ op }) => op === 'set' || op === 'delete').map(({ journal }) => journal.at(-1).phase),
    ['set', 'overwrite', 'delete', 'cleanup']);
});
for (const phase of ['ownership', 'construct', 'set', 'get', 'overwrite', 'delete', 'cleanup']) {
  test(`persistence failure at ${phase} stops normal native calls and only permits own cleanup`, () => {
    const store = fake(), progress = [];
    const result = checkNativeCredentialEntry(store.Entry, (state) => {
      progress.push(state);
      if (state.phase === phase) throw new Error('SYNTHETIC_PRIVATE_ERROR');
    });
    assert.equal(result.status, 'FAIL'); assert.equal(result.phase, 'report-persist');
    const ops = store.calls.map(({ op }) => op);
    if (['ownership', 'construct'].includes(phase)) assert.deepEqual(ops, []);
    else if (phase === 'set') assert.deepEqual(ops, ['construct']);
    else {
      assert.equal(store.absent(), true); assert.equal(result.cleanup.attempted, true);
      const failed = progress.findIndex((record) => record.phase === phase);
      assert.ok(progress.slice(failed + 1).every((record) => record.phase === 'cleanup'));
      assert.equal(ops.at(-2), 'delete'); assert.equal(ops.at(-1), 'get');
    }
    assert.equal(JSON.stringify(result).includes('SYNTHETIC_PRIVATE_ERROR'), false);
  });
}
