import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  info: vi.fn(),
  createVersion: vi.fn(),
}));

vi.mock('../src/platform/index.js', () => ({
  unwrapData: (value: { data?: unknown } | unknown) =>
    value && typeof value === 'object' && 'data' in value ? value.data : value,
  FServiceAPI: { Resource: {
    getVersionListByResourceID: mocks.list,
    resourceVersionInfo1: mocks.info,
    createVersion: mocks.createVersion,
  } },
}));

import { ensureVersionAfterCreateBatch } from '../src/services/batch/prepare.js';
import { buildCreateVersionParams } from '../src/services/resource/createVersionParams.js';
import type { PreparedFile } from '../src/services/batch/types.js';

const item: PreparedFile = {
  absolutePath: 'C:/tmp/demo.bin',
  filename: 'demo.bin',
  sha1: 'a'.repeat(40),
  name: 'demo',
  resourceTitle: 'Demo',
  resourceTypeCode: 'RT005001',
  safeDir: 'demo',
  version: '1.0.0',
  description: 'release description',
  dependencies: [],
  baseUpcastResources: [],
  authExcludedItems: [],
  inputAttrs: [],
  customPropertyDescriptors: [],
};

beforeEach(() => vi.clearAllMocks());

describe('batch version recovery', () => {
  it('omits batchSignContracts whenever authExcludedItems are present', () => {
    const payload = buildCreateVersionParams({
      resourceId: 'resource-1',
      versionCfg: {
        version: item.version,
        filePath: item.absolutePath,
        description: item.description,
        authExcludedItems: [
          { resourceId: 'dep-1', excludedType: 'policyId', excludedValue: 'policy-1' },
        ],
        batchSignContracts: [{ resourceId: 'dep-1', policyIds: ['policy-1'] }],
      },
      fileSha1: item.sha1,
      filename: item.filename,
    });
    expect(payload.authExcludedItems).toHaveLength(1);
    expect(payload.batchSignContracts).toBeUndefined();
  });

  it('requires full immutable intent match before reusing an existing version', async () => {
    mocks.list.mockResolvedValue({ data: [{ version: item.version, versionId: 'version-1' }] });
    mocks.info.mockResolvedValue({
      data: {
        version: item.version,
        versionId: 'version-1',
        fileSha1: item.sha1,
        filename: item.filename,
        description: item.description,
        dependencies: [],
        baseUpcastResources: [],
        authExcludedItems: [],
        inputAttrs: [],
        customPropertyDescriptors: [],
      },
    });

    await expect(ensureVersionAfterCreateBatch(item, 'resource-1')).resolves.toEqual({
      versionId: 'version-1',
    });
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });

  it('stops instead of binding same version with different immutable metadata', async () => {
    mocks.list.mockResolvedValue({ data: [{ version: item.version, versionId: 'version-1' }] });
    mocks.info.mockResolvedValue({
      data: {
        version: item.version,
        versionId: 'version-1',
        fileSha1: item.sha1,
        filename: item.filename,
        description: 'different Console description',
      },
    });

    await expect(ensureVersionAfterCreateBatch(item, 'resource-1')).rejects.toMatchObject({
      details: { error: 'BATCH_VERSION_INTENT_CONFLICT' },
    });
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });

  it('accepts an auth-excluded existing version when the remote omits batch contracts', async () => {
    const excludedItem: PreparedFile = {
      ...item,
      authExcludedItems: [
        { resourceId: 'dep-1', excludedType: 'policyId', excludedValue: 'policy-1' },
      ],
      batchSignContracts: [{ resourceId: 'dep-1', policyIds: ['policy-1'] }],
    };
    mocks.list.mockResolvedValue({ data: [{ version: item.version, versionId: 'version-1' }] });
    mocks.info.mockResolvedValue({
      data: {
        version: item.version,
        versionId: 'version-1',
        fileSha1: item.sha1,
        filename: item.filename,
        description: item.description,
        authExcludedItems: excludedItem.authExcludedItems,
        inputAttrs: [],
        customPropertyDescriptors: [],
      },
    });

    await expect(ensureVersionAfterCreateBatch(excludedItem, 'resource-1')).resolves.toEqual({
      versionId: 'version-1',
    });
  });
});
