import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCliEnv } from '../src/core/env.js';

const mocks = vi.hoisted(() => ({
  fetchResourceInfo: vi.fn(),
  ensureSynced: vi.fn(),
  assertResourceTypeCode: vi.fn(),
  uploadFileIfNeeded: vi.fn(),
  fileExistsOnPlatform: vi.fn(),
  createVersion: vi.fn(),
  getVersionListByResourceID: vi.fn(),
  resourceVersionInfo1: vi.fn(),
  resolveCreateVersionPropertiesFromFile: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 101, username: 'alice', token: 'test-token' }),
}));

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureSynced: mocks.ensureSynced,
    fetchResourceInfo: mocks.fetchResourceInfo,
  };
});

vi.mock('../src/services/typeService.js', () => ({
  assertResourceTypeCode: mocks.assertResourceTypeCode,
}));

vi.mock('../src/services/storageUpload.js', () => ({
  uploadFileIfNeeded: mocks.uploadFileIfNeeded,
  fileExistsOnPlatform: mocks.fileExistsOnPlatform,
}));

vi.mock('../src/services/fileProperty/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/fileProperty/index.js')>();
  return {
    ...actual,
    resolveCreateVersionPropertiesFromFile: mocks.resolveCreateVersionPropertiesFromFile,
  };
});

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Resource: {
        ...actual.FServiceAPI.Resource,
        createVersion: mocks.createVersion,
        getVersionListByResourceID: mocks.getVersionListByResourceID,
        resourceVersionInfo1: mocks.resourceVersionInfo1,
      },
    },
  };
});

import {
  loadVersionProject,
  savePlatformResourceState,
  saveVersionProject,
} from '../src/config/project.js';
import { runInitScaffold } from '../src/services/init/index.js';
import { publishVersion } from '../src/services/resource/publishVersion.js';
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';

const tempDirs: string[] = [];

describe('publishVersion dry-run side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCliEnv('dev');
    mocks.assertResourceTypeCode.mockResolvedValue({
      resourceConfig: { compress: true, supportOptionalConfig: 2 },
    });
    mocks.getVersionListByResourceID.mockResolvedValue({ data: [] });
    mocks.fileExistsOnPlatform.mockResolvedValue(false);
  });

  afterEach(() => {
    while (tempDirs.length) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not pull, persist bump, compress, upload, parse, or write the platform', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-dry-test-'));
    tempDirs.push(cwd);
    await runInitScaffold({
      dir: '.',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      runtime: '0.5',
      resourceName: 'my-theme',
      title: 'My Theme',
      skipInstall: true,
    });
    fs.mkdirSync(path.join(cwd, 'dist'));
    fs.writeFileSync(path.join(cwd, 'dist', 'main.js'), 'ok');

    savePlatformResourceState(
      {
        resourceId: 'resource-1',
        resourceName: 'alice/my-theme',
        resourceType: ['theme'],
        resourceTypeCode: 'theme',
        resourceTitle: 'My Theme',
        userId: 101,
        username: 'alice',
        latestVersion: '1.0.0',
        status: 4,
        policies: [],
      },
      cwd,
    );
    mocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'resource-1',
      resourceName: 'alice/my-theme',
      resourceType: ['theme'],
      resourceTypeCode: 'theme',
      resourceTitle: 'My Theme',
      userId: 101,
      username: 'alice',
      latestVersion: '1.0.0',
      status: 4,
      policies: [],
    });

    const manifestPath = path.join(cwd, 'freelog.manifest.json');
    const statePath = path.join(cwd, '.freelog', 'state.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    const stateBefore = fs.readFileSync(statePath, 'utf8');

    const result = await publishVersion({ store: projectStoreFromCwd(cwd), dryRun: true, bump: true });

    expect(result).toMatchObject({
      dryRun: true,
      version: '1.0.1',
      fileSha1: 'unresolved',
      stages: {
        package: 'planned',
        upload: 'planned',
        properties: 'planned',
        platformWrite: 'planned',
      },
    });
    expect(result.unresolved).toEqual(
      expect.arrayContaining([
        'createVersionParams.fileSha1',
        'createVersionParams.inputAttrs',
        'createVersionParams.customPropertyDescriptors',
      ]),
    );
    expect(result.createVersionParams).toMatchObject({
      fileSha1: 'unresolved',
      inputAttrs: 'unresolved',
      customPropertyDescriptors: 'unresolved',
    });
    expect(loadVersionProject(cwd).data.version).toBe('1.0.0');
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
    expect(fs.readFileSync(statePath, 'utf8')).toBe(stateBefore);
    expect(mocks.ensureSynced).not.toHaveBeenCalled();
    expect(mocks.uploadFileIfNeeded).not.toHaveBeenCalled();
    expect(mocks.resolveCreateVersionPropertiesFromFile).not.toHaveBeenCalled();
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });

  it('repairs local publish facts when the same version and file already exist remotely', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-reconcile-test-'));
    tempDirs.push(cwd);
    await runInitScaffold({
      dir: '.',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'RT005001',
      resourceName: 'my-resource',
      title: 'My Resource',
      skipInstall: true,
    });
    const artifactPath = path.join(cwd, 'artifact.txt');
    fs.writeFileSync(artifactPath, 'published artifact');
    const sha1 = createHash('sha1').update('published artifact').digest('hex');
    const initialVersion = loadVersionProject(cwd).data;
    saveVersionProject(
      { ...initialVersion, filePath: 'artifact.txt', artifactMode: 'file' },
      cwd,
    );
    savePlatformResourceState(
      {
        resourceId: 'resource-1',
        resourceName: 'alice/my-resource',
        resourceType: ['resource'],
        resourceTypeCode: 'RT005001',
        resourceTitle: 'My Resource',
        userId: 101,
        username: 'alice',
        latestVersion: '1.0.0',
        status: 4,
        policies: [],
      },
      cwd,
    );
    mocks.ensureSynced.mockResolvedValue({
      resource: {
        resourceId: 'resource-1',
        resourceName: 'alice/my-resource',
        resourceType: ['resource'],
        resourceTypeCode: 'RT005001',
        resourceTitle: 'My Resource',
        userId: 101,
        username: 'alice',
      },
      info: { latestVersion: '1.0.0', status: 4 },
    });
    mocks.assertResourceTypeCode.mockResolvedValue({ resourceConfig: { compress: false } });
    mocks.getVersionListByResourceID.mockResolvedValue({
      ret: 0,
      data: [{ version: '1.0.0', versionId: 'version-1' }],
    });
    mocks.resourceVersionInfo1.mockResolvedValue({
      ret: 0,
      data: { version: '1.0.0', versionId: 'version-1', fileSha1: sha1, filename: 'artifact.txt' },
    });

    await expect(publishVersion({ store: projectStoreFromCwd(cwd) })).resolves.toMatchObject({
      versionId: 'version-1',
      fileSha1: sha1,
      stages: { platformWrite: 'reused' },
    });
    expect(mocks.createVersion).not.toHaveBeenCalled();
    expect(mocks.uploadFileIfNeeded).not.toHaveBeenCalled();
    expect(loadVersionProject(cwd).data.versionId).toBe('version-1');
  });

  it('rejects existing-version recovery when non-file publish intent differs', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-reconcile-conflict-'));
    tempDirs.push(cwd);
    await runInitScaffold({
      dir: '.',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'RT005001',
      resourceName: 'my-resource',
      title: 'My Resource',
      skipInstall: true,
    });
    fs.writeFileSync(path.join(cwd, 'artifact.txt'), 'published artifact');
    const sha1 = createHash('sha1').update('published artifact').digest('hex');
    saveVersionProject(
      {
        ...loadVersionProject(cwd).data,
        filePath: 'artifact.txt',
        artifactMode: 'file',
        description: 'local intent',
      },
      cwd,
    );
    savePlatformResourceState(
      {
        resourceId: 'resource-1',
        resourceName: 'alice/my-resource',
        resourceType: ['resource'],
        resourceTypeCode: 'RT005001',
        resourceTitle: 'My Resource',
        userId: 101,
        username: 'alice',
        latestVersion: '1.0.0',
        status: 4,
        policies: [],
      },
      cwd,
    );
    mocks.ensureSynced.mockResolvedValue({
      resource: loadVersionProject(cwd).data,
      info: { latestVersion: '1.0.0', status: 4 },
    });
    mocks.assertResourceTypeCode.mockResolvedValue({ resourceConfig: { compress: false } });
    mocks.getVersionListByResourceID.mockResolvedValue({
      ret: 0,
      data: [{ version: '1.0.0', versionId: 'version-1' }],
    });
    mocks.resourceVersionInfo1.mockResolvedValue({
      ret: 0,
      data: {
        version: '1.0.0',
        versionId: 'version-1',
        fileSha1: sha1,
        filename: 'artifact.txt',
        description: 'different remote intent',
      },
    });

    await expect(publishVersion({ store: projectStoreFromCwd(cwd) })).rejects.toMatchObject({
      code: 4,
      details: { original: { error: 'PUBLISHED_VERSION_CONFLICT' } },
    });
    expect(mocks.createVersion).not.toHaveBeenCalled();
    expect(loadVersionProject(cwd).data.versionId).toBeUndefined();
  });

  it('does not mark concurrently changed publish intent as the version that was created remotely', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-publish-concurrent-'));
    tempDirs.push(cwd);
    await runInitScaffold({
      dir: '.',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'RT005001',
      resourceName: 'my-resource',
      title: 'My Resource',
      skipInstall: true,
    });
    fs.writeFileSync(path.join(cwd, 'artifact.txt'), 'new artifact');
    saveVersionProject(
      { ...loadVersionProject(cwd).data, filePath: 'artifact.txt', artifactMode: 'file' },
      cwd,
    );
    savePlatformResourceState(
      {
        resourceId: 'resource-1',
        resourceName: 'alice/my-resource',
        resourceType: ['resource'],
        resourceTypeCode: 'RT005001',
        resourceTitle: 'My Resource',
        userId: 101,
        username: 'alice',
        status: 4,
        policies: [],
      },
      cwd,
    );
    mocks.ensureSynced.mockResolvedValue({
      resource: {
        resourceId: 'resource-1',
        resourceName: 'alice/my-resource',
        resourceType: ['resource'],
        resourceTypeCode: 'RT005001',
        userId: 101,
        username: 'alice',
      },
      info: { status: 4 },
    });
    mocks.assertResourceTypeCode.mockResolvedValue({ resourceConfig: { compress: false } });
    mocks.getVersionListByResourceID.mockResolvedValue({ data: [] });
    mocks.uploadFileIfNeeded.mockResolvedValue('uploaded');
    mocks.resolveCreateVersionPropertiesFromFile.mockResolvedValue({
      inputAttrs: [],
      customPropertyDescriptors: [],
    });
    mocks.createVersion.mockImplementation(async () => {
      const concurrent = loadVersionProject(cwd).data;
      saveVersionProject({ ...concurrent, description: 'concurrent new intent' }, cwd);
      return { data: { version: '1.0.0', versionId: 'version-created' } };
    });

    await expect(publishVersion({ store: projectStoreFromCwd(cwd) })).rejects.toMatchObject({
      code: 3,
      details: {
        original: { error: 'REMOTE_WRITE_LOCAL_CONFLICT', conflictingFields: ['description'] },
        stages: { platformWrite: 'completed' },
      },
    });
    expect(loadVersionProject(cwd).data).toMatchObject({
      description: 'concurrent new intent',
    });
    expect(loadVersionProject(cwd).data.versionId).toBeUndefined();
  });
});
