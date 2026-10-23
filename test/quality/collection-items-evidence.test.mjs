/** Validator controls only; these synthetic observations are never candidate acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { itemScenarioNames, itemFixture, itemExpectedRequests, itemExpectedResult, evaluateCollectionItems } from '../acceptance/collection-items-evidence.mjs';
import { syntheticCollectionItems as synthetic } from './fixtures/collection-items.mjs';

test('the 33 fixed scenarios include actual 100/101 source stimuli and two-page authorization stimuli', () => {
  assert.equal(itemScenarioNames.length, 33);
  assert.equal(itemFixture('limit-100').sources.length, 100);
  assert.equal(itemFixture('limit-101').sources.length, 101);
  assert.equal(itemFixture('auth-pagination').initial.length, 101);
  assert.equal(itemExpectedRequests('auth-pagination').filter((r) => r.path.includes('/items?')).length, 2);
  assert.deepEqual(itemExpectedResult('add-plain'), { status: 0, stdout: '已添加：source_image；未变更：无\n' });
  assert.equal(itemExpectedRequests('contract-missing').some((r) => r.method === 'POST'), false);
  assert.equal(itemExpectedRequests('post-disconnect').filter((r) => r.method === 'POST').length, 1);
});

test('synthetic complete control recomputes, never substitutes for an installed run', () => {
  const result = evaluateCollectionItems(synthetic());
  assert.equal(result.status, 'PASS', result.reason);
  assert.equal(result.assertions.length, 34);
});

for (const [name, change] of [
  ['missing-scenario', (o) => o.scenarios.pop()],
  ['false-summary', (o) => { o.scenarios[0].result.stdout = '已添加：wrong\n'; }],
  ['signal', (o) => { o.scenarios[0].result.signal = 'SIGTERM'; }],
  ['timeout', (o) => { o.scenarios[0].result.timedOut = true; }],
  ['body', (o) => { o.scenarios[0].requests.find((r) => r.method === 'POST').body.isPublish = 1; }],
  ['missing-read', (o) => { o.scenarios[0].requests.splice(0, 1); }],
  ['response', (o) => { o.scenarios[0].requests.find((r) => r.path.includes('/source_image')).response.ret = 1; }],
  ['binary', (o) => { o.scenarios[0].after.find((e) => e.path === 'keep.bin').bytes = Buffer.from([0,255,255]).toString('base64'); }],
  ['draft', (o) => { o.scenarios[0].after = o.scenarios[0].after.filter((e) => !e.path.includes('collection-forms/dev/local_collection.json')); }],
  ['published', (o) => { o.scenarios[0].remoteAfter.published = []; }],
  ['extra-write', (o) => { o.scenarios[0].requests.push(structuredClone(o.scenarios[0].requests.find((r) => r.method === 'POST'))); }],
  ['old-window', (o) => { o.scenarios[0].startedAt = '2020-01-01T00:00:00.000Z'; }],
  ['blocked-transport', (o) => { o.scenarios[0].trace += JSON.stringify({schemaVersion:1,event:'blocked',kind:'fetch'})+'\n'; }],
]) test(`source evaluator rejects ${name} even if report says PASS`, () => {
  const observed = synthetic();
  assert.equal(evaluateCollectionItems(observed).status, 'PASS', 'The unmodified control must pass before a negative mutation.');
  change(observed); observed.status = 'PASS';
  assert.equal(evaluateCollectionItems(observed).status, 'FAIL');
});
