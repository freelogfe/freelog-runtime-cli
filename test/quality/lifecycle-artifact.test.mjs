import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { artifactManifest, retainLifecycleArtifact, validateRetainedArtifact } from '../acceptance/lifecycle-artifact.mjs';

function fixture(t) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'freelog-lifecycle-artifact-')));
  t.after(() => { assert.ok(path.basename(root).startsWith('freelog-lifecycle-artifact-')); rmSync(root, { recursive: true, force: true }); });
  const workspace = path.join(root, 'work');
  const evidenceDir = path.join(root, 'evidence');
  mkdirSync(workspace); mkdirSync(evidenceDir);
  mkdirSync(path.join(workspace, '.freelog'));
  writeFileSync(path.join(workspace, '.freelog', 'auth'), 'FAKE_PRIVATE_WORKSPACE_STATE');
  return { workspace, evidenceDir, runId: 'same-run', resourceKind: 'image' };
}

test('file copy is exact, run-owned and excludes sibling auth; does not claim re-upload is skipped', (t) => {
  const spec = fixture(t);
  writeFileSync(path.join(spec.workspace, 'photo-v2.png'), 'test artifact bytes');
  const kept = retainLifecycleArtifact({ ...spec, sourcePath: 'photo-v2.png' });
  assert.equal(kept.kind, 'file');
  assert.equal(validateRetainedArtifact(kept, spec), kept.copyPath);
  assert.equal(readFileSync(kept.copyPath, 'utf8'), 'test artifact bytes');
  assert.equal(kept.manifest.length, 1);
  assert.equal(kept.manifest[0].path, '.');
  assert.throws(() => retainLifecycleArtifact({ ...spec, sourcePath: 'photo-v2.png' }), /overwrite/u);
});

test('directory manifest binds all content and empty directories, and catches changed or extra bytes', (t) => {
  const spec = { ...fixture(t), resourceKind: 'theme' };
  mkdirSync(path.join(spec.workspace, 'dist', 'assets'), { recursive: true });
  mkdirSync(path.join(spec.workspace, 'dist', 'empty'));
  writeFileSync(path.join(spec.workspace, 'dist', 'index.html'), '<main>fixture</main>');
  writeFileSync(path.join(spec.workspace, 'dist', 'assets', 'game.js'), '// fixture');
  const kept = retainLifecycleArtifact({ ...spec, sourcePath: 'dist' });
  assert.deepEqual(artifactManifest(kept.copyPath), artifactManifest(path.join(spec.workspace, 'dist')));
  assert.ok(kept.manifest.some((item) => item.path === 'empty' && item.kind === 'directory'));
  writeFileSync(path.join(kept.copyPath, 'new.txt'), 'extra');
  assert.throws(() => validateRetainedArtifact(kept, spec), /bytes changed/u);
});

test('wrong run, moved path and altered manifest cannot reuse a retained artifact', (t) => {
  const spec = fixture(t);
  writeFileSync(path.join(spec.workspace, 'photo-v2.png'), 'fixture');
  const kept = retainLifecycleArtifact({ ...spec, sourcePath: 'photo-v2.png' });
  assert.throws(() => validateRetainedArtifact(kept, { ...spec, runId: 'old-run' }), /another run/u);
  assert.throws(() => validateRetainedArtifact({ ...kept, copyPath: path.join(spec.workspace, 'photo-v2.png') }, spec), /path/u);
  assert.throws(() => validateRetainedArtifact({ ...kept, manifest: [] }, spec), /bytes changed/u);
});

test('state paths, traversal, empty artifacts and source-contained destination are refused', (t) => {
  const spec = fixture(t);
  for (const sourcePath of ['.freelog/auth', '../escape', '.', '']) {
    assert.throws(() => retainLifecycleArtifact({ ...spec, sourcePath }), /path|state/u);
  }
  mkdirSync(path.join(spec.workspace, 'dist'));
  assert.throws(() => retainLifecycleArtifact({ ...spec, resourceKind: 'theme', sourcePath: 'dist' }), /empty/u);
  writeFileSync(path.join(spec.workspace, 'dist', 'index.html'), 'valid');
  const inside = path.join(spec.workspace, 'dist', 'evidence'); mkdirSync(inside);
  assert.throws(() => retainLifecycleArtifact({ ...spec, resourceKind: 'theme', sourcePath: 'dist', evidenceDir: inside }), /inside/u);
});

test('junctions and embedded workspace state cannot be retained as build output', (t) => {
  const spec = { ...fixture(t), resourceKind: 'theme' };
  const dist = path.join(spec.workspace, 'dist'); mkdirSync(dist);
  mkdirSync(path.join(dist, '.freelog')); writeFileSync(path.join(dist, '.freelog', 'auth'), 'FAKE_STATE');
  assert.throws(() => retainLifecycleArtifact({ ...spec, sourcePath: 'dist' }), /state/u);
  const alias = path.join(spec.workspace, 'alias');
  symlinkSync(dist, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => retainLifecycleArtifact({ ...spec, sourcePath: 'alias' }), /ordinary/u);
});

test('the actual lifecycle success-retention branch executes with its declared fs imports', async (t) => {
  const spec = fixture(t);
  writeFileSync(path.join(spec.workspace, 'photo-v2.png'), 'real producer-branch control bytes');
  const source = readFileSync(new URL('../verify-theme-image-full-lifecycle.mjs', import.meta.url), 'utf8');
  const fsImport = source.match(/^import \{[^}]+\} from 'node:fs';/mu)?.[0];
  const branch = source.match(/    if \(process\.env\.FREELOG_TEST_RUN_ID\) \{[\s\S]+?\n    \}/u)?.[0];
  assert.ok(fsImport && branch, 'exercise the declared imports and actual retained-artifact call, not a duplicated success stub');
  const moduleSource = `${fsImport}\nimport {retainLifecycleArtifact} from '${new URL('../acceptance/lifecycle-artifact.mjs', import.meta.url).href}';\n`
    + `export function exercise(work,reportDir,spec,artifact,record) { ${branch}\nreturn record; }`;
  const actual = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
  const oldRun = process.env.FREELOG_TEST_RUN_ID;
  try {
    process.env.FREELOG_TEST_RUN_ID = spec.runId;
    const record = actual.exercise(spec.workspace, spec.evidenceDir, { kind: 'image' }, { updated: 'photo-v2.png' }, {});
    assert.equal(validateRetainedArtifact(record.retainedArtifact, spec), path.join(spec.evidenceDir, 'lifecycle-artifacts/image/photo-v2.png'));
  } finally {
    if (oldRun === undefined) delete process.env.FREELOG_TEST_RUN_ID;
    else process.env.FREELOG_TEST_RUN_ID = oldRun;
  }
});
