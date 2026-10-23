/** Exact checkout bytes and the Git tree they can be traced to are separate bindings. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

const OMITTED_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', '.artifacts', '.freelog', '.omx', 'coverage', '.turbo']);
const OMITTED_FILES = /^(?:\.npmrc|\.env(?:\..*)?|\.freelog-auth|\.DS_Store|.*\.log|.*\.tsbuildinfo|\.freelog-test-.*\.local\.json)$/i;
const gitObject = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const included = (file) => !file.split('/').some((part) => OMITTED_DIRECTORIES.has(part) || OMITTED_FILES.test(part));

function sourceFiles(root) {
  const files = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      if (OMITTED_DIRECTORIES.has(name) || OMITTED_FILES.test(name)) continue;
      const file = path.join(directory, name);
      const stat = lstatSync(file);
      if (stat.isSymbolicLink()) throw new Error(`Source symlink must be reviewed explicitly: ${file}`);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) files.push(path.relative(root, file).split(path.sep).join('/'));
      else throw new Error(`Unsupported source file: ${file}`);
    }
  }
  visit(root);
  return files;
}

function fingerprint(root, files) {
  const hash = createHash('sha256');
  for (const file of files) {
    const absolute = path.join(root, file);
    hash.update(file).update('\0').update(createHash('sha256').update(readFileSync(absolute)).digest('hex')).update('\0');
    // Git records executable/regular mode on POSIX; Windows has no equivalent working-tree bit.
    if (process.platform !== 'win32') hash.update(lstatSync(absolute).mode & 0o111 ? 'executable\0' : 'regular\0');
  }
  return hash.digest('hex');
}

/** Includes ignored/untracked effective inputs; Git status alone cannot establish this identity. */
export function sourceFingerprint(repoRoot) {
  const root = realpathSync.native(repoRoot);
  return fingerprint(root, sourceFiles(root));
}

function git(root, args, input) {
  // A caller's alternate index/worktree/object environment must not replace this repository's facts.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  return spawnSync('git', ['--no-optional-locks', '-C', root, ...args], {
    input, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
const successful = (result) => result.status === 0 && !result.error && !result.signal;
function head(root) {
  const result = git(root, ['show', '--no-patch', '--format=%H%n%T', 'HEAD', '--']);
  if (!successful(result)) return null;
  const [commit, tree, ...extra] = result.stdout.trim().split(/\r?\n/u);
  return gitObject.test(commit) && gitObject.test(tree) && commit.length === tree.length && extra.length === 0 ? { commit, tree } : null;
}

function entries(output, index = false) {
  const result = new Map();
  for (const line of output.split('\0').filter(Boolean)) {
    const match = (index ? /^(\d{6}) ([a-f0-9]+) (\d)\t([\s\S]+)$/u : /^(\d{6}) (\w+) ([a-f0-9]+)\t([\s\S]+)$/u).exec(line);
    if (!match) return null;
    const [, mode, typeOrHash, hashOrStage, file] = match;
    if (!included(file)) continue;
    if (result.has(file) || !['100644', '100755'].includes(mode)
      || (index ? hashOrStage !== '0' : typeOrHash !== 'blob')) return null;
    result.set(file, { mode, hash: index ? typeOrHash : hashOrStage });
  }
  return result;
}

function attributes(root, files, cached) {
  const names = ['filter', 'ident', 'working-tree-encoding', 'text', 'eol', 'crlf'];
  const result = git(root, ['check-attr', ...(cached ? ['--cached'] : []), '--stdin', '-z', ...names], `${files.join('\0')}\0`);
  if (!successful(result)) return null;
  const fields = result.stdout.split('\0');
  fields.pop();
  if (fields.length !== files.length * names.length * 3) return null;
  const values = new Map(files.map((file) => [file, {}]));
  for (let offset = 0; offset < fields.length; offset += 3) {
    const [file, name, value] = fields.slice(offset, offset + 3);
    if (!values.has(file) || !names.includes(name) || Object.hasOwn(values.get(file), name)) return null;
    values.get(file)[name] = value;
  }
  return values;
}

function blobHash(bytes, algorithm) {
  return createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function plainUtf8(bytes) {
  if (bytes.some((byte) => (byte < 32 && ![9, 10, 13].includes(byte)) || byte === 127)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return false; }
  return !/\r(?!\n)/u.test(bytes.toString('utf8'));
}

function normalizedText(bytes, attrs, autocrlf) {
  // A conservative subset of Git's text conversion, never a replacement for arbitrary clean
  // filters. Unknown/legacy conversion rules and ambiguous binary/encoding inputs stay dev-only.
  if (attrs.text === 'unset' || attrs.crlf !== 'unspecified' || !plainUtf8(bytes)) return null;
  const normalize = ['set', 'auto'].includes(attrs.text)
    || (attrs.text === 'unspecified' && ['lf', 'crlf'].includes(attrs.eol))
    || (!['set', 'auto', 'unset'].includes(attrs.text) && ['true', 'input'].includes(autocrlf));
  return normalize ? Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n')) : null;
}

function inputsMatchTree(root, files, revision) {
  const treeResult = git(root, ['ls-tree', '-r', '-z', '--full-tree', revision.commit]);
  const indexResult = git(root, ['ls-files', '--stage', '-z']);
  if (!successful(treeResult) || !successful(indexResult)) return false;
  const tree = entries(treeResult.stdout);
  const index = entries(indexResult.stdout, true);
  if (!tree || !index || tree.size !== files.length || index.size !== files.length
    || files.some((file) => !tree.has(file) || !index.has(file)
      || tree.get(file).mode !== index.get(file).mode || tree.get(file).hash !== index.get(file).hash)) return false;
  if (process.platform !== 'win32' && files.some((file) => Boolean(lstatSync(path.join(root, file)).mode & 0o111)
    !== (tree.get(file).mode === '100755'))) return false;

  // Read both attribute views, but never invoke hash-object --filters (even after a check):
  // worktree attributes can change independently of the index and filters may execute commands.
  const worktreeAttrs = attributes(root, files, false);
  const indexAttrs = attributes(root, files, true);
  if (!worktreeAttrs || !indexAttrs) return false;
  for (const view of [worktreeAttrs, indexAttrs]) {
    if (files.some((file) => ['filter', 'ident', 'working-tree-encoding']
      .some((name) => !['unspecified', 'unset'].includes(view.get(file)[name])))) return false;
  }
  const config = git(root, ['config', '--get', 'core.autocrlf']);
  if (!successful(config) && config.status !== 1) return false;
  const autocrlf = config.stdout.trim().toLowerCase();
  const algorithm = revision.commit.length === 40 ? 'sha1' : 'sha256';
  return files.every((file) => {
    const bytes = readFileSync(path.join(root, file));
    if (blobHash(bytes, algorithm) === tree.get(file).hash) return true;
    const normalized = normalizedText(bytes, worktreeAttrs.get(file), autocrlf);
    return normalized !== null && blobHash(normalized, algorithm) === tree.get(file).hash;
  });
}

export function validSourceRevision(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 3 && ['commit', 'tree', 'clean'].every((key) => Object.hasOwn(value, key))
    && typeof value.clean === 'boolean'
    && ((value.commit === null && value.tree === null && value.clean === false)
      || (typeof value.commit === 'string' && typeof value.tree === 'string' && gitObject.test(value.commit)
        && gitObject.test(value.tree) && value.commit.length === value.tree.length));
}

export function sameSourceRevision(actual, expected) {
  return validSourceRevision(actual) && validSourceRevision(expected)
    && actual.commit === expected.commit && actual.tree === expected.tree && actual.clean === expected.clean;
}

export function readSourceState(repoRoot) {
  // Native resolution preserves physical directory identity across Windows drive/case aliases.
  // Do not lowercase paths: distinct case-sensitive directories must remain distinct roots.
  const root = realpathSync.native(repoRoot);
  const files = sourceFiles(root);
  const sourceFingerprint = fingerprint(root, files);
  const top = git(root, ['rev-parse', '--show-toplevel']);
  const fixed = successful(top) && realpathSync.native(top.stdout.trim()) === root ? head(root) : null;
  const clean = fixed !== null && inputsMatchTree(root, files, fixed);
  const latest = fixed ? head(root) : null;
  if ((fixed && (!latest || latest.commit !== fixed.commit || latest.tree !== fixed.tree))
    || fingerprint(root, sourceFiles(root)) !== sourceFingerprint) throw new Error('Source revision changed while reading candidate inputs');
  return {
    sourceFingerprint,
    purpose: clean ? 'release' : 'development',
    sourceRevision: { commit: fixed?.commit ?? null, tree: fixed?.tree ?? null, clean },
  };
}
