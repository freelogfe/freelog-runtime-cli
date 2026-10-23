import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { getCollectionContract, listCollectionContracts, listCollectionUpdateLogs } from '../../src/domain/collection/readonly';

const logRow = (logId: string) => ({ logId, resourceId: 'collection_1', createDate: '2026-10-01', operations: [] });
const ownContract = { contractId: 'contract_1', licenseeId: 'resource_x', licensorId: 'collection_1', subjectId: 'collection_1', subjectType: 1, policyId: 'policy_1', status: 0, authStatus: 1, createDate: '2026-10-01' };
const page = (rows: unknown[], totalItem: number, skip: number, limit: number) => ({ ret: 0, errCode: 0, data: { skip, limit, totalItem, dataList: rows } });

describe('合集只读管理', () => {
  let cwd: string;
  let homeDir: string;
  const info = async () => ({ ret: 0, errCode: 0, data: {
    resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF',
    subjectType: [4], userId: 7, status: 0,
  } });

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-readonly-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-readonly-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd, homeDir, loginName: 'alice', password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }),
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('日志默认只读一页，--all 才按 skip 翻页', async () => {
    const calls: Record<string, unknown>[] = [];
    const apis = {
      info,
      getLogs: async (params: Record<string, unknown>) => {
        calls.push(params);
        const skip = Number(params.skip);
        return page(skip === 0 ? [logRow('l1'), logRow('l2')] : [logRow('l3')], 3, skip, Number(params.limit));
      },
    };
    await expect(listCollectionUpdateLogs({ cwd, homeDir, selector: 'id:collection_1', limit: 2, apis }))
      .resolves.toEqual([logRow('l1'), logRow('l2')]);
    expect(calls).toEqual([{ resourceId: 'collection_1', skip: 0, limit: 2, sortType: -1 }]);
    calls.length = 0;
    await expect(listCollectionUpdateLogs({ cwd, homeDir, selector: 'id:collection_1', limit: 2, all: true, yes: true, order: 'asc', apis }))
      .resolves.toEqual([logRow('l1'), logRow('l2'), logRow('l3')]);
    expect(calls).toEqual([
      { resourceId: 'collection_1', skip: 0, limit: 2, sortType: 1 },
      { resourceId: 'collection_1', skip: 2, limit: 2, sortType: 1 },
    ]);
  });

  it('合同列表固定以合集为授权方，详情先核验合同归属', async () => {
    const calls: Record<string, unknown>[] = [];
    const apis = {
      info,
      getContracts: async (params: Record<string, unknown>) => {
        calls.push(params);
        return page([ownContract], 1, Number(params.skip), Number(params.limit));
      },
      getContract: async () => ({ ret: 0, errCode: 0, data: ownContract }),
    };
    await expect(listCollectionContracts({ cwd, homeDir, selector: 'id:collection_1', status: 0, search: 'hello', apis }))
      .resolves.toEqual([ownContract]);
    expect(calls[0]).toEqual({
      identityType: 1, licensorId: 'collection_1', subjectType: 1, skip: 0, limit: 100,
      order: 'desc', status: 0, keywords: 'hello',
    });
    await expect(getCollectionContract({ cwd, homeDir, selector: 'id:collection_1', contractId: 'contract_1', apis }))
      .resolves.toMatchObject({ contractId: 'contract_1' });
    await expect(getCollectionContract({ cwd, homeDir, selector: 'id:collection_1', contractId: 'other', apis }))
      .rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_NOT_FOUND' });
  });
});
