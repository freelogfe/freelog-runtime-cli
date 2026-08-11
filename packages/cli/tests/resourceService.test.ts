import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consola } from 'consola';
import { bootstrapCliI18nSync, t, I18N_KEYS } from '../src/i18n/index.js';

bootstrapCliI18nSync(['node', 'vitest', '--lang', 'zh_CN']);

vi.mock('consola', () => ({
  consola: { info: vi.fn(), success: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 50427, username: 'freelog-test11' }),
}));

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureOwner: vi.fn(async () => ({
      resource: {
        resourceId: '',
        resourceName: '',
        resourceTypeCode: 'RT005001',
      },
    })),
  };
});

vi.mock('../src/services/typeService.js', () => ({
  assertResourceTypeCode: vi.fn(async (code: string) => ({ resourceTypeCode: code })),
  assertLeafResourceTypeCode: vi.fn(async () => undefined),
}));

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Resource: {
        ...actual.FServiceAPI.Resource,
        info: vi.fn(async () => null),
        create: vi.fn(async () => ({
          data: {
            resourceId: 'new-resource-id',
            resourceName: 'freelog-test11/my_theme_',
            resourceType: ['photo'],
            resourceTypeCode: 'RT005001',
            resourceTitle: 'My Theme@',
          },
          ret: 0,
          errCode: 0,
        })),
      },
    },
    unwrapData: <T>(env: { data?: T } | T): T | null =>
      env && typeof env === 'object' && 'data' in env ? ((env.data ?? null) as T | null) : (env as T),
  };
});

import { createResource } from '../src/services/resourceService.js';
import { ensureOwner } from '../src/services/sync/index.js';

describe('createResource authid info', () => {
  beforeEach(() => {
    vi.mocked(consola.info).mockClear();
  });

  it('prints input_resourceauthid_automodified_msg when name derived from title', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-service-'));
    try {
      await createResource({ cwd, title: 'My Theme@', typeCode: 'RT005001' });
      expect(consola.info).toHaveBeenCalledWith(
        t(I18N_KEYS.input_resourceauthid_automodified_msg, { authid: 'My_Theme_' }),
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});

describe('createResource type required', () => {
  it('rejects missing typeCode', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-service-'));
    vi.mocked(ensureOwner).mockResolvedValueOnce({
      resource: {
        resourceId: '',
        resourceName: '',
        resourceTypeCode: '',
      },
    } as never);
    try {
      await expect(createResource({ cwd, title: 'Photo', typeCode: '' })).rejects.toThrow(
        t(I18N_KEYS.naming_convention_resource_type_required),
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
