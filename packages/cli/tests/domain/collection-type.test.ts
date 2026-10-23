import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tty from '../../src/core/tty';
import { formatCliError } from '../../src/core/errors';
import { loginAccount } from '../../src/domain/account/login';
import { createCollection } from '../../src/domain/collection/create';
import { editCollectionForm, mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft } from '../../src/domain/collection/form';
import { publishCollection } from '../../src/domain/collection/publish';
import { chooseCollectionLeafType, getCollectionTypeInfo, type CollectionTypeApis } from '../../src/domain/collection/typePick';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { createCollectionIdentity, readCollectionIdentity } from '../../src/local/identity';
import { FUtil } from '../../src/platform/api';

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const leaf = { code: 'LEAF', name: '叶子', isTerminate: true, status: 1, subjectType: [4], attrs: [], resourceConfig: { supportOptionalConfig: 2 } };
const nodes = [{ code: 'ROOT', name: '祖父', status: 1, subjectType: [1], children: [
  { code: 'PARENT', name: '父', status: 1, subjectType: [1], children: [
    { code: 'LEAF', name: '叶子', status: 1, subjectType: [4], children: [] },
  ] },
] }];
const validApis = (): CollectionTypeApis => ({ resourceTypes: async () => ok(nodes), getByCode: async () => ok(leaf) });
const snapshot = (root: string): unknown[] => readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => [
  entry.name, entry.isDirectory() ? snapshot(path.join(root, entry.name)) : readFileSync(path.join(root, entry.name)).toString('base64'),
]);

describe('C01.T01–T04 合集共享类型可信边界及完整路径', () => {
  beforeEach(() => applyCliEnv({ flag: 'test' }));
  afterEach(() => { vi.restoreAllMocks(); resetEnvForTests(); });

  it('树叶不带isTerminate且祖先不支持合集，仍由详情确认并返回完整路径', async () => {
    const calls: unknown[] = [];
    const result = await getCollectionTypeInfo(' LEAF ', {
      resourceTypes: async (params) => { calls.push(params); return ok(nodes); },
      getByCode: async (params) => { calls.push(params); return ok(leaf); },
    });
    expect(result).toMatchObject({ ...leaf, pathLabel: '祖父 / 父 / 叶子' });
    expect(calls).toEqual([{ category: 1, status: 1, subjectType: 4 }, { code: 'LEAF' }]);
    expect(nodes[0]?.children[0]?.children[0]).not.toHaveProperty('isTerminate');
  });

  const badLists: Array<[string, unknown]> = [
    ['裸数组', nodes], ['缺ret', { errCode: 0, data: nodes }], ['缺errCode', { ret: 0, data: nodes }],
    ['失败ret', { ret: 1, errCode: 0, data: nodes }], ['失败errCode', { ret: 0, errCode: 1, data: nodes }],
    ['字符串ret', { ret: '0', errCode: 0, data: nodes }], ['字符串errCode', { ret: 0, errCode: '0', data: nodes }],
    ['缺data', { ret: 0, errCode: 0 }], ['null data', ok(null)], ['dataList别名', ok({ dataList: nodes })],
    ['null行', ok([null])], ['缺code行', ok([{ name: '无code' }])],
  ];
  it.each(badLists)('失败或畸形树不能借data继续：%s', async (_name, response) => {
    await expect(getCollectionTypeInfo('LEAF', { ...validApis(), resourceTypes: async () => response }))
      .rejects.toMatchObject({ code: 'COLLECTION_TYPE_RESPONSE_INVALID' });
  });

  const badDetails: Array<[string, unknown]> = [
    ['裸对象', leaf], ['缺ret', { errCode: 0, data: leaf }], ['缺errCode', { ret: 0, data: leaf }],
    ['失败ret', { ret: 1, errCode: 0, data: leaf }], ['失败errCode', { ret: 0, errCode: 1, data: leaf }],
    ['字符串ret', { ret: '0', errCode: 0, data: leaf }], ['字符串errCode', { ret: 0, errCode: '0', data: leaf }],
    ['缺data', { ret: 0, errCode: 0 }], ['数组data', ok([leaf])],
  ];
  it.each(badDetails)('失败或畸形详情不能借code继续：%s', async (_name, response) => {
    await expect(getCollectionTypeInfo('LEAF', { ...validApis(), getByCode: async () => response }))
      .rejects.toMatchObject({ code: 'COLLECTION_TYPE_RESPONSE_INVALID' });
  });

  it('成功null详情是找不到类型，不与查询异常混为一类', async () => {
    await expect(getCollectionTypeInfo('LEAF', { ...validApis(), getByCode: async () => ok(null) }))
      .rejects.toMatchObject({ code: 'COLLECTION_TYPE_NOT_FOUND' });
  });
  it.each([4, '4', [4], ['4'], [2, 4]])('只按明确支持的主体表示接受：%j', async (subjectType) => {
    await expect(getCollectionTypeInfo('LEAF', { ...validApis(), getByCode: async () => ok({ ...leaf, subjectType }) }))
      .resolves.toMatchObject({ code: 'LEAF', pathLabel: '祖父 / 父 / 叶子' });
  });
  it.each(['04', ' 4 ', [[4]]])('不做主体数值猜测：%j', async (subjectType) => {
    await expect(getCollectionTypeInfo('LEAF', { ...validApis(), getByCode: async () => ok({ ...leaf, subjectType }) }))
      .rejects.toMatchObject({ code: 'COLLECTION_TYPE_NOT_LEAF' });
  });
  it.each([
    { status: 0 }, { isTerminate: false }, { subjectType: [1] },
  ])('详情资格不符仍拒绝：%j', async (patch) => {
    await expect(getCollectionTypeInfo('LEAF', { ...validApis(), getByCode: async () => ok({ ...leaf, ...patch }) }))
      .rejects.toMatchObject({ code: 'COLLECTION_TYPE_NOT_LEAF' });
  });
  it('详情不能把树中父节点说成最终叶子', async () => {
    await expect(getCollectionTypeInfo('PARENT', { ...validApis(), getByCode: async () => ok({ ...leaf, code: 'PARENT' }) }))
      .rejects.toMatchObject({ code: 'COLLECTION_TYPE_NOT_LEAF' });
  });
  const badTrees: Array<[string, unknown]> = [
    ['缺名称', [{ code: 'LEAF', status: 1, subjectType: [4] }]],
    ['非文本名称', [{ ...leaf, name: 3 }]],
    ['坏children', [{ ...leaf, children: '' }]],
    ['重复code', [leaf, { ...leaf, name: '重复' }]],
  ];
  it.each(badTrees)('不完整或歧义的树不能确认身份：%s', async (_name, tree) => {
    await expect(getCollectionTypeInfo('LEAF', { ...validApis(), resourceTypes: async () => ok(tree) }))
      .rejects.toMatchObject({ code: 'COLLECTION_TYPE_RESPONSE_INVALID' });
  });
  it('查询异常用固定安全错误，不输出原始message', async () => {
    const error = await getCollectionTypeInfo('LEAF', { ...validApis(), getByCode: async () => { throw new Error('synthetic-private-type-message'); } })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'COLLECTION_TYPE_RESPONSE_INVALID' });
    expect(formatCliError(error as Parameters<typeof formatCliError>[0], ['--json']).includes('synthetic-private-type-message')).toBe(false);
  });

  it('层级返回后仍显示全部祖先，最终只复验选择的叶子', async () => {
    const select = vi.spyOn(tty, 'selectQuestion').mockResolvedValueOnce('node:ROOT').mockResolvedValueOnce('node:PARENT')
      .mockResolvedValueOnce('__back__').mockResolvedValueOnce('node:PARENT').mockResolvedValueOnce('node:LEAF');
    const detail = vi.fn(async () => ok(leaf));
    await expect(chooseCollectionLeafType({ ...validApis(), getByCode: detail })).resolves.toMatchObject({ pathLabel: '祖父 / 父 / 叶子' });
    expect(select.mock.calls[4]?.[1]).toContainEqual({ name: '祖父 / 父 / 叶子 (LEAF)', value: 'node:LEAF' });
    expect(detail).toHaveBeenCalledExactlyOnceWith({ code: 'LEAF' });
  });
  it('搜索只使用当前树计算路径，不信任搜索行names或资格字段', async () => {
    const select = vi.spyOn(tty, 'selectQuestion').mockResolvedValueOnce('__search__').mockResolvedValueOnce('LEAF');
    vi.spyOn(tty, 'askInput').mockResolvedValue('叶子');
    const search = vi.fn(async () => ok([{ code: 'LEAF', name: '伪叶子', names: '伪祖先', subjectType: [1] }]));
    await expect(chooseCollectionLeafType({ ...validApis(), searchLeaves: search })).resolves.toMatchObject({ pathLabel: '祖父 / 父 / 叶子' });
    expect(select.mock.calls[1]?.[1]).toEqual([{ name: '祖父 / 父 / 叶子 (LEAF)', value: 'LEAF' }]);
    expect(search).toHaveBeenCalledExactlyOnceWith({ category: 1, nameChain: '叶子', isTerminate: true, status: 1, subjectType: 4 });
  });
  it('直接输入code也返回完整路径', async () => {
    vi.spyOn(tty, 'selectQuestion').mockResolvedValueOnce('__code__');
    vi.spyOn(tty, 'askInput').mockResolvedValue(' LEAF ');
    await expect(chooseCollectionLeafType(validApis())).resolves.toMatchObject({ pathLabel: '祖父 / 父 / 叶子' });
  });
  it('取消只读树，不请求详情', async () => {
    vi.spyOn(tty, 'selectQuestion').mockResolvedValueOnce('__cancel__');
    const detail = vi.fn(async () => ok(leaf));
    await expect(chooseCollectionLeafType({ ...validApis(), getByCode: detail })).rejects.toMatchObject({ code: 'COLLECTION_TYPE_CANCELLED' });
    expect(detail).not.toHaveBeenCalled();
  });
  it.each([['空数组', ok([]), 'COLLECTION_TYPE_NOT_FOUND'], ['失败含数组', { ret: 1, errCode: 0, data: [leaf] }, 'COLLECTION_TYPE_RESPONSE_INVALID']] as const)
  ('搜索空结果与失败响应分开，且不请求详情：%s', async (_name, response, code) => {
    vi.spyOn(tty, 'selectQuestion').mockResolvedValueOnce('__search__').mockResolvedValueOnce('LEAF');
    vi.spyOn(tty, 'askInput').mockResolvedValue('叶子');
    const detail = vi.fn(async () => ok(leaf));
    await expect(chooseCollectionLeafType({ ...validApis(), getByCode: detail, searchLeaves: async () => response })).rejects.toMatchObject({ code });
    expect(detail).not.toHaveBeenCalled();
  });

  it('C01.T06 真实SDK只隔离HTTPadapter，ret1/err0仍拒绝且精确GET正控成立', async () => {
    const adapter = FUtil.Axios.defaults.adapter;
    const calls: unknown[] = [], unexpected: string[] = [];
    let failed = true;
    FUtil.configurePlatform({ getEnv: () => 'test', getAuthorization: () => undefined, getHeaders: () => ({}) });
    FUtil.Axios.defaults.adapter = async (config) => {
      calls.push({ method: config.method, url: config.url, params: config.params });
      let data: unknown;
      if (config.url === '/v2/resources/types/listSimpleByGroup') data = ok(nodes);
      else if (config.url === '/v2/resources/types/getInfoByCode') data = failed ? { ret: 1, errCode: 0, data: leaf } : ok(leaf);
      else { unexpected.push('UNEXPECTED_ROUTE'); throw new Error('UNEXPECTED_TYPE_ROUTE'); }
      return { status: 200, statusText: 'OK', headers: {}, config, data };
    };
    try {
      await expect(getCollectionTypeInfo('LEAF')).rejects.toMatchObject({ code: 'COLLECTION_TYPE_RESPONSE_INVALID' });
      failed = false;
      await expect(getCollectionTypeInfo('LEAF')).resolves.toMatchObject({ pathLabel: '祖父 / 父 / 叶子' });
      expect(calls).toEqual(Array.from({ length: 2 }, () => [
        { method: 'get', url: '/v2/resources/types/listSimpleByGroup', params: { category: 1, status: 1, subjectType: 4 } },
        { method: 'get', url: '/v2/resources/types/getInfoByCode', params: { code: 'LEAF' } },
      ]).flat());
      expect(unexpected).toEqual([]);
    } finally { FUtil.Axios.defaults.adapter = adapter; }
  });
});

describe('C01.T05 类型失败对共享消费者的副作用边界', () => {
  let cwd: string, homeDir: string;
  const target = { resourceId: 'collection_types', resourceName: 'alice/type-collection', resourceTypeCode: 'LEAF', subjectType: [4], userId: 7, status: 0, latestVersion: '' };
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-type-boundary-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-type-boundary-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    createCollectionIdentity(cwd, { subject: 'collection', resourceId: target.resourceId, resourceName: target.resourceName, name: 'type-collection', title: '保留', typeCode: 'LEAF', env: 'test' });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_types', apis: {
      ...validApis(), info: async () => ok(target), filesInfo: async () => ok({ metaInfoArray: [] }),
    } });
    mutateCollectionFormDraft(cwd, target.resourceId, (form) => ({ ...form, description: '保留当前稿' }));
    writeFileSync(path.join(cwd, 'form.json'), JSON.stringify(readCollectionFormDraft(cwd, target.resourceId)!.form));
  });
  afterEach(() => { vi.restoreAllMocks(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });
  const consumers = ['create', 'pull', 'edit', 'publish'] as const;
  const combinations = consumers.flatMap((consumer) => (['tree', 'detail'] as const).map((phase) => [consumer, phase] as const));
  it.each(combinations)('%s遇到失败%s停止，身份/当前稿/其它字节不变且零远端写', async (consumer, phase) => {
    const create = vi.fn(), updateCollection = vi.fn();
    const apis = {
      ...validApis(), create, updateCollection,
      ...(phase === 'tree' ? { resourceTypes: async () => ({ ret: 1, errCode: 0, data: nodes }) } : { getByCode: async () => ({ ret: 1, errCode: 0, data: leaf }) }),
      info: async () => consumer === 'create' ? ok(null) : ok(target),
      getPublishedItems: async () => ok({ skip: 0, limit: 100, totalItem: 0, dataList: [] }),
      getDraftItems: async () => ok({ skip: 0, limit: 100, totalItem: 0, dataList: [] }),
      getRules: async () => ok({ status: 0, conditionType: 1, filterConditions: [] }),
    };
    const before = snapshot(cwd), home = snapshot(homeDir);
    const common = { cwd, homeDir, selector: 'id:collection_types', apis };
    const running = consumer === 'create' ? createCollection({ cwd, homeDir, type: 'LEAF', title: '新', name: 'new', yes: true, apis })
      : consumer === 'pull' ? pullCollectionForm({ ...common, yes: true })
      : consumer === 'edit' ? editCollectionForm({ ...common, from: 'form.json' })
      : publishCollection({ ...common, includeItems: 'no', yes: true });
    await expect(running).rejects.toMatchObject({ code: 'COLLECTION_TYPE_RESPONSE_INVALID' });
    expect(create).not.toHaveBeenCalled(); expect(updateCollection).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before); expect(snapshot(homeDir)).toEqual(home);
  });
  it('创建摘要展示完整路径，但请求和身份不写pathLabel', async () => {
    const confirmation = vi.spyOn(tty, 'confirmWrite').mockResolvedValue('');
    const create = vi.fn(async () => ok({ resourceId: 'new_type', resourceName: 'alice/new', resourceTypeCode: 'LEAF' }));
    const identity = await createCollection({ cwd, homeDir, type: 'LEAF', title: '新', name: 'new', yes: true,
      apis: { ...validApis(), info: async () => ok(null), create } });
    expect(confirmation.mock.calls[0]?.[0]).toContain('祖父 / 父 / 叶子');
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'new', resourceTitle: '新', resourceTypeCode: 'LEAF', subjectType: 4 });
    expect(readCollectionIdentity(cwd, identity.n)).not.toHaveProperty('pathLabel');
  });
});
