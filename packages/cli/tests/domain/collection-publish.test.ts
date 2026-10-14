import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft } from '../../src/domain/collection/form';
import { publishCollection } from '../../src/domain/collection/publish';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { FServiceAPI } from '../../src/platform/api';

// tools-lib 的 ESM 命名空间不可重定义；在 CLI 出口替换为真实调用边界上的 spy。
vi.mock('../../src/platform/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/api')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Contract: { ...actual.FServiceAPI.Contract, batchContracts: vi.fn(), batchCreateContracts: vi.fn() },
      Resource: { ...actual.FServiceAPI.Resource, batchAuth: vi.fn() },
    },
  };
});

describe('合集发布', () => {
  let cwd: string; let homeDir: string; let latest = '';
  const typeApis = {
    resourceTypes: async () => ([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
    getByCode: async () => ({ data: { code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], resourceConfig: { supportOptionalConfig: 2 } } }),
  };
  const info = async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0, latestVersion: latest } });
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-publish-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-publish-home-'));
    latest = ''; applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { vi.restoreAllMocks(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  it('将完整表单和目录 merge 标志在一个请求中提交，并读回确认而不隐式上架', async () => {
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    let payload: Record<string, unknown> | undefined;
    await expect(publishCollection({
      cwd, homeDir, selector: 'id:collection_1', includeItems: 'no', yes: true,
      apis: {
        info, ...typeApis,
        getRules: async () => ({ data: { serializeStatus: 0, status: 0, conditionType: 1, filterConditions: [] } }),
        getPublishedItems: async () => ({ data: { dataList: [] } }), getDraftItems: async () => ({ data: { dataList: [] } }),
        updateCollection: async (value) => { payload = value; latest = '1.0.0'; return { data: {} }; },
        versionInfo: async () => ({ data: { inputAttrs: [], customPropertyDescriptors: [], description: '', catalogueProperty: {}, dependencies: [], authExcludedItems: [] } }),
      },
    })).resolves.toMatchObject({ resourceId: 'collection_1', isMergeCatalogueDraft: 0, authExcludedItems: [] });
    expect(payload).toMatchObject({ resourceId: 'collection_1', isMergeCatalogueDraft: 0 });
    expect(payload).not.toHaveProperty('status');
    expect(readCollectionFormDraft(cwd, 'collection_1')).toBeUndefined();
  });

  it('没有本地表单草稿时可用刚读取的已发布表单仅发布目录变更', async () => {
    let payload: Record<string, unknown> | undefined;
    const directoryItem = { itemId: 'item_1', resourceId: 'resource_1', itemTitle: '目录单品', sortId: 1, authExcludedItems: [] };
    let publishedItems: Record<string, unknown>[] = [];
    await expect(publishCollection({
      cwd, homeDir, selector: 'id:collection_1', includeItems: 'auto', yes: true,
      apis: {
        info, ...typeApis,
        getRules: async () => ({ data: { serializeStatus: 0, status: 0, conditionType: 1, filterConditions: [] } }),
        getPublishedItems: async () => ({ data: { dataList: publishedItems } }),
        getDraftItems: async () => ({ data: { dataList: [directoryItem] } }),
        updateCollection: async (value) => { payload = value; latest = '1.0.0'; publishedItems = [directoryItem]; return { data: {} }; },
        versionInfo: async () => ({ data: { inputAttrs: [], customPropertyDescriptors: [], description: '', catalogueProperty: {}, dependencies: [], authExcludedItems: [] } }),
      },
    })).resolves.toMatchObject({ resourceId: 'collection_1', isMergeCatalogueDraft: 1, authExcludedItems: [] });
    expect(payload).toMatchObject({ resourceId: 'collection_1', isMergeCatalogueDraft: 1 });
    expect(readCollectionFormDraft(cwd, 'collection_1')).toBeUndefined();
  });

  it('发布最终表单直接依赖时不查询或签约合同，交给平台声明模型处理', async () => {
    const contracts = vi.spyOn(FServiceAPI.Contract, 'batchContracts');
    const sign = vi.spyOn(FServiceAPI.Contract, 'batchCreateContracts');
    const batchAuth = vi.spyOn(FServiceAPI.Resource, 'batchAuth');
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({
      ...form,
      dependencies: [{ resourceId: 'dep_1', versionRange: '^1.0.0' }],
    }));
    let payload: Record<string, unknown> | undefined;
    await expect(publishCollection({
      cwd, homeDir, selector: 'id:collection_1', includeItems: 'no', yes: true,
      apis: {
        info, ...typeApis,
        getRules: async () => ({ data: { serializeStatus: 0, status: 0, conditionType: 1, filterConditions: [] } }),
        getPublishedItems: async () => ({ data: { dataList: [] } }),
        getDraftItems: async () => ({ data: { dataList: [] } }),
        updateCollection: async (value) => { payload = value; latest = '1.0.0'; return { data: {} }; },
        versionInfo: async () => ({ data: { inputAttrs: [], customPropertyDescriptors: [], description: '', catalogueProperty: {}, dependencies: [{ resourceId: 'dep_1', versionRange: '^1.0.0' }], authExcludedItems: [] } }),
      },
    })).resolves.toMatchObject({ resourceId: 'collection_1', isMergeCatalogueDraft: 0, dependencies: [{ resourceId: 'dep_1', versionRange: '^1.0.0' }] });
    expect(payload).toMatchObject({ resourceId: 'collection_1', dependencies: [{ resourceId: 'dep_1', versionRange: '^1.0.0' }] });
    expect(contracts).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(batchAuth).not.toHaveBeenCalled();
    expect(readCollectionFormDraft(cwd, 'collection_1')).toBeUndefined();
  });

  it('仅发布目录变更时沿用线上表单依赖，不额外查询直接依赖合同', async () => {
    latest = '1.0.0';
    let payload: Record<string, unknown> | undefined;
    const directoryItem = { itemId: 'item_1', resourceId: 'resource_1', itemTitle: '目录单品', sortId: 1, authExcludedItems: [] };
    let publishedItems: Record<string, unknown>[] = [];
    await expect(publishCollection({
      cwd, homeDir, selector: 'id:collection_1', includeItems: 'auto', yes: true,
      apis: {
        info, ...typeApis,
        getRules: async () => ({ data: { serializeStatus: 0, status: 0, conditionType: 1, filterConditions: [] } }),
        getPublishedItems: async () => ({ data: { dataList: publishedItems } }),
        getDraftItems: async () => ({ data: { dataList: [directoryItem] } }),
        updateCollection: async (value) => { payload = value; publishedItems = [directoryItem]; return { data: {} }; },
        versionInfo: async () => ({ data: { inputAttrs: [], customPropertyDescriptors: [], description: '', catalogueProperty: {}, dependencies: [{ resourceId: 'dep_1', versionRange: '^1.0.0' }], authExcludedItems: [] } }),
      },
    })).resolves.toMatchObject({ resourceId: 'collection_1', isMergeCatalogueDraft: 1, dependencies: [{ resourceId: 'dep_1', versionRange: '^1.0.0' }] });
    expect(payload).toMatchObject({ resourceId: 'collection_1', isMergeCatalogueDraft: 1 });
  });
});
