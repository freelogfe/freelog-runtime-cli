import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyCollectionResourceContracts } from '../../src/domain/collection/contracts';
import { FUtil } from '../../src/platform/api';

const active = { contractId: 'contract_1', subjectId: 'resource_1', subjectType: 1,
  licenseeId: 'collection_1', licenseeIdentityType: 4, status: 0, authStatus: 1 };
const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });

/** Use the real SDK interceptors; only its final HTTP adapter is isolated. */
describe('C03.C01/C02/C05/C06 合同响应不能因SDK未抛错而成功', () => {
  let saved: typeof FUtil.Axios.defaults.adapter;
  let response: unknown;
  let requests: Array<{ method?: string; url?: string; params: unknown }>;
  const query = (responseCode?: string) => verifyCollectionResourceContracts({ collectionId: 'collection_1', subjectIds: ['resource_1'], responseCode });
  const assertRequest = () => expect(requests).toEqual([{ method: 'get', url: '/v2/contracts/list', params: {
    subjectIds: 'resource_1', subjectType: 1, licenseeId: 'collection_1', licenseeIdentityType: 4, isLoadPolicyInfo: 1,
  } }]);
  beforeEach(() => {
    saved = FUtil.Axios.defaults.adapter;
    response = ok([active]); requests = [];
    FUtil.Axios.defaults.adapter = async (config) => {
      requests.push({ method: config.method, url: config.url, params: structuredClone(config.params) });
      return { config, status: 200, statusText: 'OK', headers: {}, data: response };
    };
  });
  afterEach(() => { FUtil.Axios.defaults.adapter = saved; });

  it('真实SDK成功正控保留合同ID与角色查询', async () => {
    const result = await query();
    expect([...result.covered]).toEqual(['resource_1']);
    expect(result.contracts).toEqual([{ contractId: 'contract_1', subjectId: 'resource_1' }]);
    assertRequest();
  });

  it('完整成功空数组只表示未覆盖', async () => {
    response = ok([]);
    const result = await query();
    expect([...result.covered]).toEqual([]); expect(result.contracts).toEqual([]); assertRequest();
  });

  it.each([
    ['ret失败而errCode为0', { ret: 1, errCode: 0, data: [active] }],
    ['缺ret', { errCode: 0, data: [active] }],
    ['缺errCode', { ret: 0, data: [active] }],
    ['字符串ret', { ret: '0', errCode: 0, data: [active] }],
    ['缺整个信封', [active]],
    ['仅data', { data: [active] }],
    ['dataList别名', ok({ dataList: [active] })],
    ['list别名', ok({ list: [active] })],
  ])('%s不得成为可用合同', async (_label, value) => {
    response = value;
    await expect(query()).rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_RESPONSE_INVALID' });
    assertRequest();
  });

  it('调用方专用码不丢失', async () => {
    response = { ret: 1, errCode: 0, data: [active] };
    await expect(query('CALLER_CONTRACT_RESPONSE_INVALID')).rejects.toMatchObject({ code: 'CALLER_CONTRACT_RESPONSE_INVALID' });
    assertRequest();
  });
});
