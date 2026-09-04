import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { setCliEnv } from '../src/core/env.js';

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return { ...actual, ensureSynced: vi.fn() };
});

vi.mock('../src/services/collection/owner.js', () => ({
  ensureCollectionSynced: vi.fn(),
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
import { ensureSynced } from '../src/services/sync/index.js';
import { ensureCollectionSynced } from '../src/services/collection/owner.js';
import { depAuthFromMap } from '../src/services/depAuthService.js';
import { projectStoreFromCwd } from '../src/services/store/projectStore.js';

const authorizedDependencyTree = [[{
    resourceId: 'dependency-1',
    resourceName: 'alice/dependency-1',
    resourceType: ['图片'],
    version: '1.0.0',
    contracts: [{ contractId: 'contract-1', policyId: 'free-policy' }],
    children: [],
  }]];

function writeProject(subject: 'resource' | 'collection'): string {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `dep-auth-${subject}-`));
  fs.writeFileSync(
    path.join(cwd, 'freelog.manifest.json'),
    JSON.stringify({
      schemaVersion: 1,
      subject,
      identity: { name: `tester/${subject}` },
      resource: { typeCode: 'RT005001', title: subject },
      version:
        subject === 'resource'
          ? {
              version: '1.0.0',
              filePath: 'dist',
              dependencies: [{ resourceId: 'dependency-1', versionRange: '*' }],
            }
          : null,
      collection:
        subject === 'collection'
          ? {
              version: '1.0.0',
              dependencies: [{ resourceId: 'dependency-1', versionRange: '*' }],
            }
          : null,
    }),
  );
  fs.writeFileSync(
    path.join(cwd, 'auth-map.yaml'),
    'contracts:\n  - resourceId: dependency-1\n    policyIds: [free-policy]\n',
  );
  return cwd;
}

describe('dep auth resource/collection routing', () => {
  beforeEach(() => {
    setCliEnv('dev');
    vi.mocked(ensureSynced).mockReset();
    vi.mocked(ensureCollectionSynced).mockReset();
    vi.mocked(FServiceAPI.Resource.info).mockReset();
    vi.mocked(FServiceAPI.Resource.authTree).mockReset();
    vi.mocked(FServiceAPI.Resource.batchSetContracts).mockReset();
    vi.mocked(FServiceAPI.Contract.batchContracts).mockReset();
    vi.mocked(FServiceAPI.Contract.batchCreateContracts).mockReset();
    vi.mocked(FServiceAPI.Resource.info).mockResolvedValue({
      latestVersion: '1.0.0',
      policies: [{ policyId: 'free-policy', policyText: 'for public: auth', status: 1 }],
    } as never);
    vi.mocked(FServiceAPI.Resource.authTree).mockResolvedValue([[]] as never);
    vi.mocked(FServiceAPI.Resource.batchSetContracts).mockResolvedValue({} as never);
    vi.mocked(FServiceAPI.Contract.batchCreateContracts).mockResolvedValue({} as never);
    vi.mocked(FServiceAPI.Contract.batchContracts).mockResolvedValue([
      { contractId: 'contract-1', status: 0, authStatus: 1 },
    ] as never);
  });

  it('uses the independent-resource sync gate and signs free policies directly', async () => {
    const cwd = writeProject('resource');
    vi.mocked(ensureSynced).mockResolvedValue({
      resource: { resourceId: 'resource-1' },
      info: { resourceId: 'resource-1', latestVersion: '1.0.0' },
      version: { version: '1.0.0', filePath: 'dist', dependencies: [] },
    } as never);
    vi.mocked(FServiceAPI.Resource.authTree)
      .mockResolvedValueOnce([[]] as never)
      .mockResolvedValueOnce(authorizedDependencyTree as never);

    await expect(depAuthFromMap({ store: projectStoreFromCwd(cwd), policyMap: 'auth-map.yaml' })).resolves.toMatchObject({
      ok: true,
      succeeded: [{ resourceId: 'dependency-1', policyId: 'free-policy' }],
    });
    expect(ensureSynced).toHaveBeenCalledOnce();
    expect(ensureCollectionSynced).not.toHaveBeenCalled();
    expect(FServiceAPI.Contract.batchCreateContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        licenseeId: 'resource-1',
        subjects: [expect.objectContaining({ subjectType: 1 })],
      }),
    );
    expect(FServiceAPI.Resource.batchSetContracts).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'resource-1',
        subjects: [expect.objectContaining({ subjectType: 1 })],
      }),
    );
  });

  it('uses the collection sync gate and signs on behalf of the collection resource', async () => {
    const cwd = writeProject('collection');
    vi.mocked(ensureCollectionSynced).mockResolvedValue({
      collection: {
        resourceId: 'collection-1',
        version: '1.0.0',
        dependencies: [{ resourceId: 'dependency-1', versionRange: '*' }],
      },
      info: { resourceId: 'collection-1', latestVersion: '1.0.0' },
    } as never);
    vi.mocked(FServiceAPI.Resource.authTree)
      .mockResolvedValueOnce([[]] as never)
      .mockResolvedValueOnce(authorizedDependencyTree as never);

    await expect(depAuthFromMap({ store: projectStoreFromCwd(cwd), policyMap: 'auth-map.yaml' })).resolves.toMatchObject({
      ok: true,
    });
    expect(ensureCollectionSynced).toHaveBeenCalledOnce();
    expect(ensureSynced).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.batchSetContracts).toHaveBeenCalledWith(
      expect.objectContaining({ resourceId: 'collection-1' }),
    );
  });

  it('hands paid collection policies off to the collection Console route', async () => {
    const cwd = writeProject('collection');
    vi.mocked(ensureCollectionSynced).mockResolvedValue({
      collection: {
        resourceId: 'collection-1',
        version: '1.0.0',
        dependencies: [{ resourceId: 'dependency-1', versionRange: '*' }],
      },
      info: { resourceId: 'collection-1', latestVersion: '1.0.0' },
    } as never);
    vi.mocked(FServiceAPI.Resource.info).mockResolvedValue({
      policies: [
        {
          policyId: 'free-policy',
          policyText: 'freelog.TransactionEvent("1") => auth',
          status: 1,
        },
      ],
    } as never);

    const error = await depAuthFromMap({ store: projectStoreFromCwd(cwd), policyMap: 'auth-map.yaml' }).catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(CliError);
    expect(error.details).toMatchObject({
      reason: 'DEPENDENCY_PAYMENT_REQUIRED',
      actionUrl:
        'https://console.devfreelog.com/resource/collectionSidebar/dependency/collection-1',
      contractsUrl:
        'https://console.devfreelog.com/resource/collectionSidebar/contract/collection-1',
    });
    expect(FServiceAPI.Resource.batchSetContracts).not.toHaveBeenCalled();
  });

  it('closes the browser handoff after an existing paid contract resolves the auth tree', async () => {
    const cwd = writeProject('collection');
    vi.mocked(ensureCollectionSynced).mockResolvedValue({
      collection: {
        resourceId: 'collection-1',
        version: '1.0.0',
        dependencies: [{ resourceId: 'dependency-1', versionRange: '*' }],
      },
      info: { resourceId: 'collection-1', latestVersion: '1.0.0' },
    } as never);
    vi.mocked(FServiceAPI.Resource.info).mockResolvedValue({
      policies: [
        {
          policyId: 'free-policy',
          policyText: 'freelog.TransactionEvent("1") => auth',
          status: 1,
        },
      ],
    } as never);
    vi.mocked(FServiceAPI.Resource.authTree).mockResolvedValue([
      [
        {
          resourceId: 'dependency-1',
          resourceName: 'alice/dependency-1',
          resourceType: ['图片'],
          version: '1.0.0',
          contracts: [{ contractId: 'contract-1', policyId: 'free-policy' }],
          children: [],
        },
      ],
    ] as never);
    vi.mocked(FServiceAPI.Contract.batchContracts).mockResolvedValue([
      { contractId: 'contract-1', status: 0, authStatus: 1 },
    ] as never);

    await expect(depAuthFromMap({ store: projectStoreFromCwd(cwd), policyMap: 'auth-map.yaml' })).resolves.toEqual({
      ok: true,
      succeeded: [],
      failed: [],
    });
    expect(FServiceAPI.Resource.info).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.batchSetContracts).not.toHaveBeenCalled();
    expect(FServiceAPI.Contract.batchContracts).toHaveBeenCalledWith({
      contractIds: 'contract-1',
      projection: 'authStatus,contractId,status',
    });
  });

  it('propagates the collection owner gate before policy lookup or signing', async () => {
    const cwd = writeProject('collection');
    vi.mocked(ensureCollectionSynced).mockRejectedValue(
      new CliError('owner mismatch', { code: 2 }),
    );

    await expect(depAuthFromMap({ store: projectStoreFromCwd(cwd), policyMap: 'auth-map.yaml' })).rejects.toMatchObject({
      code: 2,
    });
    expect(FServiceAPI.Resource.info).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.batchSetContracts).not.toHaveBeenCalled();
  });
});
