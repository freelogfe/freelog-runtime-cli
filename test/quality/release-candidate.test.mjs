import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  assertPackageFileAllowed, checkCandidate as checkReleaseCandidate, MAX_AGE_MS, PACKAGE_NAME, prepareCandidate,
  publishCandidate as publishReleaseCandidate, readCandidate, REGISTRY, sourceFingerprint,
} from '../../scripts/release/core.mjs';
import { parseArguments } from '../../scripts/release/cli.mjs';
import { seedDeliveryDesigns, writeDeliveryFixture } from './fixtures/delivery.mjs';
import { remoteQualityFixture } from './fixtures/remote-quality.mjs';

// Transport substitution exercises the real GitHub validator; no fake approval API is injected.
const remoteTransports = new Map();
const checkCandidate = (input, options) => checkReleaseCandidate(input, { ...options, remoteFetch: remoteTransports.get(options.repoRoot) });
const publishCandidate = (input, options) => publishReleaseCandidate(input, { ...options, remoteFetch: remoteTransports.get(options.repoRoot) });

const ownRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const json = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value)}\n`); };
const put = (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };
const hash512 = (value) => createHash('sha512').update(value).digest('hex');
const git = (root, ...args) => {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
};

function fixture(t, changes = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'freelog-quality-release-'));
  t.after(() => {
    assert.ok(path.dirname(root) === tmpdir() && path.basename(root).startsWith('freelog-quality-release-'));
    rmSync(root, { recursive: true, force: true });
  });
  json(path.join(root, 'package.json'), { private: true, scripts: { verify: 'fake-offline-gates' } });
  json(path.join(root, 'packages/cli/package.json'), { name: PACKAGE_NAME, version: '0.5.8', bin: { 'freelog-cli': './dist/bin/index.js' } });
  put(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  put(path.join(root, 'src/feature.ts'), 'export const value = 1;\n');
  put(path.join(root, 'docs/design.md'), '# Approved contract\n');
  seedDeliveryDesigns(root);
  put(path.join(root, 'docs/一期/产品方案/使用/README.md'), '# Usage\n');
  put(path.join(root, 'docs/一期/产品方案/使用/合集/README.md'), '# Collection usage\n');
  if (changes.git !== false) {
    put(path.join(root, '.gitignore'), '.artifacts/\n.omx/\nnode_modules/\ndist/\nignored-effective.txt\n');
    git(root, 'init', '--quiet');
    git(root, 'config', 'user.name', 'Synthetic release test');
    git(root, 'config', 'user.email', 'synthetic-release@example.invalid');
    git(root, 'config', 'core.autocrlf', 'false');
    git(root, 'add', '--', '.');
    git(root, 'commit', '--quiet', '-m', 'Synthetic source fixture');
  }
  const calls = [];
  const state = { ...changes, registryBytes: changes.registryBytes ?? null, bytes: Buffer.from('fixed-tarball-bytes') };
  const files = ['package.json', 'README.md', 'dist/bin/index.js', 'dist/docs/README.md', 'dist/docs/合集/README.md'];
  const runner = (command, args, options) => {
    calls.push({ command, args: [...args], ...options });
    if (command === 'pnpm') return { status: state.verifyFail ? 1 : 0, stdout: '', stderr: '' };
    if (command === process.execPath) {
      if (args[1] === '--cli-version') return { status: 0, stdout: '0.5.8\n', stderr: '' };
      const pkg = path.resolve(path.dirname(args[0]), '../..');
      return { status: 0, stdout: `help\n${path.join(pkg, 'dist/docs/README.md')}\n`, stderr: '' };
    }
    assert.equal(command, 'npm');
    if (args[0] === 'pack') {
      const destination = args[args.indexOf('--pack-destination') + 1];
      mkdirSync(destination, { recursive: true });
      const filename = 'freelog-cli-cli2-0.5.8.tgz';
      const bytes = args[1] === '--json' ? state.bytes : state.downloadBytes ?? state.registryBytes;
      writeFileSync(path.join(destination, filename), bytes);
      return { status: 0, stdout: JSON.stringify([{ name: PACKAGE_NAME, version: '0.5.8', filename,
        files: (state.packFiles ?? files).map((item) => ({ path: item })) }]), stderr: '' };
    }
    if (args[0] === 'install') {
      const install = args[args.indexOf('--prefix') + 1];
      const pkg = path.join(install, 'node_modules/@freelog-cli/cli2');
      json(path.join(pkg, 'package.json'), { name: PACKAGE_NAME, version: '0.5.8',
        ...(Object.hasOwn(state, 'installedBin') ? { bin: state.installedBin } : { bin: { 'freelog-cli': './dist/bin/index.js' } }),
      });
      put(path.join(pkg, 'README.md'), '# CLI\n');
      put(path.join(pkg, 'dist/bin/index.js'), 'console.log("installed candidate");\n');
      if (!state.missingShim) {
        put(path.join(install, 'node_modules/.bin', `freelog-cli${process.platform === 'win32' ? '.cmd' : ''}`), '../@freelog-cli/cli2/dist/bin/index.js');
      }
      for (const guide of ['README.md', '合集/README.md']) {
        put(path.join(pkg, 'dist/docs', guide), readFileSync(path.join(root, 'docs/一期/产品方案/使用', guide)));
      }
      if (state.badManual) put(path.join(pkg, 'dist/docs/合集/README.md'), 'outdated manual');
      return { status: 0, stdout: '', stderr: '' };
    }
    if (args[0] === 'view') {
      if (state.lookupFail) return { status: 1, stdout: JSON.stringify({ error: { code: 'ENETDOWN' } }) };
      if (state.registryBytes === null) return { status: 1, stdout: JSON.stringify({ error: { code: 'E404' } }) };
      return { status: 0, stdout: JSON.stringify(`sha512-${createHash('sha512').update(state.registryBytes).digest('base64')}`) };
    }
    if (args[0] === 'publish') {
      state.registryBytes = readFileSync(args[1]);
      if (state.publishUnknown) return { status: null, signal: 'SIGTERM', error: new Error('timeout') };
      return { status: 0, stdout: '', stderr: '' };
    }
    throw new Error(`Unanticipated npm action: ${args[0]}`);
  };
  const remote = remoteQualityFixture({ commit: changes.git === false ? 'a'.repeat(40) : git(root, 'rev-parse', 'HEAD') });
  remoteTransports.set(root, remote.fetchImpl);
  t.after(() => remoteTransports.delete(root));
  return { root, calls, runner, state, remote };
}

function accept(prepared) {
  writeDeliveryFixture(prepared, prepared.candidate.repoRoot);
  json(path.join(path.dirname(prepared.candidateFile), 'acceptance.json'), {
    schemaVersion: 2, ...Object.fromEntries(['purpose', 'sourceRevision', 'sourceFingerprint', 'tarballSha512', 'cliBin'].map((key) => [key, prepared.candidate[key]])),
    environment: 'dev', releaseEvidence: prepared.candidate.purpose === 'release', cases: [{ id: 'fixture', status: 'PASS' }],
  });
}

function fakeValidator(report, expected) {
  assert.equal(report.schemaVersion, 2);
  for (const key of ['purpose', 'sourceFingerprint', 'tarballSha512', 'cliBin']) assert.equal(report[key], expected[key]);
  assert.deepEqual(report.sourceRevision, expected.sourceRevision);
  assert.equal(report.environment, 'dev');
  assert.ok(report.cases.length > 0 && report.cases.every((item) => item.status === 'PASS'));
  return { valid: true, caseCount: report.cases.length };
}

test('source content fingerprint is deterministic, includes untracked source/test/design/lock and excludes private/generated files', (t) => {
  const f = fixture(t);
  const original = sourceFingerprint(f.root);
  assert.equal(sourceFingerprint(f.root), original);
  for (const file of ['.artifacts/release/candidate.json', 'packages/cli/dist/index.js', '.omx/state/run.json', 'test/.freelog-test-credentials.local.json', '.npmrc']) {
    put(path.join(f.root, file), 'ignored fixture');
    assert.equal(sourceFingerprint(f.root), original, file);
  }
  for (const file of ['src/untracked.ts', 'test/new-case.mjs', 'docs/new-design.md', 'pnpm-lock.yaml']) {
    const before = sourceFingerprint(f.root);
    put(path.join(f.root, file), `changed:${file}`);
    assert.notEqual(sourceFingerprint(f.root), before, file);
  }
});

test('prepare gates, packs once, installs fixed tarball and checks all usage documents', (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  assert.equal(f.calls[0].command, 'pnpm');
  assert.deepEqual(f.calls[0].args, ['verify']);
  assert.equal(f.calls.filter((call) => call.args[0] === 'pack').length, 1);
  const installed = f.calls.find((call) => call.args[0] === 'install');
  assert.equal(installed.args.at(-1), p.candidate.tarballPath);
  for (const key of ['tarballPath', 'cliBin', 'installRoot']) assert.ok(path.isAbsolute(p.candidate[key]));
  assert.equal(p.candidate.tarballSha512, hash512(f.state.bytes));
  assert.deepEqual(readCandidate(path.dirname(p.candidateFile), { repoRoot: f.root }).candidate, p.candidate);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 0);
});

test('candidate purpose and immutable source revision come from the actual committed input tree', (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  assert.equal(p.candidate.schemaVersion, 2);
  assert.equal(p.candidate.purpose, 'release');
  assert.deepEqual(p.candidate.sourceRevision, {
    commit: git(f.root, 'rev-parse', 'HEAD'), tree: git(f.root, 'rev-parse', 'HEAD^{tree}'), clean: true,
  });
});

test('dirty, untracked, ignored effective inputs and missing Git commit stay development-only', async (t) => {
  for (const scenario of ['dirty', 'untracked', 'ignored', 'no-git', 'no-commit']) {
    const f = fixture(t, { git: !scenario.startsWith('no-') });
    if (scenario === 'dirty') put(path.join(f.root, 'src/feature.ts'), 'changed source\n');
    if (scenario === 'untracked') put(path.join(f.root, 'src/new.ts'), 'new source\n');
    if (scenario === 'ignored') {
      put(path.join(f.root, 'ignored-effective.txt'), 'Git ignored, but a candidate input\n');
      assert.equal(git(f.root, 'status', '--porcelain'), '');
    }
    if (scenario === 'no-commit') git(f.root, 'init', '--quiet');
    const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
    assert.equal(p.candidate.purpose, 'development', scenario);
    assert.equal(p.candidate.sourceRevision.clean, false, scenario);
    assert.equal(readCandidate(p.candidateFile, { repoRoot: f.root }).candidate.purpose, 'development');
    accept(p);
    await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root, verifyAcceptance: fakeValidator }), /development candidate/u);
    await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /development candidate/u);
    assert.equal(f.calls.filter((call) => ['view', 'publish'].includes(call.args[0])).length, 0);
  }
});

test('same input bytes under a different commit invalidate an existing candidate', (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  const before = sourceFingerprint(f.root);
  git(f.root, 'commit', '--quiet', '--allow-empty', '-m', 'Different source commit, same input tree');
  assert.equal(sourceFingerprint(f.root), before);
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), /Source revision changed/u);
});

test('a commit change during offline verification prevents candidate packing', (t) => {
  const f = fixture(t);
  const runner = (command, args, options) => {
    const result = f.runner(command, args, options);
    if (command === 'pnpm') git(f.root, 'commit', '--quiet', '--allow-empty', '-m', 'Commit changed while verifying');
    return result;
  };
  assert.throws(() => prepareCandidate({ repoRoot: f.root, runner }), /Source revision changed/u);
  assert.equal(f.calls.filter((call) => call.args[0] === 'pack').length, 0);
});

test('Git-clean CRLF checkout remains traceable while raw byte changes still invalidate the candidate', (t) => {
  const f = fixture(t);
  git(f.root, 'config', 'core.autocrlf', 'true');
  put(path.join(f.root, '.gitattributes'), '*.ts text eol=crlf\n');
  git(f.root, 'add', '--', '.gitattributes');
  git(f.root, 'commit', '--quiet', '-m', 'Declare checkout line endings');
  const file = path.join(f.root, 'src/feature.ts');
  const lf = readFileSync(file, 'utf8');
  rmSync(file);
  git(f.root, 'checkout-index', '--force', '--', 'src/feature.ts');
  assert.equal(readFileSync(file, 'utf8'), lf.replaceAll('\n', '\r\n'));
  git(f.root, 'add', '--renormalize', '--', 'src/feature.ts');
  assert.equal(git(f.root, 'status', '--porcelain'), '');
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  assert.equal(p.candidate.purpose, 'release');
  assert.equal(p.candidate.sourceRevision.clean, true);
  put(file, lf);
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), /Source\/design\/tests\/lock changed/u);
});

test('candidate schema rejects old records, unknown modes and forged release source identity', (t) => {
  const f = fixture(t);
  put(path.join(f.root, 'src/feature.ts'), 'uncommitted\n');
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  for (const patch of [
    { schemaVersion: 1 }, { purpose: 'force-release' }, { purpose: 'release' },
    { purpose: 'release', sourceRevision: { commit: git(f.root, 'rev-parse', 'HEAD'), tree: git(f.root, 'rev-parse', 'HEAD^{tree}'), clean: true } },
    { sourceRevision: { ...p.candidate.sourceRevision, clean: 'true' } },
  ]) {
    json(p.candidateFile, { ...p.candidate, ...patch });
    assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), /schema|purpose|Source revision/u);
  }
});

test('a failing offline gate prevents packing/installing', (t) => {
  const f = fixture(t, { verifyFail: true });
  assert.throws(() => prepareCandidate({ repoRoot: f.root, runner: f.runner }), /failed/u);
  assert.equal(f.calls.length, 1);
});

test('outdated installed manuals reject candidate preparation', (t) => {
  const f = fixture(t, { badManual: true });
  assert.throws(() => prepareCandidate({ repoRoot: f.root, runner: f.runner }), /document differs/u);
});

test('actual npm executable mapping and installed launcher are mandatory', (t) => {
  for (const installedBin of [undefined, null, {}, { 'freelog-cli': './dist/bin/other.js' }, { other: './dist/bin/index.js' },
    { 'freelog-cli': './dist/bin/index.js', extra: './dist/bin/index.js' }]) {
    const f = fixture(t, { installedBin });
    assert.throws(() => prepareCandidate({ repoRoot: f.root, runner: f.runner }), /bin mapping/u);
  }
  const missing = fixture(t, { missingShim: true });
  assert.throws(() => prepareCandidate({ repoRoot: missing.root, runner: missing.runner }), /launcher/u);
  const source = fixture(t);
  json(path.join(source.root, 'packages/cli/package.json'), { name: PACKAGE_NAME, version: '0.5.8' });
  assert.throws(() => prepareCandidate({ repoRoot: source.root, runner: source.runner }), /bin mapping/u);
  assert.equal(source.calls.filter((call) => call.args[0] === 'pack').length, 0);
});

test('pack allowlist rejects private, test, traversal and unexpected files', (t) => {
  for (const file of ['.npmrc', '.env', 'dist/.env', 'dist/credentials.json', 'dist/credentials.js', 'test/fixture.png', 'dist/media/file.png', '../escape', 'dist\\bin\\index.js']) {
    assert.throws(() => assertPackageFileAllowed(file), undefined, file);
  }
  for (const file of ['package.json', 'README.md', 'LICENSE', 'LICENSE.txt', 'dist/bin/index.js', 'dist/bin/index.js.map', 'dist/docs/合集/README.md']) {
    assert.doesNotThrow(() => assertPackageFileAllowed(file), file);
  }
  const f = fixture(t, { packFiles: ['package.json', 'dist/.npmrc'] });
  assert.throws(() => prepareCandidate({ repoRoot: f.root, runner: f.runner }), /Private\/test/u);
});

test('candidate fails closed for missing or malformed metadata and paths outside candidate root', (t) => {
  const f = fixture(t);
  assert.throws(() => readCandidate('', { repoRoot: f.root }), /required/u);
  assert.throws(() => readCandidate(path.join(f.root, 'candidate.json'), { repoRoot: f.root }), /existing/u);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  for (const [key, value] of [['schemaVersion', 1], ['sourceFingerprint', null], ['tarballSha512', 'bad'], ['packageName', 'unapproved'], ['repoRoot', tmpdir()], ['cliBin', 'relative.js'], ['installRoot', tmpdir()], ['tarballPath', path.join(f.root, 'outside.tgz')]]) {
    json(p.candidateFile, { ...p.candidate, [key]: value });
    assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), undefined, key);
  }
  json(p.candidateFile, p.candidate);
  const outside = path.join(f.root, 'copied/candidate.json');
  json(outside, p.candidate);
  assert.throws(() => readCandidate(outside, { repoRoot: f.root }), /directly inside/u);
});

test('candidate expires and rejects future timestamps', (t) => {
  const f = fixture(t);
  const now = Date.now();
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner, now });
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root, now: now + MAX_AGE_MS + 1 }), /expired/u);
  json(p.candidateFile, { ...p.candidate, createdAt: new Date(now + 120_000).toISOString() });
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root, now }), /future/u);
});

test('source, tarball, bin and installed dependency tampering each invalidate candidate', (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  const source = path.join(f.root, 'src/feature.ts');
  const originalSource = readFileSync(source);
  put(source, 'modified');
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), /Source\/design\/tests\/lock changed/u);
  writeFileSync(source, originalSource);
  put(p.candidate.tarballPath, 'replaced');
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), /tarball hash/u);
  writeFileSync(p.candidate.tarballPath, f.state.bytes);
  const originalBin = readFileSync(p.candidate.cliBin);
  put(p.candidate.cliBin, 'replaced bin');
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), /bin hash/u);
  writeFileSync(p.candidate.cliBin, originalBin);
  put(path.join(p.candidate.installRoot, 'node_modules/other/index.js'), 'injected dependency');
  assert.throws(() => readCandidate(p.candidateFile, { repoRoot: f.root }), /tree differs/u);
});

test('check requires candidate-local acceptance, explicit validator approval and matching immutable binding', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root, verifyAcceptance: fakeValidator }), /Missing regular/u);
  accept(p);
  const checked = await checkCandidate(p.candidateFile, { repoRoot: f.root, verifyAcceptance: fakeValidator });
  assert.equal(checked.validation.caseCount, 1);
  await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root, verifyAcceptance: () => ({ valid: false }) }), /explicitly approve/u);
  const file = path.join(path.dirname(p.candidateFile), 'acceptance.json');
  const report = JSON.parse(readFileSync(file));
  json(file, { ...report, cliBin: '/different/bin.js' });
  await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root, verifyAcceptance: fakeValidator }));
});

test('real acceptance validator cannot be bypassed with a PASS-only fixture or an incomplete report', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root }), /manifest/u);
  const { initialCases, manifestSha256 } = await import('../acceptance/catalog.mjs');
  const runId = 'release-validator-integration';
  const evidenceDir = path.join(path.dirname(p.candidateFile), 'evidence', runId);
  mkdirSync(evidenceDir, { recursive: true });
  json(path.join(path.dirname(p.candidateFile), 'acceptance.json'), {
    schemaVersion: 2, environment: 'dev', releaseEvidence: true,
    purpose: p.candidate.purpose, sourceRevision: p.candidate.sourceRevision,
    runId, evidenceDir,
    sourceFingerprint: p.candidate.sourceFingerprint, tarballSha512: p.candidate.tarballSha512,
    cliBin: p.candidate.cliBin, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
    manifestSha256: manifestSha256(), cases: initialCases().map((item) => ({ ...item,
      ...(item.id.startsWith('LEGACY.') ? { process: { exitCode: null, signal: null, error: null, timedOut: false } } : {}),
    })),
  });
  await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root }), /not PASS|NOT_TESTED/u);
});

test('publish has no external writes when acceptance is missing or blocked', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /acceptance/u);
  accept(p);
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: () => { throw new Error('required case NOT_TESTED'); } }), /NOT_TESTED/u);
  assert.equal(f.calls.filter((call) => ['view', 'publish'].includes(call.args[0])).length, 0);
});

test('delivery evidence is mandatory before any registry read or publish', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  rmSync(path.join(path.dirname(p.candidateFile), 'delivery.json'), { force: true });
  await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root, verifyAcceptance: fakeValidator }), /DELIVERY_MISSING/u);
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /DELIVERY_MISSING/u);
  assert.equal(f.calls.filter((call) => ['view', 'publish'].includes(call.args[0])).length, 0);
});

test('non-success trusted remote CI blocks release before registry lookup even with valid local fixture evidence', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  f.remote.jobs[0].conclusion = 'skipped';
  await assert.rejects(checkCandidate(p.candidateFile, { repoRoot: f.root, verifyAcceptance: fakeValidator }), /REMOTE_QUALITY_BLOCKED.*JOB_RESULT/u);
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /REMOTE_QUALITY_BLOCKED/u);
  assert.equal(f.calls.filter((call) => ['view', 'publish'].includes(call.args[0])).length, 0);
});

test('source modified while awaiting remote evidence cannot retain local approval', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  remoteTransports.set(f.root, async (...args) => {
    put(path.join(f.root, 'src/during-remote.ts'), 'source changed while awaiting GitHub\n');
    return f.remote.fetchImpl(...args);
  });
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /Source\/design\/tests\/lock changed/u);
  assert.equal(f.calls.filter((call) => ['view', 'publish'].includes(call.args[0])).length, 0);
});

test('evidence crossing the age limit during GitHub waiting is rejected before any registry operation', async (t) => {
  const f = fixture(t);
  let currentTime = Date.now();
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner, now: currentTime - MAX_AGE_MS + 30_000 });
  accept(p);
  currentTime = Date.now();
  remoteTransports.set(f.root, async (...args) => {
    currentTime += 60_000;
    return f.remote.fetchImpl(...args);
  });
  await assert.rejects(publishCandidate(p.candidateFile, {
    repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator, clock: () => currentTime,
  }), /expired/u);
  assert.equal(f.calls.filter((call) => ['view', 'publish'].includes(call.args[0])).length, 0);
});

test('expiry during the final remote recheck after registry waiting still cannot reach npm publish', async (t) => {
  const f = fixture(t);
  let currentTime = Date.now();
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner, now: currentTime - MAX_AGE_MS + 30_000 });
  accept(p);
  currentTime = Date.now();
  let rounds = 0;
  remoteTransports.set(f.root, async (...args) => {
    if (new URL(args[0]).pathname === '/repos/freelogfe/freelog-runtime-cli') {
      rounds += 1;
      if (rounds === 2) currentTime += 60_000;
    }
    return f.remote.fetchImpl(...args);
  });
  await assert.rejects(publishCandidate(p.candidateFile, {
    repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator, clock: () => currentTime,
  }), /expired/u);
  assert.equal(rounds, 2);
  assert.equal(f.calls.filter((call) => call.args[0] === 'view').length, 1);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 0);
});

test('publish writes exactly the accepted tarball with fixed flags then verifies registry integrity/download/install', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  const result = await publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator });
  const writes = f.calls.filter((call) => call.args[0] === 'publish');
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].args, ['publish', p.candidate.tarballPath, '--ignore-scripts', '--access', 'public', '--registry', REGISTRY, '--auth-type', 'web', '--browser=false']);
  assert.equal(result.publication.state, 'VERIFIED');
  assert.equal(result.publication.publishedNow, true);
  assert.deepEqual(result.publication.sourceRevision, p.candidate.sourceRevision);
  assert.equal(result.publication.purpose, 'release');
  assert.ok(existsSync(result.publication.registryBin));
  assert.equal(f.calls.filter((call) => call.command === 'pnpm').length, 1, 'publish must not rebuild/reverify source to create new bytes');
});

test('an identical existing version is recovered by readback without a second publish', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  f.state.registryBytes = f.state.bytes;
  const result = await publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator });
  assert.equal(result.publication.publishedNow, false);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 0);
});

test('a new source commit cannot relabel an existing publication receipt even when package bytes match', async (t) => {
  const f = fixture(t);
  const first = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(first);
  await publishCandidate(first.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator });
  git(f.root, 'commit', '--quiet', '--allow-empty', '-m', 'Different source identity after publication');
  const second = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(second);
  const readsBefore = f.calls.filter((call) => call.args[0] === 'view').length;
  remoteTransports.set(f.root, remoteQualityFixture({ commit: second.candidate.sourceRevision.commit }).fetchImpl);
  await assert.rejects(publishCandidate(second.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /different source identity/u);
  assert.equal(f.calls.filter((call) => call.args[0] === 'view').length, readsBefore);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 1);
});

test('concurrent publication of the same candidate has one atomic write owner', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  const results = await Promise.allSettled([
    publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }),
    publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }),
  ]);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const loser = results.find((result) => result.status === 'rejected');
  assert.match(loser.reason.message, /publication claim|previous publish/u);
  assert.equal(JSON.parse(readFileSync(path.join(path.dirname(p.candidateFile), 'publication.json'))).state, 'VERIFIED');
});

test('different candidates of the same version share a single publication claim', async (t) => {
  const f = fixture(t);
  const candidates = [prepareCandidate({ repoRoot: f.root, runner: f.runner }), prepareCandidate({ repoRoot: f.root, runner: f.runner })];
  for (const candidate of candidates) accept(candidate);
  const results = await Promise.allSettled(candidates.map((candidate) => publishCandidate(candidate.candidateFile,
    { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator })));
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(results.find((result) => result.status === 'rejected').reason.message, /publication claim|previous publish/u);
});

test('preparing another candidate cannot retry an unknown publication of this version', async (t) => {
  const f = fixture(t, { publishUnknown: true });
  const first = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(first);
  await assert.rejects(publishCandidate(first.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /never blindly retry/u);
  f.state.registryBytes = null;
  f.state.publishUnknown = false;
  const second = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(second);
  await assert.rejects(publishCandidate(second.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /previous publish|publication claim/u);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 1);
});

test('occupied version, network uncertainty or changed registry bytes cannot pass', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  f.state.registryBytes = Buffer.from('somebody elses bytes');
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /different bytes/u);
  f.state.lookupFail = true;
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /absence.*not been proven/u);
  f.state.lookupFail = false;
  f.state.registryBytes = f.state.bytes;
  f.state.downloadBytes = Buffer.from('registry download corrupt');
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /Registry download differs/u);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 0);
});

test('unknown publish result is persisted, never blindly retried, and can recover by exact registry bytes', async (t) => {
  const f = fixture(t, { publishUnknown: true });
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /never blindly retry/u);
  const recordFile = path.join(path.dirname(p.candidateFile), 'publication.json');
  assert.equal(JSON.parse(readFileSync(recordFile)).state, 'UNKNOWN');
  f.state.registryBytes = null;
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator }), /previous publish/u);
  f.state.registryBytes = f.state.bytes;
  const recovered = await publishCandidate(p.candidateFile, { repoRoot: f.root, runner: f.runner, verifyAcceptance: fakeValidator });
  assert.equal(recovered.publication.state, 'VERIFIED');
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 1);
});

test('source changed during registry lookup is rechecked before publication', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  const runner = (command, args, options) => {
    const result = f.runner(command, args, options);
    if (args[0] === 'view') put(path.join(f.root, 'src/interleaved.ts'), 'changed during network read');
    return result;
  };
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner, verifyAcceptance: fakeValidator }), /Source\/design/u);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 0);
});

test('same-tree commit change during registry lookup is rechecked before publication', async (t) => {
  const f = fixture(t);
  const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
  accept(p);
  const runner = (command, args, options) => {
    const result = f.runner(command, args, options);
    if (args[0] === 'view') git(f.root, 'commit', '--quiet', '--allow-empty', '-m', 'New commit during registry wait');
    return result;
  };
  await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner, verifyAcceptance: fakeValidator }), /Source revision changed/u);
  assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 0);
});

test('delivery and original review are re-read after registry wait before any publish', async (t) => {
  for (const target of ['delivery', 'review']) {
    const f = fixture(t);
    const p = prepareCandidate({ repoRoot: f.root, runner: f.runner });
    accept(p);
    const deliveryFile = path.join(path.dirname(p.candidateFile), 'delivery.json');
    const runner = (command, args, options) => {
      const result = f.runner(command, args, options);
      if (args[0] === 'view') {
        const delivery = JSON.parse(readFileSync(deliveryFile));
        if (target === 'delivery') json(deliveryFile, { ...delivery, contractSha256: 'wrong' });
        else {
          const file = delivery.reviews[0].evidenceRef.path;
          writeFileSync(file, `${readFileSync(file, 'utf8')}\n`);
        }
      }
      return result;
    };
    await assert.rejects(publishCandidate(p.candidateFile, { repoRoot: f.root, runner, verifyAcceptance: fakeValidator }),
      target === 'delivery' ? /DELIVERY_BINDING/u : /DELIVERY_REVIEW_HASH/u);
    assert.equal(f.calls.filter((call) => call.args[0] === 'view').length, 1);
    assert.equal(f.calls.filter((call) => call.args[0] === 'publish').length, 0);
  }
});

test('CLI rejects all gate skips, unknown flags and arbitrary npm arguments; direct npm hook always fails', () => {
  assert.deepEqual(parseArguments(['prepare']), { action: 'prepare' });
  assert.deepEqual(parseArguments(['--', 'check', '--candidate', 'candidate.json']), { action: 'check', candidate: 'candidate.json' });
  assert.deepEqual(parseArguments(['publish', '--', '--candidate', 'candidate.json']), { action: 'publish', candidate: 'candidate.json' });
  for (const args of [
    ['prepare', '--skip-verify'], ['prepare', '--candidate', 'somewhere'], ['publish'], ['publish', '--candidate', 'x', '--ignore-scripts'],
    ['publish', '--candidate', 'x', '--registry', 'evil'], ['login'], ['check', '--candidate', '--oops'],
  ]) assert.throws(() => parseArguments(args));
  const hook = spawnSync(process.execPath, [path.join(ownRoot, 'scripts/release/reject-direct-publish.mjs')], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(hook.status, 1);
  assert.match(hook.stderr, /Direct workspace npm publish is disabled/u);
});
