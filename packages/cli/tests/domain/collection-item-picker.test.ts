import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickCollectionItemSources, type CollectionItemPickerApis } from '../../src/domain/collection/itemPicker';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { FUtil } from '../../src/platform/api';
const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const row = (i: number) => ({ resourceId: `r${i}`, resourceName: `alice/r${i}`, resourceTitle: `Title ${i}`, userId: 7, subjectType: 1,
  status: 1, latestVersion: '1.0.0', resourceType: ['素材', '图片'], resourceTypeCode: 'IMAGE' });
function fixture(actions: string[], total = 51) {
  const calls: Record<string, unknown>[] = [], menus: unknown[] = [], inputs = ['new search'];
  const apis: CollectionItemPickerApis = { listResources: async (p) => { calls.push(structuredClone(p));
    const skip = p.skip as number; return ok({ skip, limit: 50, totalItem: total, dataList: Array.from({ length: Math.max(0, Math.min(50, total - skip)) }, (_, j) => row(skip + j)) }); },
    resourceTypes: async (p) => { calls.push(structuredClone(p)); return ok([{ code: 'MEDIA', name: '素材', children: [{ code: 'IMAGE', name: '图片', children: [] }] }]); } };
  const choose = vi.fn(async (message: string, choices: unknown[]) => { menus.push({ message, choices: structuredClone(choices) }); const next = actions.shift();
    if (next === undefined) throw new Error('UNEXPECTED_PROMPT'); return next; });
  const run = () => pickCollectionItemSources({ userId: 7, existingIds: [], apis, choose, input: async () => inputs.shift() ?? '' });
  return { run, calls, menus, choose, apis, inputs };
}
describe('C03.P 交互来源选择只读状态机', () => {
  let saved: typeof FUtil.Axios.defaults.adapter, forbidden: unknown[];
  beforeEach(() => { applyCliEnv({ flag: 'test' }); saved = FUtil.Axios.defaults.adapter; forbidden = [];
    FUtil.Axios.defaults.adapter = async (config) => { forbidden.push(config.url); throw new Error('UNEXPECTED_SDK_ACCESS'); }; });
  afterEach(() => { try { expect(forbidden).toEqual([]); } finally { FUtil.Axios.defaults.adapter = saved; resetEnvForTests(); vi.restoreAllMocks(); } });
  it('跨页多选、返回缓存页与移除保持精确稳定ID，不会重复查询旧页', async () => {
    const f = fixture(['resource:r0', 'next', 'resource:r50', 'previous', 'resource:r0', 'done']);
    expect(await f.run()).toEqual(['r50']);
    expect(f.calls).toEqual([{ skip: 0, limit: 50, isSelf: 1, subjectType: 1 }, { skip: 50, limit: 50, isSelf: 1, subjectType: 1 }]);
  });
  it('搜索重置首页但保留隐藏选择，可查看并移除', async () => {
    const f = fixture(['next', 'resource:r50', 'search', 'resource:r0', 'review', 'remove:r50', 'back', 'done']);
    expect(await f.run()).toEqual(['r0']);
    expect(f.calls.at(-1)).toEqual({ skip: 0, limit: 50, isSelf: 1, subjectType: 1, keywords: 'new search' });
  });
  it('父分类、叶子与清除类型均使用Console精确参数，选择不丢失', async () => {
    const f = fixture(['resource:r0', 'filter', 'type:MEDIA', 'all', 'filter', 'type:MEDIA', 'type:IMAGE', 'filter', 'all', 'done']);
    expect(await f.run()).toEqual(['r0']);
    expect(f.calls).toContainEqual({ category: 1, status: 1, subjectType: 1 });
    expect(f.calls).toContainEqual({ skip: 0, limit: 50, isSelf: 1, subjectType: 1, resourceType: '素材' });
    expect(f.calls).toContainEqual({ skip: 0, limit: 50, isSelf: 1, subjectType: 1, resourceTypeCode: 'IMAGE', resourceTypeCategory: 2 });
    expect(f.calls.at(-1)).toEqual({ skip: 0, limit: 50, isSelf: 1, subjectType: 1 });
  });
  it('空选完成不返回、取消有受控错误，且零写接口', async () => {
    const f = fixture(['done', 'cancel']);
    await expect(f.run()).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SELECTION_CANCELLED' });
    expect(f.calls).toHaveLength(1);
  });
  it('Ctrl+C转换为受控取消，不泄露原始错误', async () => {
    const f = fixture([]); f.choose.mockRejectedValue(Object.assign(new Error('PRIVATE_PROMPT_DETAIL'), { name: 'ExitPromptError' }));
    await expect(f.run()).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SELECTION_CANCELLED', message: '已取消单品选择' });
  });
  it.each([
    ['ret', (p: any) => { p.ret = 1; }], ['errCode', (p: any) => { p.errCode = '0'; }], ['skip', (p: any) => { p.data.skip = 1; }],
    ['limit', (p: any) => { p.data.limit = 100; }], ['short', (p: any) => { p.data.dataList.pop(); }],
    ['owner-type', (p: any) => { p.data.dataList[0].userId = '7'; }], ['missing-path', (p: any) => { delete p.data.dataList[0].resourceType; }],
    ['duplicate', (p: any) => { p.data.dataList[1] = p.data.dataList[0]; }],
  ])('坏列表%s整次失败，不进入选择', async (_name, mutate) => {
    const f = fixture(['cancel']); f.apis.listResources = async () => { const p = ok({ skip: 0, limit: 50, totalItem: 50, dataList: Array.from({ length: 50 }, (_, i) => row(i)) }); mutate(p); return p; };
    await expect(f.run()).rejects.toMatchObject({ code: 'COLLECTION_ITEM_PICKER_RESPONSE_INVALID' }); expect(f.choose).not.toHaveBeenCalled();
  });
  it('分页总数漂移与跨页重复不能被缓存掩盖', async () => {
    for (const variant of ['total', 'duplicate']) {
      const f = fixture(['next', 'cancel']); const actual = f.apis.listResources!;
      f.apis.listResources = async (p) => { const result = await actual(p) as any; if (p.skip === 50) {
        if (variant === 'total') result.data.totalItem = 52; else result.data.dataList[0] = row(0);
      } return result; };
      await expect(f.run()).rejects.toMatchObject({ code: 'COLLECTION_ITEM_PICKER_RESPONSE_INVALID' });
    }
  });
  it('100项上限不阻止移除、取消或完成，不会自动分批', async () => {
    const f = fixture([...Array.from({ length: 50 }, (_, i) => `resource:r${i}`), 'next',
      ...Array.from({ length: 50 }, (_, i) => `resource:r${i + 50}`), 'next', 'resource:r100', 'review', 'remove:r0', 'back', 'resource:r100', 'done'], 101);
    expect(await f.run()).toEqual(Array.from({ length: 100 }, (_, i) => `r${i + 1}`));
    expect(f.calls).toHaveLength(3);
    expect(f.menus.some((m: any) => m.choices.some((c: any) => c.value === 'resource:r100' && c.disabled === '已选满100项'))).toBe(true);
  });
  it('资格不符与已有目录项明确禁选，即使替身强选也不能加入', async () => {
    const f = fixture(['resource:r0', 'resource:r1', 'resource:r2', 'resource:r3', 'resource:r4', 'resource:r5', 'done'], 6);
    f.apis.listResources = async () => ok({ skip: 0, limit: 50, totalItem: 6, dataList: [
      { ...row(0), userId: 8 }, { ...row(1), subjectType: 4 }, { ...row(2), status: 4 }, { ...row(3), latestVersion: '' }, row(4), row(5)] });
    expect(await pickCollectionItemSources({ userId: 7, existingIds: ['r4'], apis: f.apis, choose: f.choose })).toEqual(['r5']);
    const menu = (f.menus[0] as any).choices;
    expect(menu.slice(0, 5).map((c: any) => c.disabled)).toEqual(['非当前账号', '不是单资源', '未上架', '没有最新版本', '已在目录草稿']);
  });
  it('全部展示字段安全引用，包括补充平面Cf；原始数据不改写', async () => {
    const f = fixture(['resource:r0', 'done'], 1), title = `x\n\u001b[31m${String.fromCodePoint(0xe0001)}\u202ey`;
    f.apis.listResources = async () => ok({ skip: 0, limit: 50, totalItem: 1, dataList: [{ ...row(0), resourceTitle: title, resourceType: ['上\u009b级', '叶子'] }] });
    expect(await f.run()).toEqual(['r0']); const label = (f.menus[0] as any).choices[0].name as string;
    expect(label).toContain('\\n\\u001b[31m\\udb40\\udc01\\u202ey'); expect(label).toContain('上\\u009b级 / 叶子');
    expect(label).not.toMatch(/[\p{Cc}\p{Cf}]/u);
  });
  it('取消修改类型保留旧筛选，搜索清空回到首页但已选仍在', async () => {
    const f = fixture(['resource:r0', 'filter', 'cancel', 'search', 'search', 'done']); f.inputs.push('');
    expect(await f.run()).toEqual(['r0']); expect(f.calls.filter((c) => 'skip' in c)).toEqual([
      { skip: 0, limit: 50, isSelf: 1, subjectType: 1 }, { skip: 0, limit: 50, isSelf: 1, subjectType: 1, keywords: 'new search' },
      { skip: 0, limit: 50, isSelf: 1, subjectType: 1 }]);
  });
  it('空结果仍可搜索/筛选/取消，无伪造来源', async () => {
    const f = fixture(['cancel'], 0); await expect(f.run()).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SELECTION_CANCELLED' });
    expect((f.menus[0] as any).choices.some((c: any) => c.value === 'next')).toBe(false);
  });
  it.each([null, { ret: 1, errCode: 0, data: [] }, ok([{ code: 'X', name: '坏节点', children: null }]), ok([{ code: 'X', name: '一', children: [{ code: 'X', name: '重复', children: [] }] }])])('坏类型响应安全失败 %#', async (response) => {
    const f = fixture(['filter']); f.apis.resourceTypes = async () => response;
    await expect(f.run()).rejects.toMatchObject({ code: 'COLLECTION_ITEM_PICKER_RESPONSE_INVALID' });
  });
  it.each([0, 1])('默认SDK列表精确GET/query、ret=%i仍由领域信封复核', async (ret) => {
    const calls: unknown[] = []; const f = fixture(['resource:r0', 'done'], 1); delete f.apis.listResources;
    FUtil.Axios.defaults.adapter = async (config) => {
      calls.push({ method: config.method, url: config.url, params: structuredClone(config.params) });
      return { config, status: 200, statusText: 'OK', headers: {}, data: { ret, errCode: 0, data: { skip: 0, limit: 50, totalItem: 1, dataList: [row(0)] } } };
    };
    if (ret) await expect(f.run()).rejects.toMatchObject({ code: 'COLLECTION_ITEM_PICKER_RESPONSE_INVALID' }); else expect(await f.run()).toEqual(['r0']);
    expect(calls).toEqual([{ method: 'get', url: '/v2/resources', params: { skip: 0, limit: 50, isSelf: 1, subjectType: 1 } }]);
  });
  it('默认SDK类型树与筛选查询均由tools-lib发出，不复制请求实现', async () => {
    const f = fixture(['filter', 'type:MEDIA', 'type:IMAGE', 'resource:r0', 'done'], 1); delete f.apis.listResources; delete f.apis.resourceTypes;
    const calls: unknown[] = [];
    FUtil.Axios.defaults.adapter = async (config) => {
      calls.push({ method: config.method, url: config.url, params: structuredClone(config.params) });
      return { config, status: 200, statusText: 'OK', headers: {}, data: ok(config.url === '/v2/resources/types/listSimpleByGroup'
        ? [{ code: 'MEDIA', name: '素材', children: [{ code: 'IMAGE', name: '图片', children: [] }] }]
        : { skip: 0, limit: 50, totalItem: 1, dataList: [row(0)] }) };
    };
    expect(await f.run()).toEqual(['r0']);
    expect(calls).toEqual([
      { method: 'get', url: '/v2/resources', params: { skip: 0, limit: 50, isSelf: 1, subjectType: 1 } },
      { method: 'get', url: '/v2/resources/types/listSimpleByGroup', params: { category: 1, status: 1, subjectType: 1 } },
      { method: 'get', url: '/v2/resources', params: { skip: 0, limit: 50, isSelf: 1, subjectType: 1, resourceTypeCode: 'IMAGE', resourceTypeCategory: 2 } },
    ]);
  });
});
