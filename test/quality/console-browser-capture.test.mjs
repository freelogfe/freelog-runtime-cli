/** Controlled tool/clock tests do not constitute real browser evidence. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';
import test from 'node:test';
import { createConsoleBrowserRecorder, projectConsoleBrowserCapture } from '../acceptance/console-browser-capture.mjs';
import { consoleLifecycleFixture, consoleRoundtripFixture, syntheticBrowserCapture } from './fixtures/console-roundtrip.mjs';
import { consoleCaptureRequest, consoleVisibleProjection, evaluateConsoleRoundtripCase, expectedConsoleStageVersion } from '../acceptance/console-roundtrip-evidence.mjs';
import { createConsoleRoundtripBudget, waitForCapture } from '../verify-console-roundtrip.mjs';

function apparatus(entry) {
  let active, axCalls = 0, inputCalls = 0;
  const optionsSeen = [], rolesSeen = [];
  let now = Date.parse(entry.request.requestedAt) + 1;
  const DateWithClock = class extends Date { constructor(...args) { super(...(args.length ? args : [now++])); } };
  const tab = {
    async getAXState(options) { optionsSeen.push(JSON.parse(JSON.stringify(options))); return axCalls++ % 2 === 0 ? active.axBefore : active.axAfter; },
    playwright: { getByRole(role) {
      rolesSeen.push(role);
      return { async evaluateAll(read) {
        inputCalls += 1;
        const controls = active.inputs.map((entry) => ({ tagName: entry.tag, disabled: entry.disabled, value: entry.value, textContent: entry.text,
          getAttribute(name) { return name === 'placeholder' ? entry.placeholder : name === 'contenteditable' ? entry.contenteditable : null; } }));
        // This unrelated value must not be read, even if a caller supplied a login-like control.
        controls.push({ tagName: 'INPUT', getAttribute: () => 'password', get value() { throw new Error('must not read private inputs'); } });
        return read(controls);
      } };
    } },
  };
  // Execute the exact portable function without imports, process, network, filesystem or module closures.
  const request = structuredClone(entry.request);
  const context = vm.createContext({ Date: DateWithClock, TextEncoder, request, tab });
  const recorder = new vm.Script(`(${createConsoleBrowserRecorder.toString()})(request, tab)`).runInContext(context);
  return { recorder, request, optionsSeen, rolesSeen, set(frame) { active = frame; axCalls = 0; }, jump(time) { now = time; }, calls() { return inputCalls; } };
}

test('the exact standalone recorder records original tool frames and actual controls, and derives all four stage profiles', async () => {
  for (const kind of ['theme', 'image']) {
    const observed = await consoleRoundtripFixture(kind);
    for (const entry of observed.browser) {
      const a = apparatus(entry);
      for (const frame of entry.capture.frames) { a.set(frame); await a.recorder.frame(frame.kind); }
      const packet = JSON.parse(JSON.stringify(a.recorder.finish()));
      const expected = projectConsoleBrowserCapture(entry.request, entry.capture);
      const actual = projectConsoleBrowserCapture(entry.request, packet);
      assert.deepEqual(actual.visible, expected.visible);
      assert.deepEqual(actual.readings, expected.readings);
      assert.equal(packet.frames[0].axBefore, entry.capture.frames[0].axBefore);
      assert.equal(a.calls(), entry.request.stage === 'view-first' ? 3 : 2);
      assert.deepEqual(a.rolesSeen, Array.from({ length: a.calls() }, () => 'textbox'));
      assert.deepEqual(a.optionsSeen, Array.from({ length: packet.frames.length * 2 }, () => ({ disableDiffing: true, emit: false })));
      assert.ok(packet.frames.every((f) => Date.parse(f.startedAt) < Date.parse(f.finishedAt)));
      assert.equal(Object.hasOwn(packet, 'observedAt'), false);
      assert.equal(Object.hasOwn(packet, 'visible'), false);
      assert.equal(Object.hasOwn(packet, 'readings'), false);
    }
  }
});

test('overrides, duplicates, concurrent frames and mutation of the original request do not overwrite collected facts', async () => {
  const entry = (await consoleRoundtripFixture()).browser[1];
  const a = apparatus(entry); a.set(entry.capture.frames[0]);
  await assert.rejects(a.recorder.frame('main', { axBefore: 'invented' }), /rejected/u);
  const running = a.recorder.frame('main');
  await assert.rejects(a.recorder.frame('author'), /rejected/u);
  await running;
  await assert.rejects(a.recorder.frame('main'), /rejected/u);
  assert.throws(() => a.recorder.finish({ observedAt: '2020-01-01' }), /rejected/u);
  a.request.resourceId = 'c'.repeat(24); a.request.expiresAt = '2099-01-01T00:00:00.000Z';
  const packet = a.recorder.finish();
  assert.equal(packet.resourceId, entry.request.resourceId);
  assert.equal(packet.frames[0].axBefore, entry.capture.frames[0].axBefore);
  assert.throws(() => a.recorder.finish(), /rejected/u);
});

test('a page or visible-version drift closes the recorder rather than exporting a partial frame', async () => {
  const entry = (await consoleRoundtripFixture()).browser[1];
  for (const mutate of [
    (frame) => { frame.axBefore = frame.axBefore.replaceAll(entry.request.url, 'https://user.devfreelog.com/login'); },
    (frame) => { frame.axAfter = frame.axAfter.replace('text 版本 1.1.0', 'text 版本 9.9.9'); },
  ]) {
    const a = apparatus(entry), frame = structuredClone(entry.capture.frames[0]); mutate(frame); a.set(frame);
    await assert.rejects(a.recorder.frame('main'), /rejected/u);
    assert.throws(() => a.recorder.finish(), /rejected/u);
  }
});

test('the actual clock cannot be replaced by extending the caller request after construction', async () => {
  const entry = (await consoleRoundtripFixture()).browser[1];
  const a = apparatus(entry); a.set(entry.capture.frames[0]);
  a.request.expiresAt = '2099-01-01T00:00:00.000Z'; a.jump(Date.parse(entry.request.expiresAt) + 1);
  await assert.rejects(a.recorder.frame('main'), /rejected/u);
  assert.throws(() => a.recorder.finish(), /rejected/u);
});

const changes = [
  ['legacy format', (c) => { c.schemaVersion = 1; }],
  ['manual observedAt', (c) => { c.observedAt = c.finishedAt; }],
  ['manual snapshot', (c) => { c.axSnapshot = 'invented'; }],
  ['copied source label', (c) => { c.readings = [{ field: 'descriptionText', source: 'contenteditable' }]; }],
  ['field override', (c) => { c.visible = { descriptionText: 'copied expected value' }; }],
  ['missing frame', (c) => { c.frames.pop(); }],
  ['duplicate frame', (c) => { c.frames.push(c.frames[0]); }],
  ['unknown frame', (c) => { c.frames[0].kind = 'private-store'; }],
  ['truncated raw page', (c) => { c.frames[0].axAfter = 'nonempty but incomplete'; }],
  ['clock before request', (c, r) => { c.frames[0].startedAt = new Date(Date.parse(r.requestedAt) - 1).toISOString(); }],
  ['clock after completion', (c) => { c.frames[0].finishedAt = new Date(Date.parse(c.finishedAt) + 1).toISOString(); }],
  ['out of order', (c) => { [c.frames[0], c.frames[1]] = [c.frames[1], c.frames[0]]; }],
  ['wrong modal key despite same value', (c) => { c.frames.find((f) => f.kind === 'text-option').inputs[1].value = 'wrongKey'; }],
  ['wrong modal raw AX', (c) => { const f = c.frames.find((f) => f.kind === 'text-option'); f.axBefore = f.axBefore.replace('heading 编辑可选配置', 'heading 其它弹窗'); }],
  ['wrong actual tag', (c) => { c.frames.find((f) => f.kind === 'text-option').inputs[3].tag = 'DIV'; }],
  ['fake contenteditable input', (c) => { c.frames.find((f) => f.kind === 'text-option').inputs[3].contenteditable = 'true'; }],
  ['empty text default not read', (c) => { c.frames.find((f) => f.kind === 'text-option').inputs.pop(); }],
  ['empty description not read', (c) => { c.frames.find((f) => f.kind === 'empty-description').inputs = []; }],
  ['description copied from ordinary div', (c) => { c.frames.find((f) => f.kind === 'empty-description').inputs[0].contenteditable = null; }],
  ['derived first-option hint missing', (c) => { const f = c.frames.find((f) => f.kind === 'select-option'); f.axAfter = f.axAfter.replace('（默认选中首个选项）', '其它说明'); }],
  ['extra input masquerading as context', (c) => { const f = c.frames.find((f) => f.kind === 'text-option'); f.inputs.push(f.inputs[3]); }],
  ['wrapper URL differs from page URL', (c) => { const f = c.frames[0]; f.axAfter = f.axAfter.replace(/URL: "[^"]+"/u, 'URL: "https://example.invalid"'); }],
  ['focused wrapper is truncated', (c) => { const f = c.frames[0]; f.axAfter = f.axAfter.split('\n').slice(0, -1).join('\n'); }],
  ['unknown non-node content in description', (c) => { const f = c.frames[0]; f.axAfter = f.axAfter.replace(/(\d+ text 相关视图)/u, 'UNRECOGNIZED CONTENT\n$1'); }],
  ['tooltip from a different attribute', (c) => { const f = c.frames.find((f) => f.kind === 'author'); f.axAfter = f.axAfter.replace('text 验收作者 theme-first', 'text 别的属性 theme-first'); }],
  ['tooltip root and child disagree', (c) => { const f = c.frames.find((f) => f.kind === 'author'); f.axAfter = f.axAfter.replace('container 名称 验收作者', 'container 名称 另一个属性'); }],
  ['unexpected tooltip child', (c) => { const f = c.frames.find((f) => f.kind === 'author'); f.axAfter = f.axAfter.replace('\t\t', '\t900 link Description: unexpected, Value: https://example.invalid\n\t\t'); }],
  ['non-main before-frame configuration drift', (c) => { const f = c.frames.find((f) => f.kind === 'author'); f.axBefore = f.axBefore.replace('text 测试文本', 'text 错误配置'); }],
];
for (const [label, mutate] of changes) test(`raw provenance rejects ${label}`, async () => {
  const entry = (await consoleRoundtripFixture()).browser[0], capture = structuredClone(entry.capture);
  mutate(capture, entry.request);
  assert.throws(() => projectConsoleBrowserCapture(entry.request, capture), /raw capture/u);
});

test('description/body, blank editor and derived classifications retain truthful source information', async () => {
  const observed = await consoleRoundtripFixture();
  const first = projectConsoleBrowserCapture(observed.browser[0].request, observed.browser[0].capture);
  const updated = projectConsoleBrowserCapture(observed.browser[1].request, observed.browser[1].capture);
  assert.equal(first.readings.find((r) => r.field === 'descriptionText').source, 'contenteditable');
  assert.equal(updated.readings.find((r) => r.field === 'descriptionText').source, 'ax-text');
  assert.equal(updated.readings.find((r) => r.field === 'customPropertyDescriptors[0].type').rule, 'attribute-section');
  assert.equal(updated.readings.find((r) => r.field === 'customPropertyDescriptors[2].defaultValue').rule, 'first-option-with-visible-hint');
  assert.ok(updated.readings.filter((r) => r.field.startsWith('customPropertyDescriptors[2]')).every((r) => r.frame === 'select-option'),
    'a nested candidateItems[1] index must not select the text-option frame');
});

const profileChanges = [
  ['author moved outside attributes', 'theme', 1, (ax) => {
    const row = ax.match(/^\s*\d+ text 验收作者 theme-second$/mu)[0];
    return ax.replace(row, '').replace(/(\d+ text 可选配置)/u, `$1\n${row}`);
  }],
  ['missing configuration cards', 'theme', 1, (ax) => ax.replace(/^\s*\d+ text (测试文本|测试下拉|更新文本|更新 \| 稳定)$/gmu, '')],
  ['configuration order reversed', 'theme', 1, (ax) => {
    const a = ax.indexOf('text 测试文本'), b = ax.indexOf('text 测试下拉'), end = ax.indexOf('text 依赖声明');
    const start = ax.lastIndexOf('\n', a) + 1, middle = ax.lastIndexOf('\n', b) + 1, finish = ax.lastIndexOf('\n', end) + 1;
    return ax.slice(0, start) + ax.slice(middle, finish) + ax.slice(start, middle) + ax.slice(finish);
  }],
  ['extra PNG additional property', 'image', 1, (ax) => ax.replace(/(\d+ text 可选配置)/u, '900 text 额外附加值 unexpected\n$1')],
  ['duplicate configuration section', 'theme', 1, (ax) => ax.replace(/(\d+ text 可选配置)/u, '$1\n900 text 可选配置')],
  ['description link silently omitted', 'theme', 1, (ax) => ax.replace(/(\d+ text 相关视图)/u, '900 link Description: UNEXPECTED DESCRIPTION, Value: https://example.invalid\n$1')],
  ['description image silently omitted', 'theme', 1, (ax) => ax.replace(/(\d+ text 相关视图)/u, '900 image Description: UNEXPECTED DESCRIPTION\n$1')],
];
for (const [label, kind, index, mutate] of profileChanges) test(`complete evaluator rejects ${label}`, async () => {
  const observed = await consoleRoundtripFixture(kind);
  const main = observed.browser[index].capture.frames[0];
  main.axBefore = mutate(main.axBefore); main.axAfter = mutate(main.axAfter);
  const result = evaluateConsoleRoundtripCase(`INTEROP.CLI_TO_CONSOLE.${kind === 'theme' ? 'THEME' : 'PNG'}_PUBLISHED`, observed);
  assert.equal(result.status, 'FAIL', label);
  assert.equal(result.assertions.find((item) => item.id === 'browser-binding').passed, false, label);
});

test('complete evaluator rejects nonempty actual empty-description values and unsupported editor kinds', async () => {
  for (const change of [
    (input) => { input.tag = 'TEXTAREA'; input.value = 'ACTUAL NONEMPTY'; },
    (input) => { input.value = 'ACTUAL NONEMPTY'; },
  ]) {
    const observed = await consoleRoundtripFixture();
    change(observed.browser[0].capture.frames.find((f) => f.kind === 'empty-description').inputs[0]);
    const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', observed);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === 'browser-binding').passed, false);
  }
});

test('UTF-8 total capture limit closes the recorder before exporting oversized multi-frame data', async () => {
  const entry = (await consoleRoundtripFixture()).browser[0];
  const a = apparatus(entry), frame = structuredClone(entry.capture.frames[0]);
  for (const key of ['axBefore', 'axAfter']) frame[key] += `\n900 text ${'界'.repeat(840_000)}`;
  a.set(frame);
  await assert.rejects(a.recorder.frame('main'), /rejected/u);
  assert.throws(() => a.recorder.finish(), /rejected/u);
  const tooLarge = structuredClone(entry.capture);
  tooLarge.frames[0].axAfter += `\n900 text ${'界'.repeat(1_700_000)}`;
  assert.throws(() => projectConsoleBrowserCapture(entry.request, tooLarge), /raw capture/u);
});

for (const section of ['属性', '可选配置', '依赖声明']) test(`fixed profile rejects named container in ${section}`, async () => {
  const observed = await consoleRoundtripFixture('image');
  for (const f of observed.browser[1].capture.frames) for (const key of ['axBefore', 'axAfter']) {
    f[key] = f[key].replace(new RegExp(`(\\d+ text ${section})`, 'u'), '$1\n900 container 未覆盖字段 unexpected');
  }
  const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.PNG_PUBLISHED', observed);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.assertions.find((item) => item.id === 'browser-binding').passed, false);
});

test('fixed profile rejects description drift in both empty and nonempty non-main frames', async () => {
  for (const index of [0, 1]) {
    const observed = await consoleRoundtripFixture();
    const f = observed.browser[index].capture.frames.find((frame) => frame.kind === 'author');
    for (const key of ['axBefore', 'axAfter']) f[key] = f[key].replace(index === 0
      ? '描述最近更新的内容，以及所有在展示或使用此资源时所需要了解的信息。' : 'theme 更新版描述', 'WRONG DESCRIPTION');
    const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', observed);
    assert.equal(result.status, 'FAIL');
    assert.equal(result.assertions.find((item) => item.id === 'browser-binding').passed, false);
  }
});

for (const [label, mutate] of [
  ['nonempty AX editor', (ax) => ax.replace(/text entry area \(settable\)[ \t]*$/mu, 'text entry area (settable) NONEMPTY EDITOR')],
  ['extra editor link', (ax) => ax.replace(/(\d+ text 相关视图)/u, '900 link Description: UNEXPECTED, Value: https://example.invalid\n$1')],
  ['extra editor named container', (ax) => ax.replace(/(\d+ text 相关视图)/u, '900 container UNEXPECTED EDITOR CONTENT\n$1')],
]) test(`fixed profile rejects ${label} despite empty DIV input`, async () => {
  const observed = await consoleRoundtripFixture();
  const f = observed.browser[0].capture.frames.find((frame) => frame.kind === 'empty-description');
  for (const key of ['axBefore', 'axAfter']) f[key] = mutate(f[key]);
  const result = evaluateConsoleRoundtripCase('INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED', observed);
  assert.equal(result.status, 'FAIL');
  assert.equal(result.assertions.find((item) => item.id === 'browser-binding').passed, false);
});

test('the actual producer stage loop rejects raw errors before SDK-after or any successor request', async () => {
  const source = readFileSync(new URL('../verify-console-roundtrip.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('      for (const [index, stage] of stages.entries()) {');
  const end = source.indexOf('\n      validateConsoleRoundtripFiles(observed);', start);
  assert.ok(start >= 0 && end > start);
  const execute = new (Object.getPrototypeOf(async function () {}).constructor)('scope', `const { Date, kind, stages, expectedConsoleStageVersion, setup, sdkVersion, observed, assert, isDeepStrictEqual,
    consoleCaptureRequest, randomBytes, path, evidenceDir, writeFileSync, console, waitForCapture, budget, evaluateConsoleRoundtripCase, forward } = scope;
    ${source.slice(start, end)}`);
  for (const variant of ['valid', 'legacy', 'wrong-section']) {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-browser-loop-')));
    try {
      const base = await consoleRoundtripFixture();
      const observed = { ...base, evidenceDir: directory, browser: [], sdkStages: [], startedAt: new Date().toISOString(), deadlineAt: new Date(Date.now() + 1_200_000).toISOString() };
      const requests = [], reads = [];
      let requestClock = Date.now();
      const StageClock = class extends Date { constructor(...args) { super(...(args.length ? args : [requestClock += 5000])); } };
      const stages = ['view-first', 'view-updated', 'edit-description', 'edit-text-option'];
      const promise = execute({ Date: StageClock, kind: 'theme', stages, expectedConsoleStageVersion, setup: { source: { versions: consoleLifecycleFixture().versions } }, observed,
        assert(condition, message) { if (!condition) throw new Error(message); }, isDeepStrictEqual, consoleCaptureRequest, randomBytes, path,
        evidenceDir: directory, console: { log() {} }, waitForCapture, budget: createConsoleRoundtripBudget(), evaluateConsoleRoundtripCase,
        forward: { id: 'INTEROP.CLI_TO_CONSOLE.THEME_PUBLISHED' },
        async sdkVersion(...args) {
          const index = reads.length; reads.push(args);
          return base.sdkStages[Math.floor(index / 2)][index % 2 ? 'after' : 'before'];
        },
        writeFileSync(file, json, options) {
          const request = JSON.parse(json); requests.push(request);
          writeFileSync(file, json, options);
          const capture = syntheticBrowserCapture(request, consoleVisibleProjection(base.sdkStages[requests.length - 1].after.data, base.dependencyIdentity));
          if (variant === 'legacy') capture.schemaVersion = 1;
          if (variant === 'wrong-section') {
            const main = capture.frames[0];
            for (const key of ['axBefore', 'axAfter']) main[key] = main[key].replace(/(\d+ text 可选配置)/u, '$1\n900 text 额外内容');
          }
          writeFileSync(file.replace('.request.json', '.capture.json'), JSON.stringify(capture), { flag: 'wx' });
        },
      });
      if (variant === 'valid') {
        await promise;
        assert.equal(requests.length, 4); assert.equal(reads.length, 8);
        assert.deepEqual(observed.browser.map((entry) => entry.request.stage), stages);
      } else {
        await assert.rejects(promise, (error) => error.status === 'FAIL'
          && error.message === 'The raw browser profile was rejected; no successor browser request or write was issued.');
        assert.equal(requests.length, 1); assert.equal(reads.length, 1);
        assert.equal(observed.sdkStages[0].after, undefined);
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});
