import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { syncResourceTitles } from '../../src/domain/resource/sync';
import { createCollectionIdentity, createIdentity, identityFilePath, readIdentity } from '../../src/local/identity';
import { draftFilePath, writeDraft } from '../../src/local/draft';
import { setCredentialStoreForTests } from '../../src/local/auth';
import { withProjectLock } from '../../src/local/lock';
import * as transaction from '../../src/local/transaction';

const responseMessage = '平台详情响应不是成功信封或缺少有效对象';
const titleMessage = '平台详情缺少有效标题（须为非空且不超过100个字符的字符串）';
function response(resourceId: string, resourceTitle: unknown): unknown {
  return { ret: 0, errCode: 0, msg: 'success', data: { resourceId, resourceTitle } };
}
function synced(n: number, title = `新 ${n}`) { return { stateFile: `${n}.json`, resourceId: `r${n}`, status: 'synced', title }; }
function failed(n: number, code: string, message: string) { return { stateFile: `${n}.json`, resourceId: `r${n}`, status: 'failed', error: { code, message } }; }

describe('resource sync 批次协议与事务边界（ARCH08 §4.2）', () => {
  let root: string;
  let cwd: string;
  let homeDir: string;
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'freelog-sync-contract-'));
    cwd = path.join(root, 'work'); homeDir = path.join(root, 'home');
    fs.mkdirSync(cwd); fs.mkdirSync(homeDir);
    applyCliEnv({ flag: 'dev' });
    const values = new Map<string, string>();
    setCredentialStoreForTests({ get: (key) => values.get(key), set: (key, value) => { values.set(key, value); }, delete: (key) => values.delete(key) });
    await loginAccount({ cwd, homeDir, loginName: 'fixture', password: 'FAKE_PASSWORD',
      loginApi: async () => ({ data: { userId: 1, username: 'fixture', token: 'FAKE_TOKEN' } }),
    });
  });
  afterEach(() => {
    vi.restoreAllMocks(); resetEnvForTests(); setCredentialStoreForTests();
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('freelog-sync-contract-')) throw new Error('Unexpected fixture root');
    fs.rmSync(root, { recursive: true, force: true });
  });
  function identity(n: number, env: 'dev' | 'test' = 'dev') {
    fs.writeFileSync(path.join(cwd, `${n}.mp4`), `artifact-${n}`);
    return createIdentity(cwd, { subject: 'resource', resourceId: `r${n}`, name: `name${n}`, title: `旧 ${n}`, typeCode: 'VIDEO', filePath: `${n}.mp4`, env });
  }
  it('完整成功按编号数值顺序覆盖目标，仅一个事务且不包含其它环境、未绑定或合集', async () => {
    for (let n = 1; n <= 10; n += 1) identity(n, [1, 2, 10].includes(n) ? 'dev' : 'test');
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'unbound.mp4' });
    createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection', name: 'collection', title: '合集', typeCode: 'CT', env: 'dev' });
    const commit = vi.spyOn(transaction, 'commitLocalTransaction');
    const complete = new Map<string, (value: unknown) => void>();
    const info = vi.fn(({ resourceIdOrName }: Record<string, unknown>) => new Promise<unknown>((resolve) => { complete.set(String(resourceIdOrName), resolve); }));
    const pending = syncResourceTitles({ cwd, homeDir, apis: { info } });
    expect(commit).not.toHaveBeenCalled();
    // 平台倒序完成，输出仍须按 N 排序；未完成全部查询前不提交成功项。
    for (const n of [10, 2, 1]) complete.get(`r${n}`)!(response(`r${n}`, `新 ${n}`));
    expect(await pending).toEqual({ schemaVersion: 1, env: 'dev', summary: { total: 3, succeeded: 3, failed: 0 }, results: [synced(1), synced(2), synced(10)] });
    expect(info.mock.calls.map(([params]) => params)).toEqual([1, 2, 10].map((n) => ({ resourceIdOrName: `r${n}`, isLoadLatestVersionInfo: 1 })));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[1].map((change) => path.basename(change.path))).toEqual(['1.json', '2.json', '10.json']);
    expect(readIdentity(cwd, 3).title).toBe('旧 3');
  });
  it.each([
    ['未知 Error', new Error('FAKE_AUTHORIZATION FAKE_COOKIE'), 'RESOURCE_SYNC_REQUEST_FAILED', '请求失败'],
    ['非 Error', { toString: () => { throw new Error('不可读取'); } }, 'RESOURCE_SYNC_REQUEST_FAILED', '请求失败'],
    ['受控错误', new CliError('结果未知，请先核对', 'RESULT_UNKNOWN'), 'RESULT_UNKNOWN', '结果未知，请先核对'],
    ['受控无码错误', new CliError('受控说明'), 'CLI_ERROR', '受控说明'],
  ])('部分失败 %s 返回 DTO，成功项同事务，失败身份/全部稿和产物字节不变', async (_label, failure, code, message) => {
    identity(1); identity(2);
    for (const n of [1, 2]) writeDraft(cwd, n, { draftKind: 'update', fromVersion: '1.0.0', description: `稿 ${n}` });
    const protectedFiles = [identityFilePath(cwd, 2), draftFilePath(cwd, 1), draftFilePath(cwd, 2), path.join(cwd, '1.mp4'), path.join(cwd, '2.mp4')];
    const before = protectedFiles.map((file) => fs.readFileSync(file));
    const commit = vi.spyOn(transaction, 'commitLocalTransaction');
    const info = vi.fn(async ({ resourceIdOrName }: Record<string, unknown>) => { if (resourceIdOrName === 'r2') throw failure; return response('r1', '新 1'); });
    expect(await syncResourceTitles({ cwd, homeDir, apis: { info } })).toEqual({ schemaVersion: 1, env: 'dev', summary: { total: 2, succeeded: 1, failed: 1 }, results: [synced(1), failed(2, code, message)] });
    expect(info).toHaveBeenCalledTimes(2); expect(commit).toHaveBeenCalledTimes(1);
    expect(commit.mock.calls[0]?.[1].map((change) => path.basename(change.path))).toEqual(['1.json']);
    expect(readIdentity(cwd, 1).title).toBe('新 1');
    expect(protectedFiles.map((file) => fs.readFileSync(file))).toEqual(before);
  });
  it('全部请求失败返回完整批次，零提交、不重试且身份不变', async () => {
    identity(1); identity(2);
    const before = [1, 2].map((n) => fs.readFileSync(identityFilePath(cwd, n)));
    const commit = vi.spyOn(transaction, 'commitLocalTransaction');
    const info = vi.fn(async () => { throw new Error('FAKE_HTTP_CONFIG'); });
    expect(await syncResourceTitles({ cwd, homeDir, apis: { info } })).toEqual({ schemaVersion: 1, env: 'dev', summary: { total: 2, succeeded: 0, failed: 2 }, results: [failed(1, 'RESOURCE_SYNC_REQUEST_FAILED', '请求失败'), failed(2, 'RESOURCE_SYNC_REQUEST_FAILED', '请求失败')] });
    expect(info).toHaveBeenCalledTimes(2); expect(commit).not.toHaveBeenCalled();
    expect([1, 2].map((n) => fs.readFileSync(identityFilePath(cwd, n)))).toEqual(before);
  });
  it.each([
    ['裸 data', { resourceId: 'r1', resourceTitle: '错' }], ['旧裸 mock', { data: { resourceId: 'r1', resourceTitle: '错' } }],
    ['ret 非零', { ret: 1, errCode: 0, data: { resourceId: 'r1', resourceTitle: '错' } }],
    ['errCode 非零', { ret: 0, errCode: 1, data: { resourceId: 'r1', resourceTitle: '错' } }],
    ['ret 字符串', { ret: '0', errCode: 0, data: {} }], ['errCode 布尔', { ret: 0, errCode: false, data: {} }],
    ['缺 ret', { errCode: 0, data: {} }], ['缺 errCode', { ret: 0, data: {} }],
    ['data null', { ret: 0, errCode: 0, data: null }], ['data 数组', { ret: 0, errCode: 0, data: [] }],
    ['data 字符串', { ret: 0, errCode: 0, data: 'bad' }], ['缺 data', { ret: 0, errCode: 0 }], ['null', null],
  ])('成功信封严格拒绝 %s', async (_label, value) => {
    identity(1);
    const before = fs.readFileSync(identityFilePath(cwd, 1));
    expect(await syncResourceTitles({ cwd, homeDir, apis: { info: async () => value } })).toEqual({ schemaVersion: 1, env: 'dev', summary: { total: 1, succeeded: 0, failed: 1 }, results: [failed(1, 'RESOURCE_SYNC_RESPONSE_INVALID', responseMessage)] });
    expect(fs.readFileSync(identityFilePath(cwd, 1))).toEqual(before);
  });
  it.each([undefined, null, 1, {}, 'other', ' r1 '])('ID 必须原样匹配本地身份：%j', async (resourceId) => {
    identity(1);
    expect(await syncResourceTitles({ cwd, homeDir, apis: { info: async () => ({ ret: 0, errCode: 0, data: { resourceId, resourceTitle: '不应写' } }) } })).toMatchObject({ summary: { succeeded: 0, failed: 1 }, results: [failed(1, 'RESOURCE_SYNC_ID_MISMATCH', '平台详情缺少或不匹配 resourceId')] });
    expect(readIdentity(cwd, 1).title).toBe('旧 1');
  });
  it.each([undefined, null, '', ' \t\n ', 1, false, {}, ['标题'], 'x'.repeat(101)])('标题拒绝非法类型、空白或超长：%j', async (title) => {
    identity(1);
    expect(await syncResourceTitles({ cwd, homeDir, apis: { info: async () => response('r1', title) } })).toMatchObject({ summary: { succeeded: 0, failed: 1 }, results: [failed(1, 'RESOURCE_SYNC_TITLE_INVALID', titleMessage)] });
    expect(readIdentity(cwd, 1).title).toBe('旧 1');
  });
  it('旧 title 别名不补救缺少 resourceTitle', async () => {
    identity(1);
    expect(await syncResourceTitles({ cwd, homeDir, apis: { info: async () => ({ ret: 0, errCode: 0, data: { resourceId: 'r1', title: '旧别名' } }) } })).toMatchObject({ results: [failed(1, 'RESOURCE_SYNC_TITLE_INVALID', titleMessage)] });
  });
  it.each(['x'.repeat(100), '  线上原文  '])('标题边界可用且不 trim、不截断：%j', async (title) => {
    identity(1);
    expect(await syncResourceTitles({ cwd, homeDir, apis: { info: async () => response('r1', title) } })).toMatchObject({ results: [synced(1, title)] });
    expect(readIdentity(cwd, 1).title).toBe(title);
  });
  it.each([
    ['零目标', () => undefined, undefined, 'RESOURCE_SYNC_EMPTY'],
    ['选择未绑定先于环境', () => createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'unbound.mp4' }), 'file:1.json', 'RESOURCE_SYNC_UNBOUND'],
    ['错误环境', () => identity(1, 'test'), 'file:1.json', 'RESOURCE_SYNC_ENV_MISMATCH'],
    ['错误选择器', () => identity(1), 'id:missing', 'IDENTITY_RESOURCE_NOT_FOUND'],
    ['损坏身份', () => { identity(1); fs.writeFileSync(identityFilePath(cwd, 1), '{bad'); }, undefined, 'IDENTITY_INVALID'],
    ['孤儿稿', () => { identity(1); fs.writeFileSync(draftFilePath(cwd, 2), '{}'); }, undefined, 'DRAFT_ORPHAN'],
    ['重复身份', () => {
      identity(1); identity(2);
      const file = identityFilePath(cwd, 2);
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      fs.writeFileSync(file, JSON.stringify({ ...value, resourceId: 'r1' }));
    }, undefined, 'IDENTITY_CONFLICT'],
    ['认证缺失', () => {
      identity(1);
      setCredentialStoreForTests({ get: () => undefined, set: () => undefined, delete: () => false });
    }, undefined, 'AUTH_CREDENTIAL_MISSING'],
    ['prod门禁', () => { identity(1); applyCliEnv({ flag: 'prod' }); }, undefined, 'PRODUCTION_ENV_DISABLED'],
  ])('前置失败 %s 不返回批次且零平台请求', async (_label, setup, selector, code) => {
    setup(); const info = vi.fn();
    await expect(syncResourceTitles({ cwd, homeDir, selector, apis: { info } })).rejects.toMatchObject({ code });
    expect(info).not.toHaveBeenCalled();
  });
  it('事务中断抛普通错误并保留实际部分写入及日志，后续前滚不重发', async () => {
    identity(1); identity(2); writeDraft(cwd, 1, { draftKind: 'update', fromVersion: '1.0.0', description: '保持稿' });
    const draftBefore = fs.readFileSync(draftFilePath(cwd, 1));
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { if (String(to) === identityFilePath(cwd, 2)) throw new Error('FAKE_DISK_PRIVATE'); return originalRename(from, to); });
    const info = vi.fn(async ({ resourceIdOrName }: Record<string, unknown>) => response(String(resourceIdOrName), `新 ${String(resourceIdOrName).slice(1)}`));
    await expect(syncResourceTitles({ cwd, homeDir, apis: { info } })).rejects.toThrow('FAKE_DISK_PRIVATE');
    expect(readIdentity(cwd, 1).title).toBe('新 1'); expect(readIdentity(cwd, 2).title).toBe('旧 2');
    expect(fs.existsSync(transaction.transactionFilePath(cwd))).toBe(true);
    rename.mockRestore(); withProjectLock(cwd, () => undefined, 'test-recover-sync');
    expect(readIdentity(cwd, 2).title).toBe('新 2'); expect(fs.existsSync(transaction.transactionFilePath(cwd))).toBe(false);
    expect(fs.readFileSync(draftFilePath(cwd, 1))).toEqual(draftBefore); expect(info).toHaveBeenCalledTimes(2);
  });
});
