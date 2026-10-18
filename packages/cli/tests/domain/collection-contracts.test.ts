import { describe, expect, it, vi } from 'vitest';
import { verifyCollectionResourceContracts } from '../../src/domain/collection/contracts';
import { CliError } from '../../src/core/errors';

const active = {
  contractId: 'contract_1', subjectId: 'resource_1', subjectType: 1,
  licenseeId: 'collection_1', licenseeIdentityType: 4, status: 0, policyId: 'policy_1',
};

describe('合集合约事实边界', () => {
  it.each([
    ['默认码', undefined, new Error('FAKE_AUTHORIZATION FAKE_COOKIE in request URL')],
    ['调用方指定码', 'COLLECTION_DEP_CONTRACT_RESPONSE_INVALID', new Error('FAKE_PRIVATE_HTTP_MESSAGE')],
    ['非 Error 对象', undefined, { toString: () => { throw new Error('不应转换未知对象'); } }],
  ])('未知请求错误使用固定安全说明，且保留失败门禁：%s', async (_label, responseCode, failure) => {
    const batchContracts = vi.fn(async () => { throw failure; });
    await expect(verifyCollectionResourceContracts({
      collectionId: 'collection_1', subjectIds: ['resource_1'], batchContracts, responseCode,
    })).rejects.toMatchObject({
      code: responseCode ?? 'COLLECTION_CONTRACT_RESPONSE_INVALID', message: '合同查询失败：请求失败',
    });
    expect(batchContracts).toHaveBeenCalledTimes(1);
  });

  it('已受控查询错误保留错误码和恢复文案，不变成空合同或其它码', async () => {
    const failure = new CliError('结果未知，请先核对原请求', 'CONTRACT_RESULT_UNKNOWN');
    await expect(verifyCollectionResourceContracts({
      collectionId: 'collection_1', subjectIds: ['resource_1'],
      batchContracts: async () => { throw failure; },
    })).rejects.toBe(failure);
  });

  it.each([
    ['搁置', { status: 1 }], ['终止', { status: 2 }], ['空状态', { status: null }],
    ['布尔状态', { status: false }], ['文本状态', { status: '0' }], ['缺状态', { status: undefined }],
    ['个人身份', { licenseeIdentityType: 3 }], ['单资源身份', { licenseeIdentityType: 1 }],
    ['文本身份', { licenseeIdentityType: '4' }], ['其他乙方', { licenseeId: 'other_collection' }],
    ['对象乙方', { licenseeId: {} }], ['其他主体', { subjectId: 'other_resource' }],
    ['文本主体类型', { subjectType: '1' }], ['合集主体', { subjectType: 4 }],
    ['无合同ID', { contractId: '' }], ['空白合同ID', { contractId: ' ' }],
    ['对象合同ID', { contractId: {} }], ['数字合同ID', { contractId: 1 }],
  ])('%s不能算已签合约', async (_label, override) => {
    const result = await verifyCollectionResourceContracts({
      collectionId: 'collection_1', subjectIds: ['resource_1'],
      batchContracts: async () => ({ data: [{ ...active, ...override }] }),
    });
    expect([...result.covered]).toEqual([]);
    expect(result.contracts).toEqual([]);
  });

  it.each([1, 2, 128])('authStatus=%s不影响声明所需的有效合约', async (authStatus) => {
    const result = await verifyCollectionResourceContracts({
      collectionId: 'collection_1', subjectIds: ['resource_1'],
      batchContracts: async () => ({ data: [{ ...active, authStatus }] }),
    });
    expect([...result.covered]).toEqual(['resource_1']);
  });

  it.each([null, { data: null }, { data: {} }, { data: [[]] }, { data: [null] }])(
    '异常响应不等同于空合同列表：%j', async (response) => {
      await expect(verifyCollectionResourceContracts({
        collectionId: 'collection_1', subjectIds: ['resource_1'],
        batchContracts: async () => response,
      })).rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_RESPONSE_INVALID' });
    },
  );

  it('返回可用于 authExcludedItems 的真实合同ID，不再依赖签约策略回验', async () => {
    const result = await verifyCollectionResourceContracts({
      collectionId: 'collection_1',
      subjectIds: ['resource_1'],
      batchContracts: async () => [active],
    });
    expect([...result.covered]).toEqual(['resource_1']);
    expect(result.contracts).toEqual([{ contractId: 'contract_1', subjectId: 'resource_1' }]);
  });

  it('没有直接依赖不请求合约', async () => {
    const query = vi.fn();
    expect((await verifyCollectionResourceContracts({ collectionId: 'collection_1', subjectIds: [], batchContracts: query })).covered.size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
