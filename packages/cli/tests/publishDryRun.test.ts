import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchResourceInfo: vi.fn(),
  ensureSynced: vi.fn(),
  assertResourceTypeCode: vi.fn(),
  uploadFileIfNeeded: vi.fn(),
  fileExistsOnPlatform: vi.fn(),
  createVersion: vi.fn(),
  getVersionListByResourceID: vi.fn(),
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
      },
    },
  };
});

import {
  loadVersionProject,
  savePlatformResourceState,
} from '../src/config/project.js';
import { runInitScaffold } from '../src/services/init/index.js';
import { publishVersion } from '../src/services/resource/publishVersion.js';
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';

describe('publishVersion dry-run side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResourceTypeCode.mockResolvedValue({
      resourceConfig: { compress: true, supportOptionalConfig: 2 },
    });
    mocks.getVersionListByResourceID.mockResolvedValue({ data: [] });
    mocks.fileExistsOnPlatform.mockResolvedValue(false);
  });

  it('does not pull, persist bump, compress, upload, parse, or write the platform', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-publish-dry-'));
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
});
