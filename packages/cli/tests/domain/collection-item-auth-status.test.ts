import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { collectionDraftAuthStatus, type CollectionItemApis } from '../../src/domain/collection/items';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

const unintendedRequest = vi.hoisted(() => vi.fn(() => { throw new Error('TEST_API_NOT_INJECTED'); }));
vi.mock('../../src/platform/api', async (original) => {
  const actual = await original<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: new Proxy(actual.FServiceAPI, { get: () => new Proxy({}, { get: () => unintendedRequest }) }) };
});
const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const row = (id: string, resourceId: string, sortId = 1) => ({ itemId: id, itemTitle: '同名', sortId, mountResourceInfo: { resourceId } });
type Row = ReturnType<typeof row>;
const snapshot = (directory: string): Array<[string, string]> => readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  .flatMap((entry): Array<[string, string]> => entry.isDirectory()
    ? snapshot(path.join(directory, entry.name)).map(([file, bytes]) => [path.join(entry.name, file), bytes])
    : [[entry.name, readFileSync(path.join(directory, entry.name)).toString('base64')]]);

describe('C03.A01～A05 单品授权结果必须完整且关联真实来源', () => {
  let cwd: string; let homeDir: string; let info: Record<string, unknown>; let rows: Row[]; let response: unknown; let api: CollectionItemApis;
  const args = (itemIds = ['a', 'b']) => ({ cwd, homeDir, selector: 'id:collection_1', itemIds, apis: api });
  beforeEach(async () => {
    unintendedRequest.mockClear();
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-item-auth-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-item-auth-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    mkdirSync(path.join(cwd, '.freelog/collection-forms/intents'), { recursive: true });
    writeFileSync(path.join(cwd, '.freelog/collection-forms/retained.json'), '{"unchanged":"local draft"}\n');
    writeFileSync(path.join(cwd, '.freelog/collection-forms/intents/retained.json'), '{"unchanged":"pending intent"}\n');
    info = { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT', subjectType: [4], userId: 7, status: 4 };
    rows = [row('a', 'source_a'), row('b', 'source_b', 2)];
    response = ok([{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }]);
    api = {
      info: vi.fn(async () => ok(info)),
      getDraftItems: vi.fn(async (params) => ok({ skip: params.skip, limit: params.limit, totalItem: rows.length,
        dataList: rows.slice(Number(params.skip), Number(params.skip) + Number(params.limit)) })),
      getDraftAuth: vi.fn(async () => response),
    };
  });
  afterEach(() => {
    try { expect(unintendedRequest).not.toHaveBeenCalled(); }
    finally { vi.restoreAllMocks(); resetEnvForTests(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); }
  });

  it('C03.A01 不按同名标题匹配；响应乱序按请求顺序输出三字段并去重', async () => {
    response = ok([{ itemId: 'b', isAuth: false }, { itemId: 'a', isAuth: true }]);
    const before = snapshot(cwd);
    await expect(collectionDraftAuthStatus(args(['a', 'b', 'a']))).resolves.toEqual([
      { itemId: 'a', resourceId: 'source_a', isAuth: true }, { itemId: 'b', resourceId: 'source_b', isAuth: false },
    ]);
    expect(api.info).toHaveBeenCalledTimes(1);
    expect(api.getDraftAuth).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', itemIds: 'a,b' });
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each([
    ['missing id', ok([{ itemId: 'a', isAuth: true }])],
    ['duplicate id', ok([{ itemId: 'a', isAuth: true }, { itemId: 'a', isAuth: false }])],
    ['unexpected id', ok([{ itemId: 'a', isAuth: true }, { itemId: 'c', isAuth: false }])],
    ['extra id', ok([{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }, { itemId: 'c', isAuth: true }])],
    ['empty array', ok([])], ['missing envelope', [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }]],
    ['data without envelope', { data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['failure with valid data', { ret: 1, errCode: 7, data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['ret-only failure', { ret: 1, errCode: 0, data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['errCode-only failure', { ret: 0, errCode: 7, data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['string ret', { ret: '0', errCode: 0, data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['string errCode', { ret: 0, errCode: '0', data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['missing ret', { errCode: 0, data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['missing errCode', { ret: 0, data: [{ itemId: 'a', isAuth: true }, { itemId: 'b', isAuth: false }] }],
    ['null', null], ['undefined', undefined], ['null data', ok(null)], ['object data', ok({})],
    ['null row', ok([null, { itemId: 'b', isAuth: false }])], ['array row', ok([[], { itemId: 'b', isAuth: false }])],
    ['numeric id', ok([{ itemId: 1, isAuth: true }, { itemId: 'b', isAuth: false }])],
    ['missing item id', ok([{ isAuth: true }, { itemId: 'b', isAuth: false }])],
    ['numeric bool', ok([{ itemId: 'a', isAuth: 1 }, { itemId: 'b', isAuth: false }])],
    ['string bool', ok([{ itemId: 'a', isAuth: 'false' }, { itemId: 'b', isAuth: false }])],
  ])('C03.A02 %s不能成为完整成功结果', async (_label, value) => {
    response = value;
    const before = snapshot(cwd);
    await expect(collectionDraftAuthStatus(args())).rejects.toMatchObject({ code: 'COLLECTION_ITEM_AUTH_RESPONSE_INVALID' });
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each([[], [''], [' '], ['a,b'], ['a\nb'], [' a'], ['a\u0000'], ['a\u001b'], ['a\u202e'], ['a\u061c'], ['a\u200b']].map((ids) => ({ ids })))('C03.A03 非法itemId $ids在请求前拒绝', async ({ ids }) => {
    const before = snapshot(cwd);
    await expect(collectionDraftAuthStatus(args(ids))).rejects.toMatchObject({ code: ids.length ? 'COLLECTION_ITEM_ID_INVALID' : 'COLLECTION_ITEM_REQUIRED' });
    expect(api.info).not.toHaveBeenCalled(); expect(api.getDraftItems).not.toHaveBeenCalled(); expect(api.getDraftAuth).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it('C03.A03 目录不存在的ID先拒绝，不让多余授权结果混入', async () => {
    await expect(collectionDraftAuthStatus(args(['a', 'missing']))).rejects.toMatchObject({ code: 'COLLECTION_ITEM_NOT_FOUND' });
    expect(api.getDraftItems).toHaveBeenCalledTimes(1); expect(api.getDraftAuth).not.toHaveBeenCalled();
  });

  it('C03.A04 全量读取后才能把第二页itemId关联来源，仍只查询所选ID', async () => {
    rows = Array.from({ length: 101 }, (_, index) => row(`i${index}`, `source_${index}`, index));
    response = ok([{ itemId: 'i100', isAuth: false }]);
    await expect(collectionDraftAuthStatus(args(['i100']))).resolves.toEqual([{ itemId: 'i100', resourceId: 'source_100', isAuth: false }]);
    expect(api.info).toHaveBeenCalledTimes(1); expect(api.getDraftItems).toHaveBeenCalledTimes(2);
    expect(api.getDraftItems).toHaveBeenNthCalledWith(2, { resourceId: 'collection_1', skip: 100, limit: 100, sortField: 'sortId', sortType: 1 });
    expect(api.getDraftAuth).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', itemIds: 'i100' });
  });

  it('C03.A04 即使目标在首屏，目录短页也不能冒充完整来源证明', async () => {
    api.getDraftItems = vi.fn(async () => ok({ skip: 0, limit: 100, totalItem: 101, dataList: rows }));
    await expect(collectionDraftAuthStatus(args())).rejects.toMatchObject({ code: 'COLLECTION_ITEMS_RESPONSE_INVALID' });
    expect(api.getDraftAuth).not.toHaveBeenCalled();
  });

  it.each(['source\tnew-column', 'source\nnew-line', 'source\u001b[2J', 'source\u202e', 'source\u061c', 'source\u200b'])('C03.A04 异常来源ID不伪造终端结构：%j', async (resourceId) => {
    rows[0]!.mountResourceInfo.resourceId = resourceId;
    await expect(collectionDraftAuthStatus(args())).rejects.toMatchObject({ code: 'COLLECTION_ITEMS_RESPONSE_INVALID' });
    expect(api.getDraftAuth).not.toHaveBeenCalled();
  });

  it.each([{ status: 2 }, { rssSource: 'yes' }, { feedUrl: 'https://example.invalid/rss' }])('C03.A05 写限制状态%j不禁止本人只读查询', async (patch) => {
    Object.assign(info, patch);
    const before = snapshot(cwd);
    await expect(collectionDraftAuthStatus(args())).resolves.toEqual([
      { itemId: 'a', resourceId: 'source_a', isAuth: true }, { itemId: 'b', resourceId: 'source_b', isAuth: false },
    ]);
    expect(snapshot(cwd)).toEqual(before);
  });
});
