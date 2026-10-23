/** Entry-only controls: missing candidates must not start children, keyring or transport. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function apparatus(t, producer = 'verify-collection-recovery.mjs') {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-recovery-entry-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-recovery-entry-'));
    rmSync(root, { recursive: true, force: true });
  });
  const touched = path.join(root, 'prohibited-io.jsonl'), loader = path.join(root, 'deny-loader.mjs'), preload = path.join(root, 'deny-preload.mjs');
  writeFileSync(loader, `import { appendFileSync } from 'node:fs';
export async function resolve(specifier, context, nextResolve) {
  if (/keyring|tools-lib[\\\\/]dist[\\\\/]node\\.mjs/u.test(specifier)) {
    appendFileSync(${JSON.stringify(touched)}, 'module\\n'); throw new Error('PRECHECK_PROHIBITED_IO');
  }
  return nextResolve(specifier, context);
}
`);
  writeFileSync(preload, `import fs from 'node:fs';
import http from 'node:http'; import https from 'node:https'; import net from 'node:net';
import tls from 'node:tls'; import dns from 'node:dns'; import child from 'node:child_process';
import Module, { syncBuiltinESMExports } from 'node:module';
const mark = (kind) => { fs.appendFileSync(${JSON.stringify(touched)}, kind + '\\n'); throw new Error('PRECHECK_PROHIBITED_IO'); };
for (const [target, names] of [[http,['request','get','createServer']], [https,['request','get','createServer']], [net,['connect','createConnection']],
  [tls,['connect']], [dns,['lookup','resolve']], [child,['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork']]]) {
  for (const name of names) target[name] = () => mark(name);
}
globalThis.fetch = () => mark('fetch');
const actualRead = fs.readFileSync;
fs.readFileSync = function(file, ...args) {
  if (/freelog-test-credentials|freelog-test-resource-pool|(?:^|[\\\\/])auth$/u.test(String(file))) return mark('private-read');
  return actualRead.call(this, file, ...args);
};
const actualLoad = Module._load;
Module._load = function(specifier, ...args) { if (/keyring/u.test(specifier)) return mark('native-keyring'); return actualLoad.call(this, specifier, ...args); };
syncBuiltinESMExports();
`);
  function run(output, args = ['--env', 'dev']) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP)$/iu.test(key)));
    Object.assign(env, { FREELOG_TEST_RUN_ID: 'synthetic-recovery-preflight', FREELOG_TEST_SUITE_REPORT: output,
      FREELOG_TEST_CLI_BIN: path.join(root, 'missing-installed-candidate.js'), HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root });
    return spawnSync(process.execPath, ['--no-warnings', '--experimental-loader', pathToFileURL(loader).href, '--import', pathToFileURL(preload).href,
      fileURLToPath(new URL(`../${producer}`, import.meta.url)), ...args],
    { cwd: root, env, encoding: 'utf8', timeout: 20_000, maxBuffer: 1_000_000, windowsHide: true });
  }
  function untouched(result) {
    assert.equal(result.signal, null); assert.equal(result.error, undefined);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /PRECHECK_PROHIBITED_IO/u);
    assert.equal(existsSync(touched), false, 'Caught exceptions cannot conceal prohibited preflight IO.');
  }
  return { root, run, untouched };
}

for (const kind of ['recovery', 'items', 'selection', 'edit']) {
test(`missing installed ${kind} candidate is BLOCKED before any CLI child, credentials, keyring or network`, (t) => {
  const f = apparatus(t, `verify-collection-${kind}.mjs`), output = path.join(f.root, 'missing.json'), result = f.run(output);
  f.untouched(result); assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(report.cases.length, 1);
  assert.equal(report.cases[0].id, kind === 'selection' ? 'COLLECTION.ITEMS.SELECTION_TTY' : `COLLECTION.${kind.toUpperCase()}.INSTALLED_MATRIX`);
  assert.equal(report.cases[0].status, 'BLOCKED');
  assert.equal(report.cases[0].observations.executed, false);
  assert.deepEqual(report.cases[0].assertions, []);
});

test(`prod ${kind} entry is rejected without writing evidence or starting prohibited IO`, (t) => {
  const f = apparatus(t, `verify-collection-${kind}.mjs`), output = path.join(f.root, 'prod.json'), result = f.run(output, ['--env', 'prod']);
  f.untouched(result); assert.equal(result.status, 1);
  assert.match(result.stderr, /permits only --env dev/u); assert.equal(existsSync(output), false);
});

test(`existing ${kind} evidence is never overwritten even when the candidate is absent`, (t) => {
  const f = apparatus(t, `verify-collection-${kind}.mjs`), output = path.join(f.root, 'existing.json'), original = 'Existing evidence sentinel.\n';
  writeFileSync(output, original);
  const result = f.run(output); f.untouched(result);
  assert.equal(result.status, 1); assert.match(result.stderr, /existing evidence is never overwritten/u);
  assert.equal(readFileSync(output, 'utf8'), original);
});
}
