import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { addCollectionDependency } from '../../src/domain/collection/dependencies';
import { pullCollectionForm, readCollectionFormDraft } from '../../src/domain/collection/form';
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

describe('合集直接依赖', () => {
  let cwd: string; let homeDir: string;
  const collectionInfo = async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0 } });
  const typeApis = {
    resourceTypes: async () => ([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
    getByCode: async () => ({ data: { code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], resourceConfig: { supportOptionalConfig: 2 } } }),
  };

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-dep-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-dep-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info: collectionInfo, ...typeApis } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  const baseApis = (extra: Record<string, unknown> = {}) => ({
    info: collectionInfo,
    targetInfo: async () => ({ data: { resourceId: 'resource_1', subjectType: [1], latestVersion: '1.2.0', status: 1 } }),
    getVersions: async () => ({ data: { dataList: [{ version: '1.2.0' }, { version: '1.1.0' }] } }),
    cycleCheck: async () => ({ data: { result: true } }),
    ...extra,
  });

  it('无合同、无策略时也只声明到本地 dependencies，不查询或签约', async () => {
    const getContracts = vi.spyOn(FServiceAPI.Contract, 'batchContracts');
    const sign = vi.spyOn(FServiceAPI.Contract, 'batchCreateContracts');
    const batchAuth = vi.spyOn(FServiceAPI.Resource, 'batchAuth');
    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1',
      apis: baseApis(),
    })).resolves.toEqual({ resourceId: 'resource_1', versionRange: '^1.2.0' });
    expect(getContracts).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(batchAuth).not.toHaveBeenCalled();
    expect(readCollectionFormDraft(cwd, 'collection_1')!.form.dependencies).toEqual([{ resourceId: 'resource_1', versionRange: '^1.2.0' }]);
  });

  it('改范围沿用声明模型并保留版本范围和循环校验', async () => {
    const cycleCheck = vi.fn(async () => ({ data: { result: true } }));
    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', range: '~1.2.0',
      apis: baseApis({ cycleCheck }),
    })).resolves.toEqual({ resourceId: 'resource_1', versionRange: '~1.2.0' });
    expect(cycleCheck).toHaveBeenCalledWith({ resourceId: 'collection_1', dependencies: [{ resourceId: 'resource_1', versionRange: '~1.2.0' }] });
    expect(readCollectionFormDraft(cwd, 'collection_1')!.form.dependencies).toEqual([{ resourceId: 'resource_1', versionRange: '~1.2.0' }]);
  });

  it('目标下架、范围未命中或循环依赖时仍拒绝写入', async () => {
    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1',
      apis: baseApis({ targetInfo: async () => ({ data: { resourceId: 'resource_1', subjectType: [1], latestVersion: '1.2.0', status: 4 } }) }),
    })).rejects.toMatchObject({ code: 'COLLECTION_DEP_TARGET_UNAVAILABLE' });

    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', range: '^2.0.0',
      apis: baseApis(),
    })).rejects.toMatchObject({ code: 'COLLECTION_DEP_RANGE_INVALID' });

    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1',
      apis: baseApis({ cycleCheck: async () => ({ data: { result: false } }) }),
    })).rejects.toMatchObject({ code: 'COLLECTION_DEP_CYCLE' });
    expect(readCollectionFormDraft(cwd, 'collection_1')!.form.dependencies).toEqual([]);
  });
});
