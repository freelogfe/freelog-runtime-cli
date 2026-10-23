import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { createCollection, type CollectionCreateApis } from '../../src/domain/collection/create';
import { bindCollection } from '../../src/domain/collection/bind';
import { getCollectionTypeInfo } from '../../src/domain/collection/typePick';
import { formatCliError } from '../../src/core/errors';
import {
  addCollectionDraftItems,
  collectionDraftAuthStatus,
  listCollectionDraftItems,
  moveCollectionDraftItem,
  removeCollectionDraftItems,
  renameCollectionDraftItem,
  sortCollectionDraftItems,
} from '../../src/domain/collection/items';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { identitySequenceFilePath, listCollectionIdentities, listIdentities, readCollectionIdentity } from '../../src/local/identity';

function snapshot(root: string): unknown[] {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => [entry.name,
    entry.isDirectory() ? snapshot(path.join(root, entry.name)) : readFileSync(path.join(root, entry.name)).toString('base64')]);
}

const cataloguePage = (items: Record<string, unknown>[]) => ({
  ret: 0, errCode: 0,
  data: { skip: 0, limit: 100, totalItem: items.length, dataList: items.map(({ resourceId, ...item }, index) => ({
    itemTitle: '', sortId: index + 1, ...item, mountResourceInfo: { resourceId },
  })) },
});
const absentItems = async ({ resourceIds }: Record<string, unknown>) => ({
  ret: 0, errCode: 0,
  data: String(resourceIds).split(',').map((resourceId) => ({ resourceId, isExists: false })),
});

describe('合集创建', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd,
      homeDir,
      loginName: 'alice',
      password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }),
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  function creationFixture(overrides: Pick<CollectionCreateApis, 'info' | 'create'> = {}) {
    const calls: Array<{ operation: string; params: Record<string, unknown> }> = [];
    const created = { resourceId: 'collection_new', resourceName: 'alice/new-collection', resourceTypeCode: 'COLLECTION_LEAF' };
    const apis: CollectionCreateApis = {
      resourceTypes: async () => ({ ret: 0, errCode: 0, data: [{ code: 'COLLECTION_LEAF', name: '合集', status: 1, subjectType: [4] }] }),
      getByCode: async ({ code }) => ({ ret: 0, errCode: 0, data: { code, name: '合集', isTerminate: true, status: 1, subjectType: [4] } }),
      info: async (params) => {
        calls.push({ operation: 'lookup', params });
        return overrides.info ? overrides.info(params) : { ret: 0, errCode: 0, data: null };
      },
      create: async (params) => {
        calls.push({ operation: 'create', params });
        return overrides.create ? overrides.create(params) : { ret: 0, errCode: 0, data: created };
      },
    };
    return { calls, created, run: () => createCollection({
      cwd, homeDir, type: 'COLLECTION_LEAF', title: '新合集', name: 'new-collection', yes: true, apis,
    }) };
  }

  it.each([
    ['成功null', async () => ({ ret: 0, errCode: 0, data: null })],
    ['Axios数值404', async () => { throw { response: { status: 404 } }; }],
    ['SDK固定404', async () => { throw new Error('{"status":404}'); }],
  ] as const)('C01.N01/N02 仅可信不存在允许完整创建：%s', async (_label, info) => {
    const fixture = creationFixture({ info });
    const identity = await fixture.run();
    expect(identity).toMatchObject({ n: 1, subject: 'collection', resourceId: fixture.created.resourceId,
      resourceName: fixture.created.resourceName, typeCode: 'COLLECTION_LEAF', name: 'new-collection', title: '新合集', env: 'test' });
    // 创建DTO的resourceTypeCode映射为本地typeCode，不要求它提供详情的owner/status。
    expect(identity).not.toHaveProperty('resourceTypeCode');
    expect(identity).not.toHaveProperty('filePath');
    expect(readCollectionIdentity(cwd, 1)).toEqual(identity);
    expect(fixture.calls).toEqual([
      { operation: 'lookup', params: { resourceIdOrName: 'alice/new-collection', isLoadLatestVersionInfo: 1 } },
      { operation: 'create', params: { name: 'new-collection', resourceTitle: '新合集', resourceTypeCode: 'COLLECTION_LEAF', subjectType: 4 } },
    ]);
  });

  it.each([
    ['null', null], ['缺data', { ret: 0, errCode: 0 }], ['裸对象', {}],
    ['空data', { ret: 0, errCode: 0, data: {} }], ['数组data', { ret: 0, errCode: 0, data: [] }],
    ['字符串ret', { ret: '0', errCode: 0, data: null }],
    ['字符串errCode', { ret: 0, errCode: '0', data: null }],
    ['失败ret', { ret: 1, errCode: 0, data: null }], ['失败errCode', { ret: 0, errCode: 401, data: null }],
    ['错name', { ret: 0, errCode: 0, data: { resourceId: 'other', resourceName: 'alice/other', userId: 7, subjectType: [4] } }],
    ['坏ID', { ret: 0, errCode: 0, data: { resourceId: 'bad/id', resourceName: 'alice/new-collection', userId: 7, subjectType: [4] } }],
    ['字符串owner', { ret: 0, errCode: 0, data: { resourceId: 'existing', resourceName: 'alice/new-collection', userId: '7', subjectType: [4] } }],
    ['仅owner别名', { ret: 0, errCode: 0, data: { resourceId: 'existing', resourceName: 'alice/new-collection', ownerId: 7, subjectType: [4] } }],
    ['字符串主体', { ret: 0, errCode: 0, data: { resourceId: 'existing', resourceName: 'alice/new-collection', userId: 7, subjectType: ['4'] } }],
  ])('C01.N01 不可信查重零POST且字节不变：%s', async (_label, response) => {
    const fixture = creationFixture({ info: async () => response });
    const before = snapshot(cwd), home = snapshot(homeDir);
    await expect(fixture.run()).rejects.toMatchObject({ code: 'COLLECTION_LOOKUP_FAILED' });
    expect(fixture.calls.map((call) => call.operation)).toEqual(['lookup']);
    expect(snapshot(cwd)).toEqual(before);
    expect(snapshot(homeDir)).toEqual(home);
  });

  it.each([
    ['字符串HTTP状态', { response: { status: '404' } }], ['仅status', { status: 404 }],
    ['文本404', new Error('request failed 404')], ['SDK近似正文', new Error('{"status":"404"}')],
    ['HTTP403', { response: { status: 403 } }], ['null异常', null],
  ])('C01.N01 非SDK真实404不能创建：%s', async (_label, error) => {
    const fixture = creationFixture({ info: async () => { throw error; } });
    const before = snapshot(cwd);
    await expect(fixture.run()).rejects.toMatchObject({ code: 'COLLECTION_LOOKUP_FAILED' });
    expect(fixture.calls.map((call) => call.operation)).toEqual(['lookup']);
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each([
    [7, [4], 'COLLECTION_OWN_SHELL'], [7, 4, 'COLLECTION_OWN_SHELL'],
    [8, [4], 'COLLECTION_NAME_TAKEN'], [7, [1], 'COLLECTION_NAME_TAKEN'],
  ] as const)('C01.N01 有效占用不重建：owner=%s subject=%j', async (userId, subjectType, code) => {
    const fixture = creationFixture({ info: async () => ({ ret: 0, errCode: 0,
      data: { resourceId: 'existing', resourceName: 'alice/new-collection', userId, subjectType },
    }) });
    const before = snapshot(cwd);
    await expect(fixture.run()).rejects.toMatchObject({ code });
    expect(fixture.calls.map((call) => call.operation)).toEqual(['lookup']);
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each([
    ['null', null], ['裸对象', {}], ['缺data', { ret: 0, errCode: 0 }],
    ['null data', { ret: 0, errCode: 0, data: null }], ['数组data', { ret: 0, errCode: 0, data: [] }],
    ['缺ID', { ret: 0, errCode: 0, data: { resourceName: 'alice/new-collection', resourceTypeCode: 'COLLECTION_LEAF' } }],
    ...([['空ID', ''], ['空白ID', ' '], ['路径ID', 'bad/id'], ['控制字符ID', 'bad\nID'], ['父路径ID', '..']] as const).map<[string, unknown]>(([label, resourceId]) => [label, { ret: 0, errCode: 0, data: { resourceId, resourceName: 'alice/new-collection', resourceTypeCode: 'COLLECTION_LEAF' } }]),
    ['缺name', { ret: 0, errCode: 0, data: { resourceId: 'new', resourceTypeCode: 'COLLECTION_LEAF' } }],
    ['错name', { ret: 0, errCode: 0, data: { resourceId: 'new', resourceName: 'alice/other', resourceTypeCode: 'COLLECTION_LEAF' } }],
    ['缺type', { ret: 0, errCode: 0, data: { resourceId: 'new', resourceName: 'alice/new-collection' } }],
    ['错type', { ret: 0, errCode: 0, data: { resourceId: 'new', resourceName: 'alice/new-collection', resourceTypeCode: 'OTHER' } }],
    ...[{ ret: 1, errCode: 0 }, { ret: 0, errCode: 1 }, { ret: '0', errCode: 0 }, { ret: 0, errCode: '0' }].map<[string, unknown]>((flags, index) => [`非成功信封含ID-${index + 1}`, {
      ...flags, msg: 'synthetic-private-message', data: { resourceId: 'new', resourceName: 'alice/new-collection', resourceTypeCode: 'COLLECTION_LEAF' },
    }]),
  ])('C01.N03 不可信创建回复不能建立身份或重发：%s', async (_label, response) => {
    const fixture = creationFixture({ create: async () => response });
    const before = snapshot(cwd), home = snapshot(homeDir);
    await expect(fixture.run()).rejects.toMatchObject({ code: 'COLLECTION_CREATE_RESULT_UNKNOWN' });
    expect(fixture.calls.map((call) => call.operation)).toEqual(['lookup', 'create']);
    expect(snapshot(cwd)).toEqual(before);
    expect(snapshot(homeDir)).toEqual(home);
  });

  it('C01.N04 真实创建抛异常到CLI格式化仍不泄漏或重试', async () => {
    const privateMessage = 'synthetic-private-authorization';
    const fixture = creationFixture({ create: async () => { throw new Error(privateMessage); } });
    writeFileSync(path.join(cwd, 'notes.txt'), '保留用户文件');
    const before = snapshot(cwd);
    const error = await fixture.run().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'COLLECTION_CREATE_RESULT_UNKNOWN' });
    for (const argv of [[], ['--json']]) {
      const formatted = formatCliError(error as Parameters<typeof formatCliError>[0], argv);
      expect(formatted).toContain('alice/new-collection');
      expect(formatted).toContain('bind');
      expect(formatted.includes(privateMessage)).toBe(false);
    }
    expect(fixture.calls.map((call) => call.operation)).toEqual(['lookup', 'create']);
    expect(snapshot(cwd)).toEqual(before);
  });

  it('C01.N05 已创建后本地故障保留现场，显式bind接入且不重发create', async () => {
    let failureSnapshot: unknown[] = [];
    const fixture = creationFixture({ create: async () => {
      writeFileSync(identitySequenceFilePath(cwd), 'synthetic-broken-sequence');
      failureSnapshot = snapshot(cwd);
      return { ret: 0, errCode: 0, data: { resourceId: 'collection_new', resourceName: 'alice/new-collection', resourceTypeCode: 'COLLECTION_LEAF' } };
    } });
    writeFileSync(path.join(cwd, 'notes.txt'), '保留用户文件');
    writeFileSync(path.join(cwd, '.freelog', '9.version.json'), '{"draft":"keep"}');
    const error = await fixture.run().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'COLLECTION_CREATE_LOCAL_STATE_FAILED' });
    const formatted = formatCliError(error as Parameters<typeof formatCliError>[0], ['--json']);
    expect(formatted).toContain('alice/new-collection');
    expect(formatted).toContain('collection bind id:collection_new');
    expect(formatted.includes('synthetic-broken-sequence')).toBe(false);
    expect(snapshot(cwd)).toEqual(failureSnapshot);
    expect(fixture.calls.map((call) => call.operation)).toEqual(['lookup', 'create']);
    // 仅移除本项刚制造的坏游标，模拟用户显式处理故障；生产代码不清理现场。
    rmSync(identitySequenceFilePath(cwd));
    const bound = await bindCollection({ cwd, homeDir, target: 'id:collection_new', apis: { info: async () => ({ ret: 0, errCode: 0,
      data: { resourceId: 'collection_new', resourceName: 'alice/new-collection', resourceTitle: '新合集', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 },
    }) } });
    expect(bound).toMatchObject({ subject: 'collection', resourceId: 'collection_new', resourceName: 'alice/new-collection' });
    expect(readFileSync(path.join(cwd, '.freelog', '9.version.json'), 'utf8')).toBe('{"draft":"keep"}');
    expect(fixture.calls.filter((call) => call.operation === 'create')).toHaveLength(1);
  });

  it('只创建 subjectType=4 壳和无 filePath 的合集身份', async () => {
    const created = await createCollection({
      cwd,
      homeDir,
      type: 'COLLECTION_LEAF',
      title: '我的合集',
      name: 'my-collection',
      yes: true,
      apis: {
        resourceTypes: async () => ({ ret: 0, errCode: 0, data: [{ code: 'ROOT', name: '根', status: 1, subjectType: [1], children: [{ code: 'COLLECTION_LEAF', name: '合集', status: 1, subjectType: [4] }] }] }),
        getByCode: async ({ code }) => ({ ret: 0, errCode: 0, data: { code, name: '合集', isTerminate: true, status: 1, subjectType: [4] } }),
        info: async () => ({ ret: 0, errCode: 0, data: null }),
        create: async (params) => {
          expect(params).toEqual({
            name: 'my-collection',
            resourceTitle: '我的合集',
            resourceTypeCode: 'COLLECTION_LEAF',
            subjectType: 4,
          });
          return { ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/my-collection', resourceTypeCode: 'COLLECTION_LEAF' } };
        },
      },
    });
    expect(created).toMatchObject({
      n: 1,
      subject: 'collection',
      resourceId: 'collection_1',
      resourceName: 'alice/my-collection',
      env: 'test',
    });
    expect(created).not.toHaveProperty('filePath');
    expect(readCollectionIdentity(cwd, 1)).toEqual(created);
    expect(listCollectionIdentities(cwd)).toHaveLength(1);
    expect(listIdentities(cwd)).toHaveLength(0);
  });

  it('拒绝非合集叶子，不发送创建请求', async () => {
    let called = false;
    await expect(createCollection({
      cwd,
      homeDir,
      type: 'RESOURCE_LEAF',
      title: '错误合集',
      name: 'wrong-subject',
      yes: true,
      apis: {
        resourceTypes: async () => ({ ret: 0, errCode: 0, data: [{ code: 'RESOURCE_LEAF', name: '资源', status: 1, subjectType: [1] }] }),
        getByCode: async ({ code }) => ({ ret: 0, errCode: 0, data: { code, name: '资源', isTerminate: true, status: 1, subjectType: [1] } }),
        create: async () => { called = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_TYPE_NOT_LEAF' });
    expect(called).toBe(false);
  });

  it.each([60, 61])('显式短标识%s字符：只允许边界内原样创建，不截断身份', async (length) => {
    const name = 'a'.repeat(length);
    const calls: Array<{ operation: string; params: Record<string, unknown> }> = [];
    const creating = createCollection({
      cwd, homeDir, type: 'COLLECTION_LEAF', title: '边界', name, yes: true,
      apis: {
        resourceTypes: async (params) => {
          calls.push({ operation: 'types', params });
          return { ret: 0, errCode: 0, data: [{ code: 'COLLECTION_LEAF', name: '合集', status: 1, subjectType: [4] }] };
        },
        getByCode: async (params) => {
          calls.push({ operation: 'type', params });
          return { ret: 0, errCode: 0, data: { code: params.code, name: '合集', status: 1, isTerminate: true, subjectType: [4] } };
        },
        info: async (params) => {
          calls.push({ operation: 'lookup', params });
          return { ret: 0, errCode: 0, data: null };
        },
        create: async (params) => {
          calls.push({ operation: 'create', params });
          return { ret: 0, errCode: 0, data: { resourceId: 'collection_boundary', resourceName: `alice/${name}`, resourceTypeCode: 'COLLECTION_LEAF' } };
        },
      },
    });
    if (length === 61) {
      await expect(creating).rejects.toMatchObject({ code: 'COLLECTION_NAME_TOO_LONG' });
      expect(calls).toEqual([]);
      expect(listCollectionIdentities(cwd)).toEqual([]);
    } else {
      const identity = await creating;
      expect(identity).toMatchObject({ name, resourceName: `alice/${name}` });
      expect(readCollectionIdentity(cwd, identity.n)).toEqual(identity);
      expect(calls.filter((call) => call.operation === 'lookup')).toEqual([
        { operation: 'lookup', params: { resourceIdOrName: `alice/${name}`, isLoadLatestVersionInfo: 1 } },
      ]);
      expect(calls.filter((call) => call.operation === 'create')).toEqual([
        { operation: 'create', params: { name, resourceTitle: '边界', resourceTypeCode: 'COLLECTION_LEAF', subjectType: 4 } },
      ]);
    }
  });

  it.each(['OTHER_COLLECTION_LEAF', ' COLLECTION_LEAF '])('共享类型复验拒绝返回另一code：%s', async (returnedCode) => {
    const queried: unknown[] = [];
    await expect(getCollectionTypeInfo(' COLLECTION_LEAF ', {
      resourceTypes: async (params) => {
        queried.push(params);
        return { ret: 0, errCode: 0, data: [{ code: 'COLLECTION_LEAF', name: '合集', status: 1, subjectType: [4] }] };
      },
      getByCode: async (params) => {
        queried.push(params);
        return { ret: 0, errCode: 0, data: { code: returnedCode, name: '另一个合集', status: 1, isTerminate: true, subjectType: [4] } };
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_TYPE_NOT_FOUND' });
    expect(queried).toEqual([{ category: 1, status: 1, subjectType: 4 }, { code: 'COLLECTION_LEAF' }]);
    expect(listCollectionIdentities(cwd)).toEqual([]);
  });

  it('共享类型复验接受请求首尾空白，但不改写精确返回code', async () => {
    const info = { code: 'COLLECTION_LEAF', name: '合集', status: 1, isTerminate: true, subjectType: ['4'] };
    expect(await getCollectionTypeInfo(' COLLECTION_LEAF ', {
      resourceTypes: async () => ({ ret: 0, errCode: 0, data: [info] }),
      getByCode: async () => ({ ret: 0, errCode: 0, data: info }),
    })).toEqual({ ...info, pathLabel: '合集' });
  });

  it('bind 接入线上本人合集，不要求本地产物，重复 bind 幂等', async () => {
    const info = async () => ({
      ret: 0, errCode: 0,
      data: {
        resourceId: 'collection_bound', resourceName: 'alice/bound', resourceTitle: '线上合集',
        resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0,
      },
    });
    const first = await bindCollection({ cwd, homeDir, target: 'name:alice/bound', apis: { info } });
    const second = await bindCollection({ cwd, homeDir, target: 'id:collection_bound', apis: { info } });
    expect(first).toMatchObject({ n: 1, subject: 'collection', resourceId: 'collection_bound' });
    expect(first).not.toHaveProperty('filePath');
    expect(second).toEqual(first);
  });

  it('添加合格单资源只写目录草稿并回读确认', async () => {
    const collectionInfo = {
      resourceId: 'collection_1', resourceName: 'alice/collection', resourceTitle: '合集',
      resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0,
    };
    let draftItems: Record<string, unknown>[] = [];
    const info = async ({ resourceIdOrName }: Record<string, unknown>) => ({
      ret: 0, errCode: 0,
      data: String(resourceIdOrName).includes('collection')
        ? collectionInfo
        : { resourceId: 'resource_1', resourceName: 'alice/resource_1', resourceTitle: '单品', subjectType: 1, userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [] },
    });
    const result = await addCollectionDraftItems({
      cwd,
      homeDir,
      selector: 'id:collection_1',
      sources: ['id:resource_1'],
      yes: true,
      apis: {
        info,
        getRules: async () => ({ ret: 0, errCode: 0, data: { status: 0, conditionType: 1, filterConditions: [] } }),
        getDraftItems: async () => cataloguePage(draftItems),
        checkItems: absentItems,
        addDraftItems: async (params) => {
          expect(params).toEqual({
            resourceId: 'collection_1',
            addCollectionItems: [{ resourceId: 'resource_1', itemTitle: '单品', authExcludedItems: [] }],
            isPublish: 0,
          });
          draftItems = [{ itemId: 'item_1', resourceId: 'resource_1', itemTitle: '单品' }];
          return { ret: 0, errCode: 0, data: { addSuccessfulItems: [{ resourceId: 'resource_1', itemTitle: '单品' }], addFailedItems: [], ignoreItems: [] } };
        },
      },
    });
    expect(result).toEqual({ added: ['resource_1'], unchanged: [], failed: [] });
    expect(await listCollectionDraftItems({
      cwd, homeDir, selector: 'id:collection_1', apis: { info, getDraftItems: async () => cataloguePage(draftItems) },
    })).toMatchObject([{ itemId: 'item_1', resourceId: 'resource_1' }]);
  });

  it('有上游真实合同时写入真实 contractId，不发起签约', async () => {
    let draftItems: Record<string, unknown>[] = [];
    const contractQueries: Record<string, unknown>[] = [];
    const result = await addCollectionDraftItems({
      cwd,
      homeDir,
      selector: 'id:collection_1',
      sources: ['id:resource_auth'],
      yes: true,
      apis: {
        info: async ({ resourceIdOrName }) => ({ ret: 0, errCode: 0, data: String(resourceIdOrName).includes('collection')
          ? { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 }
          : { resourceId: 'resource_auth', resourceName: 'alice/resource_auth', resourceTitle: '', subjectType: 1, userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [{ resourceId: 'upstream' }] } }),
        getRules: async () => ({ ret: 0, errCode: 0, data: { status: 0, conditionType: 1, filterConditions: [] } }),
        getDraftItems: async () => cataloguePage(draftItems),
        checkItems: absentItems,
        batchContracts: async (params) => {
          contractQueries.push(params);
          return { ret: 0, errCode: 0, data: [{
            contractId: 'contract_1',
            subjectId: 'upstream',
            subjectType: 1,
            licenseeId: 'collection_1',
            licenseeIdentityType: 4,
            status: 0,
            policyId: 'policy_1',
          }] };
        },
        addDraftItems: async (params) => {
          expect(params).toMatchObject({ addCollectionItems: [{ resourceId: 'resource_auth', authExcludedItems: [{ resourceId: 'upstream', excludedType: 'contractId', excludedValue: 'contract_1' }] }] });
          draftItems = [{ itemId: 'item_auth', resourceId: 'resource_auth', itemTitle: '' }];
          return { ret: 0, errCode: 0, data: { addSuccessfulItems: [{ resourceId: 'resource_auth', itemTitle: '' }], addFailedItems: [], ignoreItems: [] } };
        },
      },
    });
    expect(result.added).toEqual(['resource_auth']);
    expect(contractQueries).toEqual([
      { subjectIds: 'upstream', subjectType: 1, licenseeId: 'collection_1', licenseeIdentityType: 4, isLoadPolicyInfo: 1 },
    ]);
  });

  it('单品上游缺少当前合集合同时提示网页处理且不写目录草稿', async () => {
    let addCalled = false;
    await expect(addCollectionDraftItems({
      cwd,
      homeDir,
      selector: 'id:collection_1',
      sources: ['id:resource_auth'],
      yes: true,
      apis: {
        info: async ({ resourceIdOrName }) => ({ ret: 0, errCode: 0, data: String(resourceIdOrName).includes('collection')
          ? { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 }
          : { resourceId: 'resource_auth', resourceName: 'alice/resource_auth', resourceTitle: '', subjectType: 1, userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [{ resourceId: 'upstream' }] } }),
        getRules: async () => ({ ret: 0, errCode: 0, data: { status: 0, conditionType: 1, filterConditions: [] } }),
        getDraftItems: async () => cataloguePage([]),
        checkItems: absentItems,
        batchContracts: async () => ({ ret: 0, errCode: 0, data: [] }),
        addDraftItems: async () => { addCalled = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_ITEM_BROWSER_AUTH_REQUIRED' });
    expect(addCalled).toBe(false);
  });

  it('单品多上游只接受全部已有合同，不补签缺口', async () => {
    let addCalled = false;
    const active = (subjectId: string, policyId = 'policy_1') => ({
      contractId: `contract_${subjectId}`,
      subjectId,
      subjectType: 1,
      licenseeId: 'collection_1',
      licenseeIdentityType: 4,
      status: 0,
      policyId,
    });
    await expect(addCollectionDraftItems({
      cwd,
      homeDir,
      selector: 'id:collection_1',
      sources: ['id:resource_auth'],
      yes: true,
      apis: {
        info: async ({ resourceIdOrName }) => ({ ret: 0, errCode: 0, data: String(resourceIdOrName).includes('collection')
          ? { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 }
          : { resourceId: 'resource_auth', resourceName: 'alice/resource_auth', resourceTitle: '', subjectType: 1, userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [{ resourceId: 'upstream_a' }, { resourceId: 'upstream_b' }] } }),
        getRules: async () => ({ ret: 0, errCode: 0, data: { status: 0, conditionType: 1, filterConditions: [] } }),
        getDraftItems: async () => cataloguePage([]),
        checkItems: absentItems,
        batchContracts: async () => ({ ret: 0, errCode: 0, data: [active('upstream_a')] }),
        addDraftItems: async () => { addCalled = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_ITEM_BROWSER_AUTH_REQUIRED' });
    expect(addCalled).toBe(false);
  });

  it.each([
    { ret: 0, errCode: 0, data: { dataList: {} } },
    { ret: 1, errCode: 0, data: [{ contractId: 'contract_1', subjectId: 'upstream', subjectType: 1,
      licenseeId: 'collection_1', licenseeIdentityType: 4, status: 0, policyId: 'policy_1' }] },
  ])('单品上游合同查询响应异常时保留目录草稿不写入：%j', async (response) => {
    let addCalled = false;
    await expect(addCollectionDraftItems({
      cwd,
      homeDir,
      selector: 'id:collection_1',
      sources: ['id:resource_auth'],
      yes: true,
      apis: {
        info: async ({ resourceIdOrName }) => ({ ret: 0, errCode: 0, data: String(resourceIdOrName).includes('collection')
          ? { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 }
          : { resourceId: 'resource_auth', resourceName: 'alice/resource_auth', resourceTitle: '', subjectType: 1, userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [{ resourceId: 'upstream' }] } }),
        getRules: async () => ({ ret: 0, errCode: 0, data: { status: 0, conditionType: 1, filterConditions: [] } }),
        getDraftItems: async () => cataloguePage([]),
        checkItems: absentItems,
        batchContracts: async () => response,
        addDraftItems: async () => { addCalled = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_CONTRACT_RESPONSE_INVALID' });
    expect(addCalled).toBe(false);
  });

  it('目录维护按 itemId 写入、按稳定手工顺序移动并完整读回', async () => {
    const requestedSortFields: unknown[] = [];
    let draftItems: Record<string, unknown>[] = [
      { itemId: 'item_1', resourceId: 'resource_1', itemTitle: 'c', sortId: 1 },
      { itemId: 'item_2', resourceId: 'resource_2', itemTitle: 'b', sortId: 2 },
      { itemId: 'item_3', resourceId: 'resource_3', itemTitle: 'a', sortId: 3 },
    ];
    const info = async () => ({ ret: 0, errCode: 0, data: {
      resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0,
    } });
    const apis = {
      info,
      getRules: async () => ({ ret: 0, errCode: 0, data: { status: 0, conditionType: 1, filterConditions: [] } }),
      getDraftItems: async (params: Record<string, unknown>) => {
        requestedSortFields.push(params.sortField);
        const direction = Number(params.sortType) === -1 ? -1 : 1;
        const field = params.sortField;
        const sorted = [...draftItems].sort((left, right) => {
          const a = field === 'itemTitle' ? String(left.itemTitle) : Number(left.sortId);
          const b = field === 'itemTitle' ? String(right.itemTitle) : Number(right.sortId);
          return a < b ? -direction : a > b ? direction : 0;
        });
        return cataloguePage(sorted);
      },
      renameDraftItems: async ({ data }: Record<string, unknown>) => {
        const update = (data as Array<{ itemId: string; itemTitle: string }>)[0];
        draftItems = draftItems.map((item) => item.itemId === update.itemId ? { ...item, itemTitle: update.itemTitle } : item);
        return { ret: 0, errCode: 0, data: null };
      },
      moveDraftItems: async ({ data }: Record<string, unknown>) => {
        const { itemIds, targetSortId } = data as { itemIds: string[]; targetSortId: number };
        const moving = draftItems.find((item) => item.itemId === itemIds[0])!;
        const remaining = draftItems.filter((item) => item.itemId !== moving.itemId);
        remaining.splice(targetSortId - 1, 0, moving);
        draftItems = remaining.map((item, index) => ({ ...item, sortId: index + 1 }));
        return { ret: 0, errCode: 0, data: null };
      },
      reorderDraftItems: async ({ sortField, sortType }: Record<string, unknown>) => {
        expect({ sortField, sortType }).toEqual({ sortField: 'itemTitle', sortType: 1 });
        draftItems = [...draftItems].sort((left, right) => String(left.itemTitle).localeCompare(String(right.itemTitle)))
          .map((item, index) => ({ ...item, sortId: index + 1 }));
        return { ret: 0, errCode: 0, data: null };
      },
      getDraftAuth: async () => ({ ret: 0, errCode: 0, data: [{ itemId: 'item_1', isAuth: true }, { itemId: 'item_3', isAuth: false }] }),
      removeDraftItems: async ({ removeCollectionItemIds }: Record<string, unknown>) => {
        const ids = new Set(removeCollectionItemIds as string[]);
        draftItems = draftItems.filter((item) => !ids.has(String(item.itemId)));
        return { ret: 0, errCode: 0, data: null };
      },
    };

    await renameCollectionDraftItem({ cwd, homeDir, selector: 'id:collection_1', itemId: 'item_2', title: 'b2', yes: true, apis });
    expect(draftItems.find((item) => item.itemId === 'item_2')?.itemTitle).toBe('b2');
    await moveCollectionDraftItem({ cwd, homeDir, selector: 'id:collection_1', itemId: 'item_3', before: 'item_1', yes: true, apis });
    expect(draftItems.map((item) => item.itemId)).toEqual(['item_3', 'item_1', 'item_2']);
    const sorted = await sortCollectionDraftItems({ cwd, homeDir, selector: 'id:collection_1', by: 'title', direction: 'asc', yes: true, apis });
    expect(sorted.map((item) => item.itemId)).toEqual(['item_3', 'item_2', 'item_1']);
    expect(requestedSortFields).toEqual(expect.arrayContaining(['sortId']));
    expect(requestedSortFields).not.toContain('itemTitle');
    await expect(collectionDraftAuthStatus({ cwd, homeDir, selector: 'id:collection_1', itemIds: ['item_1', 'item_3'], apis }))
      .resolves.toEqual([{ itemId: 'item_1', resourceId: 'resource_1', isAuth: true }, { itemId: 'item_3', resourceId: 'resource_3', isAuth: false }]);
    await removeCollectionDraftItems({ cwd, homeDir, selector: 'id:collection_1', itemIds: ['item_2'], yes: true, apis });
    expect(draftItems.map((item) => item.itemId)).not.toContain('item_2');
  });

  it('自动收录开启时拒绝任何手工目录写入', async () => {
    let renameCalled = false;
    await expect(renameCollectionDraftItem({
      cwd, homeDir, selector: 'id:collection_1', itemId: 'item_1', title: '不会写入', yes: true,
      apis: {
        info: async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 } }),
        getRules: async () => ({ ret: 0, errCode: 0, data: { status: 1, conditionType: 1, filterConditions: [] } }),
        renameDraftItems: async () => { renameCalled = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_AUTO_COLLECTING' });
    expect(renameCalled).toBe(false);
  });
});
