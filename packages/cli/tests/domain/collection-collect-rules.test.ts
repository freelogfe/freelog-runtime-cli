import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { getCollectionCollectRules, setCollectionCollectRules } from '../../src/domain/collection/collectRules';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { FUtil } from '../../src/platform/api';

const cataloguePage = (items: unknown[]) => ({ ret: 0, errCode: 0, data: { skip: 0, limit: 100, totalItem: items.length, dataList: items } });
const catalogueItem = { itemId: 'i1', mountResourceInfo: { resourceId: 'r1' }, itemTitle: 'one', sortId: 1 };

describe('合集自动收录规则', () => {
  let cwd: string;
  let homeDir: string;
  const baseInfo = async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 } });
  const current = { serializeStatus: 0, status: 0, conditionType: 1, filterConditions: [] } as const;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-rules-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-rules-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  it('启用自动收录前比较全量已发布与草稿目录，并按 Console 规则映射写入和读回', async () => {
    writeFileSync(path.join(cwd, 'rules.json'), JSON.stringify([
      { field: 'title', operator: 'INCLUDES', value: '旅行' },
      { field: 'authIdentity', operator: 'STARTS_WITH', value: 'author' },
      { field: 'type', operator: 'EQUAL', value: 'RT003011' },
    ]));
    const expected = {
      serializeStatus: 0, status: 1, conditionType: 2,
      filterConditions: [
        { key: 'resourceTitle', limitOperatorType: 'INCLUDES', value: '旅行' },
        { key: 'authIdentity', limitOperatorType: 'STARTS_WITH', value: 'alice/author' },
        { key: 'resourceTypeCode', limitOperatorType: 'EQUAL', value: 'RT003011' },
      ],
    } as const;
    let state: object = current;
    let payload: Record<string, unknown> | undefined;
    await expect(setCollectionCollectRules({
      cwd, homeDir, selector: 'id:collection_1', auto: 'any', rulesFile: 'rules.json', yes: true,
      apis: {
        info: baseInfo,
        getRules: async () => ({ ret: 0, errCode: 0, data: state }),
        getPublishedItems: async () => cataloguePage([catalogueItem]),
        getDraftItems: async () => cataloguePage([catalogueItem]),
        getByCode: async () => ({ data: { code: 'RT003011', isTerminate: true, status: 1, subjectType: [1] } }),
        setRules: async (value) => { payload = value; state = expected; return { ret: 0, errCode: 0, data: {} }; },
      },
    })).resolves.toEqual(expected);
    expect(payload).toEqual({ resourceId: 'collection_1', ...expected });
  });

  it('目录草稿尚未发布时拒绝开启自动收录，且不发送规则写入', async () => {
    writeFileSync(path.join(cwd, 'rules.json'), JSON.stringify([{ field: 'title', operator: 'INCLUDES', value: '旅行' }]));
    let writes = 0;
    await expect(setCollectionCollectRules({
      cwd, homeDir, selector: 'id:collection_1', auto: 'all', rulesFile: 'rules.json', yes: true,
      apis: {
        info: baseInfo, getRules: async () => ({ ret: 0, errCode: 0, data: current }),
        getPublishedItems: async () => cataloguePage([]),
        getDraftItems: async () => cataloguePage([catalogueItem]),
        setRules: async () => { writes += 1; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_AUTO_DRAFT_DIRTY' });
    expect(writes).toBe(0);
  });

  it('平台对从未保存规则的合集返回 null 时按初始关闭状态读取', async () => {
    await expect(getCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'T', subjectType: [4], userId: 7, status: 0, serializeStatus: 1 } }), getRules: async () => ({ ret: 0, errCode: 0, data: null }) } })).resolves.toEqual({ serializeStatus: 1, status: 0, conditionType: 1, filterConditions: [] });
  });

  it('C05.W01/W02 实际SDK的ret1/err0不能被相同状态救成成功；成功信封精确POST并读回', async () => {
    const adapter = FUtil.Axios.defaults.adapter, calls: unknown[] = [], unexpected: string[] = [];
    let fail = true;
    FUtil.configurePlatform({ getEnv: () => 'test', getAuthorization: () => undefined, getHeaders: () => ({}) });
    FUtil.Axios.defaults.adapter = async config => {
      calls.push({ method: config.method, url: config.url, data: JSON.parse(String(config.data)) });
      if (config.method !== 'post' || config.url !== '/v2/resources/catalogue/collection_1/items/collectRules') {
        unexpected.push('UNEXPECTED_RULE_ROUTE'); throw new Error('UNEXPECTED_RULE_ROUTE');
      }
      return { status: 200, statusText: 'OK', headers: {}, config, data: { ret: fail ? 1 : 0, errCode: 0, data: null } };
    };
    let infoReads = 0, ruleReads = 0;
    const apis = { info: async () => { infoReads++; return baseInfo(); }, getRules: async () => { ruleReads++; return { ret: 0, errCode: 0, data: current }; } };
    const input = { cwd, homeDir, selector: 'id:collection_1', auto: 'off' as const, yes: true, apis };
    try {
      await expect(setCollectionCollectRules(input)).rejects.toMatchObject({ code: 'COLLECTION_RULES_WRITE_UNCONFIRMED' });
      expect(infoReads).toBe(1); expect(ruleReads).toBe(1);
      fail = false;
      await expect(setCollectionCollectRules(input)).resolves.toEqual(current);
      expect(infoReads).toBe(3); expect(ruleReads).toBe(3);
      expect(calls).toEqual(Array.from({ length: 2 }, () => ({ method: 'post', url: '/v2/resources/catalogue/collection_1/items/collectRules', data: current })));
      expect(unexpected).toEqual([]);
    } finally { FUtil.Axios.defaults.adapter = adapter; }
  });
});
