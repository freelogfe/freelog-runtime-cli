import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { updateCollectionListing } from '../../src/domain/collection/listing';

describe('合集 listing', () => {
  let cwd: string;
  let homeDir: string;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-listing-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-listing-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  const info = async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0, resourceTitle: '新标题', intro: '简介', tags: ['a,b'] } });

  it('只发送用户明确提供的 listing 字段', async () => {
    let payload: Record<string, unknown> | undefined;
    await expect(updateCollectionListing({
      cwd, homeDir, selector: 'id:collection_1', title: '新标题', intro: '简介', tags: [' #a,b '], yes: true,
      apis: { info, update: async (value) => { payload = value; return { data: {} }; } },
    })).resolves.toEqual({ resourceId: 'collection_1', resourceTitle: '新标题', intro: '简介', tags: ['a,b'] });
    expect(payload).toEqual({ resourceId: 'collection_1', resourceTitle: '新标题', intro: '简介', tags: ['a,b'] });
  });

  it('RSS 与冻结合集在任何 listing 写入前拒绝', async () => {
    let writes = 0;
    await expect(updateCollectionListing({
      cwd, homeDir, selector: 'id:collection_1', title: 'x', yes: true,
      apis: { info: async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'T', subjectType: [4], userId: 7, status: 0, rssSource: 'yes' } }), update: async () => { writes += 1; return { data: {} }; } },
    })).rejects.toMatchObject({ code: 'COLLECTION_RSS_READONLY' });
    await expect(updateCollectionListing({
      cwd, homeDir, selector: 'id:collection_1', title: 'x', yes: true,
      apis: { info: async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'T', subjectType: [4], userId: 7, status: 2 } }), update: async () => { writes += 1; return { data: {} }; } },
    })).rejects.toMatchObject({ code: 'COLLECTION_FROZEN' });
    expect(writes).toBe(0);
  });
});
