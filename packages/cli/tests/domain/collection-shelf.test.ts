import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { offlineCollection, onlineCollection } from '../../src/domain/collection/shelf';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

describe('合集独立上下架', () => {
  let cwd: string;
  let homeDir: string;
  let status: number;
  let latestVersion: string | undefined;
  let policies: Record<string, unknown>[];
  let rss: boolean;

  const info = async () => ({
    data: {
      resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001',
      subjectType: [4], userId: 7, status, latestVersion, policies,
      ...(rss ? { feedUrl: 'https://example.test/feed.xml' } : {}),
    },
  });

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-shelf-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-shelf-home-'));
    status = 4; latestVersion = '1.0.0'; policies = [{ policyId: 'policy_1', status: 1 }]; rss = false;
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd, homeDir, loginName: 'alice', password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }),
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('online 只在已发布且有合集自身启用策略时写 status:1，并强制读回', async () => {
    const update = vi.fn(async (payload: Record<string, unknown>) => { status = Number(payload.status); return { data: {} }; });
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .resolves.toEqual({ resourceId: 'collection_1', status: 1, changed: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ resourceId: 'collection_1', status: 1 });
  });

  it('online 不会替代发布或策略配置，任一门禁失败均零写入', async () => {
    const update = vi.fn(async () => ({ data: {} }));
    latestVersion = undefined;
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .rejects.toMatchObject({ code: 'COLLECTION_ONLINE_NO_VERSION' });
    latestVersion = '1.0.0'; policies = [];
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .rejects.toMatchObject({ code: 'COLLECTION_ONLINE_NO_POLICY' });
    expect(update).not.toHaveBeenCalled();
  });

  it('online 的成功响应若未真实改状态则失败，不能以 HTTP 成功代替读回', async () => {
    const update = vi.fn(async () => ({ data: {} }));
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .rejects.toMatchObject({ code: 'COLLECTION_SHELF_VERIFY_FAILED' });
    expect(update).toHaveBeenCalledWith({ resourceId: 'collection_1', status: 1 });
  });

  it('网络结果未知但状态读回已达目标时可确认；已上架幂等且不写', async () => {
    const uncertain = vi.fn(async () => { status = 1; throw new Error('connection reset'); });
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update: uncertain } }))
      .resolves.toEqual({ resourceId: 'collection_1', status: 1, changed: true });
    const update = vi.fn(async () => ({ data: {} }));
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .resolves.toEqual({ resourceId: 'collection_1', status: 1, changed: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('offline 幂等，写入后强制读回，且不依赖策略或最新版本', async () => {
    status = 1; latestVersion = undefined; policies = [];
    const update = vi.fn(async (payload: Record<string, unknown>) => { status = Number(payload.status); return { data: {} }; });
    await expect(offlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .resolves.toEqual({ resourceId: 'collection_1', status: 4, changed: true });
    await expect(offlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .resolves.toEqual({ resourceId: 'collection_1', status: 4, changed: false });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ resourceId: 'collection_1', status: 4 });
  });

  it('冻结或 RSS 合集在状态写入前拒绝，两个方向均不发送 update', async () => {
    const update = vi.fn(async () => ({ data: {} }));
    status = 2;
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .rejects.toMatchObject({ code: 'COLLECTION_FROZEN' });
    await expect(offlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .rejects.toMatchObject({ code: 'COLLECTION_FROZEN' });
    status = 4; rss = true;
    await expect(onlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .rejects.toMatchObject({ code: 'COLLECTION_RSS_READONLY' });
    await expect(offlineCollection({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: { info, update } }))
      .rejects.toMatchObject({ code: 'COLLECTION_RSS_READONLY' });
    expect(update).not.toHaveBeenCalled();
  });
});
