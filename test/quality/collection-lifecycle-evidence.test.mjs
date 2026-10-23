import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { collectionLifecycleFixture } from './fixtures/collection-lifecycle.mjs';
import { collectionLifecycleCases, evaluateCollectionLifecycleCase, collectionCataloguePages, collectionLoginSelectorValid, collectionCommandOutput, collectionLifecycleSystemConfigurationValid } from '../acceptance/collection-lifecycle-evidence.mjs';
import { cleanupWorkspace } from '../acceptance/cleanup.mjs';
const id = 'COLLECTION.LIFECYCLE.FIRST_UPDATE';
const digest = (v) => createHash('sha256').update(v).digest('hex');
function rewriteDraft(o, mutate) {
  const bytes = o.stages[1].localBefore.draft, value = JSON.parse(bytes.utf8); mutate(value);
  bytes.utf8 = `${JSON.stringify(value)}\n`; bytes.size = Buffer.byteLength(bytes.utf8); bytes.sha256 = digest(bytes.utf8);
}

test('first pull exposes exactly the six current fixed writable fields with explicit blank values', async () => {
  const o = await collectionLifecycleFixture();
  const expected = ['display_artist', 'label_name', 'lyric_language', 'release_type', 'music_genre', 'release_date'].map((key) => ({ key, value: '' }));
  assert.deepEqual(o.stages[0].exported.inputs, expected);
  assert.deepEqual(JSON.parse(o.stages[0].localBefore.draft.utf8).baseline.inputs, [], 'Unpublished baseline is an observed absence, independent of current writable fields.');
  const result = evaluateCollectionLifecycleCase(id, o);
  assert.equal(result.assertions.find((a) => a.id === 'full-form-stages').passed, true);
  assert.equal(result.status, 'PASS');
});

test('first and update inputs retain the independently fixed six values for the observed formats', async () => {
  const o = await collectionLifecycleFixture();
  assert.deepEqual(o.stages.map((stage) => stage.form.inputs), [
    [{ key: 'display_artist', value: '首发演出者' }, { key: 'label_name', value: '首发厂牌' }, { key: 'lyric_language', value: 'zh' },
      { key: 'release_type', value: '11' }, { key: 'music_genre', value: '2026-10-23 09:00:00' }, { key: 'release_date', value: '2026-10-23' }],
    [{ key: 'display_artist', value: '更新演出者' }, { key: 'label_name', value: '更新厂牌' }, { key: 'lyric_language', value: 'en' },
      { key: 'release_type', value: '22' }, { key: 'music_genre', value: '2026-10-24 10:00:00' }, { key: 'release_date', value: '2026-10-24' }],
  ]);
});

test('each of the six current field formats is independently required by the fixed scenario', async () => {
  for (let index = 0; index < 6; index += 1) {
    const o = await collectionLifecycleFixture(); o.systemDefinitions[index].data.format = 9;
    assert.equal(collectionLifecycleSystemConfigurationValid(o), false);
    assert.equal(evaluateCollectionLifecycleCase(id, o).assertions.find((a) => a.id === 'owner-and-type').passed, false);
  }
});

test('full type namespace may contain seventeen fields while the writable metadata set stays exactly six', async () => {
  const o = await collectionLifecycleFixture();
  for (let index = 0; index < 10; index += 1) {
    const field = { key: `source_${index}`, name: `来源${index}` };
    o.typeInfo.data.attrs.push(field);
    o.systemMetadata.data.metaInfoArray.push({ ...field, insertMode: 1, valueDisplay: '只读事实' });
  }
  o.systemDefinitions.forEach((response, index) => { if (index !== 3) response.data.contentRule = {}; });
  assert.equal(collectionLifecycleSystemConfigurationValid(o), true);
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'PASS');
});

test('metadata display values do not become first-pull inherited values or rewrite the empty published baseline', async () => {
  const o = await collectionLifecycleFixture();
  o.systemMetadata.data.metaInfoArray.forEach((row) => { row.valueDisplay = '平台当前描述值'; });
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'PASS');
});

for (const [name, mutate] of [
  ['missing metadata', (o) => { delete o.systemMetadata; }],
  ['failed metadata', (o) => { o.systemMetadata.ret = 1; }],
  ['string success metadata', (o) => { o.systemMetadata.errCode = '0'; }],
  ['missing metadata array', (o) => { delete o.systemMetadata.data.metaInfoArray; }],
  ['missing writable metadata field', (o) => { o.systemMetadata.data.metaInfoArray.pop(); }],
  ['extra writable metadata field', (o) => { o.systemMetadata.data.metaInfoArray.push({ key: 'unexpected', name: '额外系统字段', insertMode: 2 }); }],
  ['duplicate metadata field', (o) => { o.systemMetadata.data.metaInfoArray.push(structuredClone(o.systemMetadata.data.metaInfoArray[0])); }],
  ['string insert mode', (o) => { o.systemMetadata.data.metaInfoArray[0].insertMode = '2'; }],
  ['unknown insert mode', (o) => { o.systemMetadata.data.metaInfoArray[0].insertMode = 3; }],
  ['mismatched metadata name', (o) => { o.systemMetadata.data.metaInfoArray[0].name = '错误系统名'; }],
  ['malformed metadata value', (o) => { o.systemMetadata.data.metaInfoArray[0].valueDisplay = null; }],
  ['system name collision', (o) => { o.typeInfo.data.attrs.push({ key: 'other', name: '验收文本' }); }],
  ['missing definitions', (o) => { delete o.systemDefinitions; }],
  ['missing one definition', (o) => { o.systemDefinitions.pop(); }],
  ['extra definition', (o) => { o.systemDefinitions.push(structuredClone(o.systemDefinitions[0])); }],
  ['failed definition', (o) => { o.systemDefinitions[0].errCode = 1; }],
  ['string success definition', (o) => { o.systemDefinitions[0].ret = '0'; }],
  ['wrong definition key', (o) => { o.systemDefinitions[0].data.key = 'other'; }],
  ['string definition format', (o) => { o.systemDefinitions[0].data.format = '6'; }],
  ['incompatible definition format', (o) => { o.systemDefinitions[0].data.format = 8; }],
  ['missing enum rule', (o) => { o.systemDefinitions[3].data.contentRule = null; }],
  ['malformed content rule', (o) => { o.systemDefinitions[0].data.contentRule = []; }],
  ['unexpected nonempty text rule', (o) => { o.systemDefinitions[0].data.contentRule = { maxLength: 140 }; }],
  ['unexpected nonempty date rule', (o) => { o.systemDefinitions[5].data.contentRule = { startDate: '2026-01-01' }; }],
  ['enum value drift', (o) => { o.systemDefinitions[3].data.contentRule.allowedElements[0] = 'other'; }],
  ['enum order drift', (o) => { o.systemDefinitions[3].data.contentRule.allowedElements.reverse(); }],
  ['extra enum rule', (o) => { o.systemDefinitions[3].data.contentRule.unexpected = true; }],
  ['missing configuration read receipt', (o) => { delete o.systemConfiguration; }],
  ['wrong configuration type', (o) => { o.systemConfiguration.resourceTypeCode = 'OTHER'; }],
  ['configuration after first write', (o) => { o.systemConfiguration.finishedAt = '2026-10-19T00:01:00.000Z'; }],
]) test(`current system configuration evidence rejects ${name}`, async () => {
  const o = await collectionLifecycleFixture(); mutate(o);
  const result = evaluateCollectionLifecycleCase(id, o);
  assert.equal(result.assertions.find((a) => a.id === 'owner-and-type').passed, false);
  assert.equal(result.status, 'FAIL');
});

for (const [name, mutate] of [
  ['empty legacy inputs', (o) => { o.stages[0].exported.inputs = []; }],
  ['missing writable key', (o) => { o.stages[0].exported.inputs.pop(); }],
  ['extra writable key', (o) => { o.stages[0].exported.inputs.push({ key: 'other', value: '' }); }],
  ['inherited metadata value', (o) => { o.stages[0].exported.inputs[0].value = '不是首次空值'; }],
]) test(`first pull rejects ${name}`, async () => {
  const o = await collectionLifecycleFixture(); mutate(o);
  assert.equal(evaluateCollectionLifecycleCase(id, o).assertions.find((a) => a.id === 'full-form-stages').passed, false);
});

test('first baseline fingerprint cannot incorporate current writable metadata even with rewritten local hashes', async () => {
  const o = await collectionLifecycleFixture(), bytes = o.stages[0].localBefore.draft, value = JSON.parse(bytes.utf8);
  value.baseline.inputs = structuredClone(o.stages[0].exported.inputs);
  value.publishedBaselineFingerprint = digest(JSON.stringify(value.baseline));
  bytes.utf8 = `${JSON.stringify(value)}\n`; bytes.size = Buffer.byteLength(bytes.utf8); bytes.sha256 = digest(bytes.utf8);
  assert.equal(evaluateCollectionLifecycleCase(id, o).assertions.find((a) => a.id === 'local-state').passed, false);
});

async function systemReadControl(o, mutate = () => {}) {
  const { readCollectionSystemConfiguration } = await import('../verify-collection-lifecycle.mjs');
  const observed = { typeInfo: structuredClone(o.typeInfo) }, calls = [];
  const raw = { metadata: structuredClone(o.systemMetadata), definitions: structuredClone(o.systemDefinitions) };
  mutate(raw);
  const sdk = { FServiceAPI: { Storage: { filesInfo(params) { calls.push(['Storage.filesInfo', params]); return raw.metadata; } },
    Resource: { getAttrsInfoByKey(params) { calls.push(['Resource.getAttrsInfoByKey', params]); return raw.definitions[['display_artist', 'label_name', 'lyric_language', 'release_type', 'music_genre', 'release_date'].indexOf(params.key)]; } } } };
  return { observed, calls, read: () => readCollectionSystemConfiguration(sdk, (action) => action(), observed) };
}

test('producer independently reads and projects current metadata and six definitions with fixed GET arguments', async () => {
  const control = await systemReadControl(await collectionLifecycleFixture(), (raw) => {
    raw.metadata.data.ignored = 'unrelated'; raw.metadata.data.metaInfoArray[0].unrelated = 'unrelated';
    raw.definitions[0].data.name = 'unrelated';
    delete raw.definitions[0].data.contentRule;
  });
  await control.read();
  assert.deepEqual(control.calls, [['Storage.filesInfo', { resourceTypeCode: 'RT004005' }],
    ['Resource.getAttrsInfoByKey', { key: 'display_artist' }], ['Resource.getAttrsInfoByKey', { key: 'label_name' }],
    ['Resource.getAttrsInfoByKey', { key: 'lyric_language' }], ['Resource.getAttrsInfoByKey', { key: 'release_type' }],
    ['Resource.getAttrsInfoByKey', { key: 'music_genre' }], ['Resource.getAttrsInfoByKey', { key: 'release_date' }]]);
  assert.deepEqual(control.observed.systemMetadata, (await collectionLifecycleFixture()).systemMetadata);
  assert.deepEqual(control.observed.systemDefinitions, (await collectionLifecycleFixture()).systemDefinitions);
  assert.equal(collectionLifecycleSystemConfigurationValid(control.observed), true);
  assert.ok(Date.parse(control.observed.systemConfiguration.finishedAt) >= Date.parse(control.observed.systemConfiguration.startedAt));
});

for (const [name, mutate] of [
  ['failed metadata', (raw) => { raw.metadata.ret = 1; }],
  ['metadata request exception', (raw) => { Object.defineProperty(raw, 'metadata', { get() { throw new Error('synthetic-transport-secret'); } }); }],
  ['missing metadata', (raw) => { raw.metadata.data = {}; }],
  ['extra writable metadata', (raw) => { raw.metadata.data.metaInfoArray.push({ key: 'other', name: '其他', insertMode: 2 }); }],
  ['failed definition', (raw) => { raw.definitions[0].errCode = 1; }],
  ['missing definition', (raw) => { raw.definitions[1] = null; }],
  ['wrong definition format', (raw) => { raw.definitions[0].data.format = 8; }],
  ['unexpected text rule', (raw) => { raw.definitions[0].data.contentRule = { maxLength: 1 }; }],
  ['enum drift', (raw) => { raw.definitions[3].data.contentRule.allowedElements = ['11', '22']; }],
]) test(`producer blocks ${name} before allowing its successor`, async () => {
  const control = await systemReadControl(await collectionLifecycleFixture(), mutate);
  let successorCalls = 0;
  await assert.rejects(async () => { await control.read(); successorCalls += 1; }, (error) => error.status === 'BLOCKED');
  assert.equal(successorCalls, 0);
  assert.ok(control.observed.systemConfiguration.finishedAt);
  assert.equal(control.calls.every(([method]) => ['Storage.filesInfo', 'Resource.getAttrsInfoByKey'].includes(method)), true);
});

test('move output uses the complete independently ordered four-column table, not silence', async () => {
  const o = await collectionLifecycleFixture(), [theme, image] = o.sources.map((s) => s.baseline.data);
  const expected = `item-image\t${image.resourceId}\t图片单品\t${image.resourceName}\nitem-theme\t${theme.resourceId}\t更新单品标题\t${theme.resourceName}\n`;
  assert.equal(o.actions.find((a) => a.label === 'item move').result.stdout, expected);
  assert.equal(collectionCommandOutput(o, 'item move'), expected);
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'PASS');
});

test('move output safely escapes display controls without changing rows or business values', async () => {
  const o = await collectionLifecycleFixture();
  o.sources[1].baseline.data.resourceTitle = '图片\tA\nB\u001b\u200d\u2028\u2029';
  const [theme, image] = o.sources.map((s) => s.baseline.data);
  assert.equal(collectionCommandOutput(o, 'item move'), `item-image\t${image.resourceId}\t图片\\u0009A\\u000aB\\u001b\\u200d\\u2028\\u2029\t${image.resourceName}\nitem-theme\t${theme.resourceId}\t更新单品标题\t${theme.resourceName}\n`);
  assert.equal(o.sources[1].baseline.data.resourceTitle, '图片\tA\nB\u001b\u200d\u2028\u2029');
});

for (const [name, mutate] of [
  ['silent move', () => ''],
  ['truncated move', (stdout) => `${stdout.split('\n')[0]}\n`],
  ['reversed move', (stdout) => `${stdout.trimEnd().split('\n').reverse().join('\n')}\n`],
  ['wrong renamed title', (stdout) => stdout.replace('更新单品标题', '旧标题')],
  ['wrong source name', (stdout) => stdout.replace('freelog-synthetic/', 'other-owner/')],
  ['extra move output', (stdout) => `${stdout}unexpected\n`],
]) test(`move command evidence rejects ${name}`, async () => {
  const o = await collectionLifecycleFixture(), action = o.actions.find((a) => a.label === 'item move');
  action.result.stdout = mutate(action.result.stdout);
  assert.equal(evaluateCollectionLifecycleCase(id, o).assertions.find((a) => a.id === 'commands-and-processes').passed, false);
});

// Field names come from ARCH01 §2.2 and the retained 2026-10-19 real login selector;
// only account metadata/time are synthetic. Do not derive this shape from the evaluator.
function withRealSelectorShape(o) {
  for (const [index, target] of [...o.sources, o].entries()) {
    const label = index < 2 ? `${target.kind} login` : 'collection login';
    const createdAt = `2026-10-19T00:00:0${index + 1}.000Z`;
    target.auth = { schemaVersion: 1, credentialKey: 'v1/dev/12345', env: 'dev', userId: 12345, username: 'freelog-synthetic', createdAt };
    const action = o.actions.find((a) => a.label === label);
    action.startedAt = createdAt; action.finishedAt = createdAt.replace('.000Z', '.500Z');
    o.cleanupActions[index].authBefore = structuredClone(target.auth);
  }
  return o;
}

test('formal six-field selectors and independent workspace timestamps are accepted', async () => {
  const o = withRealSelectorShape(await collectionLifecycleFixture());
  assert.equal(new Set([...o.sources.map((s) => s.auth.createdAt), o.auth.createdAt]).size, 3);
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'PASS');
});

test('obsolete four-field selector summaries cannot pass full collection acceptance', async () => {
  const o = withRealSelectorShape(await collectionLifecycleFixture());
  for (const target of [...o.sources, o]) { delete target.auth.credentialKey; delete target.auth.createdAt; }
  for (const entry of o.cleanupActions) { delete entry.authBefore.credentialKey; delete entry.authBefore.createdAt; }
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'FAIL');
});

for (const [name, change] of [
  ['missing credential key', (selector) => { delete selector.credentialKey; }],
  ['missing createdAt', (selector) => { delete selector.createdAt; }],
  ['unknown field', (selector) => { selector.extra = true; }],
  ['secret field', (selector) => { selector.token = 'synthetic-secret-only'; }],
  ['wrong schema', (selector) => { selector.schemaVersion = 2; }],
  ['wrong env', (selector) => { selector.env = 'prod'; }],
  ['wrong owner', (selector) => { selector.userId += 1; }],
  ['wrong username', (selector) => { selector.username = 'freelog-another'; }],
  ['wrong credential reference', (selector) => { selector.credentialKey = 'v1/prod/12345'; }],
  ['invalid time', (selector) => { selector.createdAt = 'not-a-time'; }],
  ['noncanonical time', (selector) => { selector.createdAt = selector.createdAt.replace('T', ' '); }],
  ['before login', (selector) => { selector.createdAt = '2026-10-19T00:00:00.000Z'; }],
  ['after login', (selector) => { selector.createdAt = '2026-10-19T00:00:04.000Z'; }],
]) test(`all three workspace selectors reject ${name}, even with matching cleanup receipts`, async () => {
  for (const index of [0, 1, 2]) {
    const o = await collectionLifecycleFixture(), target = [...o.sources, o][index];
    change(target.auth); o.cleanupActions[index].authBefore = structuredClone(target.auth);
    const checked = evaluateCollectionLifecycleCase(id, o);
    assert.equal(checked.assertions.find((a) => a.id === 'owner-and-type').passed, false);
    assert.equal(checked.status, 'FAIL');
  }
});

for (const [name, change] of [
  ['absent start', (action) => { delete action.startedAt; }],
  ['reversed window', (action) => { action.finishedAt = '2026-10-19T00:00:00.000Z'; }],
  ['before run', (action) => { action.startedAt = '2026-10-18T23:59:59.000Z'; }],
  ['after deadline', (action) => { action.finishedAt = '2026-10-19T00:21:00.000Z'; }],
  ['failed login', (action) => { action.result.status = 1; }],
]) test(`selector login window rejects ${name}`, async () => {
  const o = await collectionLifecycleFixture(), action = o.actions.find((a) => a.label === 'theme login');
  change(action);
  assert.equal(collectionLoginSelectorValid(o.sources[0].auth, o.currentUser.data, action, o), false);
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'FAIL');
});

test('cleanup cannot substitute another workspace selector with the same owner', async () => {
  const o = await collectionLifecycleFixture();
  o.cleanupActions[0].authBefore = structuredClone(o.auth);
  assert.equal(evaluateCollectionLifecycleCase(id, o).assertions.find((a) => a.id === 'owned-cleanup').passed, false);
  o.sources[0].auth = structuredClone(o.auth);
  assert.equal(evaluateCollectionLifecycleCase(id, o).assertions.find((a) => a.id === 'owner-and-type').passed, false);
});

test('producer login reader accepts the actual six-field shape without SDK or keyring access', async (t) => {
  const { readCollectionLoginSelector } = await import('../verify-collection-lifecycle.mjs');
  const work = mkdtempSync(path.join(tmpdir(), 'freelog-collection-lifecycle-'));
  t.after(() => cleanupWorkspace(work, { success: true, prefixes: ['freelog-collection-lifecycle-'], log() {} }));
  const authFile = path.join(work, '.freelog/auth'), o = await collectionLifecycleFixture();
  mkdirSync(path.dirname(authFile));
  const action = o.actions.find((a) => a.label === 'theme login'), selector = o.sources[0].auth;
  writeFileSync(authFile, JSON.stringify(selector));
  assert.deepEqual(readCollectionLoginSelector(work, o.currentUser.data, action, o), selector);
  for (const bad of [{ ...selector, token: 'synthetic-secret-only' }, { ...selector, credentialKey: 'v1/dev/1' }, { ...selector, createdAt: o.auth.createdAt }]) {
    writeFileSync(authFile, JSON.stringify(bad));
    assert.throws(() => readCollectionLoginSelector(work, o.currentUser.data, action, o), (error) => {
      assert.equal(error.message, 'CLI login selector differs from the account and login window.');
      assert.doesNotMatch(error.message, /synthetic-secret/u); return true;
    });
  }
  writeFileSync(authFile, '{broken-private-json');
  assert.throws(() => readCollectionLoginSelector(work, o.currentUser.data, action, o), /私有凭据读取或解析失败；内容不进入报告/u);
});
test('readonly missing-intent rejection explicitly selects machine-readable errors', async () => {
  const o = await collectionLifecycleFixture();
  assert.ok(o.actions.find((a) => a.label === 'resume absent').argv.includes('--json'));
});
test('synthetic complete collection control is accepted, not a real-dev PASS', async () => {
  const result = evaluateCollectionLifecycleCase(id, await collectionLifecycleFixture());
  assert.equal(result.status, 'PASS', JSON.stringify(result.assertions.filter((a) => !a.passed)));
  assert.equal(collectionLifecycleCases[0].parentRule, 'COLLECTION.MANAGEMENT_MATRIX');
});
for (const [name, mutate] of [
  ['run', (o) => { o.runId = 'old-run'; }], ['bin', (o) => { o.binSha256 = '0'.repeat(64); }], ['time', (o) => { o.finishedAt = o.startedAt.replace('00:00:', '01:00:'); }],
  ['source raw', (o) => { o.prerequisites.image.prerequisite.rawText = '{}'; }], ['owner', (o) => { o.currentUser.data.userId = 1; }],
  ['type options', (o) => { o.typeInfo.data.resourceConfig.supportOptionalConfig = 1; }], ['missing action', (o) => { o.actions.pop(); }],
  ['missing type attribute', (o) => { o.typeInfo.data.attrs.pop(); }],
  ['collection source', (o) => { o.sources[0].baseline.data.subjectType = 4; o.sources[0].online.data.subjectType = 4; o.sources[0].restored.data.subjectType = 4; }],
  ['wrong first title', (o) => { o.stages[0].draftPagesBefore[0].data.dataList[0].itemTitle = 'untrusted'; o.stages[0].published.publishedPages[0].data.dataList[0].itemTitle = 'untrusted'; o.stages[0].published.draftPages[0].data.dataList[0].itemTitle = 'untrusted'; }],
  ['missing cleanup', (o) => { delete o.cleanupActions; }],
  ['cleanup failed process', (o) => { o.cleanupActions[0].result.status = 1; }],
  ['cleanup timeout', (o) => { o.cleanupActions[0].result.timedOut = true; }],
  ['cleanup wrong selector', (o) => { o.cleanupActions[0].authBefore.userId = 1; }],
  ['cleanup left auth', (o) => { o.cleanupActions[0].authAfter = 'present'; }],
  ['cleanup not removed', (o) => { o.cleanupActions[0].removed = false; }],
  ['rehashed wrong local baseline', (o) => rewriteDraft(o, (v) => { v.baseline.description = 'wrong'; v.publishedBaselineFingerprint = digest(JSON.stringify(v.baseline)); })],
  ['rehashed wrong local schema', (o) => rewriteDraft(o, (v) => { v.schemaVersion = 2; })],
  ['rehashed unknown local authorization', (o) => rewriteDraft(o, (v) => { v.authState = 'unknown'; })],
  ['rehashed malformed local date', (o) => rewriteDraft(o, (v) => { v.updatedAt = 'not-a-date'; })],
  ['rehashed unknown local field', (o) => rewriteDraft(o, (v) => { v.unexpected = true; })],
  ['unknown system mode', (o) => { o.stages[0].published.version.data.systemPropertyDescriptors.push({ key: 'bad', insertMode: 3, valueDisplay: 'bad' }); }],
  ['wrong argv', (o) => { o.actions[0].argv = ['--help']; }], ['timeout', (o) => { o.actions[0].result.timedOut = true; }], ['signal', (o) => { o.actions[0].result.signal = 'SIGTERM'; }],
  ['error', (o) => { o.actions[0].result.error = 'spawn'; }], ['stderr', (o) => { o.actions[0].result.stderr = 'failed'; }], ['exit', (o) => { o.actions[0].result.status = 1; }],
  ['publish empty stdout', (o) => { o.actions.find((a) => a.label === 'first publish').result.stdout = ''; }],
  ['forged online output', (o) => { o.actions.find((a) => a.label === 'theme online').result.stdout = '{}'; }],
  ['empty attributes', (o) => { o.stages[0].published.version.data.customPropertyDescriptors = []; }], ['missing input', (o) => { o.stages[1].published.version.data.systemPropertyDescriptors.pop(); }],
  ['wrong select default', (o) => { o.stages[1].published.version.data.customPropertyDescriptors[2].defaultValue = '稳定'; }], ['select order', (o) => { o.stages[1].published.version.data.customPropertyDescriptors[2].candidateItems.reverse(); }],
  ['dep range', (o) => { o.stages[1].published.version.data.dependencies[0].versionRange = '*'; }], ['description', (o) => { o.stages[1].published.version.data.description = ''; }],
  ['display', (o) => { delete o.stages[1].published.version.data.catalogueProperty.collection_view; }], ['auth mapping', (o) => { delete o.stages[1].published.version.data.authExcludedItems; }],
  ['error envelope', (o) => { o.stages[1].published.version.ret = 1; }], ['wrong version', (o) => { o.stages[1].published.version.data.version = 'stale'; }], ['wrong id', (o) => { o.stages[1].published.version.data.resourceId = 'f'.repeat(24); }],
  ['missing directory', (o) => { o.stages[0].published.publishedPages[0].data.dataList.pop(); }], ['rename', (o) => { o.stages[1].published.publishedPages[0].data.dataList[1].itemTitle = 'old'; }],
  ['source identity', (o) => { o.stages[0].published.draftPages[0].data.dataList[0].mountResourceInfo.resourceId = 'f'.repeat(24); }],
  ['local bytes', (o) => { o.stages[1].localBefore.draft.sha256 = '0'.repeat(64); }], ['local identity', (o) => { o.stages[1].localAfter.identity.resourceName = 'wrong/name'; }],
  ['pending intent', (o) => { o.stages[1].localAfter.intentFiles = ['unknown.json']; }], ['draft retained', (o) => { o.stages[1].localAfter.draft = o.stages[1].localBefore.draft; }],
  ['restoration', (o) => { o.sources[0].restored.data.status = 1; }], ['JSON noise', (o) => { o.actions.find((a) => a.label === 'update show').result.stdout += '{}'; }],
]) test(`complete evidence rejects ${name}`, async () => { const o = await collectionLifecycleFixture(); mutate(o); assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'FAIL'); });
test('later same-run Console version does not invalidate immutable lifecycle origin', async () => {
  const o = await collectionLifecycleFixture();
  for (const s of o.sources) { s.baseline.data.latestVersion = '1.2.0'; s.online.data.latestVersion = '1.2.0'; s.restored.data.latestVersion = '1.2.0'; }
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'PASS');
});
test('collection update proves exact new contents, not an invented version-number increment', async () => {
  const o = await collectionLifecycleFixture();
  o.stages[1].published.info.data.latestVersion = o.stages[0].published.info.data.latestVersion;
  o.stages[1].published.version.data.version = o.stages[0].published.info.data.latestVersion;
  assert.equal(evaluateCollectionLifecycleCase(id, o).status, 'PASS');
});
test('pagination rejects truncation, forged totals, duplicates and top-level aliases', () => {
  const make = () => ({ ret: 0, errCode: 0, data: { skip: 0, limit: 100, totalItem: 1, dataList: [{ itemId: 'i', itemTitle: '', sortId: 1, mountResourceInfo: { resourceId: 'a'.repeat(24) } }] } });
  for (const change of [(p) => { p.data.totalItem = 2; }, (p) => { p.data.skip = 1; }, (p) => { p.data.limit = 1; }, (p) => { p.ret = '0'; }, (p) => { p.data.dataList[0].resourceId = 'a'.repeat(24); delete p.data.dataList[0].mountResourceInfo; }]) { const p = make(); change(p); assert.throws(() => collectionCataloguePages([p])); }
});
test('owned collection cleanup logs out the precise selector before removing its workspace', async () => {
  const { cleanupCollectionWorkspace } = await import('../verify-collection-lifecycle.mjs');
  const work = mkdtempSync(path.join(tmpdir(), 'freelog-collection-lifecycle-'));
  const authFile = path.join(work, '.freelog/auth'), identity = { schemaVersion: 1, subject: 'collection', resourceId: 'a'.repeat(24) }, auth = (await collectionLifecycleFixture()).auth;
  mkdirSync(path.dirname(authFile)); writeFileSync(authFile, JSON.stringify(auth)); writeFileSync(path.join(work, '.freelog/1.json'), JSON.stringify(identity));
  const receipt = cleanupCollectionWorkspace(work, { auth, identity }, (argv) => {
    assert.deepEqual(argv, ['logout', '--env', 'dev']); assert.ok(existsSync(work)); unlinkSync(authFile);
    return { status: 0, signal: null, error: null, timedOut: false, stdout: `已退出登录：${authFile}\n`, stderr: '' };
  });
  assert.equal(existsSync(work), false); assert.equal(receipt.removed, true); assert.equal(receipt.authAfter, 'absent');
});
for (const failure of ['changed selector', 'same-owner different selector time', 'secret replacement', 'changed identity', 'logout failure', 'pending intent']) test(`owned cleanup preserves workspace on ${failure}`, async () => {
  const { cleanupCollectionWorkspace } = await import('../verify-collection-lifecycle.mjs');
  const work = mkdtempSync(path.join(tmpdir(), 'freelog-collection-lifecycle-'));
  const authFile = path.join(work, '.freelog/auth'), identity = { schemaVersion: 1, subject: 'collection', resourceId: 'a'.repeat(24) }, auth = (await collectionLifecycleFixture()).auth;
  const actualAuth = failure === 'changed selector' ? { ...auth, userId: 1 } : failure === 'same-owner different selector time' ? { ...auth, createdAt: '2026-10-19T00:00:05.000Z' }
    : failure === 'secret replacement' ? { ...auth, token: 'synthetic-secret-only' } : auth;
  mkdirSync(path.dirname(authFile)); writeFileSync(authFile, JSON.stringify(actualAuth));
  writeFileSync(path.join(work, '.freelog/1.json'), JSON.stringify(failure === 'changed identity' ? { ...identity, resourceId: 'b'.repeat(24) } : identity));
  const pending = path.join(work, '.freelog/collection-forms/intents/owned-test.json');
  if (failure === 'pending intent') { mkdirSync(path.dirname(pending), { recursive: true }); writeFileSync(pending, '{}'); }
  let calls = 0, observation;
  assert.throws(() => cleanupCollectionWorkspace(work, { auth, identity }, () => { calls += 1; return { status: 1, signal: null, error: null, timedOut: false, stdout: '', stderr: 'failed' }; }, (entry) => { observation = entry; }));
  assert.equal(calls, failure === 'logout failure' ? 1 : 0); assert.ok(existsSync(work)); assert.ok(existsSync(authFile)); assert.equal(observation.removed, false);
  assert.doesNotMatch(JSON.stringify(observation), /synthetic-secret/u, 'A replacement must not leak into persisted cleanup observations.');
  if (failure === 'pending intent') unlinkSync(pending);
  cleanupWorkspace(work, { success: true, prefixes: ['freelog-collection-lifecycle-'], log() {} });
});
