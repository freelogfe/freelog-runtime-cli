import { beforeEach, describe, expect, it, vi } from 'vitest';

const platformMocks = vi.hoisted(() => ({
  fetchResourceInfo: vi.fn(),
}));

vi.mock('../src/services/shared/platform/index.js', () => ({
  fetchResourceInfo: platformMocks.fetchResourceInfo,
}));

import { assertChildCollectionReady } from '../src/services/collection/internal.js';

describe('collection child readiness', () => {
  beforeEach(() => {
    platformMocks.fetchResourceInfo.mockReset();
    platformMocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'child-1',
      latestVersion: '1.0.0',
      status: 0,
      policies: [{ policyId: 'policy-1', status: 1 }],
    });
  });

  it('rejects an existing resource that is not online, matching Console selection rules', async () => {
    await expect(assertChildCollectionReady('child-1')).rejects.toMatchObject({ code: 4 });
  });

  it('allows an imported child to pass publish gates before the CLI puts it online', async () => {
    await expect(
      assertChildCollectionReady('child-1', '/tmp/child-1', { requireOnline: false }),
    ).resolves.toBeUndefined();
  });
});
