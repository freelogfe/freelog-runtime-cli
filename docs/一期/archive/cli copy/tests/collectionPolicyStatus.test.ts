import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({
    token: 'test-token',
    userId: 101,
    username: 'alice',
    environment: 'test',
  }),
}));

vi.mock('../src/platform/index.js', () => ({
  FServiceAPI: { Resource: { info: mocks.info, update: mocks.update } },
  unwrapData: <T>(value: { data?: T } | T) =>
    value && typeof value === 'object' && 'data' in value ? value.data : value,
}));

import { writeCollectionProject } from '../src/config/project.js';
import { collectionPolicySetStatus } from '../src/services/collection/policy.js';

describe('collection policy status', () => {
  beforeEach(() => {
    mocks.info.mockReset();
    mocks.update.mockReset();
    mocks.info.mockResolvedValue({
      data: {
        resourceId: 'collection-1',
        resourceName: 'alice/series',
        userId: 101,
        username: 'alice',
        resourceTitle: 'Series',
        resourceType: ['novel'],
        resourceTypeCode: 'novel',
        tags: [],
        coverImages: [],
      },
    });
  });

  it('sets a collection policy status through Resource.updatePolicies', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-policy-'));
    writeCollectionProject(
      {
        resourceId: 'collection-1',
        resourceName: 'alice/series',
        resourceTitle: 'Series',
        resourceType: ['novel'],
        resourceTypeCode: 'novel',
        tags: [],
        coverImages: [],
        version: '1.0.0',
      },
      cwd,
    );

    await collectionPolicySetStatus({ cwd, policyId: 'policy-1', status: 0 });

    expect(mocks.update).toHaveBeenCalledWith({
      resourceId: 'collection-1',
      updatePolicies: [{ policyId: 'policy-1', status: 0 }],
    });
  });

  it('rejects disabling the last enabled policy while a collection is online', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-policy-gate-'));
    writeCollectionProject(
      {
        resourceId: 'collection-1',
        resourceName: 'alice/series',
        resourceTitle: 'Series',
        resourceType: ['novel'],
        resourceTypeCode: 'novel',
        tags: [],
        coverImages: [],
        version: '1.0.0',
      },
      cwd,
    );
    mocks.info.mockResolvedValue({
      data: {
        resourceId: 'collection-1',
        resourceName: 'alice/series',
        userId: 101,
        username: 'alice',
        resourceTitle: 'Series',
        resourceType: ['novel'],
        resourceTypeCode: 'novel',
        tags: [],
        coverImages: [],
        status: 1,
        policies: [{ policyId: 'policy-1', policyName: 'free', status: 1 }],
      },
    });

    await expect(collectionPolicySetStatus({ cwd, policyId: 'policy-1', status: 0 })).rejects.toThrow(
      '已上架资源不能停用最后一条启用策略',
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
