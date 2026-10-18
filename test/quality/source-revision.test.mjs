import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSourceState } from '../../scripts/release/source-revision.mjs';

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.status, 0, `git ${args[0]}: ${result.stderr}`);
  return result.stdout.trim();
}
function put(root, file, content) {
  const target = path.join(root, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-source-revision-')));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(tmpdir()));
    assert.ok(path.basename(root).startsWith('freelog-source-revision-'));
    rmSync(root, { recursive: true, force: true });
  });
  put(root, '.gitignore', '.artifacts/\nignored-input.txt\n');
  put(root, '.gitattributes', '*.ts text eol=lf\n');
  put(root, 'src/value.ts', 'export const value = 1;\n');
  put(root, 'docs/handoff.md', '# Source handoff\n');
  git(root, 'init', '--quiet');
  git(root, 'config', 'user.name', 'Synthetic source test');
  git(root, 'config', 'user.email', 'synthetic-source@example.invalid');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'add', '--', '.');
  git(root, 'commit', '--quiet', '-m', 'Synthetic fixed source');
  return root;
}

test('index-only edits and assume-unchanged cannot hide uncommitted effective inputs', (t) => {
  const staged = fixture(t);
  const before = readSourceState(staged);
  const original = readFileSync(path.join(staged, 'src/value.ts'));
  put(staged, 'src/value.ts', 'staged version\n');
  git(staged, 'add', '--', 'src/value.ts');
  put(staged, 'src/value.ts', original);
  const after = readSourceState(staged);
  assert.equal(after.sourceFingerprint, before.sourceFingerprint);
  assert.equal(after.sourceRevision.commit, before.sourceRevision.commit);
  assert.equal(after.sourceRevision.clean, false);
  assert.equal(after.purpose, 'development');

  const hidden = fixture(t);
  git(hidden, 'update-index', '--assume-unchanged', '--', 'src/value.ts');
  put(hidden, 'src/value.ts', 'change hidden from status\n');
  assert.equal(git(hidden, 'status', '--porcelain'), '');
  assert.equal(readSourceState(hidden).sourceRevision.clean, false);
});

test('native POSIX executable-bit changes invalidate the fingerprint and require a committed tree mode', {
  skip: process.platform === 'win32' ? 'Requires a native POSIX filesystem; Windows does not prove executable-bit behavior.' : false,
}, (t) => {
  const root = fixture(t);
  git(root, 'config', 'core.filemode', 'true');
  const before = readSourceState(root);
  chmodSync(path.join(root, 'src/value.ts'), 0o755);
  const changed = readSourceState(root);
  assert.notEqual(changed.sourceFingerprint, before.sourceFingerprint);
  assert.equal(changed.purpose, 'development');
  assert.equal(changed.sourceRevision.clean, false);
  git(root, 'add', '--', 'src/value.ts');
  assert.equal(readSourceState(root).purpose, 'development');
  git(root, 'commit', '--quiet', '-m', 'Commit the native executable mode');
  const fixed = readSourceState(root);
  assert.equal(fixed.purpose, 'release');
  assert.notEqual(fixed.sourceRevision.tree, before.sourceRevision.tree);
});

test('deleted tracked inputs and ignored files must each be accounted for by the fixed tree', (t) => {
  const deleted = fixture(t);
  rmSync(path.join(deleted, 'src/value.ts'));
  assert.equal(readSourceState(deleted).purpose, 'development');
  const ignored = fixture(t);
  put(ignored, 'ignored-input.txt', 'effective input\n');
  assert.equal(git(ignored, 'status', '--porcelain'), '');
  assert.equal(readSourceState(ignored).purpose, 'development');
  git(ignored, 'add', '--force', '--', 'ignored-input.txt');
  git(ignored, 'commit', '--quiet', '-m', 'Track the effective input');
  assert.equal(readSourceState(ignored).purpose, 'release');
});

test('Unicode and space-containing Git paths retain exact content checks', (t) => {
  const root = fixture(t);
  const name = 'src/中文 with spaces.ts';
  put(root, name, 'export const named = true;\n');
  git(root, 'add', '--', name);
  git(root, 'commit', '--quiet', '-m', 'Synthetic Unicode path');
  assert.equal(readSourceState(root).purpose, 'release');
  put(root, name, 'changed\n');
  assert.equal(readSourceState(root).purpose, 'development');
});

test('unproven content transformations conservatively remain development-only', (t) => {
  for (const attribute of ['filter=synthetic', 'ident', 'working-tree-encoding=UTF-8']) {
    const root = fixture(t);
    put(root, '.gitattributes', `*.ts ${attribute}\n`);
    git(root, 'add', '--', '.gitattributes');
    git(root, 'commit', '--quiet', '-m', 'Synthetic transformation boundary');
    assert.equal(readSourceState(root).purpose, 'development', attribute);
  }
});

test('dirty worktree attributes are rejected before an external clean filter can run', (t) => {
  const root = fixture(t);
  const marker = path.join(root, '.artifacts/filter-ran.txt');
  const script = path.join(root, '.artifacts/clean-filter.mjs');
  put(root, '.artifacts/clean-filter.mjs', `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\nprocess.stdin.pipe(process.stdout);\n`);
  git(root, 'config', 'filter.synthetic.clean', `"${process.execPath.replaceAll('\\', '/')}" "${script.replaceAll('\\', '/')}"`);
  put(root, '.gitattributes', '*.ts filter=synthetic\n');
  assert.equal(readSourceState(root).purpose, 'development');
  assert.equal(existsSync(marker), false, 'read-only source inspection must not execute a dirty worktree filter');
});

test('global and repository-local attributes cannot execute external filters during inspection', (t) => {
  for (const location of ['info', 'global']) {
    const root = fixture(t);
    const marker = path.join(root, '.artifacts/filter-ran.txt');
    const script = path.join(root, '.artifacts/clean-filter.mjs');
    put(root, '.artifacts/clean-filter.mjs', `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\nprocess.stdin.pipe(process.stdout);\n`);
    git(root, 'config', 'filter.synthetic.clean', `"${process.execPath.replaceAll('\\', '/')}" "${script.replaceAll('\\', '/')}"`);
    if (location === 'info') put(root, '.git/info/attributes', '*.ts filter=synthetic\n');
    else {
      put(root, '.artifacts/global-attributes', '*.ts filter=synthetic\n');
      git(root, 'config', 'core.attributesFile', path.join(root, '.artifacts/global-attributes'));
    }
    assert.equal(readSourceState(root).purpose, 'development', location);
    assert.equal(existsSync(marker), false, location);
  }
});

test('binary NUL/control/invalid UTF-8 and unconfigured line-ending changes cannot become false-clean', (t) => {
  for (const original of [Buffer.from('binary\0value\n'), Buffer.from('control\u0001value\n'), Buffer.from([255, 10]), Buffer.from('plain text\n')]) {
    const root = fixture(t);
    put(root, 'input.dat', original);
    git(root, 'add', '--', 'input.dat');
    git(root, 'commit', '--quiet', '-m', 'Synthetic raw input');
    if (original[0] !== 'p'.charCodeAt(0)) git(root, 'config', 'core.autocrlf', 'true');
    put(root, 'input.dat', Buffer.from(original.toString('latin1').replaceAll('\n', '\r\n'), 'latin1'));
    assert.equal(readSourceState(root).purpose, 'development', original.toString('hex'));
  }
  for (const attribute of ['-text', '-crlf']) {
    const unset = fixture(t);
    put(unset, '.gitattributes', `*.ts ${attribute}\n`);
    git(unset, 'add', '--', '.gitattributes');
    git(unset, 'commit', '--quiet', '-m', 'Disable conversion');
    git(unset, 'config', 'core.autocrlf', 'true');
    put(unset, 'src/value.ts', 'export const value = 1;\r\n');
    assert.equal(readSourceState(unset).purpose, 'development', attribute);
  }
});

test('standard autocrlf checkout of ordinary UTF-8 text maps to the same fixed tree', (t) => {
  const root = fixture(t);
  git(root, 'config', 'core.autocrlf', 'true');
  const file = path.join(root, 'docs/handoff.md');
  rmSync(file);
  git(root, 'checkout-index', '--force', '--', 'docs/handoff.md');
  git(root, 'add', '--renormalize', '--', 'docs/handoff.md');
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.equal(readFileSync(file, 'utf8'), '# Source handoff\r\n');
  assert.equal(readSourceState(root).purpose, 'release');
});

test('excluded publication receipts preserve the source identity and later audit commits stay outside the release tag', (t) => {
  const root = fixture(t);
  const fixed = readSourceState(root);
  put(root, '.artifacts/publications/receipt.json', `${JSON.stringify({ state: 'UNKNOWN', ...fixed })}\n`);
  assert.deepEqual(readSourceState(root), fixed);
  git(root, 'tag', '-a', 'synthetic-release', fixed.sourceRevision.commit, '-m', 'Synthetic release source');
  put(root, 'docs/handoff.md', '# Later audit facts\n');
  assert.equal(readSourceState(root).purpose, 'development');
  git(root, 'add', '--', 'docs/handoff.md');
  git(root, 'commit', '--quiet', '-m', 'Post-release audit');
  const audit = readSourceState(root);
  assert.notEqual(audit.sourceRevision.commit, fixed.sourceRevision.commit);
  assert.notEqual(audit.sourceFingerprint, fixed.sourceFingerprint);
  assert.equal(git(root, 'rev-parse', 'synthetic-release^{commit}'), fixed.sourceRevision.commit);
  const rebuilt = path.join(root, '.artifacts/rebuild');
  git(root, 'worktree', 'add', '--quiet', '--detach', rebuilt, 'synthetic-release');
  assert.deepEqual(readSourceState(rebuilt), fixed, 'the source tag reconstructs the original effective inputs after audit commits');
  git(root, 'tag', '-a', 'synthetic-wrong-source', audit.sourceRevision.commit, '-m', 'Wrong source target');
  assert.notEqual(git(root, 'rev-parse', 'synthetic-wrong-source^{commit}'), fixed.sourceRevision.commit);
});
