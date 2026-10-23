import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { addCollectionDependency, removeCollectionDependency, type CollectionDepApis } from '../../src/domain/collection/dependencies';
import { collectionFormDraftPath, mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft } from '../../src/domain/collection/form';
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
  const collectionInfo = async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0, latestVersion: '' } });
  const typeApis = {
    resourceTypes: async () => ({ ret: 0, errCode: 0, data: [{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }] }),
    getByCode: async () => ({ ret: 0, errCode: 0, data: { code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], attrs: [], resourceConfig: { supportOptionalConfig: 2 } } }),
    filesInfo: async () => ({ ret: 0, errCode: 0, data: { metaInfoArray: [] } }),
  };

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-dep-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-dep-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info: collectionInfo, ...typeApis } });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  const baseApis = (extra: Record<string, unknown> = {}) => ({
    info: collectionInfo,
    targetInfo: async () => ({ ret: 0, errCode: 0, data: { resourceId: 'resource_1', resourceName: 'alice/resource', subjectType: 1, latestVersion: '1.2.0', status: 1 } }),
    getVersions: async () => ({ ret: 0, errCode: 0, data: [{ resourceId: 'resource_1', version: '1.2.0' }, { resourceId: 'resource_1', version: '1.1.0' }] }),
    cycleCheck: async () => ({ ret: 0, errCode: 0, data: true }),
    ...extra,
  });

  async function rejectWithoutChangingDraft(apis: CollectionDepApis, code: string, source = 'id:resource_1') {
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    await expect(addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source, apis })).rejects.toMatchObject({ code });
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1')).equals(before)).toBe(true);
  }

  it.each(['missing-ret', 'missing-errCode', 'failed-ret', 'failed-errCode', 'string-ret', 'string-errCode', 'null', 'bare'] as const)
  ('详情%s信封不能用内含有效数据冒充成功', async (mode) => {
    const good = await baseApis().targetInfo();
    const response: Record<string, unknown> | null = mode === 'null' ? null : mode === 'bare' ? good.data : { ...good };
    if (response && mode === 'missing-ret') delete response.ret;
    if (response && mode === 'missing-errCode') delete response.errCode;
    if (response && mode === 'failed-ret') response.ret = 1;
    if (response && mode === 'failed-errCode') response.errCode = 7;
    if (response && mode === 'string-ret') response.ret = '0';
    if (response && mode === 'string-errCode') response.errCode = '0';
    const getVersions = vi.fn(baseApis().getVersions), cycleCheck = vi.fn(baseApis().cycleCheck);
    await rejectWithoutChangingDraft(baseApis({ targetInfo: async () => response, getVersions, cycleCheck }), 'COLLECTION_DEP_TARGET_RESPONSE_INVALID');
    expect(getVersions).not.toHaveBeenCalled(); expect(cycleCheck).not.toHaveBeenCalled();
  });

  it.each([
    { patch: { resourceId: 'other_resource' } }, { patch: { resourceId: 'resource_1 ' } }, { patch: { resourceId: 'resource_1,other' } },
    { patch: { resourceName: 'other/resource' }, source: 'name:alice/resource' },
  ])('详情精确身份%#不匹配不能借版本号有效继续', async ({ patch, source }) => {
    const good = await baseApis().targetInfo(), getVersions = vi.fn(baseApis().getVersions), cycleCheck = vi.fn(baseApis().cycleCheck);
    await rejectWithoutChangingDraft(baseApis({ targetInfo: async () => ({ ...good, data: { ...good.data, ...patch } }), getVersions, cycleCheck }), 'COLLECTION_DEP_TARGET_RESPONSE_INVALID', source);
    expect(getVersions).not.toHaveBeenCalled(); expect(cycleCheck).not.toHaveBeenCalled();
  });

  it.each(['1', true, [1, 4], []].map((subjectType) => ({ subjectType })))('主体%j不能强转或包含1即当单资源', async ({ subjectType }) => {
    const good = await baseApis().targetInfo(); const cycleCheck = vi.fn(baseApis().cycleCheck);
    await rejectWithoutChangingDraft(baseApis({ targetInfo: async () => ({ ...good, data: { ...good.data, subjectType } }), cycleCheck }), 'COLLECTION_DEP_TARGET_INVALID');
    expect(cycleCheck).not.toHaveBeenCalled();
  });
  it.each(['1', true])('状态%j不能强转为已上架', async (status) => {
    const good = await baseApis().targetInfo(); const cycleCheck = vi.fn(baseApis().cycleCheck);
    await rejectWithoutChangingDraft(baseApis({ targetInfo: async () => ({ ...good, data: { ...good.data, status } }), cycleCheck }), 'COLLECTION_DEP_TARGET_UNAVAILABLE');
    expect(cycleCheck).not.toHaveBeenCalled();
  });

  it.each(['missing-ret', 'missing-errCode', 'failed-ret', 'failed-errCode', 'string-ret', 'string-errCode', 'dataList', 'list', 'bare', 'null'] as const)
  ('版本%s响应不能猜测或用失败数据通过', async (mode) => {
    const good = await baseApis().getVersions();
    const response: Record<string, unknown> | unknown[] | null = mode === 'null' ? null : mode === 'bare' ? good.data : { ...good };
    if (response && !Array.isArray(response)) {
      if (mode === 'missing-ret') delete response.ret;
      if (mode === 'missing-errCode') delete response.errCode;
      if (mode === 'failed-ret') response.ret = 1;
      if (mode === 'failed-errCode') response.errCode = 7;
      if (mode === 'string-ret') response.ret = '0';
      if (mode === 'string-errCode') response.errCode = '0';
      if (mode === 'dataList') response.data = { dataList: good.data };
      if (mode === 'list') response.data = { list: good.data };
    }
    const cycleCheck = vi.fn(baseApis().cycleCheck);
    await rejectWithoutChangingDraft(baseApis({ getVersions: async () => response, cycleCheck }), 'COLLECTION_DEP_VERSIONS_RESPONSE_INVALID');
    expect(cycleCheck).not.toHaveBeenCalled();
  });

  it.each([
    [{ resourceId: 'other_resource', version: '1.2.0' }], [{ version: '1.2.0' }],
    [{ resourceId: 'resource_1', version: '1.2.0' }, null],
    [{ resourceId: 'resource_1', version: '1.2.0' }, { resourceId: 'resource_1', version: 'invalid' }],
    [{ resourceId: 'resource_1', version: '1.2.0' }, { resourceId: 'resource_1', version: '1.2.0' }],
  ].map((rows) => ({ rows })))('完整版本数组的坏行%#不能过滤后继续', async ({ rows }) => {
    const cycleCheck = vi.fn(baseApis().cycleCheck);
    await rejectWithoutChangingDraft(baseApis({ getVersions: async () => ({ ret: 0, errCode: 0, data: rows }), cycleCheck }), 'COLLECTION_DEP_VERSIONS_RESPONSE_INVALID');
    expect(cycleCheck).not.toHaveBeenCalled();
  });

  it.each(['target', 'versions'] as const)('%s读取异常固定拒绝、不重试或透传原始诊断', async (stage) => {
    const request = vi.fn(async () => { throw new Error('SYNTHETIC_DEPENDENCY_PRIVATE_DIAGNOSTIC'); });
    const cycleCheck = vi.fn(baseApis().cycleCheck);
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const error = await addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', apis: baseApis({
      ...(stage === 'target' ? { targetInfo: request } : { getVersions: request }), cycleCheck,
    }) }).catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: stage === 'target' ? 'COLLECTION_DEP_TARGET_RESPONSE_INVALID' : 'COLLECTION_DEP_VERSIONS_RESPONSE_INVALID' });
    expect(String(error)).not.toContain('SYNTHETIC_DEPENDENCY_PRIVATE_DIAGNOSTIC');
    expect(request).toHaveBeenCalledOnce(); expect(cycleCheck).not.toHaveBeenCalled();
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1')).equals(before)).toBe(true);
  });

  it.each(['id:', 'name:', 'id: resource_1', 'id:resource_1\n', 'file:1.json'])('无效来源%s在任何SDK读取前拒绝', async (source) => {
    const info = vi.fn(collectionInfo), targetInfo = vi.fn(baseApis().targetInfo);
    await rejectWithoutChangingDraft(baseApis({ info, targetInfo }), 'COLLECTION_DEP_TARGET_INVALID', source);
    expect(info).not.toHaveBeenCalled(); expect(targetInfo).not.toHaveBeenCalled();
  });

  it.each(['id:resource_1', 'resource_1', 'name:alice/resource', 'alice/resource'])('成功信封支持精确来源%s且请求只使用已解析身份', async (source) => {
    const targetInfo = vi.fn(baseApis().targetInfo);
    await expect(addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source, apis: baseApis({ targetInfo }) }))
      .resolves.toEqual({ resourceId: 'resource_1', versionRange: '^1.2.0' });
    expect(targetInfo).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: source.replace(/^(id:|name:)/, ''), isLoadLatestVersionInfo: 1 });
  });

  it('已确认的单项数值主体数组仍可用，不扩大为混合主体兼容', async () => {
    const good = await baseApis().targetInfo();
    await expect(addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', apis: baseApis({
      targetInfo: async () => ({ ...good, data: { ...good.data, subjectType: [1] } }),
    }) })).resolves.toEqual({ resourceId: 'resource_1', versionRange: '^1.2.0' });
  });

  it.each(['invalid-range', 'empty', 'latest-absent', 'no-hit'] as const)('已发布范围%s仍保持原范围错误且零环检测/改稿', async (mode) => {
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const getVersions = vi.fn(async () => ({ ret: 0, errCode: 0, data: mode === 'empty' ? []
      : [{ resourceId: 'resource_1', version: mode === 'latest-absent' ? '1.1.0' : '1.2.0' }] }));
    const cycleCheck = vi.fn(baseApis().cycleCheck);
    await expect(addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1',
      range: mode === 'invalid-range' ? 'not-semver' : mode === 'no-hit' ? '^3.0.0' : '^1.0.0', apis: baseApis({ getVersions, cycleCheck }),
    })).rejects.toMatchObject({ code: 'COLLECTION_DEP_RANGE_INVALID' });
    expect(getVersions).toHaveBeenCalledTimes(mode === 'invalid-range' ? 0 : 1); expect(cycleCheck).not.toHaveBeenCalled();
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1')).equals(before)).toBe(true);
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
    const cycleCheck = vi.fn(async () => ({ ret: 0, errCode: 0, data: true }));
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
      apis: baseApis({ targetInfo: async () => ({ ret: 0, errCode: 0, data: { resourceId: 'resource_1', subjectType: 1, latestVersion: '1.2.0', status: 4 } }) }),
    })).rejects.toMatchObject({ code: 'COLLECTION_DEP_TARGET_UNAVAILABLE' });

    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', range: '^2.0.0',
      apis: baseApis(),
    })).rejects.toMatchObject({ code: 'COLLECTION_DEP_RANGE_INVALID' });

    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1',
      apis: baseApis({ cycleCheck: async () => ({ ret: 0, errCode: 0, data: false }) }),
    })).rejects.toMatchObject({ code: 'COLLECTION_DEP_CYCLE' });
    expect(readCollectionFormDraft(cwd, 'collection_1')!.form.dependencies).toEqual([]);
  });

  // 直接依赖§3.1与表单§4：冻结/RSS禁止全部本地表单写入口，包含删除。
  it.each([
    ['冻结', { status: 2 }],
    ['RSS标记', { rssSource: 'yes' }],
    ['RSS地址', { feedUrl: 'https://synthetic.invalid/feed.xml' }],
  ])('%s合集不能添加或移除直接依赖，失败完整保留原稿', async (_label, state) => {
    await addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', apis: baseApis() });
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const info = vi.fn(async () => ({ ...(await collectionInfo()), data: { ...(await collectionInfo()).data, ...state } }));
    const targetInfo = vi.fn(async () => ({ ret: 0, errCode: 0, data: { resourceId: 'resource_1', subjectType: 1, latestVersion: '1.2.0', status: 1 } }));
    const getVersions = vi.fn(async () => ({ ret: 0, errCode: 0, data: [{ resourceId: 'resource_1', version: '1.2.0' }] }));
    const cycleCheck = vi.fn(async () => ({ ret: 0, errCode: 0, data: true }));
    const apis = baseApis({ info, targetInfo, getVersions, cycleCheck });
    const added = await addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', apis })
      .then(() => ({ rejected: false }), (error: unknown) => ({ rejected: error instanceof Error }));
    const afterAdd = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const removed = await removeCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', resourceId: 'resource_1', apis })
      .then(() => ({ rejected: false }), (error: unknown) => ({ rejected: error instanceof Error }));
    expect({ added, removed, afterAddUnchanged: afterAdd.equals(before),
      afterRemoveUnchanged: readFileSync(collectionFormDraftPath(cwd, 'collection_1')).equals(before),
      infoCalls: info.mock.calls.length, targetCalls: targetInfo.mock.calls.length,
      versionCalls: getVersions.mock.calls.length, cycleCalls: cycleCheck.mock.calls.length,
    }).toEqual({ added: { rejected: true }, removed: { rejected: true }, afterAddUnchanged: true,
      afterRemoveUnchanged: true, infoCalls: 2, targetCalls: 0, versionCalls: 0, cycleCalls: 0 });
  });

  // 直接依赖§3.4：没有可信循环校验结果不是校验成功，不得写本地完整快照。
  it.each([
    ['空对象', {}],
    ['空data', { data: {} }],
    ['未知结果', { data: { result: 'unknown' } }],
    ['ret失败信封', { ret: 1, errCode: 0, data: true }],
    ['errCode失败信封', { ret: 0, errCode: 9, data: true }],
    ['字符串ret', { ret: '0', errCode: 0, data: true }],
    ['字符串errCode', { ret: 0, errCode: '0', data: true }],
    ['裸布尔值', true],
    ['对象不是布尔结果', { ret: 0, errCode: 0, data: { result: true } }],
    ['null结果', { ret: 0, errCode: 0, data: null }],
    ['缺少data的成功信封', { ret: 0, errCode: 0 }],
  ])('循环响应%s安全拒绝且不修改依赖', async (_label, response) => {
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const targetInfo = vi.fn(async () => ({ ret: 0, errCode: 0, data: { resourceId: 'resource_1', subjectType: 1, latestVersion: '1.2.0', status: 1 } }));
    const getVersions = vi.fn(async () => ({ ret: 0, errCode: 0, data: [{ resourceId: 'resource_1', version: '1.2.0' }] }));
    const cycleCheck = vi.fn(async () => response);
    const outcome = await addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1',
      apis: baseApis({ targetInfo, getVersions, cycleCheck }),
    }).then(() => ({ rejected: false }), (error: unknown) => ({ rejected: error instanceof Error }));
    expect({ ...outcome, unchanged: readFileSync(collectionFormDraftPath(cwd, 'collection_1')).equals(before),
      targetCalls: targetInfo.mock.calls.length, versionCalls: getVersions.mock.calls.length, cycleCalls: cycleCheck.mock.calls.length,
    }).toEqual({ rejected: true, unchanged: true, targetCalls: 1, versionCalls: 1, cycleCalls: 1 });
    expect(cycleCheck).toHaveBeenCalledWith({ resourceId: 'collection_1', dependencies: [{ resourceId: 'resource_1', versionRange: '^1.2.0' }] });
  });

  it('环检测请求异常保稿且只输出固定说明，不重试或透传诊断', async () => {
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const cycleCheck = vi.fn(async () => { throw new Error('SYNTHETIC_PRIVATE_CYCLE_DIAGNOSTIC'); });
    const failure = await addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1',
      apis: baseApis({ cycleCheck }),
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'COLLECTION_DEP_CYCLE_RESPONSE_INVALID' });
    expect(String(failure)).not.toContain('SYNTHETIC_PRIVATE_CYCLE_DIAGNOSTIC');
    expect(cycleCheck).toHaveBeenCalledTimes(1);
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1')).equals(before)).toBe(true);
  });

  it('改范围替换同一依赖并保留其他字段和基线，移除也只影响目标依赖', async () => {
    const getContracts = vi.spyOn(FServiceAPI.Contract, 'batchContracts');
    const sign = vi.spyOn(FServiceAPI.Contract, 'batchCreateContracts');
    const batchAuth = vi.spyOn(FServiceAPI.Resource, 'batchAuth');
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '保留本地说明',
      dependencies: [{ resourceId: 'resource_2', versionRange: '^2.0.0' }],
    }));
    await addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', apis: baseApis() });
    const before = readCollectionFormDraft(cwd, 'collection_1')!;
    const cycleCheck = vi.fn(async () => ({ ret: 0, errCode: 0, data: true }));
    await addCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', range: '~1.2.0', apis: baseApis({ cycleCheck }) });
    const ranged = readCollectionFormDraft(cwd, 'collection_1')!;
    expect(ranged.form).toEqual({ ...before.form, dependencies: [
      { resourceId: 'resource_2', versionRange: '^2.0.0' }, { resourceId: 'resource_1', versionRange: '~1.2.0' },
    ] });
    expect({ baseline: ranged.baseline, fingerprint: ranged.publishedBaselineFingerprint, authExcludedItems: ranged.authExcludedItems })
      .toEqual({ baseline: before.baseline, fingerprint: before.publishedBaselineFingerprint, authExcludedItems: before.authExcludedItems });
    expect(cycleCheck).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', dependencies: [
      { resourceId: 'resource_2', versionRange: '^2.0.0' }, { resourceId: 'resource_1', versionRange: '~1.2.0' },
    ] });
    await removeCollectionDependency({ cwd, homeDir, selector: 'id:collection_1', resourceId: 'resource_1', apis: baseApis() });
    expect(readCollectionFormDraft(cwd, 'collection_1')!.form).toEqual({ ...before.form, dependencies: [{ resourceId: 'resource_2', versionRange: '^2.0.0' }] });
    expect(getContracts).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(batchAuth).not.toHaveBeenCalled();
  });
});
