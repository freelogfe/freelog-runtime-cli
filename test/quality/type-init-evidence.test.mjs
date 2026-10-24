/** Synthetic oracle controls only. A fixture PASS is never installed CLI acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typeInitCases, typeInitNames, typeInitTtyNames, typeInitJson, typeInitHash,
  evaluateTypeInit, validateTypeInitFiles } from '../acceptance/type-init-evidence.mjs';

import { typeInitFixture as fixture, typeInitFixtureTrace as trace } from './fixtures/type-init.mjs';

test('finite descriptor fixes 24 meaningful scenes, excluding templates and Ctrl+C', () => {
  assert.equal(typeInitNames.length, 24);
  assert.equal(new Set(typeInitNames).size, 24);
  assert.equal(typeInitCases[0].id, 'PROJECT.TYPE_INIT.INSTALLED_LOCAL');
  assert.equal(typeInitCases[0].assertionIds.length, 25);
  assert.equal(typeInitTtyNames.size, 5);
  assert.ok(!typeInitNames.some(name => /template|ctrl/u.test(name)));
});
test('synthetic complete oracle positive control, never real execution evidence', () => {
  const result = evaluateTypeInit(fixture());
  assert.equal(result.status, 'PASS', result.reason);
  assert.deepEqual(result.assertions.map(assertion => assertion.id), typeInitCases[0].assertionIds);
});
const changes = [
  ['missing scene', value => value.scenarios.pop()],
  ['duplicate scene', value => { value.scenarios[1] = structuredClone(value.scenarios[0]); }],
  ['wrong bin', value => { value.cliBin = path.join(tmpdir(), 'dist/bin/index.js'); }],
  ['wrong package', value => { value.packageName = 'other'; }],
  ['missing terminal capability', value => { value.capability.result.completed = false; }],
  ['wrong capability flags', value => { value.capability.result.stdout = '{"stdin":false,"stdout":true}\n'; }],
  ['wrong argv', value => value.scenarios[0].argv.push('--yes')],
  ['lost first-page row', value => { value.scenarios[0].result.stdout = value.scenarios[0].result.stdout.replace('TYPE_50\t祖父节点 / 父节点 / 叶子50\n', ''); }],
  ['wrong complete error', value => { value.scenarios[7].result.stdout = '{"code":"TYPE_CODE_REQUIRED","message":"wrong"}\n'; }],
  ['signal despite good output', value => { value.scenarios[0].result.signal = 'SIGTERM'; }],
  ['timeout despite good output', value => { value.scenarios[0].result.timedOut = true; }],
  ['truncated terminal', value => { value.scenarios[19].result.completed = false; }],
  ['wrong terminal keys', value => { value.scenarios[23].steps[1].send = '\r'; }],
  ['terminal steps missing', value => { value.scenarios[21].result.completedSteps--; }],
  ['second page missing row', value => { value.scenarios[19].result.stdout = value.scenarios[19].result.stdout.replace('TYPE_51\t祖父节点 / 父节点 / 叶子51', 'TYPE_51'); }],
  ['unrelated local byte changed', value => { value.scenarios[0].after[1].bytes = 'YmFk'; }],
  ['extra secret in identity', value => { value.scenarios[15].after.find(row => row.path === 'project/.freelog/1.json').bytes = Buffer.from('{"token":"synthetic"}').toString('base64'); }],
  ['forgot sequence', value => { value.scenarios[15].after = value.scenarios[15].after.filter(row => row.path !== 'project/.freelog/.sequence'); }],
  ['wrong home side effect', value => value.scenarios[0].homeAfter.push({ path: 'bad', kind: 'directory' })],
  ['wrong HTTP method', value => { value.scenarios[0].requests[0].method = 'POST'; }],
  ['wrong subject query', value => { value.scenarios[0].requests[0].path = value.scenarios[0].requests[0].path.replace('subjectType=1', 'subjectType=4'); }],
  ['extra HTTP request', value => value.scenarios[0].requests.push(structuredClone(value.scenarios[0].requests[0]))],
  ['wrong response retained', value => { value.scenarios[0].requests[0].response.data = []; }],
  ['missing trace', value => { value.scenarios[0].trace = ''; }],
  ['keyring write blocked', value => { value.scenarios[0].trace += '{"schemaVersion":1,"event":"blocked","kind":"keyring-write"}\n'; }],
  ['credential reads missing', value => { value.scenarios[0].trace = value.scenarios[0].trace.replace('{"schemaVersion":1,"event":"keyring-get"}\n', ''); }],
  ['reused workspace', value => { value.scenarios[1].cwd = value.scenarios[0].cwd; }],
  ['wrong timestamp', value => { value.scenarios[0].startedAt = '2020-01-01T00:00:00.000Z'; }],
];
for (const [name, change] of changes) test(`oracle rejects ${name}`, () => {
  const observed = fixture(); change(observed);
  assert.equal(evaluateTypeInit(observed).status, 'FAIL');
});
test('only concurrent search tree/candidate requests commute; detail phase does not', () => {
  const observed = fixture();
  for (const index of [2, 3, 13]) { observed.scenarios[index].requests.reverse(); observed.scenarios[index].trace = trace(observed.scenarios[index].requests); }
  [observed.scenarios[21].requests[1], observed.scenarios[21].requests[2]] = [observed.scenarios[21].requests[2], observed.scenarios[21].requests[1]];
  observed.scenarios[21].trace = trace(observed.scenarios[21].requests);
  assert.equal(evaluateTypeInit(observed).status, 'PASS');
  observed.scenarios[4].requests.reverse(); observed.scenarios[4].trace = trace(observed.scenarios[4].requests);
  assert.equal(evaluateTypeInit(observed).status, 'FAIL');
});
test('all 25 raw files must match exact bytes and digest and stay inside evidence root', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'freelog-s03-oracle-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const observed = fixture(root);
  assert.doesNotThrow(() => validateTypeInitFiles(observed));
  const scene = observed.scenarios[0], file = scene.evidenceRef.path, original = readFileSync(file);
  writeFileSync(file, Buffer.concat([original, Buffer.from(' ')]));
  assert.throws(() => validateTypeInitFiles(observed), /digest\/content/u);
  writeFileSync(file, original); scene.evidenceRef.path = path.join(root, '../outside.json');
  assert.throws(() => validateTypeInitFiles(observed), /Unsafe/u);
});
test('raw validator also binds the exact regular installed-bin bytes', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'freelog-s03-oracle-bin-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const observed = fixture(root);
  assert.doesNotThrow(() => validateTypeInitFiles(observed));
  writeFileSync(observed.cliBin, 'changed synthetic bin');
  assert.throws(() => validateTypeInitFiles(observed), /bin bytes/u);
});
