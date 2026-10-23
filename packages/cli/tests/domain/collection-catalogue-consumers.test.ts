import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { setCollectionCollectRules } from '../../src/domain/collection/collectRules';
import { addCollectionDraftItems, listCollectionDraftItems, moveCollectionDraftItem, removeCollectionDraftItems, renameCollectionDraftItem, sortCollectionDraftItems } from '../../src/domain/collection/items';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

const item = (index: number) => ({ itemId: `i${index}`, itemTitle: `title${index}`, sortId: index, mountResourceInfo: { resourceId: `r${index}` } });
const page = (dataList: unknown[], totalItem = dataList.length, skip = 0) => ({ ret: 0, errCode: 0, data: { skip, limit: 100, totalItem, dataList } });
const invalid = { code: 'COLLECTION_ITEMS_RESPONSE_INVALID' };
const current = { serializeStatus: 0, status: 0, conditionType: 1, filterConditions: [] };
const absentItems = async ({ resourceIds }: Record<string, unknown>) => ({
  ret: 0, errCode: 0,
  data: String(resourceIds).split(',').map((resourceId) => ({ resourceId, isExists: false })),
});
const malformed = [
  ['short nonfinal page', page([item(1)], 101)],
  ['alias resource identity', page([{ itemId: 'i1', resourceId: 'r1', itemTitle: 'title1', sortId: 1 }])],
  ['duplicate item identity', page([item(1), item(1)])],
  ['numeric title', page([{ ...item(1), itemTitle: 7 }])],
  ['string sort', page([{ ...item(1), sortId: '1' }])],
  ['business failure', { ...page([item(1)]), errCode: 1 }],
] as const;

describe('目录消费者使用同一完整读取契约', () => {
  let cwd: string;
  let homeDir: string;
  const info = async ({ resourceIdOrName }: Record<string, unknown>) => ({ ret: 0, errCode: 0, data: resourceIdOrName === 'collection_1'
    ? { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'T', subjectType: [4], userId: 7, status: 0 }
    : { resourceId: 'r2', resourceName: 'alice/r2', resourceTitle: 'new', subjectType: 1, userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [] } });

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-catalogue-consumer-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-catalogue-consumer-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  it.each(malformed)('列表拒绝 %s', async (_label, response) => {
    await expect(listCollectionDraftItems({ cwd, homeDir, selector: 'id:collection_1', apis: { info, getDraftItems: async () => response } })).rejects.toMatchObject(invalid);
  });

  it('列表按总数读完101项并保留搜索排序和nested展示字段', async () => {
    const requests: Record<string, unknown>[] = [];
    const result = await listCollectionDraftItems({ cwd, homeDir, selector: 'id:collection_1', search: '  旅行  ', sortField: 'createDate', sortType: -1, apis: {
      info, getDraftItems: async (params) => {
        requests.push(params);
        const skip = params.skip as number;
        const list = Array.from({ length: Math.min(100, 101 - skip) }, (_, i) => ({
          ...item(skip + i),
          ...(skip + i === 0 ? { mountResourceInfo: { ...item(0).mountResourceInfo, resourceName: 'alice/a', resourceTitle: 'source title' } } : {}),
        }));
        return page(list, 101, skip);
      },
    } });
    expect(result).toHaveLength(101);
    expect(result[0]).toMatchObject({ itemId: 'i0', resourceId: 'r0', resourceName: 'alice/a', resourceTitle: 'source title' });
    expect(result[100]?.itemId).toBe('i100');
    expect(requests).toEqual([0, 100].map((skip) => ({ resourceId: 'collection_1', skip, limit: 100, keywords: '旅行', sortField: 'createDate', sortType: -1, isLoadLatestVersionInfo: 1 })));
  });

  it('添加前目录短页不能被当作完整判重结果，更不能写入', async () => {
    const add = vi.fn(async () => ({}));
    const checkItems = vi.fn(absentItems);
    await expect(addCollectionDraftItems({ cwd, homeDir, selector: 'id:collection_1', sources: ['id:r2'], yes: true, apis: {
      info, getRules: async () => ({ ret: 0, errCode: 0, data: current }), getDraftItems: async () => page([item(1)], 101), checkItems, addDraftItems: add,
    } })).rejects.toMatchObject(invalid);
    expect(add).not.toHaveBeenCalled();
    expect(checkItems).not.toHaveBeenCalled();
  });

  it('添加后的短页不能仅因出现目标资源就报告成功', async () => {
    let written = false;
    const add = vi.fn(async () => { written = true; return { ret: 0, errCode: 0, data: {
      addSuccessfulItems: [{ resourceId: 'r2', itemTitle: 'new' }], addFailedItems: [], ignoreItems: [],
    } }; });
    const getDraftItems = vi.fn(async () => written ? page([item(2)], 101) : page([]));
    await expect(addCollectionDraftItems({ cwd, homeDir, selector: 'id:collection_1', sources: ['id:r2'], yes: true, apis: {
      info, getRules: async () => ({ ret: 0, errCode: 0, data: current }), getDraftItems, checkItems: absentItems, addDraftItems: add,
    } })).rejects.toMatchObject({ code: 'COLLECTION_ITEM_RESULT_UNKNOWN' });
    expect(add).toHaveBeenCalledTimes(1);
    expect(getDraftItems).toHaveBeenCalledTimes(2);
  });

  it('编辑后的目录错误信封不能仅因目标标题匹配就报告成功', async () => {
    let written = false;
    const rename = vi.fn(async () => { written = true; return { ret: 0, errCode: 0, data: null }; });
    const getDraftItems = vi.fn(async () => written ? { ...page([{ ...item(1), itemTitle: 'changed' }]), ret: 1 } : page([item(1)]));
    await expect(renameCollectionDraftItem({ cwd, homeDir, selector: 'id:collection_1', itemId: 'i1', title: 'changed', yes: true, apis: {
      info, getRules: async () => ({ ret: 0, errCode: 0, data: current }), getDraftItems, renameDraftItems: rename,
    } })).rejects.toMatchObject({ code: 'COLLECTION_ITEM_RESULT_UNKNOWN' });
    expect(rename).toHaveBeenCalledTimes(1);
    expect(getDraftItems).toHaveBeenCalledTimes(3);
  });

  it.each(['remove', 'move', 'sort'] as const)('%s写后目录无效不能报告成功', async (operation) => {
    let written = false;
    const write = vi.fn(async () => { written = true; return { ret: 0, errCode: 0, data: null }; });
    const getDraftItems = vi.fn(async () => written ? page([], 101) : page([item(1), item(2)]));
    const input = { cwd, homeDir, selector: 'id:collection_1', yes: true, apis: {
      info, getRules: async () => ({ ret: 0, errCode: 0, data: current }),
      getDraftItems,
      removeDraftItems: write, moveDraftItems: write, reorderDraftItems: write,
    } };
    const result = operation === 'remove' ? removeCollectionDraftItems({ ...input, itemIds: ['i1'] })
      : operation === 'move' ? moveCollectionDraftItem({ ...input, itemId: 'i1', after: 'i2' })
        : sortCollectionDraftItems({ ...input, by: 'title', direction: 'asc' });
    await expect(result).rejects.toMatchObject({ code: 'COLLECTION_ITEM_RESULT_UNKNOWN' });
    expect(write).toHaveBeenCalledTimes(1);
    expect(getDraftItems).toHaveBeenCalledTimes(3);
  });

  it('完整目录第二页存在差异时禁止开启自动规则', async () => {
    writeFileSync(path.join(cwd, 'rules.json'), JSON.stringify([{ field: 'title', operator: 'INCLUDES', value: '旅行' }]));
    const set = vi.fn(async () => ({}));
    const requests: Record<string, unknown>[] = [];
    const request = (changed: boolean) => async (params: Record<string, unknown>) => {
      requests.push(params);
      const skip = params.skip as number;
      const list = Array.from({ length: Math.min(100, 101 - skip) }, (_, i) => item(skip + i));
      if (changed && skip === 100) list[0]!.itemTitle = 'unpublished';
      return page(list, 101, skip);
    };
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'all', rulesFile: 'rules.json', yes: true, apis: {
      info, getRules: async () => ({ ret: 0, errCode: 0, data: current }), getPublishedItems: request(false), getDraftItems: request(true), setRules: set,
    } })).rejects.toMatchObject({ code: 'COLLECTION_AUTO_DRAFT_DIRTY' });
    expect(requests.filter(({ skip }) => skip === 100)).toHaveLength(2);
    expect(set).not.toHaveBeenCalled();
  });

  it('来源展示名变化不等于手工目录差异，不阻止正常开启', async () => {
    writeFileSync(path.join(cwd, 'rules.json'), JSON.stringify([{ field: 'title', operator: 'INCLUDES', value: '旅行' }]));
    let state = current;
    const set = vi.fn(async (params: Record<string, unknown>) => { state = { ...current, ...params } as typeof current; return { ret: 0, errCode: 0, data: null }; });
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'all', rulesFile: 'rules.json', yes: true, apis: {
      info, getRules: async () => ({ ret: 0, errCode: 0, data: state }), getPublishedItems: async () => page([item(1)]),
      getDraftItems: async () => page([{ ...item(1), mountResourceInfo: { ...item(1).mountResourceInfo, resourceName: 'alice/new', resourceTitle: 'new display' } }]), setRules: set,
    } })).resolves.toMatchObject({ status: 1 });
    expect(set).toHaveBeenCalledTimes(1);
  });

  it.each(malformed)('开启规则时不能把相同但无效的目录 %s 当作无差异', async (_label, response) => {
    writeFileSync(path.join(cwd, 'rules.json'), JSON.stringify([{ field: 'title', operator: 'INCLUDES', value: '旅行' }]));
    let state = current;
    const set = vi.fn(async (params: Record<string, unknown>) => { state = { ...current, ...params } as typeof current; return {}; });
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'all', rulesFile: 'rules.json', yes: true, apis: {
      info, getRules: async () => ({ ret: 0, errCode: 0, data: state }), getPublishedItems: async () => response, getDraftItems: async () => response, setRules: set,
    } })).rejects.toMatchObject(invalid);
    expect(set).not.toHaveBeenCalled();
  });
});
