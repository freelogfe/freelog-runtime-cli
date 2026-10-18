/** Keep only the tested artifact, never workspace auth/state, for a later same-run browser round-trip. */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const kinds = ['theme', 'image', 'jpeg'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const child = (root, relative) => {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)
    || relative.split(/[\\/]/u).some((part) => !part || part === '.' || part === '..')) throw new Error('Invalid artifact-relative path.');
  const file = path.resolve(root, relative);
  const rel = path.relative(root, file);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw new Error('Artifact path escapes its owner.');
  return file;
};
function ordinary(file, directory) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || realpathSync(file) !== file || (directory ? !stat.isDirectory() : !stat.isFile())) {
    throw new Error('Artifact paths must be ordinary, non-aliased files/directories.');
  }
}

export function artifactManifest(file) {
  const stat = lstatSync(file);
  ordinary(file, stat.isDirectory());
  if (!stat.isDirectory()) {
    const bytes = readFileSync(file);
    return [{ path: '.', size: bytes.length, sha256: digest(bytes) }];
  }
  const entries = [];
  function walk(dir) {
    for (const name of readdirSync(dir).sort()) {
      const entry = path.join(dir, name);
      const info = lstatSync(entry);
      ordinary(entry, info.isDirectory());
      const relative = path.relative(file, entry).split(path.sep).join('/');
      if (relative.split('/').includes('.freelog')) throw new Error('Workspace state is not an artifact.');
      if (info.isDirectory()) { entries.push({ path: relative, kind: 'directory' }); walk(entry); }
      else {
        const bytes = readFileSync(entry);
        entries.push({ path: relative, kind: 'file', size: bytes.length, sha256: digest(bytes) });
      }
    }
  }
  walk(file);
  if (!entries.some((item) => item.kind === 'file')) throw new Error('Cannot retain an empty artifact.');
  return entries;
}

function copyTarget(record, evidenceDir) {
  if (!kinds.includes(record?.resourceKind) || !['file', 'directory'].includes(record.kind)
    || typeof evidenceDir !== 'string' || !path.isAbsolute(evidenceDir)) throw new Error('Invalid retained artifact owner.');
  ordinary(evidenceDir, true);
  return child(path.join(evidenceDir, 'lifecycle-artifacts', record.resourceKind), record.sourcePath);
}

export function validateRetainedArtifact(record, { evidenceDir, runId }) {
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(runId ?? '') || record?.runId !== runId) throw new Error('Retained artifact belongs to another run.');
  const target = copyTarget(record, evidenceDir);
  if (record.copyPath !== target) throw new Error('Retained artifact path does not match its run owner.');
  ordinary(target, record.kind === 'directory');
  if (!isDeepStrictEqual(artifactManifest(target), record.manifest)) throw new Error('Retained artifact bytes changed.');
  return target;
}

export function retainLifecycleArtifact({ workspace, sourcePath, resourceKind, evidenceDir, runId }) {
  if (!/^[A-Za-z0-9-]{1,80}$/u.test(runId ?? '')) throw new Error('Retained artifact needs its actual run ID.');
  ordinary(workspace, true);
  const source = child(workspace, sourcePath);
  if (sourcePath.split(/[\\/]/u).includes('.freelog')) throw new Error('Workspace state is not an artifact.');
  const kind = lstatSync(source).isDirectory() ? 'directory' : 'file';
  const manifest = artifactManifest(source);
  const record = { runId, resourceKind, sourcePath, kind, manifest };
  const copyPath = copyTarget(record, evidenceDir);
  if (existsSync(copyPath)) throw new Error('Refusing to overwrite retained artifact evidence.');
  const sourceRelative = path.relative(source, copyPath);
  if (!sourceRelative || (!sourceRelative.startsWith(`..${path.sep}`) && sourceRelative !== '..' && !path.isAbsolute(sourceRelative))) {
    throw new Error('Artifact evidence cannot be inside its source.');
  }
  mkdirSync(path.dirname(copyPath), { recursive: true });
  ordinary(path.dirname(copyPath), true);
  cpSync(source, copyPath, { recursive: kind === 'directory', force: false, errorOnExist: true, preserveTimestamps: true });
  record.copyPath = copyPath;
  validateRetainedArtifact(record, { evidenceDir, runId });
  return record;
}
