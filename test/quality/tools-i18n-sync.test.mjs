import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const requireTools = createRequire(new URL('../../packages/tools-lib/package.json', import.meta.url));
const ts = requireTools('typescript');
const i18nDirectory = fileURLToPath(new URL('../../packages/tools-lib/src/i18n/', import.meta.url));
const tick = () => new Promise((resolve) => setImmediate(resolve));
const initialSource = {
  'account.name': { en_US: 'Account', zh_CN: '账户' },
  'terms:link': { en_US: 'Terms', zh_CN: '条款' },
};

function bundle(source) {
  return {
    en_US: { translation: Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value.en_US])) },
    zh_CN: { translation: Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value.zh_CN])) },
  };
}

// Execute the actual TypeScript modules, replacing only their external boundaries.
// A real isolated i18next instance makes separator/translation assertions behavioral.
function harness({ cached, locale = 'en_US', prod = false, installed = true } = {}) {
  const engine = requireTools('i18next').createInstance();
  const calls = { init: [], add: [], network: [], cache: [], locale: [], parsed: [], state: [], platform: [] };
  const initialize = engine.init.bind(engine);
  engine.init = (...args) => {
    calls.init.push(args);
    const initialized = initialize(...args);
    const addBundle = engine.addResourceBundle.bind(engine);
    engine.addResourceBundle = (...values) => { calls.add.push(values); return addBundle(...values); };
    return initialized;
  };
  let resolveFetch;
  let rejectFetch;
  const pending = new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; });
  const platform = {
    getLocale: () => { calls.platform.push('locale'); return locale; },
    getEnv: () => 'dev',
    useProdI18nBundle: () => prod,
    getI18nCache: () => cached,
    setI18nCache: (value) => calls.cache.push(value),
    setLocale: (value) => calls.locale.push(value),
  };
  let effect;
  const react = {
    useState: (value) => [value, (update) => {
      const previous = calls.state.at(-1) ?? value;
      calls.state.push(typeof update === 'function' ? update(previous) : update);
    }],
    useEffect: (callback, dependencies) => { effect = { callback, dependencies }; },
  };
  const runtime = {
    getPlatform: () => {
      if (!installed) throw new Error('i18n constructed before platform installation');
      return platform;
    },
    setPlatform: () => { installed = true; calls.platform.push('installed'); },
  };
  const external = {
    i18next: engine,
    axios: { get: (...args) => { calls.network.push(args); return pending; } },
    '../platform/runtime': runtime,
    './platform/runtime': runtime,
    './platform/browser': { createBrowserPlatform: () => platform },
    './utils/browser': {},
    './service-API': {},
    react,
    'html-react-parser': (html) => { calls.parsed.push(html); return { parsedHtml: html }; },
  };
  const loaded = new Map();
  const load = (filename) => {
    const absolute = path.resolve(i18nDirectory, filename);
    if (loaded.has(absolute)) return loaded.get(absolute).exports;
    const source = readFileSync(absolute, 'utf8');
    const emitted = ts.transpileModule(source, {
      fileName: absolute,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    loaded.set(absolute, module);
    const controlledRequire = (specifier) => {
      if (Object.hasOwn(external, specifier)) return external[specifier];
      assert.ok(specifier.startsWith('./'), `unexpected dependency ${specifier}`);
      return load(path.resolve(path.dirname(absolute), `${specifier}.ts`));
    };
    vm.runInNewContext(emitted, { module, exports: module.exports, require: controlledRequire }, { filename: absolute });
    return module.exports;
  };
  return {
    calls, engine, load,
    resolve: (source, axiosEnvelope = true) => resolveFetch(axiosEnvelope ? { data: source } : source),
    reject: () => rejectFetch(new Error('offline refresh failure')),
    effect: () => effect,
  };
}

test('actual core initializes a synchronous shell and keeps dotted/colon keys literal in both initializations', async () => {
  const h = harness();
  const Core = h.load('I18nNext.core.ts').I18nNextCore;
  const service = new Core();
  assert.equal(service.t('  before.ready:key  '), 'before.ready:key');
  assert.equal(service.tAuto('  before.ready:key  '), 'before.ready:key');
  assert.equal(h.calls.init.length, 1);
  assert.equal(h.calls.init[0][0].keySeparator, false);
  assert.equal(h.calls.init[0][0].nsSeparator, false);
  h.resolve(initialSource);
  await service.ready();
  assert.equal(h.calls.init.length, 2);
  assert.equal(h.calls.init[1][0].keySeparator, false);
  assert.equal(h.calls.init[1][0].nsSeparator, false);
  assert.equal(service.t('account.name'), 'Account');
  assert.equal(service.t('terms:link'), 'Terms');
  assert.equal(h.calls.network.length, 1);
  assert.match(h.calls.network[0][0], /\/configs-test\/i18n\.json\?timestamp=\d+$/);
  assert.equal(h.calls.network[0][1].withCredentials, false);
});

test('changed cached resources apply real bundles, notify once, and honor detached subscription/unsubscribe', async () => {
  const h = harness({ cached: JSON.stringify(bundle(initialSource)) });
  const service = new (h.load('I18nNext.core.ts').I18nNextCore)();
  await service.ready();
  assert.equal(service.t('account.name'), 'Account');
  let updates = 0;
  const subscribe = service.subscribe;
  const unsubscribe = subscribe(() => { updates += 1; });
  const removed = subscribe(() => { updates += 100; });
  removed();
  removed();
  const changed = { ...initialSource, 'account.name': { en_US: 'Updated', zh_CN: '更新' } };
  h.resolve(changed);
  await tick();
  assert.equal(service.t('account.name'), 'Updated');
  assert.equal(h.calls.init.length, 2, 'refresh adds bundles without reinitializing');
  assert.equal(h.calls.add.length, 2);
  assert.deepEqual(h.calls.add.map((args) => [args[0], args[1], args[3], args[4]]), [
    ['zh_CN', 'translation', true, true], ['en_US', 'translation', true, true],
  ]);
  assert.equal(updates, 1);
  assert.equal(h.calls.cache.at(-1), JSON.stringify(bundle(changed)));
  unsubscribe();
  assert.equal(typeof unsubscribe, 'function');
});

test('identical background resources retain cache translations without bundle additions or notification', async () => {
  const h = harness({ cached: JSON.stringify(bundle(initialSource)) });
  const service = new (h.load('I18nNext.core.ts').I18nNextCore)();
  await service.ready();
  let updates = 0;
  service.subscribe(() => { updates += 1; });
  h.resolve(initialSource);
  await tick();
  assert.equal(service.t('terms:link'), 'Terms');
  assert.equal(h.calls.add.length, 0);
  assert.equal(updates, 0);
});

test('a rejected background refresh keeps ready cached translations and produces no update', async () => {
  const h = harness({ cached: JSON.stringify(bundle(initialSource)) });
  const service = new (h.load('I18nNext.core.ts').I18nNextCore)();
  await service.ready();
  h.reject();
  await tick();
  await service.ready();
  assert.equal(service.t('account.name'), 'Account');
  assert.equal(h.calls.cache.length, 0);
  assert.equal(h.calls.add.length, 0);
});

test('actual browser parser recognizes general HTML and wrapped HTML while preserving plain text', async () => {
  const h = harness();
  const service = new (h.load('I18nNext.browser.ts').default)();
  h.resolve({
    plain: { en_US: '  Plain text  ', zh_CN: '纯文本' },
    link: { en_US: ' \nRead <a href="/terms">terms</a> ', zh_CN: '条款' },
    wrapped: { en_US: " \n<DIV class = 'i18n'>Rich</DIV> ", zh_CN: '富文本' },
    less: { en_US: '2 < 3 and 5 > 4', zh_CN: '比较' },
  });
  await service.ready();
  assert.equal(service.tAuto('plain'), '  Plain text  ');
  assert.equal(service.tAuto('less'), '2 < 3 and 5 > 4');
  assert.equal(service.tAuto('link').parsedHtml, 'Read <a href="/terms">terms</a>');
  assert.equal(service.tAuto('wrapped').parsedHtml, "<DIV class = 'i18n'>Rich</DIV>");
  assert.equal(service.tJSXElement('link').parsedHtml, 'Read <a href="/terms">terms</a>');
  assert.equal(h.calls.parsed.length, 3);
});

test('actual Node subclass returns strings for HTML and retains platform locale/environment adapters', async () => {
  const h = harness({ prod: true });
  const service = new (h.load('I18nNext.node-runtime.ts').default)();
  h.resolve({ link: { en_US: ' <a>Terms</a> ', zh_CN: '<b>条款</b>' } }, false);
  await service.ready();
  assert.equal(service.tAuto('link'), ' <a>Terms</a> ');
  assert.equal(service.tJSXElement('link'), ' <a>Terms</a> ');
  assert.equal(h.calls.parsed.length, 0);
  service.changeLanguage('zh_CN');
  assert.equal(service.getCurrentLanguage(), 'zh_CN');
  assert.equal(service.tAuto('link'), '<b>条款</b>');
  assert.deepEqual(h.calls.locale, ['zh_CN']);
  assert.match(h.calls.network[0][0], /\/configs\/i18n\.json\?timestamp=\d+$/);
});

test('actual browser resource hook increments on refresh and returns subscription cleanup', async () => {
  const h = harness({ cached: JSON.stringify(bundle(initialSource)) });
  const createBrowserI18n = h.load('browser.ts').default;
  assert.equal(h.calls.init.length, 0, 'importing the factory must not construct i18n');
  assert.equal(h.calls.network.length, 0);
  const api = createBrowserI18n();
  await api.i18nNext.ready();
  assert.equal(typeof api.useResourcesTick, 'function');
  assert.equal(api.useResourcesTick(), 0);
  const effect = h.effect();
  assert.equal(effect.dependencies.length, 0);
  const listeners = new Set();
  const actualSubscribe = api.i18nNext.subscribe;
  api.i18nNext.subscribe = (listener) => {
    listeners.add(listener);
    const unsubscribe = actualSubscribe(listener);
    return () => { listeners.delete(listener); unsubscribe(); };
  };
  const cleanup = effect.callback();
  assert.equal(listeners.size, 1);
  h.resolve({ ...initialSource, added: { en_US: 'New', zh_CN: '新' } });
  await tick();
  assert.deepEqual(h.calls.state, [1]);
  for (const listener of listeners) listener();
  assert.deepEqual(h.calls.state, [1, 2], 'hook uses functional state updates');
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(api.i18nNext.t('added'), 'New');
});

test('public browser entry exposes the resource hook and installs its platform before constructing i18n', async () => {
  const h = harness({ cached: JSON.stringify(bundle(initialSource)), installed: false });
  const api = h.load('../browser.ts');
  await api.FI18n.i18nNext.ready();
  assert.deepEqual(h.calls.platform, ['installed', 'locale']);
  assert.equal(typeof api.FI18n.useResourcesTick, 'function');
  assert.equal(api.FI18n.useResourcesTick(), 0);
  const cleanup = h.effect().callback();
  h.resolve({ ...initialSource, public: { en_US: 'Public hook', zh_CN: '公共钩子' } });
  await tick();
  assert.deepEqual(h.calls.state, [1]);
  assert.equal(api.FI18n.i18nNext.t('public'), 'Public hook');
  assert.equal(typeof cleanup, 'function');
  cleanup();
});
