import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EphemeralStore } from '../src/services/store/ephemeralStore.js';
import { ensureOperationContext } from '../src/services/sync/operationContext.js';

const ownerMocks = vi.hoisted(() => ({
  ensureOwner: vi.fn(),
}));

const fetchMocks = vi.hoisted(() => ({
  fetchResourceInfo: vi.fn(),
}));

vi.mock('../src/services/sync/owner.js', () => ({
  ensureOwner: ownerMocks.ensureOwner,
}));

vi.mock('../src/services/sync/fetch.js', () => ({
  fetchResourceInfo: fetchMocks.fetchResourceInfo,
  fetchVersionDraft: vi.fn(),
}));

describe('ensureOperationContext P1', () => {
  beforeEach(() => {
    ownerMocks.ensureOwner.mockReset();
    fetchMocks.fetchResourceInfo.mockReset();
  });

  it('session store refreshes platform facts without listing drift pull', async () => {
    const store = new EphemeralStore({
      resourceId: 'res-session',
      seed: {
        version: { version: '1.0.0', filePath: 'dist' },
      },
    });

    ownerMocks.ensureOwner.mockResolvedValue({
      auth: { userId: 1, username: 'alice' },
      resource: { resourceId: 'res-session', resourceName: 'alice/demo', resourceType: ['主题'] },
      info: { resourceId: 'res-session', resourceName: 'alice/demo', latestVersion: '1.0.0' },
      version: { version: '1.0.0', filePath: 'dist' },
    });

    fetchMocks.fetchResourceInfo.mockResolvedValue({
      resourceId: 'res-session',
      resourceName: 'alice/demo',
      resourceType: ['主题'],
      resourceTypeCode: 'RT005001',
      latestVersion: '1.0.0',
      userId: 1,
      username: 'alice',
    });

    const ctx = await ensureOperationContext({ store });

    expect(ctx.mode).toBe('session');
    expect(fetchMocks.fetchResourceInfo).toHaveBeenCalledWith('res-session');
    expect(ctx.platform.resourceTypeCode).toBe('RT005001');
    expect(ctx.resource.resourceTypeCode).toBe('RT005001');
    expect(store.loadResource().resourceTypeCode).toBe('RT005001');
  });
});
