import { beforeEach, describe, expect, it, vi } from 'vitest';
import { editReleasedVersion } from '../src/services/versionEditService.js';

const resourceMocks = vi.hoisted(() => ({
  updateResourceVersionInfo: vi.fn(),
  resourceVersionInfo1: vi.fn(),
  info: vi.fn(),
  getVersionListByResourceID: vi.fn(),
  authTree: vi.fn(),
}));

vi.mock('../src/platform/index.js', () => ({
  FServiceAPI: {
    Resource: {
      updateResourceVersionInfo: resourceMocks.updateResourceVersionInfo,
      resourceVersionInfo1: resourceMocks.resourceVersionInfo1,
      info: resourceMocks.info,
      getVersionListByResourceID: resourceMocks.getVersionListByResourceID,
      authTree: resourceMocks.authTree,
    },
  },
  unwrapData: (value: unknown) => (value as { data?: unknown }).data ?? value,
}));

vi.mock('../src/services/sync/index.js', () => ({
  ensureSynced: vi.fn(async () => ({
    resource: { resourceId: 'res-1', resourceName: 'user/demo' },
    info: { latestVersion: '1.0.0' },
    version: {},
  })),
}));

vi.mock('../src/config/project.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/project.js')>();
  return {
    ...actual,
    loadVersionProject: vi.fn(() => ({
      data: {
        version: '1.0.0',
        filePath: 'file.zip',
        description: 'local',
        inputAttrs: [{ key: 'author', value: 'cli' }],
        customPropertyDescriptors: [
          { type: 'readonlyText', key: 'copyright', defaultValue: '2026' },
        ],
      },
    })),
    saveVersionProject: vi.fn(),
  };
});

vi.mock('../src/services/coverUpload.js', () => ({
  resolveCoverImageUrl: vi.fn(async (value: string) => `https://cdn.example/${value}`),
}));

describe('editReleasedVersion', () => {
  beforeEach(() => {
    resourceMocks.updateResourceVersionInfo.mockReset();
    resourceMocks.resourceVersionInfo1.mockReset();
    resourceMocks.updateResourceVersionInfo.mockResolvedValue({ data: { ok: true } });
    resourceMocks.resourceVersionInfo1.mockResolvedValue({
      data: {
        systemPropertyDescriptors: [
          { key: 'author', insertMode: 2, valueDisplay: 'platform-author' },
          { key: 'license', insertMode: 2, valueDisplay: 'MIT' },
        ],
        customPropertyDescriptors: [
          {
            type: 'readonlyText',
            key: 'copyright',
            name: 'Copyright',
            defaultValue: '2025',
          },
        ],
      },
    });
  });

  it('syncs merged platform+manifest properties like Console syncAllProperties', async () => {
    await editReleasedVersion({
      version: '1.0.0',
      syncProperties: true,
    });

    expect(resourceMocks.resourceVersionInfo1).toHaveBeenCalledWith({
      resourceId: 'res-1',
      version: '1.0.0',
    });
    expect(resourceMocks.updateResourceVersionInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'res-1',
        version: '1.0.0',
        inputAttrs: [
          { key: 'author', value: 'cli' },
          { key: 'license', value: 'MIT' },
        ],
        customPropertyDescriptors: [
          expect.objectContaining({ key: 'copyright', defaultValue: '2026' }),
        ],
      }),
    );
  });

  it('updates videoCover after local upload resolution', async () => {
    await editReleasedVersion({
      version: '1.0.0',
      videoCover: 'cover.png',
    });

    expect(resourceMocks.updateResourceVersionInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        videoCover: 'https://cdn.example/cover.png',
      }),
    );
  });
});
