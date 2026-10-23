import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { addCollectionDraftItems, type CollectionItemApis } from '../../src/domain/collection/items';
import { loginAccount } from '../../src/domain/account/login';
import { createCollectionIdentity } from '../../src/local/identity';
import { pullCollectionForm, mutateCollectionFormDraft, readCollectionFormDraft } from '../../src/domain/collection/form';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { FUtil } from '../../src/platform/api';
import * as tty from '../../src/core/tty';

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const target = { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: 4, userId: 7, status: 0, latestVersion: '' };
const source = (resourceId = 'source_1') => ({ resourceId, resourceName: `alice/${resourceId}`, resourceTitle: '来源标题',
  userId: 7, subjectType: 1, status: 1, latestVersion: '1.0.0', baseUpcastResources: [] as Array<{ resourceId: string }> });
const without = (key: string) => Object.fromEntries(Object.entries(source()).filter(([field]) => field !== key));
const page = (ids: string[]) => ok({ skip: 0, limit: 100, totalItem: ids.length,
  dataList: ids.map((resourceId, index) => ({ itemId: `item_${resourceId}`, itemTitle: '来源标题', sortId: index, mountResourceInfo: { resourceId } })) });
function snapshot(root: string): unknown[] {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => [entry.name,
    entry.isDirectory() ? snapshot(path.join(root, entry.name)) : readFileSync(path.join(root, entry.name)).toString('base64')]);
}

describe('C03.S01–S06 来源详情先于确认/合同/POST验证', () => {
  let cwd: string, homeDir: string, saved: typeof FUtil.Axios.defaults.adapter;
  let sdk: Array<{ method: unknown; url: unknown; params: unknown }>;
  let unexpectedSdk: unknown[];
  let sdkSource: unknown;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-item-source-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-item-source-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    createCollectionIdentity(cwd, { subject: 'collection', resourceId: target.resourceId, resourceName: target.resourceName, name: 'collection', typeCode: 'CT001', env: 'test' });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => ok(target),
      resourceTypes: async () => ok([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
      getByCode: async () => ok({ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], attrs: [], resourceConfig: { supportOptionalConfig: 2 } }),
      filesInfo: async () => ok({ metaInfoArray: [] }),
    } });
    mutateCollectionFormDraft(cwd, target.resourceId, (form) => ({ ...form, description: '来源异常也须保留的当前稿' }));
    expect(readCollectionFormDraft(cwd, target.resourceId)?.form.description).toBe('来源异常也须保留的当前稿');
    mkdirSync(path.join(cwd, 'empty')); writeFileSync(path.join(cwd, 'binary'), Buffer.from([0, 255, 254]));
    vi.spyOn(tty, 'confirmWrite').mockImplementation(async (preview) => preview);
    saved = FUtil.Axios.defaults.adapter; sdk = []; unexpectedSdk = []; sdkSource = ok(source());
    FUtil.Axios.defaults.adapter = async (config) => {
      sdk.push({ method: config.method, url: config.url, params: structuredClone(config.params) });
      if (config.method !== 'get' || !['/v2/resources/collection_1', '/v2/resources/source_1'].includes(config.url ?? '')) {
        unexpectedSdk.push({ method: config.method, url: config.url });
        throw new Error('UNEXPECTED_SDK_REQUEST');
      }
      return { config, status: 200, statusText: 'OK', headers: {},
        data: config.url === '/v2/resources/collection_1' ? ok(target) : sdkSource };
    };
  });
  afterEach(() => { try { expect(unexpectedSdk).toEqual([]); }
    finally { FUtil.Axios.defaults.adapter = saved; vi.restoreAllMocks(); resetEnvForTests();
      rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); } });

  function fixture(response: unknown = ok(source()), useSdk = false) {
    const local = snapshot(cwd), home = snapshot(homeDir), infos: Record<string, unknown>[] = [], writes: Record<string, unknown>[] = [], contracts: Record<string, unknown>[] = [];
    const checks: Record<string, unknown>[] = [];
    let added: string[] = [];
    const apis: CollectionItemApis = {
      ...(!useSdk ? { info: async (params: Record<string, unknown>) => { infos.push(params); return params.resourceIdOrName === 'collection_1' ? ok(target) : response; } } : {}),
      getRules: async () => ok(null), getDraftItems: async () => page(added),
      checkItems: async (params) => { checks.push(params); return ok(String(params.resourceIds).split(',')
        .map((resourceId) => ({ resourceId, isExists: false }))); },
      batchContracts: async (params) => { contracts.push(params); return ok([{ contractId: 'contract_upstream', subjectId: 'upstream', subjectType: 1,
        licenseeId: 'collection_1', licenseeIdentityType: 4, status: 0, authStatus: 128 }]); },
      addDraftItems: async (params) => { writes.push(params); const items = params.addCollectionItems as Array<{ resourceId: string; itemTitle: string }>;
        added = items.map((item) => item.resourceId); return ok({ addSuccessfulItems: items, addFailedItems: [], ignoreItems: [] }); },
    };
    return { input: { cwd, homeDir, selector: 'id:collection_1', sources: ['id:source_1'], yes: true, apis }, infos, writes, contracts, checks,
      unchanged: () => { expect(snapshot(cwd)).toEqual(local); expect(snapshot(homeDir)).toEqual(home); if (!useSdk) expect(sdk).toEqual([]); },
      noWrites: () => { expect(writes).toEqual([]); expect(contracts).toEqual([]); expect(tty.confirmWrite).not.toHaveBeenCalled();
        expect(checks).toEqual([]);
        expect(added).toEqual([]); expect(snapshot(cwd)).toEqual(local); expect(snapshot(homeDir)).toEqual(home); if (!useSdk) expect(sdk).toEqual([]); } };
  }

  it.each(['id:source_1', 'name:alice/source_1', 'source_1', 'alice/source_1'])('合法%s对应精确身份，空上游不查合同', async (selector) => {
    const f = fixture(); f.input.sources = [selector];
    expect(await addCollectionDraftItems(f.input)).toEqual({ added: ['source_1'], unchanged: [], failed: [] });
    expect(f.infos.filter((entry) => entry.resourceIdOrName !== 'collection_1')).toEqual([{ resourceIdOrName: selector.replace(/^(id:|name:)/, ''), isLoadLatestVersionInfo: 1 }]);
    expect(f.writes).toEqual([{ resourceId: 'collection_1', addCollectionItems: [{ resourceId: 'source_1', itemTitle: '来源标题', authExcludedItems: [] }], isPublish: 0 }]);
    expect(tty.confirmWrite).toHaveBeenCalledTimes(1); expect(f.contracts).toEqual([]); f.unchanged();
  });

  it('重复上游去重后核验真实合集合同，128不阻断', async () => {
    const f = fixture(ok({ ...source(), baseUpcastResources: [{ resourceId: 'upstream' }, { resourceId: 'upstream' }] }));
    expect((await addCollectionDraftItems(f.input)).added).toEqual(['source_1']);
    expect(f.contracts).toEqual([{ subjectIds: 'upstream', subjectType: 1, licenseeId: 'collection_1', licenseeIdentityType: 4, isLoadPolicyInfo: 1 }]);
    expect(f.writes[0]).toEqual({ resourceId: 'collection_1', addCollectionItems: [{ resourceId: 'source_1', itemTitle: '来源标题', authExcludedItems: [{ resourceId: 'upstream', excludedType: 'contractId', excludedValue: 'contract_upstream' }] }], isPublish: 0 }); f.unchanged();
  });

  it.each((['contractId', 'subjectId', 'licenseeId'] as const).flatMap((field) => [
    ['前空白', (value: string) => ` ${value}`], ['后空白', (value: string) => `${value} `],
    ['格式控制', (value: string) => `${value}\u202e`],
  ].map(([label, mutate]) => ({ field, label, mutate: mutate as (value: string) => string }))))('合同$field含$label时添加入口零确认/POST且保稿', async ({ field, mutate }) => {
    const f = fixture(ok({ ...source(), baseUpcastResources: [{ resourceId: 'upstream' }] }));
    const original = f.input.apis.batchContracts!;
    f.input.apis.batchContracts = async (params) => {
      const result = await original(params) as { ret: number; errCode: number; data: Array<Record<string, unknown>> };
      const contract = result.data[0]!;
      return { ...result, data: [{ ...contract, [field]: mutate(contract[field] as string) }] };
    };
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_BROWSER_AUTH_REQUIRED' });
    expect(f.contracts).toHaveLength(1);
    expect(tty.confirmWrite).not.toHaveBeenCalled();
    expect(f.writes).toEqual([]);
    f.unchanged();
  });

  const invalid = [
    ['ret失败', { ...ok(source()), ret: 1 }], ['errCode失败', { ...ok(source()), errCode: 1 }],
    ['缺ret', { errCode: 0, data: source() }], ['缺errCode', { ret: 0, data: source() }], ['字符串ret', { ...ok(source()), ret: '0' }],
    ['字符串errCode', { ...ok(source()), errCode: '0' }], ['裸data', source()], ['null数据', ok(null)], ['数组data', ok([source()])],
    ['错误ID', ok({ ...source(), resourceId: 'another' })], ['缺ID', ok(without('resourceId'))], ['缺name', ok(without('resourceName'))],
    ['字符串owner', ok({ ...source(), userId: '7' })], ['owner别名', ok({ ...without('userId'), ownerId: 7 })], ['creator别名', ok({ ...without('userId'), creatorId: 7 })],
    ['字符串主体', ok({ ...source(), subjectType: '1' })], ['类型配置数组冒充主体', ok({ ...source(), subjectType: [1] })],
    ['字符串状态', ok({ ...source(), status: '1' })], ['数字版本', ok({ ...source(), latestVersion: 1 })], ['数字标题', ok({ ...source(), resourceTitle: 1 })],
    ['缺上游', ok(without('baseUpcastResources'))], ['null上游', ok({ ...source(), baseUpcastResources: null })],
    ['对象上游', ok({ ...source(), baseUpcastResources: {} })], ['null行', ok({ ...source(), baseUpcastResources: [null] })],
    ['缺上游ID', ok({ ...source(), baseUpcastResources: [{}] })], ['数字上游ID', ok({ ...source(), baseUpcastResources: [{ resourceId: 1 }] })],
    ['空上游ID', ok({ ...source(), baseUpcastResources: [{ resourceId: '' }] })],
    ['控制符上游ID', ok({ ...source(), baseUpcastResources: [{ resourceId: 'upstream\u202e' }] })],
  ] as const;
  it.each(invalid)('%s即使看似合格也零确认/合同/目录写', async (_name, response) => {
    const f = fixture(response);
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID' }); f.noWrites();
  });

  it.each([{ userId: 8 }, { subjectType: 4 }, { status: 4 }, { latestVersion: '' }])('合法详情但资格不满足%j安全拒绝', async (patch) => {
    const f = fixture(ok({ ...source(), ...patch }));
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_INVALID' }); f.noWrites();
  });

  it('按完整名称查询时，返回另一个名称也不能写', async () => {
    const f = fixture(); f.input.sources = ['name:alice/other'];
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID' }); f.noWrites();
  });
  it('第二来源坏元数据时，第一来源也未确认/查合同/提交', async () => {
    const f = fixture(ok({ ...source(), baseUpcastResources: [{ resourceId: 'upstream' }] })); const original = f.input.apis.info!;
    f.input.sources = ['id:source_1', 'id:source_2'];
    f.input.apis.info = (params) => params.resourceIdOrName === 'source_2' ? Promise.resolve(ok({ ...source('source_2'), baseUpcastResources: null })) : original(params);
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID' }); f.noWrites();
  });

  it.each(['', 'id:', 'name:', 'name:only', 'id:.', 'id:..', 'id:alice/name', 'id:bad\n', 'name:alice/na\u202eme', 'id:bad,other'])('非法selector%j在任何详情请求前拒绝', async (selector) => {
    const f = fixture(); f.input.sources = ['id:source_1', selector];
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_INVALID' });
    expect(f.infos).toEqual([]); f.noWrites();
  });

  it.each([0, 1])('实际SDK ret=%i、errCode0仍需领域核验', async (ret) => {
    sdkSource = { ...ok(source()), ret };
    const f = fixture(undefined, true);
    if (ret === 1) { await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID' }); f.noWrites(); }
    else { expect((await addCollectionDraftItems(f.input)).added).toEqual(['source_1']); expect(f.writes).toHaveLength(1); f.unchanged(); }
    const targetRequest = { method: 'get', url: '/v2/resources/collection_1', params: { isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 } };
    expect(sdk).toEqual([targetRequest, targetRequest, { method: 'get', url: '/v2/resources/source_1', params: { isLoadLatestVersionInfo: 1 } }, ...(ret === 0 ? [targetRequest] : [])]);
  });

  it('实际SDK抛出失败响应时也只给安全来源错误，不泄露原文', async () => {
    sdkSource = { ret: 1, errCode: 123, msg: 'Authorization=synthetic-secret private response' };
    const f = fixture(undefined, true);
    const error = await addCollectionDraftItems(f.input).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'COLLECTION_ITEM_SOURCE_RESPONSE_INVALID' });
    expect(String(error)).not.toContain('synthetic-secret'); f.noWrites();
    const targetRequest = { method: 'get', url: '/v2/resources/collection_1', params: { isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 } };
    expect(sdk).toEqual([targetRequest, targetRequest, { method: 'get', url: '/v2/resources/source_1', params: { isLoadLatestVersionInfo: 1 } }]);
  });
});
