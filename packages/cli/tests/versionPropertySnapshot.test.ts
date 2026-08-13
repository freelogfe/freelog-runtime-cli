import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchReleasedVersionSnapshot } from '../src/services/versionPropertyService.js';

const resourceMocks = vi.hoisted(() => ({
  resourceVersionInfo1: vi.fn(),
  getResourceTypeInfoByCode: vi.fn(),
}));

vi.mock('../src/platform/index.js', () => ({
  FServiceAPI: {
    Resource: {
      resourceVersionInfo1: resourceMocks.resourceVersionInfo1,
      getResourceTypeInfoByCode: resourceMocks.getResourceTypeInfoByCode,
    },
  },
  unwrapData: (value: unknown) => (value as { data?: unknown }).data ?? value,
}));

describe('fetchReleasedVersionSnapshot', () => {
  beforeEach(() => {
    resourceMocks.resourceVersionInfo1.mockReset();
    resourceMocks.getResourceTypeInfoByCode.mockReset();
    resourceMocks.getResourceTypeInfoByCode.mockResolvedValue({
      data: { resourceConfig: { supportOptionalConfig: 2 } },
    });
  });

  it('maps resourceVersionInfo1 fields for V-06 reuse', async () => {
    resourceMocks.resourceVersionInfo1.mockResolvedValue({
      data: {
        fileSha1: 'abc123',
        filename: 'demo-1.0.0.zip',
        description: 'from platform',
        dependencies: [
          { resourceId: 'dep-1', resourceName: 'user/lib', versionRange: '>=1.0.0' },
        ],
        systemPropertyDescriptors: [{ key: 'author', insertMode: 2, valueDisplay: 'cli' }],
        customPropertyDescriptors: [
          { type: 'readonlyText', key: 'copyright', name: 'Copyright', defaultValue: '2026' },
        ],
      },
    });

    const snapshot = await fetchReleasedVersionSnapshot({
      resourceId: 'res-1',
      version: '1.0.0',
    });

    expect(snapshot.fileSha1).toBe('abc123');
    expect(snapshot.filename).toBe('demo-1.0.0.zip');
    expect(snapshot.description).toBe('from platform');
    expect(snapshot.dependencies).toEqual([
      { resourceId: 'dep-1', resourceName: 'user/lib', versionRange: '>=1.0.0' },
    ]);
    expect(snapshot.inputAttrs).toEqual([{ key: 'author', value: 'cli' }]);
    expect(snapshot.customPropertyDescriptors?.[0]?.key).toBe('copyright');
  });

  it('prefers insertMode filtering when systemPropertyDescriptors exist alongside inputAttrs', async () => {
    resourceMocks.resourceVersionInfo1.mockResolvedValue({
      data: {
        fileSha1: 'abc123',
        filename: 'demo-1.0.0.zip',
        dependencies: [],
        inputAttrs: [{ key: 'legacy', value: 'skip' }],
        systemPropertyDescriptors: [
          { key: 'author', insertMode: 2, valueDisplay: 'cli' },
          { key: 'internal', insertMode: 1, valueDisplay: 'hidden' },
        ],
        customPropertyDescriptors: [],
      },
    });

    const snapshot = await fetchReleasedVersionSnapshot({
      resourceId: 'res-1',
      version: '1.0.0',
    });

    expect(snapshot.inputAttrs).toEqual([{ key: 'author', value: 'cli' }]);
  });

  it('drops editable custom properties when supportOptionalConfig is not 2', async () => {
    resourceMocks.getResourceTypeInfoByCode.mockResolvedValue({
      data: { resourceConfig: { supportOptionalConfig: 1 } },
    });
    resourceMocks.resourceVersionInfo1.mockResolvedValue({
      data: {
        fileSha1: 'abc123',
        filename: 'demo-1.0.0.zip',
        dependencies: [],
        customPropertyDescriptors: [
          { type: 'readonlyText', key: 'copyright', name: 'Copyright', defaultValue: '2026' },
          { type: 'text', key: 'editable', name: 'Editable', defaultValue: 'x' },
        ],
      },
    });

    const snapshot = await fetchReleasedVersionSnapshot({
      resourceId: 'res-1',
      version: '1.0.0',
      resourceTypeCode: 'RT005001',
    });

    expect(snapshot.customPropertyDescriptors).toHaveLength(1);
    expect(snapshot.customPropertyDescriptors?.[0]?.key).toBe('copyright');
  });
});
