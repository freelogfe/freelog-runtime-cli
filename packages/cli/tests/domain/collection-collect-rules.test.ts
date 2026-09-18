import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { getCollectionCollectRules, setCollectionCollectRules } from '../../src/domain/collection/collectRules';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

describe('合集自动收录规则', () => {
  let cwd: string;
  let homeDir: string;
  const baseInfo = async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0 } });
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
        getRules: async () => ({ data: state }),
        getPublishedItems: async () => ({ data: { dataList: [{ itemId: 'i1', resourceId: 'r1', itemTitle: 'one', sortId: 1 }] } }),
        getDraftItems: async () => ({ data: { dataList: [{ itemId: 'i1', resourceId: 'r1', itemTitle: 'one', sortId: 1 }] } }),
        getByCode: async () => ({ data: { code: 'RT003011', isTerminate: true, status: 1, subjectType: [1] } }),
        setRules: async (value) => { payload = value; state = expected; return { data: {} }; },
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
        info: baseInfo, getRules: async () => ({ data: current }),
        getPublishedItems: async () => ({ data: { dataList: [] } }),
        getDraftItems: async () => ({ data: { dataList: [{ itemId: 'i1', resourceId: 'r1' }] } }),
        setRules: async () => { writes += 1; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'COLLECTION_AUTO_DRAFT_DIRTY' });
    expect(writes).toBe(0);
  });

  it('平台对从未保存规则的合集返回 null 时按初始关闭状态读取', async () => {
    await expect(getCollectionCollectRules({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'T', subjectType: [4], userId: 7, status: 0, serializeStatus: 1 } }), getRules: async () => ({ data: null }) } })).resolves.toEqual({ serializeStatus: 1, status: 0, conditionType: 1, filterConditions: [] });
  });
});
