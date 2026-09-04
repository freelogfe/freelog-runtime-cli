import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consola } from 'consola';
import { bootstrapCliI18nSync, t, I18N_KEYS } from '../src/i18n/index.js';
import { createResourceManifest, saveManifest } from '../src/config/project/index.js';

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
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';
import { ensureOwner } from '../src/services/sync/index.js';

describe('createResource machine output boundary', () => {
  beforeEach(() => {
    vi.mocked(consola.info).mockClear();
  });

  it('does not print authid normalization hints from the service layer', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-service-'));
    try {
      saveManifest(
        createResourceManifest({
          resourceName: 'demo',
          resourceTypeCode: 'RT005001',
          resourceTitle: 'Demo',
        }),
        cwd,
      );
      await createResource({ store: projectStoreFromCwd(cwd), title: 'My Theme@', typeCode: 'RT005001' });
      expect(consola.info).not.toHaveBeenCalled();
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
      await expect(createResource({ store: projectStoreFromCwd(cwd), title: 'Photo', typeCode: '' })).rejects.toThrow(
        t(I18N_KEYS.naming_convention_resource_type_required),
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
