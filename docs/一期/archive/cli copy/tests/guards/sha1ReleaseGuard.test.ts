import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bootstrapCliI18nSync } from '../../src/i18n/index.js';
import { FServiceAPI } from '../../src/platform/index.js';
import { assertSha1PublishAllowed } from '../../src/services/shared/guards/index.js';

vi.mock('../../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 100, username: 'me' }),
}));

vi.mock('../../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/index.js')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Resource: {
        ...actual.FServiceAPI.Resource,
        getResourceBySha1: vi.fn(),
      },
    },
  };
});

describe('assertSha1PublishAllowed', () => {
  beforeEach(() => {
    bootstrapCliI18nSync('zh_CN');
    vi.mocked(FServiceAPI.Resource.getResourceBySha1).mockReset();
  });

  it('allows when platform has no binding', async () => {
    vi.mocked(FServiceAPI.Resource.getResourceBySha1).mockRejectedValue(new Error('404'));
    await expect(assertSha1PublishAllowed('abc')).resolves.toBeUndefined();
  });

  it('blocks same owner reuse', async () => {
    vi.mocked(FServiceAPI.Resource.getResourceBySha1).mockResolvedValue({
      ret: 0,
      data: { resourceId: 'r1', userId: 100 },
    });
    await expect(assertSha1PublishAllowed('abc')).rejects.toMatchObject({ code: 4 });
  });
});
