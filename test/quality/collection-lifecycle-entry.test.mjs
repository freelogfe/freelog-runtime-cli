/** Entry preflight must fail before private inputs, SDK initialization or any CLI child can run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

test('collection producer rejects prod and absent installed candidate without accessing credentials or SDK', (t) => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-collection-entry-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-collection-entry-'));
    rmSync(root, { recursive: true, force: true });
  });
  const preload = path.join(root, 'deny-private-and-sdk.mjs');
  const loader = path.join(root, 'deny-sdk-loader.mjs');
  const touched = path.join(root, 'forbidden-access-observed.txt');
  writeFileSync(loader, `import { writeFileSync } from 'node:fs';
export async function resolve(specifier, context, nextResolve) {
  if (specifier.includes('tools-lib/dist/node.mjs')) {
    writeFileSync(${JSON.stringify(touched)}, 'SDK access attempted');
    throw new Error('PRECHECK_TOUCHED_PRIVATE_OR_SDK');
  }
  return nextResolve(specifier, context);
}
`);
  // No real credentials are read: private file and workspace SDK access are fatal before startup.
  writeFileSync(preload, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const actual = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  if (/freelog-test-credentials|tools-lib[\\\\/]dist[\\\\/]node\\.mjs/u.test(String(file))) {
    fs.writeFileSync(${JSON.stringify(touched)}, 'Private input access attempted');
    throw new Error('PRECHECK_TOUCHED_PRIVATE_OR_SDK');
  }
  return actual.call(this, file, ...args);
};
syncBuiltinESMExports();
`);
  for (const [index, args] of [['--env', 'prod'], ['--env', 'dev']].entries()) {
    const output = path.join(root, `result-${index}.json`);
    const env = { ...process.env, FREELOG_TEST_RUN_ID: 'synthetic-preflight-only', FREELOG_TEST_SUITE_REPORT: output,
      FREELOG_TEST_CLI_BIN: path.join(root, 'absent-installed-bin.js') };
    delete env.NODE_OPTIONS;
    const result = spawnSync(process.execPath, ['--experimental-loader', pathToFileURL(loader).href, '--import', pathToFileURL(preload).href, fileURLToPath(new URL('../verify-collection-lifecycle.mjs', import.meta.url)), ...args],
      { env, encoding: 'utf8', timeout: 20_000, maxBuffer: 2_000_000 });
    assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);
    assert.equal(result.error, undefined);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /PRECHECK_TOUCHED_PRIVATE_OR_SDK/u);
    assert.equal(existsSync(touched), false, 'A caught private/SDK access error must not hide a forbidden preflight side effect.');
    const report = JSON.parse(readFileSync(output, 'utf8'));
    assert.equal(report.cases.length, 1);
    assert.equal(report.cases[0].id, 'COLLECTION.LIFECYCLE.FIRST_UPDATE');
    assert.equal(report.cases[0].status, 'BLOCKED');
    assert.notEqual(report.cases[0].observations?.actions?.length > 0, true);
  }
});
