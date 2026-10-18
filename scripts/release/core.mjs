/** Fixed-candidate release boundary. CLI callers cannot skip gates or inject npm flags. */
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync,
  realpathSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSourceState, sameSourceRevision, sourceFingerprint as fingerprint, validSourceRevision } from './source-revision.mjs';
import { verifyRemoteQuality } from './remote-quality.mjs';

export const PACKAGE_NAME = '@freelog-cli/cli2';
export const REGISTRY = 'https://registry.npmjs.org/';
export const MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HASH_256 = /^[a-f0-9]{64}$/;
const HASH_512 = /^[a-f0-9]{128}$/;

export function sourceFingerprint(repoRoot = DEFAULT_REPO_ROOT) { return fingerprint(repoRoot); }

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function digest(bytes, algorithm = 'sha256') {
  return createHash(algorithm).update(bytes).digest('hex');
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function absolute(value, label) {
  invariant(typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value, `${label} must be a normalized absolute path`);
  return value;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
  } catch (error) {
    throw new Error(`Cannot read valid JSON: ${file}`, { cause: error });
  }
}

function writeJson(file, value, flag = 'w') {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag });
}

function installationFingerprint(installRoot) {
  const root = realpathSync(installRoot);
  const hash = createHash('sha256');
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const stat = lstatSync(file);
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (stat.isSymbolicLink()) {
        invariant(inside(root, realpathSync(file)), `Installed symlink escapes candidate: ${file}`);
        hash.update(`link:${relative}\0${readlinkSync(file)}\0`);
      } else if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) hash.update(`file:${relative}\0${digest(readFileSync(file))}\0`);
      else throw new Error(`Unsupported installed file: ${file}`);
    }
  }
  visit(root);
  return hash.digest('hex');
}

function windowsTool(command) {
  const configured = process.env.npm_execpath;
  if (configured && existsSync(configured)
    && ((command === 'pnpm' && /pnpm\.(?:c?js)$/i.test(configured))
      || (command === 'npm' && /npm-cli\.js$/i.test(configured)))) return configured;
  const roots = [path.dirname(process.execPath)];
  const located = spawnSync('where.exe', [`${command}.cmd`], { encoding: 'utf8', timeout: 10_000 });
  if (located.status === 0) roots.push(...located.stdout.trim().split(/\r?\n/u).map((file) => path.dirname(file)));
  const entry = command === 'npm' ? ['npm', 'bin', 'npm-cli.js'] : ['pnpm', 'bin', 'pnpm.cjs'];
  for (const root of roots) {
    const file = path.join(root, 'node_modules', ...entry);
    if (existsSync(file)) return file;
  }
  throw new Error(`Cannot resolve ${command}'s Node entry; refusing shell-built release commands`);
}

/** Injectable only through the JS API for isolated tests, never through release CLI flags. */
export function defaultRunner(command, args, { cwd, timeoutMs, inherit = false } = {}) {
  const useNode = process.platform === 'win32' && ['npm', 'pnpm'].includes(command);
  const executable = useNode ? process.execPath : command;
  const parameters = useNode ? [windowsTool(command), ...args] : args;
  return spawnSync(executable, parameters, {
    cwd, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
}

function execute(runner, command, args, options, allowFailure = false) {
  const result = runner(command, args, options);
  invariant(result && Number.isInteger(result.status) && !result.signal && !result.error,
    `${command} did not complete normally; outcome may be unknown (no automatic retry)`);
  if (!allowFailure) invariant(result.status === 0, `${command} ${args[0] ?? ''} failed (exit ${result.status})`);
  return result;
}

function packageVersion(repoRoot) {
  const pkg = readJson(path.join(repoRoot, 'packages/cli/package.json'));
  invariant(pkg.name === PACKAGE_NAME, 'Only the approved CLI package can be released');
  assertExecutableMapping(pkg);
  invariant(typeof pkg.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(pkg.version), 'Invalid CLI package version');
  return pkg.version;
}

/** npm users execute the bin mapping, not the internal JS path our harness happens to know. */
function assertExecutableMapping(pkg) {
  invariant(pkg.bin && typeof pkg.bin === 'object' && !Array.isArray(pkg.bin)
    && Object.keys(pkg.bin).length === 1 && Object.hasOwn(pkg.bin, 'freelog-cli')
    && ['dist/bin/index.js', './dist/bin/index.js'].includes(pkg.bin['freelog-cli']),
  'Package bin mapping must contain only freelog-cli -> ./dist/bin/index.js');
}

function assertInstalledLauncher(installRoot, cliBin) {
  const launcher = path.join(installRoot, 'node_modules/.bin', `freelog-cli${process.platform === 'win32' ? '.cmd' : ''}`);
  invariant(existsSync(launcher), 'Installed npm executable launcher is missing');
  const stat = lstatSync(launcher);
  if (stat.isSymbolicLink()) invariant(realpathSync(launcher) === realpathSync(cliBin), 'Installed launcher points to a different bin');
  else invariant(stat.isFile() && readFileSync(launcher, 'utf8').replaceAll('\\', '/').includes('@freelog-cli/cli2/dist/bin/index.js'),
    'Installed launcher does not reference the approved bin');
}

/** npm always includes standard README/license files even with files:[dist]. */
export function assertPackageFileAllowed(file) {
  invariant(typeof file === 'string' && !file.includes('\\') && !file.startsWith('/')
    && !file.split('/').some((part) => ['.', '..', ''].includes(part)), `Unsafe package path: ${file}`);
  const parts = file.split('/');
  invariant(!parts.some((part) => /^\./u.test(part) || /(?:credentials?|auth-map|test-fixture|\.local\.json$)/iu.test(part)), `Private/test file in package: ${file}`);
  const standard = /^(?:package\.json|README(?:\.[A-Za-z0-9]+)?|LICEN[CS]E(?:\.[A-Za-z0-9]+)?)$/iu.test(file);
  const built = /^dist\/(?!docs\/).+\.(?:[cm]?js|map)$/u.test(file);
  const guide = /^dist\/docs\/.+\.md$/u.test(file);
  invariant(standard || built || guide, `Unapproved package file: ${file}`);
}

function filesBelow(root) {
  const result = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      const stat = lstatSync(file);
      invariant(!stat.isSymbolicLink(), `Unexpected package/document symlink: ${file}`);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) result.push(path.relative(root, file).split(path.sep).join('/'));
      else throw new Error(`Unexpected package/document file: ${file}`);
    }
  }
  visit(root);
  return result;
}

function assertManuals(repoRoot, installedPackage) {
  const source = path.join(repoRoot, 'docs/一期/产品方案/使用');
  const installed = path.join(installedPackage, 'dist/docs');
  const expected = filesBelow(source);
  const actual = filesBelow(installed);
  invariant(expected.length > 0 && JSON.stringify(expected) === JSON.stringify(actual), 'Installed usage document inventory differs from approved source');
  for (const file of expected) {
    invariant(file.endsWith('.md'), `Unapproved usage asset: ${file}`);
    invariant(readFileSync(path.join(source, file)).equals(readFileSync(path.join(installed, file))), `Installed usage document differs: ${file}`);
  }
}

function smoke(repoRoot, installRoot, version, runner) {
  const installedPackage = path.join(installRoot, 'node_modules', '@freelog-cli', 'cli2');
  const pkg = readJson(path.join(installedPackage, 'package.json'));
  invariant(pkg.name === PACKAGE_NAME && pkg.version === version, 'Installed candidate package identity differs');
  assertExecutableMapping(pkg);
  for (const file of filesBelow(installedPackage)) assertPackageFileAllowed(file);
  assertManuals(repoRoot, installedPackage);
  const cliBin = path.join(installedPackage, 'dist/bin/index.js');
  invariant(lstatSync(cliBin).isFile(), 'Candidate CLI bin is not a regular file');
  assertInstalledLauncher(installRoot, cliBin);
  const options = { cwd: installRoot, timeoutMs: 30_000 };
  const reported = execute(runner, process.execPath, [cliBin, '--cli-version'], options).stdout?.trim();
  invariant(reported === version, 'Installed candidate --cli-version differs');
  const help = execute(runner, process.execPath, [cliBin, '--help'], options).stdout ?? '';
  invariant(help.includes(path.join(installedPackage, 'dist/docs/README.md')), 'Installed help does not point to its own manual');
  return cliBin;
}

export { smoke as verifyInstalledPackage };

function installAndSmoke(repoRoot, tarball, installRoot, version, runner) {
  mkdirSync(installRoot, { recursive: true });
  execute(runner, 'npm', ['install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund',
    '--registry', REGISTRY, '--prefix', installRoot, tarball], { cwd: installRoot, timeoutMs: 300_000 });
  return smoke(repoRoot, installRoot, version, runner);
}

function packedTarball(result, directory, version) {
  let items;
  try { items = JSON.parse(result.stdout); } catch { throw new Error('npm pack did not return its JSON manifest'); }
  invariant(Array.isArray(items) && items.length === 1, 'npm pack must produce exactly one package');
  const item = items[0];
  invariant(item.name === PACKAGE_NAME && item.version === version, 'Packed package identity differs');
  invariant(typeof item.filename === 'string' && item.filename === path.basename(item.filename)
    && /^[A-Za-z0-9._-]+\.tgz$/u.test(item.filename), 'Unsafe npm tarball filename');
  invariant(Array.isArray(item.files) && item.files.length > 0, 'npm pack manifest has no files');
  for (const file of item.files) assertPackageFileAllowed(file.path);
  invariant(item.files.some((file) => file.path === 'dist/bin/index.js')
    && item.files.some((file) => file.path === 'dist/docs/README.md'), 'npm package lacks bin/manual');
  const tarball = path.join(directory, item.filename);
  invariant(lstatSync(tarball).isFile() && lstatSync(tarball).size > 0, 'Tarball is not a nonempty regular file');
  return tarball;
}

export function prepareCandidate({ repoRoot = DEFAULT_REPO_ROOT, runner = defaultRunner, now = Date.now() } = {}) {
  const root = realpathSync(repoRoot);
  const before = readSourceState(root);
  // No public --skip-build/--skip-verify path. All gates precede pack/install.
  execute(runner, 'pnpm', ['verify'], { cwd: root, timeoutMs: 900_000, inherit: true });
  assertSourceState(root, before, 'Source changed during local verification; prepare a fresh candidate');
  const version = packageVersion(root);
  const id = `${new Date(now).toISOString().replace(/[:.]/gu, '-')}-${randomBytes(4).toString('hex')}`;
  const directory = path.join(root, '.artifacts/release', id);
  mkdirSync(directory, { recursive: true });
  const packed = execute(runner, 'npm', ['pack', '--json', '--pack-destination', directory],
    { cwd: path.join(root, 'packages/cli'), timeoutMs: 180_000 });
  const tarballPath = packedTarball(packed, directory, version);
  const installRoot = path.join(directory, 'install');
  const cliBin = installAndSmoke(root, tarballPath, installRoot, version, runner);
  assertSourceState(root, before, 'Source changed while packaging; candidate is not approved');
  const candidate = {
    schemaVersion: 2, packageName: PACKAGE_NAME, version, createdAt: new Date(now).toISOString(),
    repoRoot: root, ...before, tarballPath,
    tarballSha512: digest(readFileSync(tarballPath), 'sha512'),
    cliBin, installRoot, installSha256: installationFingerprint(installRoot),
    binSha256: digest(readFileSync(cliBin)), platform: process.platform, nodeVersion: process.version,
  };
  const candidateFile = path.join(directory, 'candidate.json');
  writeJson(candidateFile, candidate);
  return { candidate, candidateFile };
}

function assertSourceState(root, expected, message) {
  const actual = readSourceState(root);
  invariant(actual.sourceFingerprint === expected.sourceFingerprint, message);
  invariant(actual.purpose === expected.purpose && sameSourceRevision(actual.sourceRevision, expected.sourceRevision),
    'Source revision changed; prepare a fresh candidate for this commit/tree');
}

/** This reads/verifies a candidate only; it does not turn missing dev evidence into PASS. */
export function readCandidate(candidateInput, { repoRoot = DEFAULT_REPO_ROOT, now = Date.now() } = {}) {
  invariant(typeof candidateInput === 'string' && candidateInput.trim() !== '', 'A candidate path is required');
  const root = realpathSync(repoRoot);
  let candidateFile = path.resolve(root, candidateInput);
  if (existsSync(candidateFile) && lstatSync(candidateFile).isDirectory()) candidateFile = path.join(candidateFile, 'candidate.json');
  invariant(path.basename(candidateFile) === 'candidate.json' && existsSync(candidateFile), 'Expected an existing candidate.json');
  invariant(!lstatSync(candidateFile).isSymbolicLink(), 'Candidate metadata must not be a symlink');
  const directory = path.dirname(candidateFile);
  const releases = path.join(root, '.artifacts/release');
  invariant(path.dirname(directory) === releases && realpathSync(directory) === directory, 'Candidate must be directly inside this repository .artifacts/release/<id>');
  const candidate = readJson(candidateFile);
  const keys = ['schemaVersion', 'packageName', 'version', 'createdAt', 'repoRoot', 'sourceFingerprint', 'purpose', 'sourceRevision',
    'tarballPath', 'tarballSha512', 'cliBin', 'installRoot', 'installSha256', 'binSha256', 'platform', 'nodeVersion'];
  invariant(candidate && !Array.isArray(candidate) && candidate.schemaVersion === 2
    && Object.keys(candidate).length === keys.length && keys.every((key) => Object.hasOwn(candidate, key)), 'Unsupported candidate schema');
  invariant(validSourceRevision(candidate.sourceRevision), 'Unsupported candidate sourceRevision schema');
  invariant(['development', 'release'].includes(candidate.purpose)
    && (candidate.purpose === 'release') === candidate.sourceRevision.clean, 'Candidate purpose differs from source revision');
  invariant(candidate.packageName === PACKAGE_NAME && candidate.version === packageVersion(root), 'Candidate package/version differs from current source');
  invariant(candidate.repoRoot === root && candidate.platform === process.platform && candidate.nodeVersion === process.version, 'Candidate repository/platform/Node differs');
  invariant(HASH_256.test(candidate.sourceFingerprint) && HASH_512.test(candidate.tarballSha512)
    && HASH_256.test(candidate.installSha256) && HASH_256.test(candidate.binSha256), 'Candidate hashes missing or malformed');
  const created = Date.parse(candidate.createdAt);
  invariant(Number.isFinite(created) && created <= now + 60_000 && now - created <= MAX_AGE_MS, 'Candidate is expired or has an invalid future timestamp');
  const tarball = absolute(candidate.tarballPath, 'tarballPath');
  invariant(path.dirname(tarball) === directory && tarball.endsWith('.tgz')
    && lstatSync(tarball).isFile() && !lstatSync(tarball).isSymbolicLink(), 'Tarball escapes candidate or is not a regular tgz');
  const installRoot = absolute(candidate.installRoot, 'installRoot');
  invariant(installRoot === path.join(directory, 'install') && realpathSync(installRoot) === installRoot, 'Installed candidate path differs');
  const cliBin = absolute(candidate.cliBin, 'cliBin');
  invariant(cliBin === path.join(installRoot, 'node_modules/@freelog-cli/cli2/dist/bin/index.js')
    && realpathSync(cliBin) === cliBin && lstatSync(cliBin).isFile(), 'Candidate bin path differs or was replaced by a symlink');
  assertSourceState(root, candidate, 'Source/design/tests/lock changed; evidence is stale');
  invariant(digest(readFileSync(tarball), 'sha512') === candidate.tarballSha512, 'Candidate tarball hash differs');
  invariant(digest(readFileSync(cliBin)) === candidate.binSha256, 'Installed bin hash differs');
  invariant(installationFingerprint(installRoot) === candidate.installSha256, 'Installed candidate tree differs');
  const installedPackage = path.dirname(path.dirname(path.dirname(cliBin)));
  const pkg = readJson(path.join(installedPackage, 'package.json'));
  invariant(pkg.name === PACKAGE_NAME && pkg.version === candidate.version, 'Installed package identity differs');
  assertExecutableMapping(pkg);
  assertInstalledLauncher(installRoot, cliBin);
  assertManuals(root, installedPackage);
  return { candidate, candidateFile };
}

export async function checkCandidate(candidateInput, { repoRoot = DEFAULT_REPO_ROOT, clock = Date.now, now = clock(), verifyAcceptance, remoteFetch } = {}) {
  const verified = readCandidate(candidateInput, { repoRoot, now });
  invariant(verified.candidate.purpose === 'release', 'A development candidate cannot receive release approval; prepare again from fixed committed inputs');
  const acceptanceFile = path.join(path.dirname(verified.candidateFile), 'acceptance.json');
  invariant(existsSync(acceptanceFile) && !lstatSync(acceptanceFile).isSymbolicLink(), 'Missing regular candidate acceptance.json; publication is blocked');
  const { readDeliveryEvidence } = await import('./delivery.mjs');
  const verifier = verifyAcceptance ?? (await import('../../test/acceptance/protocol.mjs')).validateAcceptanceReport;
  invariant(typeof verifier === 'function', 'Acceptance validator is unavailable');
  const localApproval = (current, checkedAt) => {
    invariant(existsSync(acceptanceFile) && !lstatSync(acceptanceFile).isSymbolicLink(), 'Missing regular candidate acceptance.json; publication is blocked');
    const acceptance = readJson(acceptanceFile);
    const delivery = readDeliveryEvidence(current, { repoRoot, now: checkedAt });
    const validation = verifier(acceptance, {
      purpose: current.candidate.purpose, sourceRevision: current.candidate.sourceRevision,
      sourceFingerprint: current.candidate.sourceFingerprint,
      tarballSha512: current.candidate.tarballSha512,
      cliBin: current.candidate.cliBin, candidateDir: path.dirname(current.candidateFile),
      now: checkedAt, maxAgeMs: MAX_AGE_MS,
    });
    invariant(validation?.valid === true, 'Acceptance validator did not explicitly approve the candidate');
    return { acceptance, validation, delivery };
  };
  localApproval(verified, now);
  // Only the transport is injectable for isolated tests; callers cannot supply a remote PASS record.
  const remote = await verifyRemoteQuality({ candidate: verified.candidate, fetchImpl: remoteFetch });
  invariant(remote.scope === 'fixed-source-current-policy' && remote.status === 'PASS',
    `REMOTE_QUALITY_BLOCKED: ${remote.reasons.map((reason) => reason.code).join(', ')}`);
  // GitHub was a network wait. Re-read source, package and every mutable local record afterward.
  const completedAt = Math.max(now, clock());
  const current = readCandidate(verified.candidateFile, { repoRoot, now: completedAt });
  return { ...current, ...localApproval(current, completedAt), remote };
}

function registryIntegrity(candidate, runner, repoRoot) {
  const result = execute(runner, 'npm', ['view', `${PACKAGE_NAME}@${candidate.version}`, 'dist.integrity', '--json', '--registry', REGISTRY],
    { cwd: repoRoot, timeoutMs: 60_000 }, true);
  let value;
  try { value = JSON.parse(result.stdout || result.stderr || 'null'); } catch { /* fail closed below */ }
  if (result.status === 0) {
    invariant(typeof value === 'string' && value.length > 0, 'Registry integrity is unavailable');
    return value;
  }
  invariant(value?.error?.code === 'E404', 'Registry lookup failed; absence of this version has not been proven');
  return null;
}

/** The only writer: rechecks evidence, publishes exactly one verified tarball, never retries writes. */
export async function publishCandidate(candidateInput, { repoRoot = DEFAULT_REPO_ROOT, runner = defaultRunner, clock = Date.now, now = clock(), verifyAcceptance, remoteFetch } = {}) {
  const checked = await checkCandidate(candidateInput, { repoRoot, clock, now, verifyAcceptance, remoteFetch });
  const { candidate, candidateFile } = checked;
  const root = realpathSync(repoRoot);
  const directory = path.dirname(candidateFile);
  const recordFile = path.join(directory, 'publication.json');
  const claims = path.join(root, '.artifacts/publications');
  mkdirSync(claims, { recursive: true });
  invariant(realpathSync(claims) === claims, 'Publication claims must not be redirected by a symlink');
  const claimFile = path.join(claims, `${digest(`${REGISTRY}\0${PACKAGE_NAME}\0${candidate.version}`)}.json`);
  const prior = existsSync(claimFile) ? readJson(claimFile) : existsSync(recordFile) ? readJson(recordFile) : null;
  if (prior) invariant(prior.schemaVersion === 2 && prior.version === candidate.version && prior.tarballSha512 === candidate.tarballSha512
    && prior.purpose === candidate.purpose && prior.sourceFingerprint === candidate.sourceFingerprint
    && sameSourceRevision(prior.sourceRevision, candidate.sourceRevision),
  'Previous publication claim belongs to a different source identity or bytes; inspect the original candidate, never replace it');
  const persist = (record) => {
    const bound = { ...record, schemaVersion: 2, packageName: PACKAGE_NAME, registry: REGISTRY, candidateFile,
      purpose: candidate.purpose, sourceRevision: candidate.sourceRevision, sourceFingerprint: candidate.sourceFingerprint };
    writeJson(claimFile, bound);
    writeJson(recordFile, bound);
  };
  const expectedIntegrity = `sha512-${Buffer.from(candidate.tarballSha512, 'hex').toString('base64')}`;
  const existing = registryIntegrity(candidate, runner, root);
  invariant(existing === null || existing === expectedIntegrity, 'This npm version already exists with different bytes; do not overwrite or bump automatically');
  let publishedNow = false;
  if (existing === null) {
    invariant(!prior, 'A previous publish was attempted; verify its external result before another write');
    // Registry lookup was a network wait; recheck all mutable bindings immediately before the write.
    await checkCandidate(candidateFile, { repoRoot: root, clock, verifyAcceptance, remoteFetch });
    // Shared by registry/package/version, not candidate: rebuilding cannot bypass an unknown attempt.
    try {
      writeJson(claimFile, { schemaVersion: 2, state: 'PUBLISHING', packageName: PACKAGE_NAME, registry: REGISTRY,
        candidateFile, purpose: candidate.purpose, sourceRevision: candidate.sourceRevision, sourceFingerprint: candidate.sourceFingerprint,
        version: candidate.version, tarballSha512: candidate.tarballSha512, startedAt: new Date().toISOString() }, 'wx');
    } catch (error) {
      throw new Error('Cannot acquire exclusive publication claim; inspect the previous publish before any new write', { cause: error });
    }
    try {
      persist({ state: 'PUBLISHING', version: candidate.version, tarballSha512: candidate.tarballSha512 });
      execute(runner, 'npm', ['publish', candidate.tarballPath, '--ignore-scripts', '--access', 'public',
        '--registry', REGISTRY, '--auth-type', 'web', '--browser=false'],
      { cwd: directory, timeoutMs: 900_000, inherit: true });
      publishedNow = true;
      persist({ state: 'PUBLISHED_UNVERIFIED', version: candidate.version, tarballSha512: candidate.tarballSha512 });
    } catch (error) {
      persist({ state: 'UNKNOWN', version: candidate.version, tarballSha512: candidate.tarballSha512 });
      throw new Error('Publish did not finish with a verified result; inspect registry first, never blindly retry or change version', { cause: error });
    }
  }
  invariant(registryIntegrity(candidate, runner, root) === expectedIntegrity, 'Registry integrity differs; publication remains unverified');
  const registryDir = path.join(directory, `registry-${randomBytes(4).toString('hex')}`);
  mkdirSync(registryDir);
  const downloaded = execute(runner, 'npm', ['pack', `${PACKAGE_NAME}@${candidate.version}`, '--json', '--ignore-scripts',
    '--registry', REGISTRY, '--pack-destination', registryDir], { cwd: registryDir, timeoutMs: 180_000 });
  const registryTarball = packedTarball(downloaded, registryDir, candidate.version);
  invariant(digest(readFileSync(registryTarball), 'sha512') === candidate.tarballSha512, 'Registry download differs from the verified candidate');
  const registryBin = installAndSmoke(root, registryTarball, path.join(registryDir, 'install'), candidate.version, runner);
  readCandidate(candidateFile, { repoRoot: root, now: Date.now() });
  const record = { schemaVersion: 2, state: 'VERIFIED', version: candidate.version,
    candidateFile, purpose: candidate.purpose, sourceRevision: candidate.sourceRevision, sourceFingerprint: candidate.sourceFingerprint,
    tarballSha512: candidate.tarballSha512, integrity: expectedIntegrity, publishedNow,
    registryBin, finishedAt: new Date().toISOString() };
  persist(record);
  return { ...checked, publication: record };
}
