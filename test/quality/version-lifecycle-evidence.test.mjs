import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const helper = new URL('../acceptance/version-lifecycle-evidence.mjs', import.meta.url);
const producer = new URL('../verify-theme-image-full-lifecycle.mjs', import.meta.url);

// Synthetic read DTOs only exercise the evidence checker, never real-dev acceptance.
function fixture(kind = 'theme') {
  const resourceId = 'synthetic-new-resource';
  const dependency = { resourceId: 'synthetic-readonly-dependency', versionRange: '^1.0.0' };
  const typeCode = kind === 'theme' ? 'RT001' : 'RT005001';
  const mime = { theme: 'application/zip', image: 'image/png', jpeg: 'image/jpeg' }[kind];
  const form = (updated) => [
    { key: `qa${kind}Author`, name: '验收作者', type: 'readonlyText', defaultValue: `${kind}-${updated ? 'second' : 'first'}`, remark: '作者说明', candidateItems: [] },
    { key: `options_qa${kind}Text`, name: '测试文本', type: 'editableText', defaultValue: updated ? '更新文本' : '', remark: '文本说明', candidateItems: [] },
    { key: `options_qa${kind}Select`, name: '测试下拉', type: 'select', defaultValue: updated ? '更新' : '稳定', remark: '下拉说明', candidateItems: updated ? ['更新', '稳定'] : ['稳定', '更新'] },
  ];
  const system = kind === 'theme' ? { bundleTool: 'vite', noderuntime_target_version: '0.5' } : {};
  const versions = [false, true].map((updated) => ({
    resourceId, resourceTypeCode: typeCode, version: updated ? '1.1.0' : '1.0.0',
    fileSha1: (updated ? 'b' : 'a').repeat(40),
    filename: kind === 'theme' ? `freelog-zip-${updated ? '2' : '1'}-synthetic.zip` : `photo-v${updated ? '2' : '1'}.${kind === 'image' ? 'png' : 'jpg'}`,
    description: updated ? `${kind} 更新版描述` : '', customPropertyDescriptors: form(updated), dependencies: [dependency],
    systemPropertyDescriptors: [{ key: 'mime', insertMode: 1, valueDisplay: mime }, ...Object.entries(system).map(([key, value]) => ({ key, insertMode: 2, defaultValue: value, valueDisplay: value }))],
    versionProperty: { mime, ...Object.fromEntries(form(updated).map((item) => [item.key, item.defaultValue])), ...system },
  }));
  const paths = kind === 'theme' ? ['dist', 'dist'] : versions.map((item) => item.filename);
  const local = paths.map((filePath) => ({ draft: 'absent', pending: 'absent', identity: { resourceId, typeCode, filePath } }));
  return {
    kind, resourceId, typeCode, dependency, versions, local,
    artifacts: paths.map((sourcePath, index) => ({ sourcePath, kind: kind === 'theme' ? 'directory' : 'file', ...(kind === 'theme' ? {} : { sha1: versions[index].fileSha1 }) })),
    pulledDraft: { draftKind: 'update', fromVersion: '1.0.0', resourceId, resourceTypeCode: typeCode,
      fileSha1: versions[0].fileSha1, filename: versions[0].filename, description: '',
      customPropertyDescriptors: form(false), dependencies: [dependency], inputAttrs: Object.entries(system).map(([key, value]) => ({ key, value })),
      orphanedInputAttrs: [], baseUpcastResources: [], authExcludedItems: [] },
    actions: [
      kind === 'theme'
        ? ['init theme --template vite-react-ts', ['init', 'theme', '.', '--template', 'vite-react-ts', '--yes', '--env', 'dev']]
        : [kind === 'image' ? 'init --type RT005001 --artifact photo-v1.png' : 'init JPEG --type RT005001 --artifact photo-v1.jpg',
          ['init', '.', '--type', typeCode, '--artifact', paths[0], '--yes', '--env', 'dev']],
      ['create', ['create', '--title', `qa-synthetic-${kind}`, '--type', typeCode, '--name', `qa-synthetic-${kind}`, '--artifact', paths[0], '--yes', '--env', 'dev']],
      ['create-version --prepare', ['create-version', '--prepare', '--yes', '--env', 'dev']],
      ['create-version 1.0.0', ['create-version', '--yes', '--env', 'dev']],
      ['version show 1.0.0', ['version', 'show', '--version', '1.0.0', '--env', 'dev'], JSON.stringify(versions[0])],
      ['draft pull', ['version', 'draft', 'pull', '--yes', '--env', 'dev']],
      ['update-version 1.1.0', ['update-version', '--version', '1.1.0', '--artifact', paths[1], '--yes', '--env', 'dev']],
      ['version show 1.1.0', ['version', 'show', '--version', '1.1.0', '--env', 'dev'], JSON.stringify(versions[1])],
    ].map(([label, argv, stdout = '']) => ({
      label, argv, expectedExit: 0, process: { exitCode: 0, signal: null, error: null, timedOut: false }, stdout, stderr: '',
    })),
  };
}

test('three leaves retain design references, explicit input/side effects, and the unresolved parent matrix', async () => {
  const { versionLifecycleCases } = await import(helper);
  assert.equal(versionLifecycleCases.length, 3);
  assert.equal(new Set(versionLifecycleCases.map((item) => item.id)).size, 3);
  for (const leaf of versionLifecycleCases) {
    assert.equal(leaf.parentRule, 'VERSION.UPDATE_MATRIX');
    assert.equal(leaf.script, 'verify-theme-image-full-lifecycle.mjs');
    assert.ok(leaf.inputClass && leaf.layer && leaf.action.length && leaf.preconditions.length && leaf.forbiddenSideEffects.length);
    assert.ok(leaf.assertionIds.length >= 10);
    for (const ref of leaf.designRefs) assert.ok(ref.section && existsSync(new URL(`../../${ref.path}`, import.meta.url)), ref.path);
  }
});

test('complete DTO and local observations pass with concrete expected/actual and raw readbacks', async () => {
  const { evaluateVersionLifecycle } = await import(helper);
  for (const kind of ['theme', 'image', 'jpeg']) {
    const input = fixture(kind);
    const result = evaluateVersionLifecycle(kind, input);
    assert.equal(result.status, 'PASS', result.reason);
    assert.deepEqual(result.observations, input);
    assert.deepEqual(JSON.parse(JSON.stringify(result)).assertions, result.assertions);
    for (const item of result.assertions) {
      assert.equal(item.passed, true, item.id);
      assert.notEqual(typeof item.expected, 'boolean', item.id);
      assert.deepEqual(item.actual, item.expected, item.id);
    }
  }
});

test('wrong identity, each form field, duplicate/extra descriptors and inconsistent property values fail precisely', async () => {
  const { evaluateVersionLifecycle } = await import(helper);
  for (const [mutate, id] of [
    [(value) => { value.versions[0].resourceId = 'other'; }, 'first-version'],
    [(value) => { value.versions[1].version = '1.0.0'; }, 'updated-version'],
    ...['key', 'name', 'type', 'defaultValue', 'remark'].map((field) => [(value) => { value.versions[0].customPropertyDescriptors[0][field] = 'wrong'; }, 'first-form']),
    [(value) => { value.versions[0].customPropertyDescriptors[1].candidateItems = ['not-text']; }, 'first-form'],
    [(value) => { delete value.versions[0].customPropertyDescriptors[0].candidateItems; }, 'first-form'],
    [(value) => { value.versions[0].customPropertyDescriptors[1].candidateItems = null; }, 'first-form'],
    [(value) => { value.versions[1].customPropertyDescriptors[2].candidateItems.reverse(); }, 'updated-form'],
    [(value) => { value.versions[1].customPropertyDescriptors.push(value.versions[1].customPropertyDescriptors[0]); }, 'updated-form'],
    [(value) => { value.versions[0].versionProperty.options_qathemeText = 'lost-empty'; }, 'first-form'],
    [(value) => { value.versions[1].dependencies[0].versionRange = '*'; }, 'updated-form'],
    [(value) => { value.versions[1].description = ''; }, 'updated-form'],
    [(value) => { value.versions[0].systemPropertyDescriptors[1].insertMode = '2'; }, 'first-form'],
    [(value) => { value.versions[1].versionProperty.bundleTool = 'other'; }, 'updated-form'],
    [(value) => { value.pulledDraft.customPropertyDescriptors[1].defaultValue = 'changed'; }, 'pull-inheritance'],
    [(value) => { value.pulledDraft.inputAttrs.pop(); }, 'pull-inheritance'],
    [(value) => { value.local[0].draft = 'present'; }, 'first-local-finalization'],
    [(value) => { value.local[1].identity.filePath = 'temporary.zip'; }, 'updated-local-finalization'],
    [(value) => { value.local[1].pending = 'present'; }, 'updated-local-finalization'],
  ]) {
    const input = fixture(); mutate(input);
    const result = evaluateVersionLifecycle('theme', input);
    assert.equal(result.status, 'FAIL', id);
    assert.equal(result.assertions.find((item) => item.id === id).passed, false, id);
  }
});

test('artifact keywords elsewhere, bad SHA, unchanged upload and MIME contradictions cannot pass', async () => {
  const { evaluateVersionLifecycle } = await import(helper);
  for (const [kind, mutate, id] of [
    ['theme', (value) => { value.versions[0].filename = 'not-a-zip.txt'; value.versions[0].description = '.zip'; }, 'first-artifact'],
    ['image', (value) => { value.versions[1].filename = 'wrong.png'; value.versions[1].description += ' photo-v2.png'; }, 'updated-artifact'],
    ['jpeg', (value) => { value.versions[0].fileSha1 = 'not-a-sha'; }, 'first-artifact'],
    ['theme', (value) => { value.versions[1].fileSha1 = value.versions[0].fileSha1; }, 'artifact-replacement'],
    ['image', (value) => { value.versions[0].fileSha1 = 'c'.repeat(40); }, 'first-artifact'],
    ['jpeg', (value) => { value.versions[1].systemPropertyDescriptors[0].valueDisplay = 'image/png'; }, 'updated-artifact'],
    ['theme', (value) => { value.versions[0].versionProperty.mime = 'text/plain'; }, 'first-artifact'],
  ]) {
    const input = fixture(kind); mutate(input);
    const result = evaluateVersionLifecycle(kind, input);
    assert.equal(result.status, 'FAIL', id);
    assert.equal(result.assertions.find((item) => item.id === id).passed, false, id);
  }
});

test('crash, timeout, failed expected rejection and missing stages cannot pass as command completion', async () => {
  const { evaluateVersionLifecycle } = await import(helper);
  for (const mutate of [
    (value) => { value.actions[0].process.signal = 'SIGTERM'; },
    (value) => { value.actions[0].process.timedOut = true; },
    (value) => { value.actions[0].process.error = 'spawn failed'; },
    (value) => { value.actions[0].process.exitCode = null; },
    (value) => { value.actions.pop(); },
    (value) => { value.actions.push({ label: 'negative', expectedExit: 1, process: { exitCode: 0, signal: null, error: null, timedOut: false } }); },
  ]) {
    const input = fixture(); mutate(input);
    const result = evaluateVersionLifecycle('theme', input);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === 'commands-completed').passed, false);
  }
});

test('required stages cannot relabel rejection, replace argv with help or contradict the original readback', async () => {
  const { evaluateVersionLifecycle } = await import(helper);
  for (const mutate of [
    (value) => { const action = value.actions.find((item) => item.label === 'create-version 1.0.0'); action.expectedExit = 1; action.process.exitCode = 1; },
    (value) => { for (const action of value.actions) action.argv = ['--help']; },
    (value) => { value.actions.find((item) => item.label === 'version show 1.0.0').stdout = JSON.stringify({ resourceId: 'other', version: '9.9.9' }); },
    (value) => { value.actions.reverse(); },
    (value) => { value.actions.push(value.actions[0]); },
    (value) => { value.actions[0].argv[value.actions[0].argv.length - 1] = 'prod'; },
    (value) => { value.actions.shift(); },
    (value) => { value.actions[0].argv[4] = 'another-template'; },
  ]) {
    const input = fixture(); mutate(input);
    assert.equal(evaluateVersionLifecycle('theme', input).status, 'FAIL');
  }
});

test('missing or malformed read DTO arrays fail with structured assertions', async () => {
  const { evaluateVersionLifecycle } = await import(helper);
  for (const mutate of [
    (value) => { value.versions[0].systemPropertyDescriptors = {}; },
    (value) => { value.versions[0].customPropertyDescriptors = null; },
    (value) => { value.versions[1].dependencies = {}; },
    (value) => { value.pulledDraft.inputAttrs = [null]; },
    (value) => { value.versions = []; },
    (value) => { value.versions = {}; },
  ]) {
    const input = fixture(); mutate(input);
    const result = evaluateVersionLifecycle('theme', input);
    assert.equal(result.status, 'FAIL');
    assert.ok(result.assertions.some((item) => item.passed === false));
  }
});

test('additional attribute values come from valueDisplay, independent of the definition default', async () => {
  const { evaluateVersionLifecycle } = await import(helper);
  const input = fixture();
  for (const version of input.versions) {
    version.systemPropertyDescriptors.find((item) => item.key === 'bundleTool').defaultValue = 'definition-default';
  }
  input.actions.find((item) => item.label === 'version show 1.0.0').stdout = JSON.stringify(input.versions[0]);
  input.actions.find((item) => item.label === 'version show 1.1.0').stdout = JSON.stringify(input.versions[1]);
  assert.equal(evaluateVersionLifecycle('theme', input).status, 'PASS');
});

test('subset and interrupted chain reports keep all unexecuted leaves NOT_TESTED', async () => {
  const { initialVersionLifecycleCases, replaceVersionLifecycleResult, evaluateVersionLifecycle } = await import(helper);
  const cases = initialVersionLifecycleCases('image');
  replaceVersionLifecycleResult(cases, evaluateVersionLifecycle('image', fixture('image')));
  assert.deepEqual(cases.map((item) => item.status), ['NOT_TESTED', 'PASS', 'NOT_TESTED']);
  assert.throws(() => replaceVersionLifecycleResult(cases, { id: 'unknown', status: 'PASS' }), /Unknown/u);
  const failed = initialVersionLifecycleCases();
  replaceVersionLifecycleResult(failed, { id: failed[0].id, status: 'BLOCKED', reason: 'missing prerequisite', assertions: [] });
  assert.deepEqual(failed.map((item) => item.status), ['BLOCKED', 'NOT_TESTED', 'NOT_TESTED']);
  const laterFailure = initialVersionLifecycleCases();
  replaceVersionLifecycleResult(laterFailure, evaluateVersionLifecycle('theme', fixture()));
  replaceVersionLifecycleResult(laterFailure, { id: laterFailure[1].id, status: 'FAIL', reason: 'second chain failed', assertions: [] });
  assert.deepEqual(laterFailure.map((item) => item.status), ['PASS', 'FAIL', 'NOT_TESTED']);
});

test('actual producer preflight writes all three leaves without login, build or network', (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-version-evidence-quality-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-version-evidence-quality-'));
    rmSync(root, { recursive: true, force: true });
  });
  for (const environment of ['prod', 'dev']) {
    const output = path.join(root, `suite-${environment}.json`);
    const result = spawnSync(process.execPath, [producer.pathname.replace(/^\/(\w:)/u, '$1'), '--env', environment, '--only', 'image'], {
      env: { ...process.env, FREELOG_TEST_SUITE_REPORT: output, FREELOG_TEST_RUN_ID: 'synthetic-preflight', FREELOG_TEST_CLI_BIN: path.join(root, 'missing.js') }, encoding: 'utf8', timeout: 10_000,
    });
    assert.equal(result.status, 3, result.stderr);
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(report.cases.map((item) => item.status), ['NOT_TESTED', 'BLOCKED', 'NOT_TESTED']);
    assert.ok(report.cases.every((item) => item.evidenceRef.runId === 'synthetic-preflight'));
    assert.doesNotMatch(result.stdout, /command=|CLI build/u);
    assert.match(report.cases[1].reason, environment === 'dev' ? /FREELOG_TEST_CLI_BIN/u : /只允许 --env dev/u);
    const raw = JSON.parse(readFileSync(report.cases[1].evidenceRef.path, 'utf8'));
    assert.equal(raw.caseId, report.cases[1].id);
    assert.deepEqual(raw.assertions, []);
  }
});
