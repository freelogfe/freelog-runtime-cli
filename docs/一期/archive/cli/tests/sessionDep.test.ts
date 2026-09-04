import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCliEnv } from '../src/core/env.js';
import { EphemeralStore } from '../src/services/store/ephemeralStore.js';
import { depAdd } from '../src/services/depService.js';
import { fetchSessionDeclaredAuthSubjects } from '../src/services/depSessionSources.js';
import { depAuthFromMap } from '../src/services/depAuthService.js';

vi.mock('../src/services/sync/operationContext.js', () => ({
  ensureOperationContext: vi.fn(async () => ({
    mode: 'session',
    resource: { resourceId: 'parent-1' },
    platform: { resourceId: 'parent-1', latestVersion: '1.0.0' },
  })),
}));

vi.mock('../src/services/depSessionSources.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/depSessionSources.js')>();
  return {
    ...actual,
    fetchSessionDeclaredAuthSubjects: vi.fn(),
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
        info: vi.fn(),
        authTree: vi.fn(),
        batchSetContracts: vi.fn(),
      },
      Contract: {
        ...actual.FServiceAPI.Contract,
        batchContracts: vi.fn(),
        batchCreateContracts: vi.fn(),
      },
    },
  };
});

import { FServiceAPI } from '../src/platform/index.js';

describe('session dep P3 (Console-aligned)', () => {
  beforeEach(() => {
    setCliEnv('dev');
    vi.mocked(fetchSessionDeclaredAuthSubjects).mockReset();
    vi.mocked(FServiceAPI.Resource.info).mockReset();
    vi.mocked(FServiceAPI.Resource.authTree).mockReset();
    vi.mocked(FServiceAPI.Resource.batchSetContracts).mockReset();
    vi.mocked(FServiceAPI.Contract.batchCreateContracts).mockReset();
  });

  it('depAdd writes dependencies into EphemeralStore (≅ versionCreator directDependencies)', async () => {
    const store = new EphemeralStore({ resourceId: 'parent-1' });
    store.saveVersion({ version: '2.0.0', filePath: '' });

    const deps = await depAdd({
      store,
      resourceId: 'dep-1',
      versionRange: '>=1.0.0',
      resourceName: 'alice/lib',
    });

    expect(deps).toEqual([
      { resourceId: 'dep-1', versionRange: '>=1.0.0', resourceName: 'alice/lib' },
    ]);
    expect(store.loadVersion()?.dependencies).toHaveLength(1);
  });

  it('dep auth --session reads declared deps from platform snapshot §22', async () => {
    vi.mocked(fetchSessionDeclaredAuthSubjects).mockResolvedValue({
      dependencies: [{ resourceId: 'dep-1', versionRange: '*' }],
      baseUpcastResources: [],
      authTreeVersion: '1.0.0',
    });
    vi.mocked(FServiceAPI.Resource.info).mockResolvedValue({
      latestVersion: '1.0.0',
      policies: [{ policyId: 'free-policy', policyText: 'for public: auth', status: 1 }],
    } as never);
    vi.mocked(FServiceAPI.Resource.authTree)
      .mockResolvedValueOnce([[]] as never)
      .mockResolvedValueOnce([
        [
          {
            resourceId: 'dep-1',
            resourceName: 'alice/dep-1',
            resourceType: ['图片'],
            version: '1.0.0',
            contracts: [{ contractId: 'c1', policyId: 'free-policy' }],
            children: [],
          },
        ],
      ] as never);
    vi.mocked(FServiceAPI.Contract.batchContracts).mockResolvedValue([
      { contractId: 'c1', status: 0, authStatus: 1 },
    ] as never);
    vi.mocked(FServiceAPI.Contract.batchCreateContracts).mockResolvedValue({} as never);
    vi.mocked(FServiceAPI.Resource.batchSetContracts).mockResolvedValue({} as never);

    const store = new EphemeralStore({ resourceId: 'parent-1' });
    const cwd = store.rootDir();
    const fs = await import('node:fs');
    const path = await import('node:path');
    fs.writeFileSync(
      path.join(cwd, 'auth-map.yaml'),
      'contracts:\n  - resourceId: dep-1\n    policyIds: [free-policy]\n',
    );

    await expect(
      depAuthFromMap({ store, policyMap: 'auth-map.yaml' }),
    ).resolves.toMatchObject({
      ok: true,
      succeeded: [{ resourceId: 'dep-1', policyId: 'free-policy' }],
    });

    expect(fetchSessionDeclaredAuthSubjects).toHaveBeenCalledWith({
      resourceId: 'parent-1',
      version: undefined,
    });
  });
});
