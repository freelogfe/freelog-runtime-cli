import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { addCollectionDraftItems } from '../../src/domain/collection/items';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { createCollectionIdentity, readCollectionIdentity } from '../../src/local/identity';
import { mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft } from '../../src/domain/collection/form';

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const success = (resourceId: string) => ({ resourceId, itemTitle: resourceId });
const ignored = (resourceId: string) => ({ ...success(resourceId), itemId: `item_${resourceId}` });
const failed = (resourceId: string, reason = '不满足收录条件') => ({ resourceId, reason });
const groups = (addSuccessfulItems: unknown[] = [], addFailedItems: unknown[] = [], ignoreItems: unknown[] = []) =>
  ok({ addSuccessfulItems, addFailedItems, ignoreItems });
const row = (resourceId: string, itemId = `item_${resourceId}`) =>
  ({ itemId, itemTitle: resourceId, sortId: 1, mountResourceInfo: { resourceId } });
const page = (dataList: unknown[]) => ok({ skip: 0, limit: 100, totalItem: dataList.length, dataList });

// Include binary bytes and empty directories, not just parsed .freelog JSON.
function snapshot(root: string): unknown[] {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => {
    const file = path.join(root, entry.name);
    return [entry.name, entry.isDirectory() ? snapshot(file) : readFileSync(file).toString('base64')];
  });
}

describe('C03.R01–R04 添加单品结果不能由目录存在推断', () => {
  let cwd: string, homeDir: string;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-item-add-result-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-item-add-result-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1', resourceName: 'alice/collection',
      name: 'collection', title: '本地标题缓存', typeCode: 'CT001', env: 'test' });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: {
      info: async () => ok({ resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0, latestVersion: '' }),
      resourceTypes: async () => ok([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
      getByCode: async () => ok({ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], attrs: [], resourceConfig: { supportOptionalConfig: 2 } }),
      filesInfo: async () => ok({ metaInfoArray: [] }),
    } });
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '目录命令不得改动的未发布稿',
      properties: [{ key: 'copyright', name: '版权', value: 'CC', description: '保留' }],
      options: [{ key: 'theme', name: '主题', kind: 'select', values: ['light', 'dark'], description: '' }],
      dependencies: [{ resourceId: 'upstream_local', versionRange: '^1.0.0' }],
    }));
    expect(readCollectionIdentity(cwd, 1)).toMatchObject({ resourceId: 'collection_1', title: '本地标题缓存' });
    expect(readCollectionFormDraft(cwd, 'collection_1')?.form).toMatchObject({ description: '目录命令不得改动的未发布稿',
      properties: [{ key: 'copyright', value: 'CC' }], options: [{ key: 'theme', values: ['light', 'dark'] }],
      dependencies: [{ resourceId: 'upstream_local', versionRange: '^1.0.0' }],
    });
    mkdirSync(path.join(cwd, 'empty'));
    writeFileSync(path.join(cwd, 'binary'), Buffer.from([0, 255, 254]));
  });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  function fixture(response: unknown, after: unknown[], before: unknown[] = []) {
    const beforeLocal = snapshot(cwd), beforeHome = snapshot(homeDir);
    const existing = new Set(before.map((entry) => (entry as ReturnType<typeof row>).mountResourceInfo.resourceId));
    let written = false;
    const writes: Record<string, unknown>[] = [];
    const reads: Record<string, unknown>[] = [];
    const addDraftItems = vi.fn(async (params: Record<string, unknown>) => {
      writes.push(params); written = true;
      if (response instanceof Error) throw response;
      return response;
    });
    const input = { cwd, homeDir, selector: 'id:collection_1', sources: ['id:a', 'id:b', 'id:c'], yes: true,
      apis: {
        info: async ({ resourceIdOrName }: Record<string, unknown>) => ok(resourceIdOrName === 'collection_1'
          ? { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0 }
          : { resourceId: resourceIdOrName, resourceName: `alice/${resourceIdOrName}`, resourceTitle: resourceIdOrName, subjectType: 1, userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [] }),
        getRules: async () => ok(null),
        getDraftItems: async (params: Record<string, unknown>) => { reads.push(params); return page(written ? after : before); },
        checkItems: async ({ resourceIds }: Record<string, unknown>) => ok(String(resourceIds).split(',')
          .map((resourceId) => ({ resourceId, isExists: existing.has(resourceId) }))),
        addDraftItems,
      } };
    return { input, writes, reads, unchangedLocal: () => {
      expect(snapshot(cwd)).toEqual(beforeLocal); expect(snapshot(homeDir)).toEqual(beforeHome);
    } };
  }

  it('混合分组按请求顺序返回，不把ignore或失败列为added', async () => {
    const f = fixture(groups([success('c')], [failed('b')], [ignored('a')]), [row('a'), row('c')]);
    const result = await addCollectionDraftItems(f.input);
    expect(result).toEqual({ added: ['c'], unchanged: ['a'], failed: [failed('b')] });
    expect(f.writes).toEqual([{ resourceId: 'collection_1', isPublish: 0,
      addCollectionItems: ['a', 'b', 'c'].map((resourceId) => ({ resourceId, itemTitle: resourceId, authExcludedItems: [] })) }]);
    expect(f.reads).toHaveLength(2); f.unchangedLocal();
  });

  it.each(['success', 'ignore', 'failure'] as const)('全%s保持各自语义，不推断新增', async (kind) => {
    const ids = ['c', 'b', 'a'];
    const f = fixture(groups(kind === 'success' ? ids.map(success) : [], kind === 'failure' ? ids.map((id) => failed(id)) : [], kind === 'ignore' ? ids.map(ignored) : []),
      kind === 'failure' ? [] : ids.map((id) => row(id)));
    const result = await addCollectionDraftItems(f.input);
    expect(result).toEqual({ added: kind === 'success' ? ['a', 'b', 'c'] : [], unchanged: kind === 'ignore' ? ['a', 'b', 'c'] : [],
      failed: kind === 'failure' ? ['a', 'b', 'c'].map((id) => failed(id)) : [] });
    expect(f.writes).toHaveLength(1); f.unchangedLocal();
  });

  it('写前已有来源不进入POST，别名重复也不重复提交同一资源', async () => {
    const f = fixture(groups([success('b')]), [row('a'), row('b')], [row('a')]);
    f.input.sources = ['id:a', 'id:b', 'name:alice/b'];
    const original = f.input.apis.info;
    f.input.apis.info = (params) => original({ ...params, resourceIdOrName: params.resourceIdOrName === 'alice/b' ? 'b' : params.resourceIdOrName });
    expect(await addCollectionDraftItems(f.input)).toEqual({ added: ['b'], unchanged: ['a'], failed: [] });
    expect(f.writes[0].addCollectionItems).toEqual([{ resourceId: 'b', itemTitle: 'b', authExcludedItems: [] }]); f.unchangedLocal();
  });

  it('全都已在草稿时不调用POST', async () => {
    const f = fixture(undefined, [], ['a', 'b', 'c'].map((id) => row(id)));
    expect(await addCollectionDraftItems(f.input)).toEqual({ added: [], unchanged: ['a', 'b', 'c'], failed: [] });
    expect(f.writes).toEqual([]); f.unchangedLocal();
  });

  it('写前已有项和服务端忽略项交错时，未变更仍按来源输入顺序', async () => {
    const f = fixture(groups([success('c')], [], [ignored('a')]), [row('a'), row('b'), row('c')], [row('b')]);
    expect(await addCollectionDraftItems(f.input)).toEqual({ added: ['c'], unchanged: ['a', 'b'], failed: [] });
    expect(f.writes[0].addCollectionItems).toEqual(['a', 'c'].map((resourceId) => ({ resourceId, itemTitle: resourceId, authExcludedItems: [] })));
    f.unchangedLocal();
  });

  const valid = () => groups(['a', 'b', 'c'].map(success));
  it.each([
    ['ret失败', { ...valid(), ret: 1 }], ['errCode失败', { ...valid(), errCode: 1 }],
    ['缺ret', { errCode: 0, data: valid().data }], ['缺errCode', { ret: 0, data: valid().data }],
    ['字符串ret', { ...valid(), ret: '0' }], ['字符串errCode', { ...valid(), errCode: '0' }],
    ['缺分组', ok({ addSuccessfulItems: ['a', 'b', 'c'].map(success), addFailedItems: [] })],
    ['非数组组', ok({ addSuccessfulItems: ['a', 'b', 'c'].map(success), addFailedItems: {}, ignoreItems: [] })],
    ['遗漏ID', groups([success('a'), success('b')])],
    ['额外ID', groups(['a', 'b', 'c', 'extra'].map(success))],
    ['组内重复', groups(['a', 'b', 'c', 'a'].map(success))],
    ['跨组重复', groups(['a', 'b', 'c'].map(success), [failed('a')])],
    ['成功缺标题', groups([{ resourceId: 'a' }, success('b'), success('c')])],
    ['失败坏原因', groups([success('b'), success('c')], [{ resourceId: 'a', reason: 1 }])],
    ['忽略缺itemId', groups([success('b'), success('c')], [], [success('a')])],
    ['空ID', groups([success(''), success('b'), success('c')])],
    ['null行', groups([null, success('b'), success('c')])], ['null响应', null], ['null数据', ok(null)],
    ['data别名', ok({ dataList: valid().data })], ['裸数组', ['a', 'b', 'c'].map(success)],
  ])('无效结果%s即使目录全存在也UNKNOWN且不重试', async (_name, response) => {
    const f = fixture(response, ['a', 'b', 'c'].map((id) => row(id)));
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_RESULT_UNKNOWN' });
    expect(f.writes).toHaveLength(1); f.unchangedLocal();
  });

  it.each([
    ['成功缺失', groups(['a', 'b', 'c'].map(success)), [row('a'), row('b')]],
    ['忽略itemId错配', groups([success('b'), success('c')], [], [ignored('a')]), [row('a', 'another'), row('b'), row('c')]],
    ['失败却存在', groups([success('b'), success('c')], [failed('a')]), [row('a'), row('b'), row('c')]],
    ['来源重复', groups(['a', 'b', 'c'].map(success)), [row('a'), row('a', 'second_a'), row('b'), row('c')]],
  ])('分组与回读矛盾%s为UNKNOWN，不改成成功或重发', async (_name, response, after) => {
    const f = fixture(response, after as unknown[]);
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_RESULT_UNKNOWN' });
    expect(f.writes).toHaveLength(1); expect(f.reads).toHaveLength(2); f.unchangedLocal();
  });

  it('写入异常即使可能已变远端也只给安全UNKNOWN，不泄露或重发', async () => {
    const f = fixture(new Error('Authorization=secret-token raw private response'), ['a', 'b', 'c'].map((id) => row(id)));
    const error = await addCollectionDraftItems(f.input).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'COLLECTION_ITEM_RESULT_UNKNOWN', message: expect.stringContaining('collection item list') });
    expect(String(error)).not.toContain('secret-token'); expect(f.writes).toHaveLength(1); f.unchangedLocal();
  });
});
