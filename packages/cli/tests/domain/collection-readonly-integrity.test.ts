import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tty from '../../src/core/tty';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { getCollectionContract, listCollectionContracts, listCollectionUpdateLogs, type CollectionReadonlyApis } from '../../src/domain/collection/readonly';

const unintended = vi.hoisted(() => vi.fn(() => { throw new Error('TEST_API_NOT_INJECTED'); }));
vi.mock('../../src/platform/api', async (original) => {
  const actual = await original<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: new Proxy(actual.FServiceAPI, { get: () => new Proxy({}, { get: () => unintended }) }) };
});
const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const log = (day = '01') => ({ resourceId: 'collection_1', resourceVersionId: 'same_version', createDate: `2026-10-${day}`, operations: [{ operationType: 'CREATE', operationItems: [] }] });
const contract = (id = 'contract_1') => ({ contractId: id, licensorId: 'collection_1', subjectId: 'collection_1', subjectType: 1, policyId: 'policy_1',
  licenseeId: 'buyer', licenseeName: '买方', contractName: '策略', status: 0, authStatus: 128, createDate: '2026-10-01', updateDate: '2026-10-02' });
const page = (rows: unknown[], totalItem = rows.length, skip = 0, limit = 2) => ok({ skip, limit, totalItem, dataList: rows });

describe('C11.R01～R05 只读查询的完整性、上限和归属', () => {
  let cwd: string; let homeDir: string; let api: CollectionReadonlyApis;
  const base = () => ({ cwd, homeDir, selector: 'id:collection_1', apis: api });
  const read = (kind: 'log' | 'contract', extra: Record<string, unknown> = {}) => kind === 'log'
    ? listCollectionUpdateLogs({ ...base(), limit: 2, ...extra }) : listCollectionContracts({ ...base(), limit: 2, ...extra });
  beforeEach(async () => {
    unintended.mockClear(); cwd = mkdtempSync(path.join(tmpdir(), 'freelog-read-integrity-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-read-integrity-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    vi.spyOn(tty, 'isInteractive').mockReturnValue(false); vi.spyOn(tty, 'confirmQuestion').mockResolvedValue(false);
    api = { info: vi.fn(async () => ok({ resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT', subjectType: [4], userId: 7, status: 2, rssSource: 'yes' })),
      getLogs: vi.fn(async (params) => page([], 0, Number(params.skip), Number(params.limit))),
      getContracts: vi.fn(async (params) => page([], 0, Number(params.skip), Number(params.limit))),
      getContract: vi.fn(async () => ok(contract())) };
  });
  afterEach(() => {
    try { expect(unintended).not.toHaveBeenCalled(); }
    finally { vi.restoreAllMocks(); resetEnvForTests(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); }
  });

  it.each(['log', 'contract'] as const)('C11.R01 %s失败信封即使数据完整也不能通过', async (kind) => {
    api[kind === 'log' ? 'getLogs' : 'getContracts'] = vi.fn(async () => ({ ...page([kind === 'log' ? log() : contract()]), ret: 1, errCode: 0 }));
    await expect(read(kind)).rejects.toMatchObject({ code: kind === 'log' ? 'COLLECTION_LOG_RESPONSE_INVALID' : 'COLLECTION_CONTRACT_LIST_RESPONSE_INVALID' });
  });

  it.each([
    ['raw array', [log()]], ['bare data', { data: [log()] }], ['wrong skip', page([log()], 1, 1)],
    ['wrong limit', page([log()], 1, 0, 1)], ['string total', ok({ skip: 0, limit: 2, totalItem: '1', dataList: [log()] })],
    ['short page', page([log()], 3)], ['null row', page([null])], ['array row', page([[]])],
    ['other target', page([{ ...log(), resourceId: 'other' }])], ['bad operations', page([{ ...log(), operations: null }])],
  ])('C11.R01 日志%s不是完整分页', async (_label, value) => {
    api.getLogs = vi.fn(async () => value);
    await expect(read('log')).rejects.toMatchObject({ code: 'COLLECTION_LOG_RESPONSE_INVALID' });
  });

  it('C11.R01 同版本两条真实日志不按版本ID误去重', async () => {
    api.getLogs = vi.fn(async () => page([log('01'), log('02')]));
    await expect(read('log')).resolves.toEqual([log('01'), log('02')]);
  });

  it.each([null, '', ' ', 'log,other', 'log\u202e', {}, [], 7].map((value) => ({ value })))('C11.R01 非法可选logId $value必须整页拒绝，不能当无ID', async ({ value }) => {
    api.getLogs = vi.fn(async () => page([{ ...log('01'), logId: 'valid_log' }, { ...log('02'), logId: value }]));
    const nextPage = vi.fn(async () => true);
    const authPath = path.join(cwd, '.freelog/auth'); const before = readFileSync(authPath);
    await expect(read('log', { nextPage })).rejects.toMatchObject({ code: 'COLLECTION_LOG_RESPONSE_INVALID' });
    expect(api.getLogs).toHaveBeenCalledTimes(1); expect(nextPage).not.toHaveBeenCalled();
    expect(readFileSync(authPath)).toEqual(before);
  });

  it('C11.R01 合法日志ID与缺失ID均原样保留，未知字段不丢失', async () => {
    const rows = [{ ...log('01'), logId: 'log_1', future: { value: 0 } }, log('02')];
    api.getLogs = vi.fn(async () => page(rows));
    await expect(read('log')).resolves.toEqual(rows);
  });

  it('C11.R01 重复合法日志ID跨页拒绝，不按相同版本ID去重', async () => {
    api.getLogs = vi.fn().mockResolvedValueOnce(page([{ ...log('01'), logId: 'log_1' }, { ...log('02'), logId: 'log_2' }], 3))
      .mockResolvedValueOnce(page([{ ...log('03'), logId: 'log_1' }], 3, 2));
    await expect(read('log', { all: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_LOG_RESPONSE_INVALID' });
    expect(api.getLogs).toHaveBeenCalledTimes(2);
  });

  it('C11.R01 总数中途变化不输出完整列表，也不继续发第三页', async () => {
    api.getLogs = vi.fn().mockResolvedValueOnce(page([log('01'), log('02')], 3)).mockResolvedValueOnce(page([log('03')], 4, 2));
    await expect(read('log', { all: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_LOG_RESPONSE_INVALID' });
    expect(api.getLogs).toHaveBeenCalledTimes(2);
  });

  it.each([{ limit: 0 }, { limit: 101 }, { order: 'invalid' }])('C11.R02 %j在读取目标前拒绝', async (extra) => {
    await expect(read('log', extra)).rejects.toMatchObject({ code: 'limit' in extra ? 'COLLECTION_READ_LIMIT_INVALID' : 'COLLECTION_READ_ORDER_INVALID' });
    expect(api.info).not.toHaveBeenCalled(); expect(api.getLogs).not.toHaveBeenCalled();
  });

  it.each(['log', 'contract'] as const)('C11.R03 %s非TTY的all没有yes不能读首个数据页', async (kind) => {
    await expect(read(kind, { all: true })).rejects.toMatchObject({ code: 'COLLECTION_READ_ALL_NEED_YES' });
    expect(api.getLogs).not.toHaveBeenCalled(); expect(api.getContracts).not.toHaveBeenCalled();
  });

  it('C11.R03 TTY的all默认否，取消零数据请求', async () => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    await expect(read('log', { all: true })).rejects.toMatchObject({ code: 'COLLECTION_READ_CANCELLED' });
    expect(tty.confirmQuestion).toHaveBeenCalledWith(expect.stringContaining('alice/collection'), false);
    expect(api.getLogs).not.toHaveBeenCalled();
  });

  it('C11.R03 TTY明确确认后才读取，空列表如实返回', async () => {
    vi.mocked(tty.isInteractive).mockReturnValue(true); vi.mocked(tty.confirmQuestion).mockResolvedValue(true);
    await expect(read('log', { all: true })).resolves.toEqual([]);
    expect(api.getLogs).toHaveBeenCalledTimes(1);
  });

  it('C11.R03 恰100页允许完整读取，不因整页末页多请求一页', async () => {
    api.getLogs = vi.fn(async (params) => page([{ ...log(), createDate: `time-${params.skip}` }], 100, Number(params.skip), 1));
    await expect(read('log', { limit: 1, all: true, yes: true })).resolves.toHaveLength(100);
    expect(api.getLogs).toHaveBeenCalledTimes(100);
    expect(api.getLogs).toHaveBeenLastCalledWith({ resourceId: 'collection_1', skip: 99, limit: 1, sortType: -1 });
  });

  it('C11.R03 手动继续也不能绕过100页上限', async () => {
    api.getLogs = vi.fn(async (params) => page([{ ...log(), createDate: `time-${params.skip}` }], 101, Number(params.skip), 1));
    const nextPage = vi.fn(async () => true);
    await expect(read('log', { limit: 1, nextPage })).rejects.toMatchObject({ code: 'COLLECTION_READ_TOO_LARGE' });
    expect(api.getLogs).toHaveBeenCalledTimes(100);
  });

  it.each([10001, 201])('C11.R03 总数%s超过条数或页数预算时首屏后拒绝', async (total) => {
    api.getLogs = vi.fn().mockResolvedValueOnce(page([log('01'), log('02')], total)).mockResolvedValue(page([], 0, 2));
    await expect(read('log', { all: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_READ_TOO_LARGE' });
    expect(api.getLogs).toHaveBeenCalledTimes(1);
  });

  it('C11.R04 手动继续只读取所选页，结束不请求下一页', async () => {
    api.getLogs = vi.fn().mockResolvedValueOnce(page([log('01'), log('02')], 5)).mockResolvedValueOnce(page([log('03'), log('04')], 5, 2));
    const nextPage = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(read('log', { nextPage })).resolves.toEqual([log('01'), log('02'), log('03'), log('04')]);
    expect(nextPage).toHaveBeenCalledTimes(2); expect(api.getLogs).toHaveBeenCalledTimes(2); expect(api.info).toHaveBeenCalledTimes(1);
  });

  it.each([
    { licensorId: 'other' }, { subjectId: 'other' }, { subjectType: 4 }, { contractId: '' }, { policyId: null },
  ])('C11.R05 合同列表%j不能冒充本合集发出的合同', async (patch) => {
    api.getContracts = vi.fn(async () => page([{ ...contract(), ...patch }]));
    await expect(read('contract')).rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_LIST_RESPONSE_INVALID' });
    expect(api.getContract).not.toHaveBeenCalled();
  });

  it('C11.R05 重复合同ID跨页拒绝，不静默去重', async () => {
    api.getContracts = vi.fn().mockResolvedValueOnce(page([contract('one'), contract('two')], 3)).mockResolvedValueOnce(page([contract('one')], 3, 2));
    await expect(read('contract', { all: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_LIST_RESPONSE_INVALID' });
  });

  it.each([{ contractId: 'other' }, { licensorId: 'other' }, { subjectId: 'other' }, { subjectType: 2 }])('C11.R05 详情%j不能混入', async (patch) => {
    api.getContracts = vi.fn(async (params) => page([contract()], 1, 0, Number(params.limit)));
    api.getContract = vi.fn(async () => ok({ ...contract(), ...patch }));
    await expect(getCollectionContract({ ...base(), contractId: 'contract_1' })).rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_RESPONSE_INVALID' });
    expect(api.getContract).toHaveBeenCalledTimes(1);
  });

  it('C11.R05 show按固定目标有界查找，命中后只请求一次详情', async () => {
    api.getContracts = vi.fn(async (params) => page([contract()], 1, 0, Number(params.limit)));
    const before = readdirSync(path.join(cwd, '.freelog')); const auth = readFileSync(path.join(cwd, '.freelog/auth'));
    await expect(getCollectionContract({ ...base(), contractId: 'contract_1' })).resolves.toEqual(contract());
    expect(api.info).toHaveBeenCalledTimes(1); expect(api.getContracts).toHaveBeenCalledTimes(1); expect(api.getContract).toHaveBeenCalledExactlyOnceWith({ contractId: 'contract_1', isLoadPolicyInfo: 1 });
    expect(readdirSync(path.join(cwd, '.freelog'))).toEqual(before); expect(readFileSync(path.join(cwd, '.freelog/auth'))).toEqual(auth);
  });

  it('C11.R05 show可查第二页但不是公共all导出，不重复解析目标', async () => {
    const rows = [...Array.from({ length: 100 }, (_, index) => contract(`c${index}`)), contract('wanted')];
    api.getContracts = vi.fn(async (params) => page(rows.slice(Number(params.skip), Number(params.skip) + Number(params.limit)), 101, Number(params.skip), Number(params.limit)));
    api.getContract = vi.fn(async () => ok(contract('wanted')));
    await expect(getCollectionContract({ ...base(), contractId: 'wanted' })).resolves.toEqual(contract('wanted'));
    expect(api.info).toHaveBeenCalledTimes(1); expect(api.getContracts).toHaveBeenCalledTimes(2); expect(api.getContract).toHaveBeenCalledTimes(1);
    expect(api.getContracts).toHaveBeenLastCalledWith({ identityType: 1, licensorId: 'collection_1', subjectType: 1, skip: 100, limit: 100, order: 'desc' });
    expect(tty.confirmQuestion).not.toHaveBeenCalled();
  });

  it('C11.R05 详情失败信封即使数据匹配也拒绝', async () => {
    api.getContracts = vi.fn(async (params) => page([contract()], 1, 0, Number(params.limit)));
    api.getContract = vi.fn(async () => ({ ...ok(contract()), ret: 1 }));
    await expect(getCollectionContract({ ...base(), contractId: 'contract_1' })).rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_RESPONSE_INVALID' });
  });
});
