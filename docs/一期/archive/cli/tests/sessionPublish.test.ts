import { describe, expect, it, vi } from 'vitest';
import { EphemeralStore } from '../src/services/store/ephemeralStore.js';
import { createThenPublish } from '../src/services/resource/createThenPublish.js';
import { applySessionPublishIntent } from '../src/services/resource/sessionPublishIntent.js';

vi.mock('../src/services/resourceService.js', () => ({
  createResource: vi.fn(async () => ({
    resourceId: 'res-new',
    resourceName: 'alice/demo',
    resourceTypeCode: 'RT005001',
  })),
}));

vi.mock('../src/services/resource/publishVersion.js', () => ({
  computeBumpedVersion: vi.fn(() => '1.0.0'),
  publishVersion: vi.fn(async () => ({
    resourceId: 'res-new',
    version: '1.0.0',
    fileSha1: 'a'.repeat(40),
    filename: 'demo.zip',
    stages: {},
  })),
}));

vi.mock('../src/services/sync/operationContext.js', () => ({
  ensureOperationContext: vi.fn(async () => ({
    mode: 'session',
    resource: { resourceId: 'res-existing', resourceName: 'alice/demo' },
    platform: { resourceId: 'res-existing', latestVersion: '1.0.0' },
  })),
}));

vi.mock('../src/services/sync/fetch.js', () => ({
  fetchResourceInfo: vi.fn(async () => ({
    resourceId: 'res-existing',
    baseUpcastResources: [],
  })),
}));

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

describe('session publish orchestration P2', () => {
  it('createThenPublish seeds version and delegates to publishVersion', async () => {
    const { createResource } = await import('../src/services/resourceService.js');
    const { publishVersion } = await import('../src/services/resource/publishVersion.js');
    const store = new EphemeralStore();

    const result = await createThenPublish({
      store,
      title: 'Demo',
      typeCode: 'RT005001',
      file: 'dist.zip',
      version: '1.0.0',
    });

    expect(createResource).toHaveBeenCalled();
    expect(publishVersion).toHaveBeenCalled();
    expect(store.loadVersion()?.filePath).toBe('dist.zip');
    expect(result.version).toBe('1.0.0');
  });

  it('applySessionPublishIntent sets reuse platform file fields', async () => {
    const store = new EphemeralStore({ resourceId: 'res-existing' });
    const version = await applySessionPublishIntent({
      store,
      reuseVersion: '1.0.0',
      version: '1.0.1',
    });

    expect(version.reusePlatformFile).toBe(true);
    expect(version.fileSha1).toBe('b'.repeat(40));
    expect(version.filePath).toBe('');
    expect(version.dependencies).toHaveLength(1);
  });

  it('applySessionPublishIntent rejects reuse + file together', async () => {
    const store = new EphemeralStore({ resourceId: 'res-existing' });
    await expect(
      applySessionPublishIntent({
        store,
        reuseVersion: '1.0.0',
        file: 'x.zip',
        version: '1.0.1',
      }),
    ).rejects.toThrow(/reuse|file|互斥/i);
  });
});
