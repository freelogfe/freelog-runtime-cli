import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors';
import { collectionCatalogueFingerprint, readCollectionCatalogue, type CollectionCatalogueItem } from '../../src/domain/collection/catalogue';

const resourceId = 'collection_1';
const invalid = { code: 'COLLECTION_ITEMS_RESPONSE_INVALID', message: '平台目录响应不完整或格式无效，无法核验完整目录。' };
const item = (index: number) => ({ itemId: `item_${index}`, itemTitle: `单品 ${index}`, sortId: index, mountResourceInfo: { resourceId: `resource_${index}` } });
const items = (count: number, offset = 0) => Array.from({ length: count }, (_, index) => item(index + offset));
const page = (dataList: unknown[], totalItem = dataList.length, skip = 0, limit = 100) => ({ ret: 0, errCode: 0, data: { skip, limit, totalItem, dataList } });
const normalized = (count: number, offset = 0): CollectionCatalogueItem[] => items(count, offset).map(({ itemId, itemTitle, sortId, mountResourceInfo }) => ({ itemId, resourceId: mountResourceInfo.resourceId, itemTitle, sortId }));

describe('合集目录完整读取', () => {
  it.each([0, 2, 100, 101, 200])('按 totalItem 完整读取 %i 项并保留列表顺序', async (count) => {
    const requests: Record<string, unknown>[] = [];
    const request = vi.fn(async (params: Record<string, unknown>) => {
      requests.push(params);
      const skip = params.skip as number;
      return page(items(Math.min(100, count - skip), skip), count, skip);
    });
    await expect(readCollectionCatalogue(resourceId, request)).resolves.toEqual(normalized(count));
    expect(requests).toEqual(Array.from({ length: Math.max(1, Math.ceil(count / 100)) }, (_, index) => ({ resourceId, skip: index * 100, limit: 100, sortField: 'sortId', sortType: 1 })));
  });

  it('仅使用 nested resourceId，保留空标题/负排序且不生成授权字段', async () => {
    const raw = { ...item(1), itemTitle: '', sortId: -1.5, resourceId: 'wrong-top-level', authExcludedItems: ['untrusted'], other: true };
    await expect(readCollectionCatalogue(resourceId, async () => page([raw]))).resolves.toEqual([{ itemId: 'item_1', resourceId: 'resource_1', itemTitle: '', sortId: -1.5 }]);
  });

  it('展示字段只取nested实际字符串，不用顶层别名或强制转换补值', async () => {
    const raw = { ...item(1), resourceName: 'wrong', resourceTitle: 'wrong', mountResourceInfo: { resourceId: 'resource_1', resourceName: 1, resourceTitle: null } };
    await expect(readCollectionCatalogue(resourceId, async () => page([raw]))).resolves.toEqual(normalized(1, 1));
  });

  it.each([
    ['null', null], ['array envelope', []], ['missing ret', { errCode: 0, data: page([]).data }],
    ['missing errCode', { ret: 0, data: page([]).data }], ['ret error', { ...page([]), ret: 1, message: 'raw-secret' }],
    ['errCode error', { ...page([]), errCode: 1, message: 'raw-secret' }], ['ret string', { ...page([]), ret: '0' }],
    ['errCode string', { ...page([]), errCode: '0' }], ['missing data', { ret: 0, errCode: 0 }],
    ['array data', { ret: 0, errCode: 0, data: [] }], ['missing dataList', { ret: 0, errCode: 0, data: { skip: 0, limit: 100, totalItem: 0 } }],
    ['list fallback', { ret: 0, errCode: 0, data: { skip: 0, limit: 100, totalItem: 0, list: [] } }],
  ])('拒绝不可信信封 %s 并输出固定安全错误', async (_label, response) => {
    await expect(readCollectionCatalogue(resourceId, async () => response)).rejects.toMatchObject(invalid);
  });

  it.each([
    ['string skip', { skip: '0' }], ['wrong skip', { skip: 1 }], ['string limit', { limit: '100' }], ['wrong limit', { limit: 99 }],
    ['string total', { totalItem: '0' }], ['negative total', { totalItem: -1 }], ['fraction total', { totalItem: 0.5 }],
    ['unsafe total', { totalItem: Number.MAX_SAFE_INTEGER + 1 }], ['NaN total', { totalItem: NaN }], ['infinite total', { totalItem: Infinity }],
    ['missing total', { totalItem: undefined }],
  ])('拒绝分页元数据 %s', async (_label, patch) => {
    await expect(readCollectionCatalogue(resourceId, async () => ({ ...page([]), data: { ...page([]).data, ...patch } }))).rejects.toMatchObject(invalid);
  });

  it.each([
    ['short first nonfinal page', page(items(99), 101)], ['empty nonfinal page', page([], 101)],
    ['extra item for zero total', page(items(1), 0)], ['extra final item', page(items(2), 1)],
    ['over limit', page(items(101), 101)],
  ])('拒绝条数不完整 %s，不能当作完整目录', async (_label, response) => {
    const request = vi.fn().mockResolvedValueOnce(response).mockResolvedValue(page([]));
    await expect(readCollectionCatalogue(resourceId, request)).rejects.toMatchObject(invalid);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['changed total', page(items(2, 100), 102, 100)], ['short final page', page([], 101, 100)],
    ['wrong second offset', page(items(1, 100), 101, 0)], ['wrong second limit', page(items(1, 100), 101, 100, 1)],
    ['duplicate across pages', page([item(0)], 101, 100)], ['second envelope failure', { ...page(items(1, 100), 101, 100), ret: 1 }],
  ])('第二页 %s 时整体拒绝', async (_label, second) => {
    const request = vi.fn().mockResolvedValueOnce(page(items(100), 101)).mockResolvedValueOnce(second);
    await expect(readCollectionCatalogue(resourceId, request)).rejects.toMatchObject(invalid);
    expect(request.mock.calls.map(([params]) => params)).toEqual([0, 100].map((skip) => ({ resourceId, skip, limit: 100, sortField: 'sortId', sortType: 1 })));
  });

  it('同页重复 itemId 即使资源与标题不同也拒绝', async () => {
    await expect(readCollectionCatalogue(resourceId, async () => page([item(0), { ...item(1), itemId: 'item_0' }]))).rejects.toMatchObject(invalid);
  });

  it.each([
    ['null item', null], ['array item', []], ['missing itemId', { ...item(0), itemId: undefined }],
    ['numeric itemId', { ...item(0), itemId: 0 }], ['empty itemId', { ...item(0), itemId: '' }], ['blank itemId', { ...item(0), itemId: ' ' }],
    ['missing title', { ...item(0), itemTitle: undefined }], ['numeric title', { ...item(0), itemTitle: 1 }],
    ['missing nested identity', { itemId: 'i', resourceId: 'r', itemTitle: 't', sortId: 0 }],
    ['null nested identity', { ...item(0), mountResourceInfo: null }], ['array nested identity', { ...item(0), mountResourceInfo: [] }],
    ['empty nested resourceId', { ...item(0), mountResourceInfo: { resourceId: '' } }],
    ['blank nested resourceId', { ...item(0), mountResourceInfo: { resourceId: ' ' } }],
    ['numeric nested resourceId', { ...item(0), mountResourceInfo: { resourceId: 1 } }],
    ['missing sort', { ...item(0), sortId: undefined }], ['numeric string sort', { ...item(0), sortId: '0' }],
    ['NaN sort', { ...item(0), sortId: NaN }], ['infinite sort', { ...item(0), sortId: Infinity }],
  ])('拒绝单品类型/身份错误 %s', async (_label, raw) => {
    await expect(readCollectionCatalogue(resourceId, async () => page([raw]))).rejects.toMatchObject(invalid);
  });

  it('请求异常原样上抛且不重试', async () => {
    const thrown = new Error('request-secret');
    const request = vi.fn().mockResolvedValueOnce(page(items(100), 101)).mockRejectedValueOnce(thrown);
    await expect(readCollectionCatalogue(resourceId, request)).rejects.toBe(thrown);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('格式错误使用 CliError 且不会转发服务端详情', async () => {
    const error = await readCollectionCatalogue(resourceId, async () => ({ ...page([]), ret: 1, message: 'raw-secret' })).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject(invalid);
    expect(JSON.stringify(error)).not.toContain('raw-secret');
  });
});

describe('合集目录指纹', () => {
  it('以固定字段顺序编码规范化列表再计算 SHA-256', () => {
    const value = normalized(2);
    const reordered = [{ sortId: 0, itemTitle: '单品 0', resourceId: 'resource_0', itemId: 'item_0' }, value[1]!];
    const expected = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    expect(collectionCatalogueFingerprint(value)).toBe(expected);
    expect(collectionCatalogueFingerprint(reordered)).toBe(expected);
    expect(collectionCatalogueFingerprint([])).toBe(createHash('sha256').update('[]').digest('hex'));
  });

  it('顺序和每个观察字段变化都会改变指纹，且不修改输入', () => {
    const value = normalized(2);
    const before = JSON.stringify(value);
    const baseline = collectionCatalogueFingerprint(value);
    for (const changed of [
      [...value].reverse(), [{ ...value[0]!, itemId: 'new' }, value[1]!], [{ ...value[0]!, resourceId: 'new' }, value[1]!],
      [{ ...value[0]!, itemTitle: 'new' }, value[1]!], [{ ...value[0]!, sortId: 4 }, value[1]!],
    ]) expect(collectionCatalogueFingerprint(changed)).not.toBe(baseline);
    expect(JSON.stringify(value)).toBe(before);
  });

  it('可变来源标题与授权标识的展示变化不参与指纹', () => {
    const value = normalized(2);
    const displayChanged = value.map((entry) => ({ ...entry, resourceName: 'alice/renamed', resourceTitle: 'changed source title' }));
    expect(collectionCatalogueFingerprint(displayChanged)).toBe(collectionCatalogueFingerprint(value));
  });
});
