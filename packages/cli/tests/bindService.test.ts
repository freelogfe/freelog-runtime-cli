import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCliEnv } from '../src/core/env.js';

const mocks = vi.hoisted(() => ({
  fetchResourceInfo: vi.fn(),
  pullResourceToLocal: vi.fn(),
  pullCollection: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({
    token: 't',
    userId: 101,
    username: 'alice',
    environment: 'test',
  }),
}));

vi.mock('../src/services/syncService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/syncService.js')>();
  return {
    ...actual,
    fetchResourceInfo: mocks.fetchResourceInfo,
    pullResourceToLocal: mocks.pullResourceToLocal,
    ownersMatch: actual.ownersMatch,
  };
});

vi.mock('../src/services/collectionService.js', () => ({
  pullCollection: mocks.pullCollection,
}));

import { bindProject } from '../src/services/bindService.js';
import { loadState, writeResourceProject, writeVersionProject } from '../src/config/project.js';

describe('bindProject', () => {
  let cwd: string;

  beforeEach(() => {
    setCliEnv('test');
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-bind-'));
    writeResourceProject(
      {
        resourceName: 'my-theme',
        resourceTypeCode: 'theme-code',
        resourceTitle: 'My Theme',
      },
      cwd,
    );
    writeVersionProject(
      {
        resourceName: 'my-theme',
        resourceTypeCode: 'theme-code',
        version: '1.0.0',
        filePath: 'dist',
      },
      cwd,
    );
    mocks.fetchResourceInfo.mockReset();
    mocks.pullResourceToLocal.mockReset();
    mocks.pullCollection.mockReset();
  });

  it('binds resourceId and pulls platform facts', async () => {
    mocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'rid-1',
      resourceName: 'alice/my-theme',
      userId: 101,
      username: 'alice',
      latestVersion: '1.0.0',
    });
    mocks.pullResourceToLocal.mockResolvedValue({
      resource: { resourceId: 'rid-1' },
      info: { latestVersion: '1.0.0' },
    });

    const result = await bindProject({ cwd, target: 'rid-1' });

    expect(result.resourceId).toBe('rid-1');
    expect(loadState(cwd).data.resource.resourceId).toBe('rid-1');
    expect(mocks.pullResourceToLocal).toHaveBeenCalled();
  });

  it('rejects owner mismatch', async () => {
    mocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'rid-2',
      userId: 999,
      username: 'bob',
    });

    await expect(bindProject({ cwd, target: 'rid-2' })).rejects.toMatchObject({ code: 2 });
  });
});
