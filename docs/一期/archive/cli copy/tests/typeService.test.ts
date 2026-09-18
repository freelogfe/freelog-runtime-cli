import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FServiceAPI } from '../src/platform/index.js';
import { assertLeafResourceTypeCode } from '../src/services/typeService.js';

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Resource: {
        ...actual.FServiceAPI.Resource,
        getResourceTypeInfoByCode: vi.fn(),
        resourceTypes: vi.fn(),
      },
    },
  };
});

describe('assertLeafResourceTypeCode fail-closed contract', () => {
  beforeEach(() => {
    vi.mocked(FServiceAPI.Resource.getResourceTypeInfoByCode).mockReset();
    vi.mocked(FServiceAPI.Resource.resourceTypes).mockReset();
    vi.mocked(FServiceAPI.Resource.getResourceTypeInfoByCode).mockResolvedValue({
      ret: 0,
      data: { code: 'parent-code', name: 'Parent', category: 1 },
    });
  });

  it('propagates a complete type-tree read failure instead of accepting an unverified type', async () => {
    const networkError = new Error('ECONNRESET');
    vi.mocked(FServiceAPI.Resource.resourceTypes).mockRejectedValue(networkError);

    await expect(assertLeafResourceTypeCode('parent-code')).rejects.toBe(networkError);
  });

  it('rejects an empty type-tree response because leaf status cannot be verified', async () => {
    vi.mocked(FServiceAPI.Resource.resourceTypes).mockResolvedValue({ ret: 0, data: [] });

    await expect(assertLeafResourceTypeCode('parent-code')).rejects.toMatchObject({ code: 4 });
  });

  it('still rejects a non-leaf type discovered in a valid complete tree', async () => {
    vi.mocked(FServiceAPI.Resource.resourceTypes).mockResolvedValue({
      ret: 0,
      data: [
        {
          code: 'parent-code',
          name: 'Parent',
          children: [{ code: 'leaf-code', name: 'Leaf' }],
        },
      ],
    });

    await expect(assertLeafResourceTypeCode('parent-code')).rejects.toMatchObject({ code: 4 });
  });

  it('preserves the normal path for a verified leaf type', async () => {
    vi.mocked(FServiceAPI.Resource.getResourceTypeInfoByCode).mockResolvedValue({
      ret: 0,
      data: { code: 'leaf-code', name: 'Leaf', category: 1 },
    });
    vi.mocked(FServiceAPI.Resource.resourceTypes).mockResolvedValue({
      ret: 0,
      data: [{ code: 'leaf-code', name: 'Leaf' }],
    });

    await expect(assertLeafResourceTypeCode('leaf-code')).resolves.toMatchObject({
      code: 'leaf-code',
    });
  });
});
