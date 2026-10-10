import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEmptyState,
  createResourceManifest,
  ensureProjectGitignore,
  loadCollectionProject,
  loadManifest,
  loadResourceProject,
  loadState,
  loadVersionProject,
  migrateManifestDocument,
  migrateStateDocument,
  saveCollectionProject,
  savePlatformResourceState,
  saveProjectSnapshot,
  saveResourceProject,
  saveState,
  saveVersionProject,
} from '../src/config/project/index.js';
import { ManifestStateStore } from '../src/services/store/manifestStateStore.js';

const tempDirs: string[] = [];

function mkProject() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-storage-integrity-'));
  tempDirs.push(cwd);
  const manifest = createResourceManifest({
    resourceName: 'demo',
    resourceTypeCode: 'RT005001',
    resourceTitle: 'Demo',
  });
  const state = createEmptyState('resource');
  saveProjectSnapshot(manifest, state, cwd);
  return { cwd, manifest, state };
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('project schema boundary', () => {
  it('accepts the current schema through explicit migration entry points', () => {
    expect(migrateManifestDocument({ schemaVersion: 1 }).schemaVersion).toBe(1);
    expect(migrateStateDocument({ schemaVersion: 1 }).schemaVersion).toBe(1);
  });

  it('rejects missing and future manifest schema versions instead of coercing them to v1', () => {
    const { cwd, manifest } = mkProject();
    const file = path.join(cwd, 'freelog.manifest.json');

    const { schemaVersion: _schemaVersion, ...withoutVersion } = manifest;
    fs.writeFileSync(file, `${JSON.stringify(withoutVersion)}\n`);
    expect(() => loadManifest(cwd)).toThrow(/schemaVersion/);

    fs.writeFileSync(file, `${JSON.stringify({ ...manifest, schemaVersion: 2 })}\n`);
    expect(() => loadManifest(cwd)).toThrow(/schemaVersion=2/);
  });

  it('rejects invalid state objects and nested sections instead of returning an empty state', () => {
    const { cwd } = mkProject();
    const file = path.join(cwd, '.freelog', 'state.json');

    fs.writeFileSync(file, '[]\n');
    expect(() => loadState(cwd)).toThrow(/state\.json/);

    fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: 1, resource: [] })}\n`);
    expect(() => loadState(cwd)).toThrow(/state\.resource/);
  });

  it('rejects platform policy ids and empty policy source in manifest intent', () => {
    const { cwd, manifest } = mkProject();
    const file = path.join(cwd, 'freelog.manifest.json');
    const invalid = {
      ...manifest,
      policies: [{ policyId: 'policy-1', policyName: 'free', policyText: '' }],
    };
    fs.writeFileSync(file, `${JSON.stringify(invalid)}\n`);

    expect(() => loadManifest(cwd)).toThrow(/policies\[0\]/);
  });
});

describe('project write integrity', () => {
  it('fails explicitly while another live process owns the project write lock', async () => {
    const { cwd, state } = mkProject();
    const lock = path.join(cwd, '.freelog', 'tmp', 'project-write.lock');
    const child = spawn(
      process.execPath,
      [
        '-e',
        `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(lock)},JSON.stringify({pid:process.pid})+'\\n');process.stdout.write('ready');setTimeout(()=>{},30000)`,
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('error', reject);
      child.stdout.once('data', () => resolve());
    });

    try {
      expect(() => saveState(state, cwd)).toThrow(/CLI 进程|CLI process/i);
      expect(() => loadResourceProject(cwd)).toThrow(/CLI 进程|CLI process/i);
    } finally {
      child.kill();
    }
  });

  it('reasserts project-private paths after later gitignore negations', () => {
    const { cwd } = mkProject();
    fs.writeFileSync(
      path.join(cwd, '.gitignore'),
      [
        '/.freelog/state.json',
        '/.freelog/cache/',
        '/.freelog/tmp/',
        '/.freelog-auth',
        '!.freelog/state.json',
        '!.freelog/cache/keep',
        '!.freelog/tmp/debug.log',
        '!**/.freelog-auth',
        '',
      ].join('\n'),
    );

    ensureProjectGitignore(cwd);

    const rules = fs
      .readFileSync(path.join(cwd, '.gitignore'), 'utf8')
      .trimEnd()
      .split(/\r?\n/);
    expect(rules.slice(-4)).toEqual([
      '/.freelog/state.json',
      '/.freelog/cache/',
      '/.freelog/tmp/',
      '/.freelog-auth',
    ]);
  });

  it('cleans a lock left by a dead process and completes the write', () => {
    const { cwd, state } = mkProject();
    const lock = path.join(cwd, '.freelog', 'tmp', 'project-write.lock');
    fs.writeFileSync(lock, `${JSON.stringify({ pid: 2_147_483_647 })}\n`);
    state.resource.resourceId = 'resource-after-stale-lock';

    expect(() => saveState(state, cwd)).not.toThrow();
    expect(loadState(cwd).data.resource.resourceId).toBe('resource-after-stale-lock');
    expect(fs.existsSync(lock)).toBe(false);
  });

  it('rolls an interrupted manifest/state pair forward before either document is read', () => {
    const { cwd, manifest, state } = mkProject();
    const journalPath = path.join(cwd, '.freelog', 'tmp', 'project-transaction.json');
    const nextManifest = {
      ...manifest,
      resource: { ...manifest.resource, title: 'Recovered title' },
    };
    const nextState = {
      ...state,
      resource: { ...state.resource, resourceId: 'resource-recovered' },
    };
    fs.writeFileSync(
      journalPath,
      `${JSON.stringify({
        schemaVersion: 1,
        manifest: `${JSON.stringify(nextManifest)}\n`,
        state: `${JSON.stringify(nextState)}\n`,
      })}\n`,
    );

    expect(loadManifest(cwd).data.resource.title).toBe('Recovered title');
    expect(loadState(cwd).data.resource.resourceId).toBe('resource-recovered');
    expect(fs.existsSync(journalPath)).toBe(false);
  });

  it('rejects a stale resource DTO instead of silently overwriting a completed write', () => {
    const { cwd } = mkProject();
    const first = loadResourceProject(cwd).data;
    const stale = loadResourceProject(cwd).data;
    const updated = { ...first, resourceTitle: 'First writer' };

    saveResourceProject(updated, cwd);
    expect(() => saveResourceProject({ ...stale, intro: 'stale writer' }, cwd)).toThrow(
      /其他进程|another process/i,
    );
    expect(loadResourceProject(cwd).data.resourceTitle).toBe('First writer');

    expect(() => saveResourceProject({ ...updated, intro: 'same writer continues' }, cwd)).not.toThrow();
  });

  it('applies optimistic revision checks to version and collection writers', () => {
    const { cwd } = mkProject();
    const version = loadVersionProject(cwd).data;
    const staleVersion = loadVersionProject(cwd).data;
    saveVersionProject({ ...version, description: 'fresh version' }, cwd);
    expect(() => saveVersionProject({ ...staleVersion, description: 'stale version' }, cwd)).toThrow(
      /其他进程|another process/i,
    );

    const collectionCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-storage-collection-'));
    tempDirs.push(collectionCwd);
    const collectionManifest = createResourceManifest({
      subject: 'collection',
      resourceName: 'collection',
      resourceTypeCode: 'collection',
    });
    saveProjectSnapshot(collectionManifest, createEmptyState('collection'), collectionCwd);
    const collection = loadCollectionProject(collectionCwd).data;
    const staleCollection = loadCollectionProject(collectionCwd).data;
    saveCollectionProject({ ...collection, description: 'fresh collection' }, collectionCwd);
    expect(() =>
      saveCollectionProject(
        { ...staleCollection, description: 'stale collection' },
        collectionCwd,
      ),
    ).toThrow(/其他进程|another process/i);
  });

  it('rebases only fields changed from a stale store snapshot and preserves concurrent intent', () => {
    const { cwd } = mkProject();
    const store = new ManifestStateStore(cwd);
    const prepared = store.loadVersion();

    const concurrent = loadVersionProject(cwd).data;
    saveVersionProject({ ...concurrent, description: 'concurrent local intent' }, cwd);

    expect(() =>
      store.saveVersion({
        ...prepared,
        published: true,
        versionId: 'version-1',
        fileSha1: 'sha-1',
        filename: 'file.zip',
      }),
    ).not.toThrow();
    expect(store.loadVersion().description).toBe('concurrent local intent');
    expect(store.loadVersion().versionId).toBe('version-1');
  });

  it('rejects a stale store patch when both writers changed the same field', () => {
    const { cwd } = mkProject();
    const store = new ManifestStateStore(cwd);
    const prepared = store.loadVersion();
    const concurrent = loadVersionProject(cwd).data;
    saveVersionProject({ ...concurrent, description: 'concurrent local intent' }, cwd);

    expect(() =>
      store.saveVersion({ ...prepared, description: 'stale writer intent' }),
    ).toThrow(/其他进程|another process/i);
    expect(store.loadVersion().description).toBe('concurrent local intent');
  });

  it('keeps pure partial store patches compatible and hides merge metadata from JSON', () => {
    const { cwd } = mkProject();
    const store = new ManifestStateStore(cwd);
    store.saveVersion({ description: 'partial intent' });

    const loaded = store.loadVersion();
    expect(loaded.description).toBe('partial intent');
    expect(JSON.stringify(loaded)).not.toContain('store-patch-base');
  });

  it('merges confirmed remote facts without overwriting concurrent local intent', () => {
    const { cwd, manifest, state } = mkProject();
    state.resource.resourceId = 'resource-1';
    state.resource.owner = { userId: 101, username: 'alice' };
    saveProjectSnapshot(manifest, state, cwd);
    const remoteWriter = loadResourceProject(cwd).data;
    const localWriter = loadResourceProject(cwd).data;

    saveResourceProject({ ...localWriter, intro: 'concurrent local intent' }, cwd);
    savePlatformResourceState(
      { ...remoteWriter, status: 1, policies: [{ policyId: 'policy-1', status: 1 }] },
      cwd,
      'resource',
      { remoteWriteConfirmed: true },
    );

    const current = loadResourceProject(cwd).data;
    expect(current.intro).toBe('concurrent local intent');
    expect(current.status).toBe(1);
    expect(current.policies).toEqual([{ policyId: 'policy-1', status: 1 }]);
  });

  it('never restores a cleared or changed binding while merging confirmed remote facts', () => {
    const { cwd, manifest, state } = mkProject();
    state.resource.resourceId = 'resource-1';
    state.resource.owner = { userId: 101, username: 'alice' };
    saveProjectSnapshot(manifest, state, cwd);
    const remoteWriter = loadResourceProject(cwd).data;

    saveProjectSnapshot(manifest, createEmptyState('resource'), cwd);

    expect(() =>
      savePlatformResourceState(remoteWriter, cwd, 'resource', { remoteWriteConfirmed: true }),
    ).toThrow(/其他进程|another process/i);
    expect(loadState(cwd).data.resource.resourceId).toBeNull();
  });
});
