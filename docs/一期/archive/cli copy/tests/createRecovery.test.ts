import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setCliEnv } from '../src/core/env.js';
import { createResourceManifest, loadResourceProject, saveManifest } from '../src/config/project.js';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  create: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 101, username: 'alice' }),
}));

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureOwner: vi.fn(async ({ store }) => ({ resource: store.loadResource() })),
  };
});

vi.mock('../src/services/typeService.js', () => ({
  assertLeafResourceTypeCode: vi.fn(),
  assertResourceTypeCode: vi.fn(),
}));

vi.mock('../src/platform/index.js', () => ({
  unwrapData: (value: { data?: unknown } | unknown) =>
    value && typeof value === 'object' && 'data' in value ? value.data : value,
  FServiceAPI: { Resource: { info: mocks.info, create: mocks.create } },
}));

import { createResource } from '../src/services/resourceService.js';
import { createCollection } from '../src/services/collection/create.js';
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';

const tempDirs: string[] = [];

afterEach(() => {
  vi.clearAllMocks();
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('create reconciliation', () => {
  it('binds an exact owned create result found after the previous connection was lost', async () => {
    setCliEnv('dev');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-create-recovery-'));
    tempDirs.push(cwd);
    saveManifest(
      createResourceManifest({
        resourceName: 'demo',
        resourceTypeCode: 'RT005001',
        resourceTitle: 'Demo',
      }),
      cwd,
    );
    mocks.info.mockResolvedValue({
      data: {
        resourceId: 'resource-1',
        resourceName: 'alice/demo',
        resourceType: ['resource'],
        resourceTypeCode: 'RT005001',
        resourceTitle: 'Demo',
        userId: 101,
        username: 'alice',
      },
    });

    await expect(createResource({ store: projectStoreFromCwd(cwd) })).resolves.toMatchObject({
      resourceId: 'resource-1',
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(loadResourceProject(cwd).data.resourceId).toBe('resource-1');
  });

  it('does not treat a damaged local manifest as an empty collection workspace', async () => {
    setCliEnv('dev');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-damaged-'));
    tempDirs.push(cwd);
    fs.writeFileSync(path.join(cwd, 'freelog.manifest.json'), '{broken', 'utf8');

    await expect(createCollection({ cwd, title: 'Demo', typeCode: 'RT003005' })).rejects.toMatchObject({
      code: 4,
    });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not create a collection over an independent-resource manifest', async () => {
    setCliEnv('dev');
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-subject-'));
    tempDirs.push(cwd);
    saveManifest(
      createResourceManifest({
        resourceName: 'demo',
        resourceTypeCode: 'RT005001',
        resourceTitle: 'Demo',
      }),
      cwd,
    );

    await expect(createCollection({ cwd })).rejects.toMatchObject({ code: 4 });
    expect(mocks.info).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
