import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { bootstrapCliI18nSync, t, I18N_KEYS } from '../src/i18n/index.js';

bootstrapCliI18nSync(['node', 'vitest', '--lang', 'zh_CN']);

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureSynced: vi.fn(),
    fetchResourceInfo: vi.fn(),
  };
});

vi.mock('../src/services/collection/owner.js', () => ({
  ensureCollectionSynced: vi.fn(async () => {
    throw new Error('collection path should not be used');
  }),
}));

vi.mock('../src/config/project.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/config/project.js')>();
  return {
    ...actual,
    tryLoadCollectionProject: () => null,
    savePlatformResourceState: vi.fn(),
  };
});

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Resource: {
        ...actual.FServiceAPI.Resource,
        update: vi.fn(),
      },
    },
  };
});

import { ensureOwner, ensureSynced, fetchResourceInfo } from '../src/services/sync/index.js';
import { onlineResource } from '../src/services/onlineService.js';
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';

describe('onlineService policy hint', () => {
  beforeEach(() => {
    vi.mocked(ensureSynced).mockReset();
    vi.mocked(fetchResourceInfo).mockReset();
    vi.mocked(ensureSynced).mockResolvedValue({
      resource: { resourceId: 'resource-id' },
      info: { resourceId: 'resource-id' },
    } as never);
  });

  it('uses msg02 when policies exist but all disabled', async () => {
    vi.mocked(fetchResourceInfo).mockResolvedValue({
      resourceId: 'resource-id',
      status: 4,
      latestVersion: '1.0.0',
      policies: [{ policyId: 'p1', status: 0 }],
    } as never);

    await expect(onlineResource({ store: projectStoreFromCwd('/tmp/proj') })).rejects.toMatchObject({
      message: t(I18N_KEYS.msg_set_resource_avaliable_for_auth02),
    });
  });

  it('uses msg01 when no policies at all', async () => {
    vi.mocked(fetchResourceInfo).mockResolvedValue({
      resourceId: 'resource-id',
      status: 4,
      latestVersion: '1.0.0',
      policies: [],
    } as never);

    await expect(onlineResource({ store: projectStoreFromCwd('/tmp/proj') })).rejects.toMatchObject({
      message: t(I18N_KEYS.msg_set_resource_avaliable_for_auth01),
    });
  });

  it('uses msg_release_version_first when no latestVersion even with enabled policies', async () => {
    vi.mocked(fetchResourceInfo).mockResolvedValue({
      resourceId: 'resource-id',
      status: 4,
      latestVersion: undefined,
      policies: [{ policyId: 'p1', status: 1 }],
    } as never);

    await expect(onlineResource({ store: projectStoreFromCwd('/tmp/proj') })).rejects.toMatchObject({
      message: t(I18N_KEYS.msg_release_version_first),
    });
  });

  it('rejects frozen resources including composite freeze bit', async () => {
    vi.mocked(fetchResourceInfo).mockResolvedValue({
      resourceId: 'resource-id',
      status: 3,
      latestVersion: '1.0.0',
      policies: [{ policyId: 'p1', status: 1 }],
    } as never);

    await expect(onlineResource({ store: projectStoreFromCwd('/tmp/proj') })).rejects.toMatchObject({
      message: t(I18N_KEYS.cli_resource_frozen),
    });
  });
});

describe('offline confirm i18n', () => {
  it('confirm message key is bundled', () => {
    expect(t(I18N_KEYS.confirm_msg_remove_resource_from_auth)).toMatch(/下架|remove|offline/i);
  });
});

describe('clear-file confirm i18n', () => {
  it('uses createversion_remove_file_confirmation key', () => {
    expect(t(I18N_KEYS.createversion_remove_file_confirmation)).toMatch(/移除|remove|file/i);
  });
});
