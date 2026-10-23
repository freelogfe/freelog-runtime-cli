import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { pullCollectionForm } from '../../src/domain/collection/form';
import { publishCollection } from '../../src/domain/collection/publish';
import { getCollectionCollectRules, setCollectionCollectRules } from '../../src/domain/collection/collectRules';
import { addCollectionDraftItems, renameCollectionDraftItem, removeCollectionDraftItems, moveCollectionDraftItem, sortCollectionDraftItems, type CollectionItemApis } from '../../src/domain/collection/items';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

const infoData = { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT', subjectType: [4], userId: 7, status: 4, serializeStatus: 0 };
const info = async () => ({ ret: 0, errCode: 0, data: infoData });
const state = { status: 0, conditionType: 1, filterConditions: [] };
const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const item = { itemId: 'one', itemTitle: 'old', sortId: 1, mountResourceInfo: { resourceId: 'source_1' } };
const page = (itemTitle: string) => ok({ skip: 0, limit: 100, totalItem: 1, dataList: [{ ...item, itemTitle }] });
const snapshot = (root: string): unknown[] => readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).map(entry => [
  entry.name, entry.isDirectory() ? snapshot(path.join(root, entry.name)) : readFileSync(path.join(root, entry.name)).toString('base64'),
]);
const unintendedRequest = vi.hoisted(() => vi.fn(() => { throw new Error('TEST_API_NOT_INJECTED'); }));
vi.mock('../../src/platform/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: { ...actual.FServiceAPI, Resource: new Proxy({}, { get: () => unintendedRequest }) } };
});

describe('合集规则信封必须先于任何写入得到验证', () => {
  let cwd: string; let homeDir: string;
  function preserveLocal() {
    const forms = path.join(cwd, '.freelog', 'collection-forms', 'test');
    mkdirSync(forms, { recursive: true });
    writeFileSync(path.join(forms, 'collection_1.json'), '{"keep":"synthetic current draft"}\n');
    mkdirSync(path.join(cwd, 'empty-dir')); writeFileSync(path.join(cwd, 'keep.bin'), Buffer.from([0, 255, 7]));
    const localBefore = snapshot(cwd), homeBefore = snapshot(homeDir);
    return () => { expect(snapshot(cwd)).toEqual(localBefore); expect(snapshot(homeDir)).toEqual(homeBefore); };
  }
  beforeEach(async () => {
    unintendedRequest.mockClear();
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-rules-response-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-rules-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
  });
  afterEach(() => {
    try { expect(unintendedRequest).not.toHaveBeenCalled(); }
    finally { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); }
  });

  it('缺失的规则响应不是自动关闭初态', async () => {
    await expect(getCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', apis: { info, getRules: async () => undefined } })).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
  });

  it('失败信封即使data为null也不能放行目录改名', async () => {
    let title = 'old'; const rename = vi.fn(async () => { title = 'new'; });
    const getDraftItems = vi.fn(async () => page(title));
    const apis: CollectionItemApis = { info, getRules: async () => ({ ret: 1, errCode: 7, data: null }), getDraftItems, renameDraftItems: rename };
    await expect(renameCollectionDraftItem({ cwd, homeDir, selector: 'id:collection_1', itemId: 'one', title: 'new', yes: true, apis })).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
    expect(rename).not.toHaveBeenCalled(); expect(getDraftItems).not.toHaveBeenCalled();
  });

  it.each(['add', 'rename', 'remove', 'move', 'sort'])('所有手工目录写消费者均在读取目录和写入前拒绝未知模式：%s', async (operation) => {
    const directory = vi.fn(), write = vi.fn();
    const apis: CollectionItemApis = { info, getRules: async () => undefined, getDraftItems: directory,
      addDraftItems: write, renameDraftItems: write, removeDraftItems: write, moveDraftItems: write, reorderDraftItems: write };
    const input = { cwd, homeDir, selector: 'id:collection_1', yes: true, apis };
    const actions: Record<string, () => Promise<unknown>> = {
      add: () => addCollectionDraftItems({ ...input, sources: ['id:source_1'] }),
      rename: () => renameCollectionDraftItem({ ...input, itemId: 'one', title: 'new' }),
      remove: () => removeCollectionDraftItems({ ...input, itemIds: ['one'] }),
      move: () => moveCollectionDraftItem({ ...input, itemId: 'one', before: 'two' }),
      sort: () => sortCollectionDraftItems({ ...input, by: 'title', direction: 'asc' }),
    };
    await expect(actions[operation]()).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
    expect(directory).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });

  it('写后读取若变成缺失信封，不能把它报告成规则更新成功', async () => {
    let reads = 0; const write = vi.fn(async () => ok({}));
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'off', yes: true,
      apis: { info, getRules: async () => ++reads === 1 ? ok(state) : undefined, setRules: write },
    })).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined, null, [], 'ok', {}, { data: {} }, { ret: 0 }, { errCode: 0 },
    { ret: 1, errCode: 0 }, { ret: 0, errCode: 1 }, { ret: '0', errCode: 0 },
    { ret: 0, errCode: '0' }, { ret: false, errCode: 0 }, { ret: 0, errCode: false },
  ])('C05.W02 写响应不能借相同的线上状态救成成功：%j', async (response) => {
    const unchanged = preserveLocal();
    const readInfo = vi.fn(info), readRules = vi.fn(async () => ok(state));
    const write = vi.fn(async () => response);
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'off', yes: true,
      apis: { info: readInfo, getRules: readRules, setRules: write },
    })).rejects.toMatchObject({ code: 'COLLECTION_RULES_WRITE_UNCONFIRMED' });
    expect(write).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', serializeStatus: 0, ...state });
    expect(readInfo).toHaveBeenCalledTimes(1); expect(readRules).toHaveBeenCalledTimes(1);
    unchanged();
  });

  it('C05.W03 写入异常不暴露原始诊断、不重发或继续读回', async () => {
    const unchanged = preserveLocal();
    const marker = 'SYNTHETIC_RULE_WRITE_SECRET';
    const readInfo = vi.fn(info), readRules = vi.fn(async () => ok(state));
    const write = vi.fn(async () => { throw new Error(marker); });
    const result = await setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'off', yes: true,
      apis: { info: readInfo, getRules: readRules, setRules: write },
    }).catch(error => error);
    expect(result).toMatchObject({ code: 'COLLECTION_RULES_WRITE_UNCONFIRMED' });
    expect(String(result)).not.toContain(marker);
    expect(write).toHaveBeenCalledTimes(1); expect(readInfo).toHaveBeenCalledTimes(1); expect(readRules).toHaveBeenCalledTimes(1);
    unchanged();
  });

  it.each([{ ret: 0, errCode: 0 }, ok(null)])('C05.W01 成功写信封不要求data包含读取DTO，但仍须严格读回：%j', async response => {
    const unchanged = preserveLocal();
    const readInfo = vi.fn(info), readRules = vi.fn(async () => ok(state)), write = vi.fn(async () => response);
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'off', yes: true,
      apis: { info: readInfo, getRules: readRules, setRules: write },
    })).resolves.toEqual({ serializeStatus: 0, ...state });
    expect(write).toHaveBeenCalledTimes(1); expect(readInfo).toHaveBeenCalledTimes(2); expect(readRules).toHaveBeenCalledTimes(2);
    unchanged();
  });

  it('C05.W04 成功写入但读回不一致仍不能成功', async () => {
    const unchanged = preserveLocal();
    const readRules = vi.fn().mockResolvedValueOnce(ok(state)).mockResolvedValueOnce(ok({ ...state, status: 1 }));
    const write = vi.fn(async () => ok(null));
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'off', yes: true,
      apis: { info, getRules: readRules, setRules: write },
    })).rejects.toMatchObject({ code: 'COLLECTION_RULES_VERIFY_FAILED' });
    expect(write).toHaveBeenCalledTimes(1);
    unchanged();
  });

  it('发布消费者也在持久化intent或PUT之前拒绝失败规则信封', async () => {
    const typeApis = { resourceTypes: async () => ok([{ code: 'CT', name: '测试合集', status: 1, isTerminate: true, subjectType: [4] }]),
      getByCode: async () => ok({ code: 'CT', status: 1, isTerminate: true, subjectType: [4], attrs: [], resourceConfig: { supportOptionalConfig: 2 } }),
      filesInfo: async () => ok({ metaInfoArray: [] }) };
    const publishedInfo = async () => ok({ ...infoData, latestVersion: '' });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info: publishedInfo, ...typeApis } });
    const update = vi.fn();
    await expect(publishCollection({ cwd, homeDir, selector: 'id:collection_1', includeItems: 'no', yes: true,
      apis: { info: publishedInfo, ...typeApis, getRules: async () => ({ ret: 1, errCode: 7, data: null }),
        getPublishedItems: async () => ok({ skip: 0, limit: 100, totalItem: 0, dataList: [] }),
        getDraftItems: async () => ok({ skip: 0, limit: 100, totalItem: 0, dataList: [] }), updateCollection: update },
    })).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
    expect(update).not.toHaveBeenCalled();
    expect(existsSync(path.join(cwd, '.freelog', 'collection-forms', 'intents'))).toBe(false);
  });

  it.each([
    undefined, null, {}, { data: null }, { ret: 0, errCode: 0 }, ok(undefined), { ret: '0', errCode: 0, data: null }, { ret: 0, errCode: 1, data: null },
    ok({ ...state, status: '0' }), ok({ ...state, conditionType: true }), ok({ status: 0, conditionType: 1 }), ok({ ...state, filterConditions: null }),
    ok({ ...state, filterConditions: [null] }), ok({ ...state, filterConditions: [{ key: 'unknown', limitOperatorType: 'INCLUDES', value: 'x' }] }),
    ok({ ...state, serializeStatus: '0' }),
  ])('错误规则不能被get/set的共享读取当成有效基线：%j', async (response) => {
    const setRules = vi.fn();
    await expect(getCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', apis: { info, getRules: async () => response } })).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
    await expect(setCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', auto: 'off', yes: true, apis: { info, getRules: async () => response, setRules } })).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
    expect(setRules).not.toHaveBeenCalled();
  });

  it('真实成功null保持初态，完结状态从已验证详情读取', async () => {
    await expect(getCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', apis: { info, getRules: async () => ok(null) } })).resolves.toEqual({ serializeStatus: 0, ...state });
    await expect(getCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => ok({ ...infoData, serializeStatus: undefined }), getRules: async () => ok(null) } })).rejects.toMatchObject({ code: 'COLLECTION_RULES_RESPONSE_INVALID' });
  });
});
