import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authTree: vi.fn(),
  batchContracts: vi.fn(),
  contracts: vi.fn(),
}));

vi.mock('../src/platform/index.js', () => ({
  FServiceAPI: {
    Resource: { authTree: mocks.authTree },
    Contract: { batchContracts: mocks.batchContracts, contracts: mocks.contracts },
  },
  unwrapData: <T>(value: { data?: T } | T) =>
    value && typeof value === 'object' && !Array.isArray(value) && 'data' in value
      ? value.data
      : value,
}));

import { assessResourceAuthorization } from '../src/services/authorizationTree.js';

const consoleTree = [
  [
    {
      resourceId: 'dependency-1',
      resourceName: 'alice/dependency-1',
      resourceType: ['图片'],
      version: '1.0.0',
      contracts: [{ contractId: 'contract-1', policyId: 'policy-1' }],
      children: [],
    },
  ],
];

describe('Console authorization tree contract', () => {
  beforeEach(() => vi.clearAllMocks());

  it('treats active contracts from the nested Console tree as resolved', async () => {
    mocks.authTree.mockResolvedValue({ data: consoleTree });
    mocks.batchContracts.mockResolvedValue({
      data: [{ contractId: 'contract-1', status: 0, authStatus: 1 }],
    });

    await expect(
      assessResourceAuthorization({
        resourceId: 'resource-1',
        version: '1.0.0',
        declaredDependencies: [{ resourceId: 'dependency-1' }],
      }),
    ).resolves.toMatchObject({ resolved: true, contractIds: ['contract-1'] });
  });

  it('keeps inactive or missing contracts unresolved', async () => {
    mocks.authTree.mockResolvedValue({ data: consoleTree });
    mocks.batchContracts.mockResolvedValue({
      data: [{ contractId: 'contract-1', status: 0, authStatus: 128 }],
    });

    const result = await assessResourceAuthorization({
      resourceId: 'resource-1',
      version: '1.0.0',
      declaredDependencies: [{ resourceId: 'dependency-1' }],
    });
    expect(result.resolved).toBe(false);
    expect(result.unresolvedDependencies).toEqual(
      expect.arrayContaining([
        { reason: 'DECLARED_DEPENDENCY_NOT_AUTHORIZED', resourceId: 'dependency-1' },
        {
          reason: 'CONTRACT_NOT_AUTHORIZED',
          resourceIds: ['dependency-1'],
          contractIds: ['contract-1'],
        },
      ]),
    );
  });

  it('requires every declared direct dependency to be represented by an active contract', async () => {
    mocks.authTree.mockResolvedValue({ data: consoleTree });
    mocks.batchContracts.mockResolvedValue({
      data: [{ contractId: 'contract-1', status: 0, authStatus: 1 }],
    });

    const result = await assessResourceAuthorization({
      resourceId: 'resource-1',
      version: '1.0.0',
      declaredDependencies: [
        { resourceId: 'dependency-1' },
        { resourceId: 'dependency-2' },
      ],
    });

    expect(result.resolved).toBe(false);
    expect(result.unresolvedDependencies).toContainEqual({
      reason: 'DECLARED_DEPENDENCY_NOT_AUTHORIZED',
      resourceId: 'dependency-2',
    });
  });

  it('accepts one active contract when the same dependency has inactive historical contracts', async () => {
    mocks.authTree.mockResolvedValue({
      data: [[{ ...consoleTree[0][0], contracts: [
        { contractId: 'contract-old', policyId: 'policy-old' },
        { contractId: 'contract-1', policyId: 'policy-1' },
      ] }]],
    });
    mocks.batchContracts.mockResolvedValue({
      data: [
        { contractId: 'contract-old', status: 1, authStatus: 128 },
        { contractId: 'contract-1', status: 0, authStatus: 1 },
      ],
    });

    await expect(
      assessResourceAuthorization({
        resourceId: 'resource-1',
        version: '1.0.0',
        declaredDependencies: [{ resourceId: 'dependency-1' }],
      }),
    ).resolves.toMatchObject({ resolved: true });
  });

  it('falls back to licensee contracts when authTree is empty before first publish', async () => {
    mocks.authTree.mockResolvedValue({ data: [] });
    mocks.contracts.mockResolvedValue({
      data: {
        dataList: [
          {
            contractId: 'contract-self',
            subjectId: 'dependency-1',
            policyId: 'policy-1',
            status: 0,
            authStatus: 1,
          },
        ],
      },
    });

    await expect(
      assessResourceAuthorization({
        resourceId: 'resource-1',
        version: '1.0.0',
        declaredDependencies: [{ resourceId: 'dependency-1' }],
      }),
    ).resolves.toMatchObject({ resolved: true, contractIds: ['contract-self'] });
    expect(mocks.contracts).toHaveBeenCalledWith(
      expect.objectContaining({ licenseeId: 'resource-1', identityType: 1 }),
    );
  });
});
