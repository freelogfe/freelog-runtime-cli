import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCliEnv } from '../src/core/env.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  info: vi.fn(),
  assertResourceTypeCode: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({
    token: 'test-token',
    userId: 101,
    username: 'alice',
    environment: 'test',
  }),
}));

vi.mock('../src/services/typeService.js', () => ({
  assertResourceTypeCode: mocks.assertResourceTypeCode,
}));

vi.mock('../src/platform/index.js', () => ({
  FServiceAPI: { Resource: { create: mocks.create, info: mocks.info } },
  unwrapData: <T>(value: { data?: T } | T) =>
    value && typeof value === 'object' && 'data' in value ? value.data : value,
}));

import {
  type CollectionProject,
  type ResourceProject,
  type VersionProject,
  loadCollectionProject,
  loadManifest,
  loadResourceProject,
  loadState,
  loadVersionProject,
  savePlatformResourceState,
  saveCollectionProject,
  saveResourceProject,
  saveVersionProject,
} from '../src/config/project.js';
import { runInitScaffold } from '../src/services/scaffold.js';
import { collectionVersionSet, createCollection } from '../src/services/collectionService.js';
import { createResource } from '../src/services/resourceService.js';
import { assertApplyListingAllowed } from '../src/services/syncService.js';

describe('init manifest/state flow', () => {
  beforeEach(() => {
    setCliEnv('test');
    mocks.create.mockReset();
    mocks.info.mockReset();
    mocks.info.mockResolvedValue({ data: null });
    mocks.assertResourceTypeCode.mockReset();
  });

  it('creates a resource from init manifest without repeating title or type', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-resource-template-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
    });
    mocks.create.mockResolvedValue({
      data: {
        resourceId: 'resource-1',
        resourceName: 'alice/my-theme',
        resourceType: ['theme'],
        resourceTypeCode: 'theme',
        userId: 101,
        username: 'alice',
      },
    });

    const created = await createResource({ cwd: projectDir });

    expect(mocks.create).toHaveBeenCalledWith({
      name: 'my-theme',
      resourceTypeCode: 'theme',
      resourceTypeName: undefined,
      resourceTitle: 'my-theme',
    });
    expect(mocks.info).toHaveBeenCalledWith({ resourceIdOrName: 'alice/my-theme' });
    expect(created).toMatchObject({
      resourceId: 'resource-1',
      resourceName: 'alice/my-theme',
      resourceTypeCode: 'theme',
      userId: 101,
    });
    expect(loadResourceProject(projectDir).data).toMatchObject({
      resourceId: 'resource-1',
      resourceName: 'alice/my-theme',
      username: 'alice',
    } satisfies Partial<ResourceProject>);
    expect(loadVersionProject(projectDir).data).toMatchObject({
      resourceId: 'resource-1',
      resourceName: 'alice/my-theme',
      resourceTypeCode: 'theme',
      version: '1.0.0',
      filePath: 'dist',
    } satisfies Partial<VersionProject>);
    expectOldConfigAbsent(projectDir);
  });

  it('records current CLI env in local state', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-state-env-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
    });

    expect(loadState(projectDir).data.env).toBe('test');
  });

  it('rejects reading a project state from another CLI env', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-state-env-mismatch-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
    });

    setCliEnv('dev');
    try {
      expect(() => loadState(projectDir)).toThrow('项目 state 环境与当前 API 环境不一致');
    } finally {
      setCliEnv('test');
    }
  });

  it('creates a collection from init manifest without repeating title or type', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-template-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-collection',
      cwd,
      scaffold: 'collection',
      resourceTypeCode: 'collection',
      skipInstall: true,
    });
    mocks.create.mockResolvedValue({
      data: {
        resourceId: 'collection-1',
        resourceName: 'alice/my-collection',
        resourceType: ['collection'],
        resourceTypeCode: 'collection',
        userId: 101,
        username: 'alice',
      },
    });

    const created = await createCollection({ cwd: projectDir });

    expect(mocks.create).toHaveBeenCalledWith({
      name: 'my-collection',
      subjectType: 4,
      resourceTypeCode: 'collection',
      resourceTitle: 'my-collection',
    });
    expect(mocks.info).toHaveBeenCalledWith({ resourceIdOrName: 'alice/my-collection' });
    expect(created).toMatchObject({
      resourceId: 'collection-1',
      resourceName: 'alice/my-collection',
      resourceTypeCode: 'collection',
      version: '1.0.0',
      display: {},
      catalogueItems: [],
    });
    expect(loadCollectionProject(projectDir).data).toMatchObject({
      resourceId: 'collection-1',
      resourceName: 'alice/my-collection',
      userId: 101,
      username: 'alice',
      version: '1.0.0',
      display: {},
      catalogueItems: [],
    } satisfies Partial<CollectionProject>);
    expectOldConfigAbsent(projectDir);
  });

  it('rejects a full authorization name because create accepts a short name only', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-full-name-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
    });
    await expect(createResource({ cwd: projectDir, name: 'team/shared-theme' })).rejects.toThrow(
      '只能是短授权标识',
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('clears stale published file metadata when the local version intent changes', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-version-clear-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      runtime: '0.5',
      skipInstall: true,
    });

    saveVersionProject(
      {
        ...loadVersionProject(projectDir).data,
        version: '1.0.0',
        fileSha1: 'a'.repeat(40),
        filename: 'my-theme-1.0.0.zip',
        versionId: 'version-100',
      },
      projectDir,
    );
    expect(loadVersionProject(projectDir).data).toMatchObject({
      version: '1.0.0',
      fileSha1: 'a'.repeat(40),
      filename: 'my-theme-1.0.0.zip',
      versionId: 'version-100',
    } satisfies Partial<VersionProject>);

    saveVersionProject(
      {
        ...loadVersionProject(projectDir).data,
        version: '1.0.1',
        fileSha1: null,
        filename: null,
        versionId: null,
      },
      projectDir,
    );

    expect(loadVersionProject(projectDir).data).toMatchObject({
      version: '1.0.1',
      fileSha1: undefined,
      filename: undefined,
      versionId: undefined,
    } satisfies Partial<VersionProject>);
  });

  it('refreshes platform facts without overwriting manifest listing intent', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-state-only-refresh-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
      title: 'Local Title',
    });

    savePlatformResourceState(
      {
        resourceId: 'resource-1',
        resourceName: 'alice/my-theme',
        resourceType: ['theme'],
        resourceTypeCode: 'theme',
        resourceTitle: 'Platform Title',
        intro: 'Platform intro',
        tags: ['platform'],
        userId: 101,
        username: 'alice',
        status: 4,
        latestVersion: '1.0.0',
        policies: [{ policyId: 'p1', policyName: 'free', status: 1 }],
      },
      projectDir,
    );

    expect(loadManifest(projectDir).data.resource.title).toBe('Local Title');
    expect(loadResourceProject(projectDir).data).toMatchObject({
      resourceTitle: 'Local Title',
      resourceId: 'resource-1',
      latestVersion: '1.0.0',
      status: 4,
    } satisfies Partial<ResourceProject>);
  });

  it('records formal publish facts separately from local version intent', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-publish-state-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      runtime: '0.5',
      skipInstall: true,
    });

    saveVersionProject(
      {
        ...loadVersionProject(projectDir).data,
        resourceId: 'resource-1',
        resourceName: 'alice/my-theme',
        version: '1.0.0',
        fileSha1: 'b'.repeat(40),
        filename: 'my-theme-1.0.0.zip',
        versionId: 'version-100',
        published: true,
      },
      projectDir,
    );

    expect(loadState(projectDir).data.version).toMatchObject({
      lastPublishedVersion: '1.0.0',
      lastPublishedVersionId: 'version-100',
      fileSha1: 'b'.repeat(40),
      filename: 'my-theme-1.0.0.zip',
    });
    expect(loadResourceProject(projectDir).data.latestVersion).toBe('1.0.0');
  });

  it('clears draftSync when saveVersionProject receives null', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-draft-sync-clear-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
    });

    saveVersionProject(
      {
        ...loadVersionProject(projectDir).data,
        draftSync: {
          lastFingerprint: 'a'.repeat(64),
          lastRemoteUpdateDate: '2026-08-05T00:00:00.000Z',
        },
      },
      projectDir,
    );
    expect(loadState(projectDir).data.version.draftSync?.lastFingerprint).toBe('a'.repeat(64));

    saveVersionProject({ ...loadVersionProject(projectDir).data, draftSync: null }, projectDir);

    expect(loadState(projectDir).data.version.draftSync).toBeNull();
    expect(loadVersionProject(projectDir).data.draftSync).toBeNull();
  });

  it('clears collection draftSync when saveCollectionProject receives null', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-draft-sync-clear-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-collection',
      cwd,
      scaffold: 'collection',
      resourceTypeCode: 'collection',
      skipInstall: true,
    });

    saveCollectionProject(
      {
        ...loadCollectionProject(projectDir).data,
        draftSync: {
          lastFingerprint: 'b'.repeat(64),
          lastRemoteUpdateDate: '2026-08-05T00:00:00.000Z',
        },
      },
      projectDir,
    );
    expect(loadState(projectDir).data.collection.draftSync?.lastFingerprint).toBe('b'.repeat(64));

    saveCollectionProject({ ...loadCollectionProject(projectDir).data, draftSync: null }, projectDir);

    expect(loadState(projectDir).data.collection.draftSync).toBeNull();
    expect(loadCollectionProject(projectDir).data.draftSync).toBeNull();
  });

  it('allows apply-listing when only the platform listing changed since baseline', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-apply-listing-platform-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
      title: 'Baseline Title',
    });

    savePlatformResourceState(
      {
        ...loadResourceProject(projectDir).data,
        resourceId: 'resource-1',
        resourceName: 'alice/my-theme',
        resourceTitle: 'Baseline Title',
        tags: [],
        coverImages: [],
      },
      projectDir,
    );

    expect(() =>
      assertApplyListingAllowed({
        cwd: projectDir,
        local: loadResourceProject(projectDir).data,
        info: {
          resourceId: 'resource-1',
          resourceName: 'alice/my-theme',
          resourceTitle: 'Platform Title',
          tags: [],
          coverImages: [],
        },
      }),
    ).not.toThrow();
  });

  it('requires force when local and platform listing both changed since baseline', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-apply-listing-conflict-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
      title: 'Baseline Title',
    });

    savePlatformResourceState(
      {
        ...loadResourceProject(projectDir).data,
        resourceId: 'resource-1',
        resourceName: 'alice/my-theme',
        resourceTitle: 'Baseline Title',
        tags: [],
        coverImages: [],
      },
      projectDir,
    );
    const local = loadResourceProject(projectDir).data;
    local.resourceTitle = 'Local Title';
    saveResourceProject(local, projectDir);

    expect(() =>
      assertApplyListingAllowed({
        cwd: projectDir,
        local: loadResourceProject(projectDir).data,
        info: {
          resourceId: 'resource-1',
          resourceName: 'alice/my-theme',
          resourceTitle: 'Platform Title',
          tags: [],
          coverImages: [],
        },
      }),
    ).toThrow('平台 listing 与本地 manifest.resource 均有变更');
  });

  it('updates collection release description intent before platform create', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-version-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-collection',
      cwd,
      scaffold: 'collection',
      resourceTypeCode: 'collection',
      skipInstall: true,
    });

    const next = await collectionVersionSet({
      cwd: projectDir,
      description: 'next collection publish',
    });

    expect(loadCollectionProject(projectDir).data).toMatchObject({
      description: 'next collection publish',
    } satisfies Partial<CollectionProject>);
  });

  it('rejects collection version numbers because platform collections use fixed versions', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-fixed-version-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-collection',
      cwd,
      scaffold: 'collection',
      resourceTypeCode: 'collection',
      skipInstall: true,
    });

    await expect(
      collectionVersionSet({
        cwd: projectDir,
        version: '1.1.0',
      }),
    ).rejects.toThrow('合集资源目前为平台固定版本');
  });

  it('rejects an occupied authorization name before calling Resource.create', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-occupied-name-'));
    const { projectDir } = await runInitScaffold({
      dir: 'my-theme',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      skipInstall: true,
    });
    mocks.info.mockResolvedValue({ data: { resourceId: 'existing-resource' } });

    await expect(createResource({ cwd: projectDir })).rejects.toThrow('授权标识已存在');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('rejects an incomplete init template before it creates a directory', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-missing-type-'));

    await expect(
      runInitScaffold({
        dir: 'missing-type',
        cwd,
        scaffold: 'none',
        skipInstall: true,
      }),
    ).rejects.toThrow('init 必须提供 --resource-type');
    expect(fs.existsSync(path.join(cwd, 'missing-type'))).toBe(false);
  });

  it('initializes the current directory without creating a dash child directory', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-existing-theme-'));

    const { projectDir } = await runInitScaffold({
      dir: '.',
      cwd,
      scaffold: 'none',
      resourceTypeCode: 'theme',
      runtime: '0.5',
      resourceName: 'existing-theme',
      title: 'Existing Theme',
      skipInstall: true,
    });

    expect(projectDir).toBe(cwd);
    expect(fs.existsSync(path.join(cwd, '-'))).toBe(false);
    expect(loadResourceProject(cwd).data).toMatchObject({
      resourceName: 'existing-theme',
      resourceTitle: 'Existing Theme',
      resourceTypeCode: 'theme',
    } satisfies Partial<ResourceProject>);
    expect(loadVersionProject(cwd).data).toMatchObject({
      resourceName: 'existing-theme',
      resourceTypeCode: 'theme',
      runtimeVersion: '0.5',
      filePath: 'dist',
    } satisfies Partial<VersionProject>);
  });

  it('rejects copying a runtime template into a non-empty existing directory', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-existing-runtime-'));
    fs.writeFileSync(path.join(cwd, 'package.json'), '{}\n');

    await expect(
      runInitScaffold({
        dir: '.',
        cwd,
        scaffold: 'runtime',
        template: 'vite-react-ts',
        resourceTypeCode: 'theme',
        runtime: '0.5',
        skipInstall: true,
      }),
    ).rejects.toThrow('目录非空，不能复制模板');
  });
});

function expectOldConfigAbsent(cwd: string) {
  expect(fs.existsSync(path.join(cwd, 'freelog.resource.config.ts'))).toBe(false);
  expect(fs.existsSync(path.join(cwd, 'freelog.version.config.ts'))).toBe(false);
  expect(fs.existsSync(path.join(cwd, 'freelog.collection.config.ts'))).toBe(false);
  expect(fs.existsSync(path.join(cwd, 'freelog.manifest.json'))).toBe(true);
  expect(fs.existsSync(path.join(cwd, '.freelog', 'state.json'))).toBe(true);
}
