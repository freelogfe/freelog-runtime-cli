/** Orchestration controls only: all candidate/producer results are synthetic, no SDK/keyring/account access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { acceptanceScope } from '../run-final-acceptance.mjs';
import { acceptanceCatalog, acceptanceScripts } from '../acceptance/catalog.mjs';

const runner = fileURLToPath(new URL('../run-final-acceptance.mjs', import.meta.url));
test('full scope preserves the original producer order; no caller script/filter is accepted', () => {
  assert.deepEqual(acceptanceScope().scripts, acceptanceScripts());
  assert.equal(acceptanceScope().needsTty, true);
  assert.deepEqual(acceptanceScope('type-init'), { scope: 'type-init', scripts: ['verify-type-init.mjs'], needsTty: false });
  assert.deepEqual(acceptanceScope('collection-lifecycle'), { scope: 'collection-lifecycle', scripts: ['verify-theme-image-full-lifecycle.mjs', 'verify-collection-lifecycle.mjs'], needsTty: false });
  for (const bad of ['', 'partial', ['verify-collection-lifecycle.mjs'], { scripts: ['verify-collection-lifecycle.mjs'] }]) assert.throws(() => acceptanceScope(bad), /Unknown acceptance scope/u);
});

function fixture(t, purpose = 'development', scope = 'collection-lifecycle', privateAvailable = true) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-acceptance-scope-')));
  t.after(() => { assert.equal(path.dirname(root), realpathSync(tmpdir())); assert.ok(path.basename(root).startsWith('freelog-acceptance-scope-')); rmSync(root, { recursive: true, force: true }); });
  const coreUrl = new URL('../../scripts/release/core.mjs', import.meta.url).href;
  const catalogUrl = new URL('../acceptance/catalog.mjs', import.meta.url).href;
  const candidateFile = path.join(root, 'synthetic-candidate.json'), cliBin = path.join(root, 'synthetic-bin.js');
  const candidate = { purpose, sourceRevision: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), clean: purpose === 'release' },
    sourceFingerprint: 'c'.repeat(64), tarballSha512: 'd'.repeat(128), cliBin };
  writeFileSync(candidateFile, 'Synthetic binding, not a real candidate.'); writeFileSync(cliBin, '// Never executed');
  writeFileSync(path.join(root, 'acceptance.json'), 'Existing full report sentinel');
  writeFileSync(path.join(root, 'summary.txt'), 'Existing full summary sentinel');
  const loader = path.join(root, 'synthetic-candidate-loader.mjs'), preload = path.join(root, 'deny-real-producers.mjs');
  const code = `export function readCandidate() { return ${JSON.stringify({ candidate, candidateFile })}; }`;
  writeFileSync(loader, `export async function resolve(specifier, context, nextResolve) {
    const resolved = await nextResolve(specifier, context);
    if (resolved.url === ${JSON.stringify(coreUrl)}) return { url: ${JSON.stringify(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)}, shortCircuit: true };
    return resolved;
  }`);
  const callsFile = path.join(root, 'synthetic-calls.json');
  const privateProbesFile = path.join(root, 'private-probe-attempt.txt');
  writeFileSync(preload, `import fs from 'node:fs'; import childProcess from 'node:child_process'; import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module'; import { acceptanceCatalog } from ${JSON.stringify(catalogUrl)};
const exists = fs.existsSync, read = fs.readFileSync, calls = [];
const write = process.stdout.write.bind(process.stdout); let announced;
process.stdout.write = function(chunk, ...args) { const text = String(chunk); if (text.startsWith('Run evidence directory: ')) announced = text.trim().slice('Run evidence directory: '.length); return write(chunk, ...args); };
fs.existsSync = (file) => {
  if (/\\.freelog-test-(credentials|resource-pool|optional-config)\\.local\\.json$/u.test(String(file))) {
    if (['type-init', 'collection-recovery', 'collection-items', 'collection-selection', 'collection-edit', 'collection-rules', 'collection-publish-preflight', 'collection-publish-preview'].includes(${JSON.stringify(scope)})) { fs.writeFileSync(${JSON.stringify(privateProbesFile)}, 'Unrelated private input probe attempted'); throw new Error('FORBIDDEN_PRIVATE_INPUT_CHECK'); }
    return ${JSON.stringify(privateAvailable)};
  }
  return exists(file);
};
fs.readFileSync = function(file, ...args) { if (/freelog-test-.*local\\.json/u.test(String(file))) throw new Error('FORBIDDEN_PRIVATE_READ'); return read.call(this, file, ...args); };
childProcess.spawnSync = (exe, args, options) => {
  const script = path.basename(args[0]);
  if (!${JSON.stringify(acceptanceScope(scope).scripts)}.includes(script)) throw new Error('FORBIDDEN_BUILD_TTY_OR_PRODUCER');
  if (announced !== path.dirname(options.env.FREELOG_TEST_SUITE_REPORT) || !exists(announced)) throw new Error('PRODUCER_BEFORE_EVIDENCE_ANNOUNCEMENT');
  calls.push({ exe, args, announced, env: { runId: options.env.FREELOG_TEST_RUN_ID, cliBin: options.env.FREELOG_TEST_CLI_BIN, candidateMode: options.env.FREELOG_TEST_CANDIDATE_MODE }, report: options.env.FREELOG_TEST_SUITE_REPORT });
  fs.writeFileSync(${JSON.stringify(callsFile)}, JSON.stringify(calls));
  fs.writeFileSync(options.env.FREELOG_TEST_SUITE_REPORT, JSON.stringify({ schemaVersion: 1, cases: acceptanceCatalog.filter((c) => c.script === script && c.kind === 'product-case').map((c) => ({ id: c.id, status: 'NOT_TESTED', reason: 'Synthetic orchestration only', assertions: [] })) }));
  return { status: 3, signal: null, error: undefined, stdout: '', stderr: '' };
}; syncBuiltinESMExports();`);
  const env = { ...process.env }; delete env.NODE_OPTIONS; delete env.FREELOG_TEST_CLI_BIN; delete env.FREELOG_TEST_CANDIDATE_MODE;
  const run = () => spawnSync(process.execPath, ['--experimental-loader', pathToFileURL(loader).href, '--import', pathToFileURL(preload).href,
    runner, '--candidate', candidateFile, '--scope', scope], { env, encoding: 'utf8', timeout: 20_000, maxBuffer: 2_000_000 });
  return { root, cliBin, callsFile, privateProbesFile, run };
}

test('actual aggregate entry runs only fixed producers, binds one run/bin and never overwrites full reports', (t) => {
  const f = fixture(t), result = f.run();
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /FORBIDDEN_/u);
  assert.equal(readFileSync(path.join(f.root, 'acceptance.json'), 'utf8'), 'Existing full report sentinel');
  assert.equal(readFileSync(path.join(f.root, 'summary.txt'), 'utf8'), 'Existing full summary sentinel');
  const files = readdirSync(f.root).filter((name) => /^acceptance\.collection-lifecycle\.[a-f\d-]+\.json$/u.test(name));
  assert.equal(files.length, 1);
  const report = JSON.parse(readFileSync(path.join(f.root, files[0]), 'utf8')), calls = JSON.parse(readFileSync(f.callsFile, 'utf8'));
  assert.equal(report.scope, 'collection-lifecycle'); assert.equal(report.releaseEvidence, false); assert.equal(report.releaseApproved, false);
  assert.equal(report.releaseBlocker, 'Scoped development evidence cannot satisfy full candidate acceptance.');
  assert.deepEqual(report.cases.map((c) => c.id), acceptanceCatalog.map((c) => c.id));
  assert.deepEqual(calls.map((c) => path.basename(c.args[0])), ['verify-theme-image-full-lifecycle.mjs', 'verify-collection-lifecycle.mjs']);
  for (const call of calls) {
    assert.equal(call.env.runId, report.runId); assert.equal(call.env.cliBin, f.cliBin); assert.equal(call.env.candidateMode, '1');
    assert.equal(path.dirname(call.report), report.evidenceDir); assert.deepEqual(call.args.slice(1), ['--env', 'dev', '--skip-build']);
    assert.equal(call.announced, report.evidenceDir);
  }
  assert.equal(report.cases.filter((c) => c.status === 'PASS').length, 0);
  for (const item of acceptanceCatalog.filter((c) => !acceptanceScope('collection-lifecycle').scripts.includes(c.script))) {
    assert.equal(report.cases.find((c) => c.id === item.id).status, 'NOT_TESTED');
  }
});

test('a release candidate is rejected before any scoped producer or private read', (t) => {
  const f = fixture(t, 'release'), result = f.run();
  assert.equal(result.status, 1); assert.match(result.stderr, /Scoped diagnosis permits development candidates only/u);
  assert.equal(existsSync(f.callsFile), false); assert.doesNotMatch(result.stderr, /FORBIDDEN_/u);
});

for (const scope of ['type-init', 'collection-recovery', 'collection-items', 'collection-selection', 'collection-edit', 'collection-rules', 'collection-publish-preflight', 'collection-publish-preview']) test(`fixed local ${scope} diagnosis never probes real dev credentials, resource pool or optional fixtures`, (t) => {
  const f = fixture(t, 'development', scope), result = f.run();
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  assert.equal(existsSync(f.privateProbesFile), false, 'Even a caught private probe is forbidden for local recovery.');
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /FORBIDDEN_/u);
  const calls = JSON.parse(readFileSync(f.callsFile, 'utf8'));
  assert.deepEqual(calls.map((call) => path.basename(call.args[0])), acceptanceScope(scope).scripts);
  const reportName = readdirSync(f.root).find((name) => name.startsWith(`acceptance.${scope}.`) && name.endsWith('.json'));
  const report = JSON.parse(readFileSync(path.join(f.root, reportName), 'utf8'));
  assert.equal(report.releaseApproved, false); assert.equal(report.releaseEvidence, false);
  assert.deepEqual(report.cases.map((item) => item.id), acceptanceCatalog.map((item) => item.id));
  assert.equal(readFileSync(path.join(f.root, 'acceptance.json'), 'utf8'), 'Existing full report sentinel');
  assert.equal(readFileSync(path.join(f.root, 'summary.txt'), 'utf8'), 'Existing full summary sentinel');
});

for (const scope of ['full', 'collection-lifecycle']) test(`${scope} still blocks missing real dev inputs before producers or TTY`, (t) => {
  const f = fixture(t, 'development', scope, false), result = f.run();
  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /BLOCKED setup: Required private dev credentials, resource pool or optional-config fixture is unavailable/u);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /FORBIDDEN_/u);
  assert.equal(existsSync(f.callsFile), false);
});
