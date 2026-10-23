import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { addCollectionDraftItems, selectCollectionItemSources, type CollectionItemApis } from '../../src/domain/collection/items';
import * as picker from '../../src/domain/collection/itemPicker';
import { loginAccount } from '../../src/domain/account/login';
import { createCollectionIdentity } from '../../src/local/identity';
import { pullCollectionForm, mutateCollectionFormDraft } from '../../src/domain/collection/form';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { FUtil } from '../../src/platform/api';
import * as tty from '../../src/core/tty';

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const target = { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: 4, userId: 7, status: 0, latestVersion: '' };
const states = (isExists = false) => ok([{ resourceId: 's0', isExists }]);
function snapshot(root: string): unknown[] {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map((entry) => [entry.name,
    entry.isDirectory() ? snapshot(path.join(root, entry.name)) : readFileSync(path.join(root, entry.name)).toString('base64')]);
}

describe('C03.E01–E06 草稿判重、数量和安全预览', () => {
  let cwd: string, homeDir: string, saved: typeof FUtil.Axios.defaults.adapter;
  let sdk: unknown[], forbidden: unknown[], sdkResponse: unknown;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-item-preflight-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-item-preflight-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    createCollectionIdentity(cwd, { subject: 'collection', resourceId: target.resourceId, resourceName: target.resourceName, name: 'collection', typeCode: 'CT001', env: 'test' });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => ok(target),
      resourceTypes: async () => ok([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
      getByCode: async () => ok({ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], attrs: [], resourceConfig: { supportOptionalConfig: 2 } }),
      filesInfo: async () => ok({ metaInfoArray: [] }),
    } });
    mutateCollectionFormDraft(cwd, target.resourceId, (form) => ({ ...form, description: '判重失败不得更改本稿' }));
    mkdirSync(path.join(cwd, 'empty')); writeFileSync(path.join(cwd, 'binary'), Buffer.from([0, 255, 254]));
    vi.spyOn(tty, 'confirmWrite').mockImplementation(async (preview) => preview);
    saved = FUtil.Axios.defaults.adapter; sdk = []; forbidden = []; sdkResponse = states();
    FUtil.Axios.defaults.adapter = async (config) => {
      sdk.push({ method: config.method, url: config.url, params: structuredClone(config.params) });
      if (config.method !== 'get' || config.url !== '/v2/resources/catalogues/drafts/collection_1/items/checkExists') {
        forbidden.push(config.url); throw new Error('UNEXPECTED_SDK_REQUEST');
      }
      return { config, status: 200, statusText: 'OK', headers: {}, data: sdkResponse };
    };
  });
  afterEach(() => { try { expect(forbidden).toEqual([]); }
    finally { FUtil.Axios.defaults.adapter = saved; vi.restoreAllMocks(); resetEnvForTests();
      rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); } });

  function fixture(response?: unknown, initial: string[] = [], sdkMode = false) {
    const local = snapshot(cwd), home = snapshot(homeDir); let current = [...initial];
    const checks: Record<string, unknown>[] = [], writes: Record<string, unknown>[] = [], reads: unknown[] = [], contracts: unknown[] = [];
    const value = { title: '原标题', upcasts: [] as string[] };
    const apis: CollectionItemApis = {
      info: async ({ resourceIdOrName }) => ok(resourceIdOrName === 'collection_1' ? target : {
        resourceId: String(resourceIdOrName).split('/').at(-1), resourceName: `alice/${String(resourceIdOrName).split('/').at(-1)}`, resourceTitle: value.title,
        userId: 7, subjectType: 1, status: 1, latestVersion: '1.0.0', baseUpcastResources: value.upcasts.map((resourceId) => ({ resourceId })),
      }), getRules: async () => ok(null),
      getDraftItems: async (params) => { reads.push(params); const skip = params.skip as number;
        return ok({ skip, limit: 100, totalItem: current.length, dataList: current.slice(skip, skip + 100).map((resourceId, index) => ({ itemId: `i_${resourceId}`, itemTitle: value.title, sortId: skip + index, mountResourceInfo: { resourceId } })) }); },
      ...(!sdkMode ? { checkItems: async (params: Record<string, unknown>) => { checks.push(params); if (response instanceof Error) throw response;
        return response === undefined ? ok(String(params.resourceIds).split(',').map((resourceId) => ({ resourceId, isExists: initial.includes(resourceId) }))) : response; } } : {}),
      batchContracts: async (params) => { contracts.push(params); return ok([]); },
      addDraftItems: async (params) => { writes.push(params); const items = params.addCollectionItems as Array<{ resourceId: string; itemTitle: string }>;
        current.push(...items.map((item) => item.resourceId)); return ok({ addSuccessfulItems: items, addFailedItems: [], ignoreItems: [] }); },
    };
    return { input: { cwd, homeDir, selector: 'id:collection_1', sources: ['id:s0'], yes: true, apis }, checks, writes, reads, contracts, value,
      unchanged: () => { expect(snapshot(cwd)).toEqual(local); expect(snapshot(homeDir)).toEqual(home); if (!sdkMode) expect(sdk).toEqual([]); },
      rejected: () => { expect(writes).toEqual([]); expect(contracts).toEqual([]); expect(tty.confirmWrite).not.toHaveBeenCalled(); expect(current).toEqual(initial);
        expect(snapshot(cwd)).toEqual(local); expect(snapshot(homeDir)).toEqual(home); if (!sdkMode) expect(sdk).toEqual([]); } };
  }

  it('去重真实ID查询一次，乱序true/false按ID对应且保留已有项', async () => {
    const f = fixture(ok([{ resourceId: 's1', isExists: false }, { resourceId: 's0', isExists: true }]), ['s0']);
    f.input.sources = ['id:s0', 'name:alice/s0', 'id:s1'];
    expect(await addCollectionDraftItems(f.input)).toEqual({ added: ['s1'], unchanged: ['s0'], failed: [] });
    expect(f.checks).toEqual([{ resourceId: 'collection_1', resourceIds: 's0,s1' }]);
    expect(f.writes).toHaveLength(1); f.unchanged();
  });
  it.each(['frozen', 'owner'])('交互选择完成后重新核验%s，不沿用选择快照写入', async (variant) => {
    const f = fixture(); vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    const original = f.input.apis.info!; let selected = false;
    f.input.apis.info = async (params) => {
      const result = await original(params) as { ret: number; errCode: number; data: Record<string, unknown> };
      if (selected && variant === 'frozen' && params.resourceIdOrName === 'collection_1') return { ...result, data: { ...result.data, status: 2 } };
      if (selected && variant === 'owner' && params.resourceIdOrName === 's0') return { ...result, data: { ...result.data, userId: 8 } };
      return result;
    };
    const ui = vi.spyOn(picker, 'pickCollectionItemSources').mockImplementation(async (input) => {
      expect(input.userId).toBe(7); expect(input.existingIds).toEqual([]); selected = true; return ['s0'];
    });
    const chosen = await selectCollectionItemSources(f.input);
    expect(chosen).toEqual({ resourceId: 'collection_1', sources: ['id:s0'] }); expect(ui).toHaveBeenCalledTimes(1);
    await expect(addCollectionDraftItems({ ...f.input, selector: `id:${chosen.resourceId}`, sources: chosen.sources }))
      .rejects.toMatchObject({ code: variant === 'frozen' ? 'COLLECTION_FROZEN' : 'COLLECTION_ITEM_SOURCE_INVALID' });
    expect(f.checks).toEqual([]); f.rejected();
  });
  it('交互只读选择完整保留身份、非空稿、二进制及空目录；未发生确认或写', async () => {
    const f = fixture(); vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    vi.spyOn(picker, 'pickCollectionItemSources').mockResolvedValue(['s0']);
    expect(await selectCollectionItemSources(f.input)).toEqual({ resourceId: 'collection_1', sources: ['id:s0'] }); f.rejected();
  });
  it('全已存在仍先查专用接口，再返回未变更且不POST', async () => {
    const f = fixture(states(true), ['s0']);
    expect(await addCollectionDraftItems(f.input)).toEqual({ added: [], unchanged: ['s0'], failed: [] });
    expect(f.checks).toEqual([{ resourceId: 'collection_1', resourceIds: 's0' }]); f.rejected();
  });
  it.each([
    ['ret失败', { ...states(), ret: 1 }], ['errCode失败', { ...states(), errCode: 1 }], ['缺ret', { errCode: 0, data: states().data }],
    ['缺errCode', { ret: 0, data: states().data }], ['字符串ret', { ...states(), ret: '0' }], ['字符串errCode', { ...states(), errCode: '0' }],
    ['缺项', ok([])], ['额外项', ok([{ resourceId: 's0', isExists: false }, { resourceId: 'extra', isExists: false }])],
    ['重复', ok([{ resourceId: 's0', isExists: false }, { resourceId: 's0', isExists: false }])],
    ['数字bool', ok([{ resourceId: 's0', isExists: 0 }])], ['字符串bool', ok([{ resourceId: 's0', isExists: 'false' }])],
    ['错身份', ok([{ resourceId: 'other', isExists: false }])], ['null行', ok([null])], ['别名', ok({ dataList: states().data })],
    ['null响应', null], ['非数组data', ok({})], ['裸数组', states().data], ['缺身份', ok([{ isExists: false }])], ['数字身份', ok([{ resourceId: 0, isExists: false }])],
  ])('判重%s不可当作未存在，零后续写', async (_label, response) => {
    const f = fixture(response);
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID' });
    expect(f.checks).toHaveLength(1); f.rejected();
  });
  it.each([
    ['同长重复', [{ resourceId: 's0', isExists: false }, { resourceId: 's0', isExists: false }]],
    ['同长额外', [{ resourceId: 's0', isExists: false }, { resourceId: 'extra', isExists: false }]],
  ])('请求两ID时%s不能靠长度门禁掩盖集合错误', async (_label, rows) => {
    const f = fixture(ok(rows)); f.input.sources = ['id:s0', 'id:s1'];
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID' });
    expect(f.checks).toEqual([{ resourceId: 'collection_1', resourceIds: 's0,s1' }]); f.rejected();
  });
  it('来源确有上游时，坏判重也须先于任何合同查询拒绝', async () => {
    const f = fixture({ ...states(), ret: 1 }); f.value.upcasts = ['upstream'];
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID' });
    expect(f.checks).toHaveLength(1); f.rejected();
  });
  it.each([false, true])('两次读取相反（目录已存在=%s）停止，不自动重读/重发', async (exists) => {
    const f = fixture(states(!exists), exists ? ['s0'] : []);
    await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_CATALOGUE_CHANGED' });
    expect(f.checks).toHaveLength(1); expect(f.reads).toHaveLength(1); f.rejected();
  });
  it('判重SDK异常受控且不泄露原始消息', async () => {
    const f = fixture(new Error('Authorization=synthetic-private'));
    const error = await addCollectionDraftItems(f.input).catch((value: unknown) => value);
    expect(error).toMatchObject({ code: 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID' }); expect(String(error)).not.toContain('synthetic-private'); f.rejected();
  });
  it.each([100, 101])('%i个实际来源严格守上限，不重复计别名', async (count) => {
    const f = fixture(); f.input.sources = [...Array.from({ length: count }, (_, i) => `id:s${i}`), 'name:alice/s0'];
    if (count === 101) { await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_LIMIT' }); expect(f.checks).toEqual([]); f.rejected(); }
    else { expect((await addCollectionDraftItems(f.input)).added).toEqual(Array.from({ length: 100 }, (_, i) => `s${i}`)); expect(f.checks).toHaveLength(1); f.unchanged(); }
  });
  it('预览转义终端控制，提交原标题不受影响', async () => {
    const f = fixture(); f.value.title = '标题\n\u001b[31m\u009b\u202e\u2028末尾';
    await addCollectionDraftItems(f.input);
    expect(tty.confirmWrite).toHaveBeenCalledExactlyOnceWith('添加 1 个单品到合集目录草稿\n- s0 "标题\\n\\u001b[31m\\u009b\\u202e\\u2028末尾"', true);
    expect(f.writes[0].addCollectionItems).toEqual([{ resourceId: 's0', itemTitle: f.value.title, authExcludedItems: [] }]); f.unchanged();
  });
  it('预览的补充平面格式控制保持完整UTF-16引用，不截断原字符', async () => {
    const f = fixture(); f.value.title = `标记${String.fromCodePoint(0xe0001)}末尾`;
    await addCollectionDraftItems(f.input);
    const preview = vi.mocked(tty.confirmWrite).mock.calls[0][0];
    const quoted = preview.split('\n- s0 ')[1];
    expect(quoted).toBe('"标记\\udb40\\udc01末尾"');
    expect(JSON.parse(quoted)).toBe(f.value.title); f.unchanged();
  });
  it.each([0, 1])('真实SDK判重ret=%i/errCode0仍需业务信封核验', async (ret) => {
    sdkResponse = { ...states(), ret }; const f = fixture(undefined, [], true);
    if (ret === 1) { await expect(addCollectionDraftItems(f.input)).rejects.toMatchObject({ code: 'COLLECTION_ITEM_EXISTENCE_RESPONSE_INVALID' }); f.rejected(); }
    else { expect((await addCollectionDraftItems(f.input)).added).toEqual(['s0']); f.unchanged(); }
    expect(sdk).toEqual([{ method: 'get', url: '/v2/resources/catalogues/drafts/collection_1/items/checkExists', params: { resourceIds: 's0' } }]);
  });
});
