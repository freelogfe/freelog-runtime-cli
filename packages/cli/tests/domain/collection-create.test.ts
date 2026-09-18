import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { createCollection } from '../../src/domain/collection/create';
import { bindCollection } from '../../src/domain/collection/bind';
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
import { listCollectionIdentities, listIdentities, readCollectionIdentity } from '../../src/local/identity';

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

  it('只创建 subjectType=4 壳和无 filePath 的合集身份', async () => {
    const created = await createCollection({
      cwd,
      homeDir,
      type: 'COLLECTION_LEAF',
      title: '我的合集',
      name: 'my-collection',
      yes: true,
      apis: {
        resourceTypes: async () => ({ data: [{ code: 'ROOT', name: '根', status: 1, subjectType: [1], children: [{ code: 'COLLECTION_LEAF', name: '合集', status: 1, subjectType: [4] }] }] }),
        getByCode: async ({ code }) => ({ data: { code, name: '合集', isTerminate: true, status: 1, subjectType: [4] } }),
        info: async () => ({ data: {} }),
        create: async (params) => {
          expect(params).toEqual({
            name: 'my-collection',
            resourceTitle: '我的合集',
            resourceTypeCode: 'COLLECTION_LEAF',
            subjectType: 4,
          });
          return { data: { resourceId: 'collection_1', resourceName: 'alice/my-collection' } };
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
        resourceTypes: async () => ({ data: [{ code: 'RESOURCE_LEAF', name: '资源', status: 1, subjectType: [1] }] }),
        getByCode: async ({ code }) => ({ data: { code, name: '资源', isTerminate: true, status: 1, subjectType: [1] } }),
        create: async () => { called = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_TYPE_NOT_LEAF' });
    expect(called).toBe(false);
  });

  it('bind 接入线上本人合集，不要求本地产物，重复 bind 幂等', async () => {
    const info = async () => ({
      data: {
        resourceId: 'collection_bound', resourceName: 'alice/bound', resourceTitle: '线上合集',
        resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7,
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
      resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7,
    };
    let draftItems: Record<string, unknown>[] = [];
    const info = async ({ resourceIdOrName }: Record<string, unknown>) => ({
      data: String(resourceIdOrName).includes('collection')
        ? collectionInfo
        : { resourceId: 'resource_1', resourceTitle: '单品', subjectType: [1], userId: 7, status: 1, latestVersion: '1.0.0' },
    });
    const result = await addCollectionDraftItems({
      cwd,
      homeDir,
      selector: 'id:collection_1',
      sources: ['id:resource_1'],
      yes: true,
      apis: {
        info,
        getRules: async () => ({ data: { status: 0 } }),
        getDraftItems: async () => ({ data: draftItems }),
        addDraftItems: async (params) => {
          expect(params).toEqual({
            resourceId: 'collection_1',
            addCollectionItems: [{ resourceId: 'resource_1', itemTitle: '单品', authExcludedItems: [] }],
            isPublish: 0,
          });
          draftItems = [{ itemId: 'item_1', resourceId: 'resource_1', itemTitle: '单品' }];
          return { data: {} };
        },
      },
    });
    expect(result).toEqual({ added: ['resource_1'], unchanged: [] });
    expect(await listCollectionDraftItems({
      cwd, homeDir, selector: 'id:collection_1', apis: { info, getDraftItems: async () => ({ data: draftItems }) },
    })).toMatchObject([{ itemId: 'item_1', resourceId: 'resource_1' }]);
  });

  it('有上游授权时按显式策略签约并写入真实 contractId', async () => {
    let draftItems: Record<string, unknown>[] = [];
    let contractRead = 0;
    const result = await addCollectionDraftItems({
      cwd,
      homeDir,
      selector: 'id:collection_1',
      sources: ['id:resource_auth'],
      yes: true,
      policyBySubject: { upstream: 'policy_1' },
      apis: {
        info: async ({ resourceIdOrName }) => ({ data: String(resourceIdOrName).includes('collection')
          ? { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7 }
          : String(resourceIdOrName) === 'upstream'
            ? { resourceId: 'upstream', subjectType: [1], userId: 8, policies: [{ policyId: 'policy_1', status: 1 }] }
            : { resourceId: 'resource_auth', subjectType: [1], userId: 7, status: 1, latestVersion: '1.0.0', baseUpcastResources: [{ resourceId: 'upstream' }] } }),
        getRules: async () => ({ data: { status: 0 } }),
        getDraftItems: async () => ({ data: draftItems }),
        batchContracts: async () => ({ data: contractRead++ === 0 ? [] : [{ contractId: 'contract_1', subjectId: 'upstream', policyId: 'policy_1' }] }),
        signContracts: async (params) => {
          expect(params).toEqual({ subjects: [{ subjectId: 'upstream', policyId: 'policy_1', subjectType: 1 }], subjectType: 1, licenseeId: 'collection_1', licenseeIdentityType: 1 });
          return { data: {} };
        },
        addDraftItems: async (params) => {
          expect(params).toMatchObject({ addCollectionItems: [{ resourceId: 'resource_auth', authExcludedItems: [{ resourceId: 'upstream', excludedType: 'contractId', excludedValue: 'contract_1' }] }] });
          draftItems = [{ itemId: 'item_auth', resourceId: 'resource_auth', itemTitle: '' }];
          return { data: {} };
        },
      },
    });
    expect(result.added).toEqual(['resource_auth']);
  });

  it('目录维护按 itemId 写入、按稳定手工顺序移动并完整读回', async () => {
    const requestedSortFields: unknown[] = [];
    let draftItems: Record<string, unknown>[] = [
      { itemId: 'item_1', resourceId: 'resource_1', itemTitle: 'c', sortId: 1 },
      { itemId: 'item_2', resourceId: 'resource_2', itemTitle: 'b', sortId: 2 },
      { itemId: 'item_3', resourceId: 'resource_3', itemTitle: 'a', sortId: 3 },
    ];
    const info = async () => ({ data: {
      resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7,
    } });
    const apis = {
      info,
      getRules: async () => ({ data: { status: 0 } }),
      getDraftItems: async (params: Record<string, unknown>) => {
        requestedSortFields.push(params.sortField);
        const direction = Number(params.sortType) === -1 ? -1 : 1;
        const field = params.sortField;
        const sorted = [...draftItems].sort((left, right) => {
          const a = field === 'itemTitle' ? String(left.itemTitle) : Number(left.sortId);
          const b = field === 'itemTitle' ? String(right.itemTitle) : Number(right.sortId);
          return a < b ? -direction : a > b ? direction : 0;
        });
        return { data: sorted };
      },
      renameDraftItems: async ({ data }: Record<string, unknown>) => {
        const update = (data as Array<{ itemId: string; itemTitle: string }>)[0];
        draftItems = draftItems.map((item) => item.itemId === update.itemId ? { ...item, itemTitle: update.itemTitle } : item);
        return { data: {} };
      },
      moveDraftItems: async ({ data }: Record<string, unknown>) => {
        const { itemIds, targetSortId } = data as { itemIds: string[]; targetSortId: number };
        const moving = draftItems.find((item) => item.itemId === itemIds[0])!;
        const remaining = draftItems.filter((item) => item.itemId !== moving.itemId);
        remaining.splice(targetSortId - 1, 0, moving);
        draftItems = remaining.map((item, index) => ({ ...item, sortId: index + 1 }));
        return { data: {} };
      },
      reorderDraftItems: async ({ sortField, sortType }: Record<string, unknown>) => {
        expect({ sortField, sortType }).toEqual({ sortField: 'itemTitle', sortType: 1 });
        draftItems = [...draftItems].sort((left, right) => String(left.itemTitle).localeCompare(String(right.itemTitle)))
          .map((item, index) => ({ ...item, sortId: index + 1 }));
        return { data: {} };
      },
      getDraftAuth: async () => ({ data: [{ itemId: 'item_1', isAuth: true }, { itemId: 'item_3', isAuth: false }] }),
      removeDraftItems: async ({ removeCollectionItemIds }: Record<string, unknown>) => {
        const ids = new Set(removeCollectionItemIds as string[]);
        draftItems = draftItems.filter((item) => !ids.has(String(item.itemId)));
        return { data: {} };
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
      .resolves.toEqual([{ itemId: 'item_1', isAuth: true }, { itemId: 'item_3', isAuth: false }]);
    await removeCollectionDraftItems({ cwd, homeDir, selector: 'id:collection_1', itemIds: ['item_2'], yes: true, apis });
    expect(draftItems.map((item) => item.itemId)).not.toContain('item_2');
  });

  it('自动收录开启时拒绝任何手工目录写入', async () => {
    let renameCalled = false;
    await expect(renameCollectionDraftItem({
      cwd, homeDir, selector: 'id:collection_1', itemId: 'item_1', title: '不会写入', yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7 } }),
        getRules: async () => ({ data: { status: 1 } }),
        renameDraftItems: async () => { renameCalled = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_AUTO_COLLECTING' });
    expect(renameCalled).toBe(false);
  });
});
