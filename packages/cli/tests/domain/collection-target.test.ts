import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { resolveCollectionTarget } from '../../src/domain/collection/target';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { createCollectionIdentity } from '../../src/local/identity';
import * as tty from '../../src/core/tty';
import { onlineCollection } from '../../src/domain/collection/shelf';
import { applyCollectionPolicy } from '../../src/domain/collection/policy';

vi.mock('../../src/core/tty', async (original) => ({ ...await original<typeof tty>(), isInteractive: vi.fn(() => false), selectQuestion: vi.fn() }));

const row = (id = 'collection_1') => ({ resourceId: id, resourceName: `alice/${id}`, resourceTitle: '相同标题', resourceTypeCode: 'CT001', userId: 7, subjectType: 4, status: 0 });
const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });

describe('合集共同目标边界', () => {
  let cwd: string;
  let homeDir: string;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-target-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-target-home-'));
    applyCliEnv({ flag: 'test' });
    vi.mocked(tty.isInteractive).mockReturnValue(false);
    vi.mocked(tty.selectQuestion).mockReset();
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });
  const identity = (cwd: string, env: 'test' | 'dev' | 'prod' = 'test', id = 'collection_1') => createCollectionIdentity(cwd, {
    subject: 'collection', resourceId: id, resourceName: `alice/${id}`, name: id, title: '过期标题', typeCode: 'CT001', env,
  });

  it.each(['id:collection_1', 'collection_1', 'name:alice/collection_1', 'alice/collection_1', 'file:1.json', undefined])('稳定选择器 %s 重读同一合集，忽略标题变化', async (selector) => {
    identity(cwd);
    const info = vi.fn(async (_params: Record<string, unknown>) => ok(row()));
    const result = await resolveCollectionTarget({ cwd, homeDir, selector, apis: { info } });
    expect(result).toMatchObject({ resourceId: 'collection_1', title: '相同标题', local: { n: 1 } });
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0]?.[0]).toMatchObject({ resourceIdOrName: 'collection_1' });
    expect(tty.selectQuestion).not.toHaveBeenCalled();
  });

  it.each(['id:collection_1', 'name:alice/collection_1', 'file:1.json'])('拒绝选择A却返回B：%s', async (selector) => {
    identity(cwd);
    await expect(resolveCollectionTarget({ cwd, homeDir, selector, apis: { info: async () => ok(row('collection_2')) } }))
      .rejects.toMatchObject({ code: 'COLLECTION_IDENTITY_MISMATCH' });
  });

  it.each([undefined, null, [], { data: row() }, { ret: 1, errCode: 0, data: row() }, { ret: 0, errCode: 1, data: row() }, { ret: '0', errCode: 0, data: row() }, ok([])])('拒绝不可信成功信封 %#', async (response) => {
    await expect(resolveCollectionTarget({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => response } }))
      .rejects.toMatchObject({ code: 'COLLECTION_INFO_INVALID' });
  });

  it.each([
    [{ userId: '7' }, 'COLLECTION_INFO_INVALID'], [{ userId: undefined, ownerId: 7 }, 'COLLECTION_INFO_INVALID'],
    [{ subjectType: '4' }, 'COLLECTION_TARGET_INVALID'], [{ subjectType: 1 }, 'COLLECTION_TARGET_INVALID'],
    [{ resourceTypeCode: undefined, resourceType: ['图片'] }, 'COLLECTION_INFO_INVALID'],
    [{ status: undefined }, 'COLLECTION_INFO_INVALID'], [{ status: '0' }, 'COLLECTION_INFO_INVALID'], [{ status: 3 }, 'COLLECTION_INFO_INVALID'],
  ])('拒绝错误详情字段 %#', async (patch, code) => {
    await expect(resolveCollectionTarget({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => ok({ ...row(), ...patch }) } })).rejects.toMatchObject({ code });
  });

  it.each([{ resourceName: 'alice/changed' }, { resourceTypeCode: 'CHANGED' }])('本地不可变字段冲突不能被详情覆盖 %#', async (patch) => {
    identity(cwd);
    await expect(resolveCollectionTarget({ cwd, homeDir, selector: 'file:1.json', apis: { info: async () => ok({ ...row(), ...patch }) } })).rejects.toMatchObject({ code: 'COLLECTION_IDENTITY_MISMATCH' });
  });

  it.each(['prod', 'dev'] as const)('%s前置环境门禁在资源请求前失败', async (env) => {
    applyCliEnv({ flag: env });
    const info = vi.fn();
    const listCollections = vi.fn();
    await expect(resolveCollectionTarget({ cwd, homeDir, selector: 'id:collection_1', apis: { info, listCollections } })).rejects.toMatchObject({ code: env === 'prod' ? 'PRODUCTION_ENV_DISABLED' : 'AUTH_ENV_MISMATCH' });
    expect(info).not.toHaveBeenCalled();
    expect(listCollections).not.toHaveBeenCalled();
  });

  it('多份本地仍可选线上未bind合集，不按本地标题或第一份执行', async () => {
    identity(cwd); identity(cwd, 'test', 'collection_2');
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('id:collection_3');
    const info = vi.fn(async () => ok(row('collection_3')));
    const result = await resolveCollectionTarget({ cwd, homeDir, apis: { info, listCollections: async () => ok({ skip: 0, limit: 100, totalItem: 1, dataList: [row('collection_3')] }) } });
    expect(result.resourceId).toBe('collection_3');
    expect(result.local).toBeUndefined();
    expect(tty.selectQuestion).toHaveBeenCalledTimes(1);
  });

  it('列表候选选中后详情返回另一ID仍拒绝', async () => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('id:collection_1');
    await expect(resolveCollectionTarget({ cwd, homeDir, apis: { info: async () => ok(row('collection_2')), listCollections: async () => ok({ skip: 0, limit: 100, totalItem: 1, dataList: [row()] }) } })).rejects.toMatchObject({ code: 'COLLECTION_IDENTITY_MISMATCH' });
  });

  it('他人归属拒绝；name必须精确匹配，不能按标题或不完整标识猜测', async () => {
    await expect(resolveCollectionTarget({ cwd, homeDir, selector: 'id:collection_1', apis: { info: async () => ok({ ...row(), userId: 8 }) } })).rejects.toMatchObject({ code: 'COLLECTION_NOT_OWNER' });
    await expect(resolveCollectionTarget({ cwd, homeDir, selector: 'name:alice/other', apis: { info: async () => ok(row()) } })).rejects.toMatchObject({ code: 'COLLECTION_IDENTITY_MISMATCH' });
  });

  it.each(['', ' ', 'id:', 'name:short', 'file:../1.json', 'file:0.json', 'artifact:x', 'title:标题'])('无效选择器%s在GET前拒绝', async (selector) => {
    const info = vi.fn(async () => ok(row()));
    await expect(resolveCollectionTarget({ cwd, homeDir, selector, apis: { info } })).rejects.toMatchObject({ code: 'COLLECTION_SELECTOR_INVALID' });
    expect(info).not.toHaveBeenCalled();
  });

  it.each(['dev', 'prod'] as const)('选中跨环境本地身份%s在GET前拒绝', async (env) => {
    identity(cwd, env);
    const info = vi.fn(async () => ok(row()));
    await expect(resolveCollectionTarget({ cwd, homeDir, apis: { info } })).rejects.toMatchObject({ code: 'COLLECTION_ENV_MISMATCH' });
    expect(info).not.toHaveBeenCalled();
  });

  it.each([0, 2])('非TTY的%d份本地身份不能默认选择', async (count) => {
    for (let i = 0; i < count; i++) identity(cwd, 'test', `collection_${i + 1}`);
    const info = vi.fn(async () => ok(row()));
    await expect(resolveCollectionTarget({ cwd, homeDir, apis: { info } })).rejects.toMatchObject({ code: 'COLLECTION_SELECTOR_REQUIRED' });
    expect(info).not.toHaveBeenCalled();
  });

  it('TTY线上选择未bind合集，允许前后翻页且最终重读，零本地写入', async () => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    const first = Array.from({ length: 100 }, (_, i) => row(`collection_${i + 1}`));
    const listCollections = vi.fn(async (params: Record<string, unknown>) => ok({ skip: params.skip, limit: 100, totalItem: 101, dataList: params.skip === 0 ? first : [row('collection_101')] }));
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('next').mockResolvedValueOnce('previous').mockResolvedValueOnce('next').mockResolvedValueOnce('id:collection_101');
    const info = vi.fn(async () => ok(row('collection_101')));
    const before = readdirSync(cwd);
    const result = await resolveCollectionTarget({ cwd, homeDir, apis: { info, listCollections } });
    expect(result).toMatchObject({ resourceId: 'collection_101' });
    expect(result.local).toBeUndefined();
    expect(readdirSync(cwd)).toEqual(before);
    expect(listCollections.mock.calls.map(([params]) => params)).toEqual([
      { skip: 0, limit: 100, isSelf: 1, subjectType: 4 }, { skip: 100, limit: 100, isSelf: 1, subjectType: 4 },
    ]);
    expect(info).toHaveBeenCalledTimes(1);
    expect(tty.selectQuestion).toHaveBeenLastCalledWith(expect.any(String), expect.arrayContaining([{ name: expect.stringContaining('alice/collection_101'), value: 'id:collection_101' }]), process.stderr);
  });

  it('复制身份造成重复ID或标识时不能选第一份、不能请求详情', async () => {
    identity(cwd);
    copyFileSync(path.join(cwd, '.freelog/1.json'), path.join(cwd, '.freelog/2.json'));
    const info = vi.fn(async () => ok(row()));
    await expect(resolveCollectionTarget({ cwd, homeDir, selector: 'id:collection_1', apis: { info } })).rejects.toMatchObject({ code: 'COLLECTION_IDENTITY_CONFLICT' });
    expect(info).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'forged'])('TTY取消/不存在的选项%s不请求详情', async (choice) => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    vi.mocked(tty.selectQuestion).mockResolvedValue(choice);
    const info = vi.fn(async () => ok(row()));
    await expect(resolveCollectionTarget({ cwd, homeDir, apis: { info, listCollections: async () => ok({ skip: 0, limit: 100, totalItem: 1, dataList: [row()] }) } })).rejects.toBeDefined();
    expect(info).not.toHaveBeenCalled();
  });

  it.each(['online', 'policy'])('%s只选择一次，后续步骤固定首次ID', async (action) => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('id:collection_1').mockRejectedValue(new Error('不允许再次选择'));
    const listCollections = vi.fn(async () => ok({ skip: 0, limit: 100, totalItem: 1, dataList: [row()] }));
    let status = 4;
    const policies: Record<string, unknown>[] = [{ policyId: 'old', policyName: '已有策略', status: 1 }];
    const requested: unknown[] = [];
    const info = async (params: Record<string, unknown>) => { requested.push(params.resourceIdOrName); return ok({ ...row(), status, policies: [...policies], latestVersion: 'published' }); };
    const writes: Record<string, unknown>[] = [];
    const update = async (payload: Record<string, unknown>) => {
      writes.push(payload);
      if (payload.status !== undefined) status = Number(payload.status);
      if (payload.addPolicies) policies.push({ ...(payload.addPolicies as Record<string, unknown>[])[0], policyId: 'new' });
      return ok({});
    };
    if (action === 'online') await expect(onlineCollection({ cwd, homeDir, yes: true, apis: { info, listCollections, update } })).resolves.toMatchObject({ resourceId: 'collection_1', status: 1 });
    else await expect(applyCollectionPolicy({ cwd, homeDir, policyName: '新策略', policyText: 'FOR PUBLIC', apis: { info, listCollections, update } })).resolves.toBeUndefined();
    expect(tty.selectQuestion).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.resourceId).toBe('collection_1');
    expect(requested.length).toBeGreaterThan(1);
    expect(new Set(requested)).toEqual(new Set(['collection_1']));
  });

  it.each([ok({ skip: 0, limit: 100, totalItem: 0, dataList: [] }), ok({ skip: 0, limit: 100, totalItem: 2, dataList: [row()] }), { data: { dataList: [row()] } }])('空或错误分页不可当作已选择 %#', async (response) => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    const info = vi.fn(async () => ok(row()));
    await expect(resolveCollectionTarget({ cwd, homeDir, apis: { info, listCollections: async () => response } })).rejects.toBeDefined();
    expect(info).not.toHaveBeenCalled();
    expect(tty.selectQuestion).not.toHaveBeenCalled();
  });
});
