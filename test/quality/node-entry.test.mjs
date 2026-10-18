import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const requireTools = createRequire(new URL('../../packages/tools-lib/package.json', import.meta.url));
const ts = requireTools('typescript');
let loadSequence = 0;

async function loadNodeEntry() {
  const source = readFileSync(new URL('../../packages/tools-lib/src/node.ts', import.meta.url), 'utf8');
  // Evaluate the real entry initializer with observable import boundaries. This unit test
  // proves lazy construction; the actual installed-package network guard proves zero traffic.
  const dependencies = [
    [/import \{ setPlatform \} from '[^']+';/u, 'const setPlatform = () => {};'],
    [/import \{ createNodePlatform \} from '[^']+';/u, 'const createNodePlatform = () => ({});'],
    [/import FUtil from '[^']+';/u, 'const FUtil = {};'],
    [/import FServiceAPI from '[^']+';/u, 'const FServiceAPI = {};'],
    [/import NodeI18nNext from '[^']+';/u, 'let constructed = 0; class NodeI18nNext { constructor() { constructed += 1; } }'],
  ];
  let isolated = source;
  for (const [pattern, replacement] of dependencies) {
    assert.match(isolated, pattern, 'the actual import boundary must still match');
    isolated = isolated.replace(pattern, replacement);
  }
  const emitted = ts.transpileModule(`${isolated}\nexport const constructionCount = () => constructed;`, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(emitted).toString('base64')}#isolated-${++loadSequence}`);
}

test('Node API/tool entry import does not construct the network-initialized internationalization service', async () => {
  const entry = await loadNodeEntry();
  assert.equal(typeof entry.FUtil, 'object');
  assert.equal(typeof entry.FServiceAPI, 'object');
  assert.equal(entry.constructionCount(), 0);
  assert.ok(Object.hasOwn(entry.FI18n, 'i18nNext'));
  assert.equal(entry.constructionCount(), 0);
});

test('explicit Node internationalization access constructs once and retains its public object identity', async () => {
  const entry = await loadNodeEntry();
  const first = entry.FI18n.i18nNext;
  assert.equal(entry.constructionCount(), 1);
  assert.equal(entry.FI18n.i18nNext, first);
  assert.equal(entry.constructionCount(), 1);
});
