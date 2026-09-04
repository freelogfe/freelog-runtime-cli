import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCliEnv } from '../src/core/env.js';

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 1, username: 'tester' }),
}));

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureSynced: vi.fn(async () => ({
      resource: {
        resourceId: 'res-existing',
        resourceName: 'alice/demo',
        resourceTypeCode: 'RT005001',
      },
      info: { latestVersion: '1.0.0' },
    })),
  };
});

vi.mock('../src/services/versionPropertyService.js', () => ({
  fetchReleasedVersionSnapshot: vi.fn(async () => ({
    fileSha1: 'b'.repeat(40),
    filename: 'demo-1.0.0.zip',
    description: 'from platform',
    dependencies: [{ resourceId: 'dep-1' }],
    inputAttrs: [],
    customPropertyDescriptors: [],
  })),
}));

vi.mock('../src/services/sync/fetch.js', () => ({
  fetchResourceInfo: vi.fn(async () => ({
    resourceId: 'res-existing',
    baseUpcastResources: [],
  })),
}));

vi.mock('../src/services/resource/publishVersion.js', () => ({
  computeBumpedVersion: vi.fn(() => '1.0.1'),
  publishVersion: vi.fn(async () => ({
    resourceId: 'res-existing',
    version: '1.0.1',
    fileSha1: 'b'.repeat(40),
    filename: 'demo-1.0.0.zip',
    stages: {},
  })),
}));

import { applyReuseVersionIntent } from '../src/services/resource/reuseVersionIntent.js';
import { publishVersion } from '../src/services/resource/publishVersion.js';
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';

describe('engineering publish --reuse-version', () => {
  let cwd: string;

  beforeEach(() => {
    setCliEnv('dev');
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-reuse-'));
    fs.writeFileSync(
      path.join(cwd, 'freelog.manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        subject: 'resource',
        identity: { name: 'u/reuse-test' },
        resource: { typeCode: 'RT005001', title: 'Reuse Test' },
        version: {
          version: '1.0.1',
          filePath: '',
          description: '',
          dependencies: [],
          baseUpcastResources: [],
          authExcludedItems: [],
          inputAttrs: [],
          customPropertyDescriptors: [],
        },
        policies: [],
        collection: null,
      }),
      'utf8',
    );
    fs.mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.freelog', 'state.json'),
      JSON.stringify({ schemaVersion: 1, env: 'dev', resource: { resourceId: 'res-existing' } }),
      'utf8',
    );
    vi.mocked(publishVersion).mockClear();
  });

  it('applyReuseVersionIntent seeds reusePlatformFile for publishVersion', async () => {
    const store = projectStoreFromCwd(cwd);
    const version = await applyReuseVersionIntent({
      store,
      resourceId: 'res-existing',
      resourceName: 'alice/demo',
      resourceTypeCode: 'RT005001',
      reuseVersion: '1.0.0',
      targetVersion: '1.0.1',
    });

    expect(version.reusePlatformFile).toBe(true);
    expect(version.filePath).toBe('');
    expect(version.fileSha1).toBe('b'.repeat(40));

    await publishVersion({ store });
    expect(publishVersion).toHaveBeenCalledWith(expect.objectContaining({ store }));
  });
});
