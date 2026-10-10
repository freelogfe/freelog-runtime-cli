import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { FServiceAPI } from '../src/platform/index.js';
import { searchResources } from '../src/services/resourceSearchService.js';

vi.mock('../src/core/auth.js', () => ({
  requireAuth: vi.fn(() => ({ userId: 100, username: 'alice' })),
}));

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Resource: {
        ...actual.FServiceAPI.Resource,
        info: vi.fn(),
        list: vi.fn(),
      },
    },
  };
});

describe('searchResources exact-query fallback contract', () => {
  beforeEach(() => {
    vi.mocked(FServiceAPI.Resource.info).mockReset();
    vi.mocked(FServiceAPI.Resource.list).mockReset();
  });

  it('returns an exact hit without running keyword search', async () => {
    vi.mocked(FServiceAPI.Resource.info).mockResolvedValue({
      ret: 0,
      data: { resourceId: 'exact-id', resourceName: 'alice/exact' },
    });

    await expect(searchResources({ query: 'alice/exact' })).resolves.toEqual([
      expect.objectContaining({ resourceId: 'exact-id', resourceName: 'alice/exact' }),
    ]);
    expect(FServiceAPI.Resource.list).not.toHaveBeenCalled();
  });

  it('falls back to keyword search only after an explicit HTTP 404', async () => {
    const notFound = Object.assign(new Error('request failed'), {
      response: { status: 404 },
    });
    vi.mocked(FServiceAPI.Resource.info).mockRejectedValue(notFound);
    vi.mocked(FServiceAPI.Resource.list).mockResolvedValue({
      ret: 0,
      data: [{ resourceId: 'r1', resourceName: 'alice/demo' }],
    });

    await expect(searchResources({ query: 'demo' })).resolves.toEqual([
      expect.objectContaining({ resourceId: 'r1', resourceName: 'alice/demo' }),
    ]);
    expect(FServiceAPI.Resource.list).toHaveBeenCalledOnce();
  });

  it.each([
    ['authentication', new CliError('login required', { code: 2 })],
    ['network', new Error('ECONNRESET')],
    ['rate limit', Object.assign(new Error('too many requests'), { response: { status: 429 } })],
  ])('propagates %s failures without running keyword search', async (_label, error) => {
    vi.mocked(FServiceAPI.Resource.info).mockRejectedValue(error);

    await expect(searchResources({ query: 'demo' })).rejects.toBe(error);
    expect(FServiceAPI.Resource.list).not.toHaveBeenCalled();
  });

  it('rejects a successful but malformed exact-query response', async () => {
    vi.mocked(FServiceAPI.Resource.info).mockResolvedValue({ ret: 0, data: {} });

    await expect(searchResources({ query: 'demo' })).rejects.toMatchObject({ code: 1 });
    expect(FServiceAPI.Resource.list).not.toHaveBeenCalled();
  });
});
