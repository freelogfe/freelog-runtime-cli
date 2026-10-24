import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { bindResource } from '../../src/domain/bind/bind';
import { createResource } from '../../src/domain/create/create';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { writeDraft } from '../../src/local/draft';
import { createIdentity, listIdentities } from '../../src/local/identity';
import { unwrapData, unwrapFirst, unwrapList } from '../../src/platform/unwrap';

const secret = 'SYNTHETIC-PLATFORM-BODY-DO-NOT-ECHO';
const remote = { resourceId: 'remote_new', resourceName: 'alice/new', resourceTitle: '线上标题', resourceTypeCode: 'VIDEO', subjectType: 1, userId: 7 };
const typeApis = { getByCode: async () => ({ data: { code: 'VIDEO', name: '视频', isTerminate: true, status: 1, subjectType: 1 } }) };
const invalid: Array<{ label: string; wrap: (data: Record<string, unknown>) => unknown }> = [
  { label: 'ret1与errCode0', wrap: (data) => ({ ret: 1, errCode: 0, msg: secret, data }) },
  { label: 'errCode1与ret0', wrap: (data) => ({ ret: 0, errCode: 1, msg: secret, data }) },
  { label: '小写errcode1', wrap: (data) => ({ ret: 0, errCode: 0, errcode: 1, msg: secret, data }) },
  ...['ret', 'errCode', 'errcode'].flatMap((field) => ['0', null, undefined, false].map((value) => ({
    label: `${field}:${String(value)}`, wrap: (data: Record<string, unknown>) => ({ [field]: value, msg: secret, data }),
  }))),
  ...[null, [], secret, 0].map((value) => ({ label: `原始${JSON.stringify(value)}`, wrap: () => value })),
];
const valid = [
  { label: '全部数值0', wrap: (data: Record<string, unknown>) => ({ ret: 0, errCode: 0, errcode: 0, data }) },
  { label: 'data-only注入', wrap: (data: Record<string, unknown>) => ({ data }) },
  { label: '裸DTO注入', wrap: (data: Record<string, unknown>) => data },
];

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(directory: string) {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (statSync(file).isDirectory()) walk(file);
      else files[path.relative(root, file)] = readFileSync(file).toString('base64');
    }
  }
  walk(root);
  return files;
}

describe('单资源create/bind业务信封边界（Step1/ARCH04）', () => {
  let cwd: string;
  let homeDir: string;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-response-boundaries-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-response-boundaries-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic-token' } }) });
    writeFileSync(path.join(cwd, 'first.mp4'), 'first synthetic artifact');
    writeFileSync(path.join(cwd, 'new.mp4'), 'new synthetic artifact');
    createIdentity(cwd, { subject: 'resource', resourceId: 'old_id', resourceName: 'alice/old', name: 'old', title: '旧标题', typeCode: 'VIDEO', filePath: 'first.mp4', env: 'test' });
    writeDraft(cwd, 1, { fileSha1: 'synthetic-sha', filename: 'first.mp4', customPropertyDescriptors: [{ key: 'keep', value: 'draft' }] });
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'new.mp4' });
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });
  const createInput = () => ({ cwd, homeDir, title: '新标题', name: 'new', type: 'VIDEO', selector: 'file:2.json', yes: true });

  it.each(invalid)('create查重$label不能成为名称可用，零POST且全部本地字节保留', async ({ wrap }) => {
    const before = snapshot(cwd), homeBefore = snapshot(homeDir);
    const info = vi.fn(async () => wrap({}));
    const create = vi.fn(async () => ({ data: remote }));
    await expect(createResource({ ...createInput(), apis: { ...typeApis, info, create } })).rejects.toMatchObject({
      code: 'CREATE_LOOKUP_FAILED', message: '查询现有资源失败，请检查登录和网络后重试',
    });
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'alice/new', isLoadLatestVersionInfo: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
    expect(snapshot(homeDir)).toEqual(homeBefore);
  });

  it.each(invalid)('createPOST$label即使带有效ID也只请求一次，不保存身份且提示核对线上', async ({ wrap }) => {
    const before = snapshot(cwd), homeBefore = snapshot(homeDir);
    const info = vi.fn(async () => ({ data: {} }));
    const create = vi.fn(async () => wrap(remote));
    await expect(createResource({ ...createInput(), apis: { ...typeApis, info, create } })).rejects.toMatchObject({
      code: 'CREATE_FAILED', message: '创建响应失败或无效，请先核对线上条目，再决定 bind 或后续操作',
    });
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'alice/new', isLoadLatestVersionInfo: 1 });
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'new', resourceTitle: '新标题', resourceTypeCode: 'VIDEO' });
    expect(snapshot(cwd)).toEqual(before);
    expect(snapshot(homeDir)).toEqual(homeBefore);
  });

  it.each(invalid)('bind详情$label带有效owner/ID也拒绝，保留原身份和完整工作稿', async ({ wrap }) => {
    const before = snapshot(cwd), homeBefore = snapshot(homeDir);
    const info = vi.fn(async () => wrap(remote));
    await expect(bindResource({ cwd, homeDir, target: 'remote_new', selector: 'file:1.json', force: true, yes: true, apis: { info } })).rejects.toMatchObject({
      code: 'BIND_INFO_INVALID', message: '平台资源详情响应失败或无效，请核对后重试',
    });
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'remote_new', isLoadLatestVersionInfo: 1 });
    expect(snapshot(cwd)).toEqual(before);
    expect(snapshot(homeDir)).toEqual(homeBefore);
  });

  it('全新工程POST失败响应带有效ID也不创建身份，且不自动重发', async () => {
    const fresh = path.join(cwd, 'fresh');
    mkdirSync(fresh);
    writeFileSync(path.join(fresh, 'artifact.mp4'), 'synthetic artifact');
    const before = snapshot(fresh);
    const info = vi.fn(async () => ({ ret: 0, errCode: 0, data: {} }));
    const create = vi.fn(async () => ({ ret: 1, errCode: 0, msg: secret, data: remote }));
    await expect(createResource({ cwd: fresh, homeDir, title: '新标题', name: 'new', type: 'VIDEO', file: 'artifact.mp4', yes: true,
      apis: { ...typeApis, info, create } })).rejects.toMatchObject({
      code: 'CREATE_FAILED', message: '创建响应失败或无效，请先核对线上条目，再决定 bind 或后续操作',
    });
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'alice/new', isLoadLatestVersionInfo: 1 });
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'new', resourceTitle: '新标题', resourceTypeCode: 'VIDEO' });
    expect(listIdentities(fresh)).toEqual([]);
    expect(snapshot(fresh)).toEqual(before);
  });

  it.each([[], [remote], secret, 0, false, undefined])('create查重成功码但data=%j畸形时零POST并保留全部文件', async (data) => {
    const before = snapshot(cwd);
    const info = vi.fn(async () => ({ ret: 0, errCode: 0, data, msg: secret }));
    const create = vi.fn(async () => ({ data: remote }));
    await expect(createResource({ ...createInput(), apis: { ...typeApis, info, create } })).rejects.toMatchObject({
      code: 'CREATE_LOOKUP_FAILED', message: '查询现有资源失败，请检查登录和网络后重试',
    });
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'alice/new', isLoadLatestVersionInfo: 1 });
    expect(create).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each([null, [], [remote], secret, 0, false, undefined])('POST成功码但data=%j畸形时不信任顶层残留ID，不落身份或重发', async (data) => {
    const before = snapshot(cwd);
    const info = vi.fn(async () => ({ data: {} }));
    const create = vi.fn(async () => ({ ...remote, ret: 0, errCode: 0, data, msg: secret }));
    await expect(createResource({ ...createInput(), apis: { ...typeApis, info, create } })).rejects.toMatchObject({
      code: 'CREATE_FAILED', message: '创建响应失败或无效，请先核对线上条目，再决定 bind 或后续操作',
    });
    expect(info).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'new', resourceTitle: '新标题', resourceTypeCode: 'VIDEO' });
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each([null, [], [remote], secret, 0, false, undefined])('bind成功码但data=%j畸形时不信任顶层残留ID且保留旧身份和稿', async (data) => {
    const before = snapshot(cwd);
    const info = vi.fn(async () => ({ ...remote, ret: 0, errCode: 0, data, msg: secret }));
    await expect(bindResource({ cwd, homeDir, target: 'remote_new', selector: 'file:1.json', force: true, yes: true, apis: { info } })).rejects.toMatchObject({
      code: 'BIND_INFO_INVALID', message: '平台资源详情响应失败或无效，请核对后重试',
    });
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'remote_new', isLoadLatestVersionInfo: 1 });
    expect(snapshot(cwd)).toEqual(before);
  });

  it('查重成功null保持既有未命中语义，只发送一次POST', async () => {
    const info = vi.fn(async () => ({ ret: 0, errCode: 0, data: null }));
    const create = vi.fn(async () => ({ data: remote }));
    await expect(createResource({ ...createInput(), apis: { ...typeApis, info, create } })).resolves.toMatchObject({ resourceId: 'remote_new' });
    expect(info).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it.each(valid)('$label保持create查重与POST合法成功路径', async ({ wrap }) => {
    const info = vi.fn(async () => wrap({}));
    const create = vi.fn(async () => wrap(remote));
    const saved = await createResource({ ...createInput(), apis: { ...typeApis, info, create } });
    expect(saved).toMatchObject({ n: 2, resourceId: 'remote_new', resourceName: 'alice/new' });
    expect(listIdentities(cwd)).toHaveLength(2);
    expect(info).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it.each(valid)('$label保持bind合法详情路径', async ({ wrap }) => {
    const info = vi.fn(async () => wrap(remote));
    const saved = await bindResource({ cwd, homeDir, target: 'remote_new', selector: 'file:2.json', apis: { info } });
    expect(saved).toMatchObject({ n: 2, resourceId: 'remote_new', resourceName: 'alice/new' });
    expect(info).toHaveBeenCalledOnce();
  });

  it('既有解包函数保持仅取数据行为，不向其它消费者全局追加业务判定', () => {
    const failed = { ret: 1, errCode: 1, data: { keep: 'value' } };
    expect(unwrapData(failed)).toEqual({ keep: 'value' });
    expect(unwrapFirst({ ret: 1, data: [{ first: true }] })).toEqual({ first: true });
    expect(unwrapList({ ret: 1, data: [{ first: true }] })).toEqual([{ first: true }]);
  });
});
