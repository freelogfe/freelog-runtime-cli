import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/bin/program';
import { CliError } from '../../src/core/errors';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import * as syncDomain from '../../src/domain/resource/sync';
import { setCredentialStoreForTests } from '../../src/local/auth';
import { createIdentity, identityFilePath } from '../../src/local/identity';
import { FServiceAPI } from '../../src/platform/api';
import { transactionFilePath } from '../../src/local/transaction';
import { withProjectLock } from '../../src/local/lock';
import { createResourceCommand, ResourceSyncBatchFailure } from '../../src/commands/project/resource';

// SDK 的模块命名空间不可 spy；只替换请求端口，命令/领域/事务仍跑真实实现。
vi.mock('../../src/platform/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: { ...actual.FServiceAPI, Resource: { ...actual.FServiceAPI.Resource, info: vi.fn() } } };
});

describe('resource sync 实际 runCli JSON/人类出口', () => {
  let root: string;
  let cwd: string;
  const out: string[] = [];
  const err: string[] = [];
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'freelog-sync-command-'));
    cwd = path.join(root, 'work'); const homeDir = path.join(root, 'home');
    fs.mkdirSync(cwd); fs.mkdirSync(homeDir);
    const values = new Map<string, string>();
    setCredentialStoreForTests({ get: (key) => values.get(key), set: (key, value) => { values.set(key, value); }, delete: (key) => values.delete(key) });
    applyCliEnv({ flag: 'dev' });
    await loginAccount({ cwd, homeDir, loginName: 'fixture', password: 'FAKE_PASSWORD',
      loginApi: async () => ({ data: { userId: 1, username: 'fixture', token: 'FAKE_TOKEN' } }),
    });
    for (const n of [1, 2]) {
      fs.writeFileSync(path.join(cwd, `${n}.mp4`), `artifact-${n}`);
      createIdentity(cwd, { subject: 'resource', resourceId: `r${n}`, name: `name${n}`, title: `旧 ${n}`, typeCode: 'VIDEO', filePath: `${n}.mp4`, env: 'dev' });
    }
    out.length = 0; err.length = 0;
    vi.spyOn(console, 'log').mockImplementation((text: unknown) => { out.push(`${String(text)}\n`); });
    vi.spyOn(console, 'error').mockImplementation((text: unknown) => { err.push(`${String(text)}\n`); });
  });
  afterEach(() => {
    vi.restoreAllMocks(); resetEnvForTests(); setCredentialStoreForTests();
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('freelog-sync-command-')) throw new Error('Unexpected fixture root');
    fs.rmSync(root, { recursive: true, force: true });
  });
  function run(json = true, extra: string[] = []) {
    return runCli(['resource', 'sync', '--cwd', cwd, '--env', 'dev', ...(json ? ['--json'] : []), ...extra], {
      writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); },
    });
  }
  it.each([0, 1, 2])('失败目标数 %s：stdout 只有完整批次 JSON，stderr 空且退出码精确', async (failedCount) => {
    const info = vi.spyOn(FServiceAPI.Resource, 'info').mockImplementation(async (input) => {
      const n = input.resourceIdOrName === 'r1' ? 1 : 2;
      if (n <= failedCount) throw new Error('FAKE_AUTHORIZATION FAKE_COOKIE');
      return { ret: 0, errCode: 0, data: { resourceId: `r${n}`, resourceTitle: `新 ${n}` } } as never;
    });
    expect(await run()).toBe(failedCount === 0 ? 0 : 1); expect(err).toEqual([]); expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!)).toEqual({ schemaVersion: 1, env: 'dev', summary: { total: 2, succeeded: 2 - failedCount, failed: failedCount },
      results: [1, 2].map((n) => n <= failedCount
        ? { stateFile: `${n}.json`, resourceId: `r${n}`, status: 'failed', error: { code: 'RESOURCE_SYNC_REQUEST_FAILED', message: '请求失败' } }
        : { stateFile: `${n}.json`, resourceId: `r${n}`, status: 'synced', title: `新 ${n}` }),
    });
    expect(info).toHaveBeenCalledTimes(2);
  });
  it.each([0, 1, 2])('human 失败数 %s 保持既有摘要和非零语义', async (failedCount) => {
    vi.spyOn(FServiceAPI.Resource, 'info').mockImplementation(async (input) => {
      const n = input.resourceIdOrName === 'r1' ? 1 : 2;
      if (n <= failedCount) throw new Error('FAKE_PRIVATE_MESSAGE');
      return { ret: 0, errCode: 0, data: { resourceId: `r${n}`, resourceTitle: `新 ${n}` } } as never;
    });
    expect(await run(false)).toBe(failedCount === 0 ? 0 : 1);
    if (failedCount === 0) { expect(out).toEqual(['已同步 2 份资源标题\n']); expect(err).toEqual([]); }
    else {
      expect(out).toEqual([]);
      expect(err).toEqual([`标题已同步 ${2 - failedCount} 份；失败：${[1, 2].filter((n) => n <= failedCount).map((n) => `${n}.json（请求失败）`).join('、')}\n`]);
    }
  });
  it('合法精确选择只请求/回写目标，DTO 不包含其它身份', async () => {
    const untouched = fs.readFileSync(identityFilePath(cwd, 1));
    const info = vi.spyOn(FServiceAPI.Resource, 'info').mockResolvedValue({ ret: 0, errCode: 0, data: { resourceId: 'r2', resourceTitle: '新 2' } } as never);
    expect(await run(true, ['--resource', 'file:2.json'])).toBe(0);
    expect(out).toEqual([`${JSON.stringify({ schemaVersion: 1, env: 'dev', summary: { total: 1, succeeded: 1, failed: 0 },
      results: [{ stateFile: '2.json', resourceId: 'r2', status: 'synced', title: '新 2' }],
    })}\n`]);
    expect(err).toEqual([]); expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'r2', isLoadLatestVersionInfo: 1 });
    expect(fs.readFileSync(identityFilePath(cwd, 1))).toEqual(untouched);
  });
  it('human 部分失败保留 RESOURCE_SYNC_PARTIAL，通用 toJSON 仍只有原两字段', async () => {
    vi.spyOn(FServiceAPI.Resource, 'info').mockRejectedValue(new Error('FAKE_PRIVATE'));
    const failure = await createResourceCommand().parseAsync(['sync', '--cwd', cwd], { from: 'user' }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ResourceSyncBatchFailure);
    expect(failure).toMatchObject({ code: 'RESOURCE_SYNC_PARTIAL', message: '标题已同步 0 份；失败：1.json（请求失败）、2.json（请求失败）' });
    expect(JSON.parse(JSON.stringify(failure))).toEqual({ code: 'RESOURCE_SYNC_PARTIAL', message: '标题已同步 0 份；失败：1.json（请求失败）、2.json（请求失败）' });
    expect(out).toEqual([]); expect(err).toEqual([]);
  });
  it('前置选择错误维持两字段标准 JSON、零请求且不混入批次', async () => {
    const info = vi.spyOn(FServiceAPI.Resource, 'info');
    expect(await run(true, ['--resource', 'id:missing'])).toBe(1);
    expect(out).toEqual([`${JSON.stringify({ code: 'IDENTITY_RESOURCE_NOT_FOUND', message: '找不到资源选择器 id:missing' })}\n`]);
    expect(err).toEqual([]); expect(info).not.toHaveBeenCalled();
  });
  it.each([
    ['零目标', () => { for (const n of [1, 2]) fs.unlinkSync(identityFilePath(cwd, n)); }, [], 'RESOURCE_SYNC_EMPTY'],
    ['未绑定先环境', () => { createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'unbound.mp4' }); }, ['--resource', 'file:3.json'], 'RESOURCE_SYNC_UNBOUND'],
    ['损坏身份', () => { fs.writeFileSync(identityFilePath(cwd, 2), '{bad'); }, [], 'IDENTITY_INVALID'],
    ['认证缺失', () => { setCredentialStoreForTests({ get: () => undefined, set: () => undefined, delete: () => false }); }, [], 'AUTH_CREDENTIAL_MISSING'],
    ['prod门禁', () => undefined, ['--env', 'prod'], 'PRODUCTION_ENV_DISABLED'],
  ])('前置 %s 只输出两字段失败，零请求且本地不变', async (_label, setup, extra, code) => {
    setup();
    const files = fs.readdirSync(path.join(cwd, '.freelog')).sort();
    const before = files.map((file) => fs.readFileSync(path.join(cwd, '.freelog', file)));
    const info = vi.spyOn(FServiceAPI.Resource, 'info');
    expect(await run(true, extra)).toBe(1);
    expect(out).toHaveLength(1); expect(err).toEqual([]);
    const actual = JSON.parse(out[0]!);
    expect(Object.keys(actual).sort()).toEqual(['code', 'message']);
    expect(actual.code).toBe(code); expect(typeof actual.message).toBe('string');
    if (code === 'RESOURCE_SYNC_UNBOUND') expect(actual.message).toBe('所选资源尚未绑定，不能同步标题');
    expect(info).not.toHaveBeenCalled();
    expect(fs.readdirSync(path.join(cwd, '.freelog')).sort()).toEqual(files);
    expect(files.map((file) => fs.readFileSync(path.join(cwd, '.freelog', file)))).toEqual(before);
  });
  it('普通 CliError 即使伪装批次名称/字段或自带 toJSON，仍只有标准两字段', async () => {
    const toJSON = vi.fn(() => ({ Authorization: 'FAKE_AUTHORIZATION' }));
    const failure = Object.assign(new CliError('受控说明', 'CONTROLLED'), { name: 'ResourceSyncBatchFailure', batch: { private: 'FAKE_COOKIE' }, toJSON });
    vi.spyOn(syncDomain, 'syncResourceTitles').mockRejectedValue(failure);
    expect(await run()).toBe(1);
    expect(out).toEqual([`${JSON.stringify({ code: 'CONTROLLED', message: '受控说明' })}\n`]);
    expect(err).toEqual([]); expect(toJSON).not.toHaveBeenCalled();
  });
  it('已控请求错误只投影 code/message，任何异常 toJSON 都不可执行', async () => {
    const toJSON = vi.fn(() => { throw new Error('不可调用原异常 toJSON'); });
    const failure = Object.assign(new CliError('先核对旧请求', 'RESULT_UNKNOWN'), { toJSON, config: { headers: { Authorization: 'FAKE_AUTHORIZATION', Cookie: 'FAKE_COOKIE' } } });
    vi.spyOn(FServiceAPI.Resource, 'info').mockRejectedValue(failure);
    expect(await run()).toBe(1); expect(err).toEqual([]); expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!)).toEqual({ schemaVersion: 1, env: 'dev', summary: { total: 2, succeeded: 0, failed: 2 },
      results: [1, 2].map((n) => ({ stateFile: `${n}.json`, resourceId: `r${n}`, status: 'failed', error: { code: 'RESULT_UNKNOWN', message: '先核对旧请求' } })),
    });
    expect(toJSON).not.toHaveBeenCalled();
  });
  it('命令白名单投影不展开 DTO 私有字段，不调用任何层次的 toJSON', async () => {
    const toJSON = vi.fn(() => { throw new Error('不可调用 DTO toJSON'); });
    const batch = { schemaVersion: 1, env: 'dev', summary: { total: 1, succeeded: 0, failed: 1, private: 'FAKE_TOKEN', toJSON },
      results: [{ stateFile: '1.json', resourceId: 'r1', status: 'failed', title: '不可输出', toJSON,
        error: { code: 'RESULT_UNKNOWN', message: '先核对', config: { Authorization: 'FAKE_AUTHORIZATION' }, toJSON } }], private: 'FAKE_COOKIE', toJSON };
    vi.spyOn(syncDomain, 'syncResourceTitles').mockResolvedValue(batch as never);
    expect(await run()).toBe(1);
    expect(out).toEqual([`${JSON.stringify({ schemaVersion: 1, env: 'dev', summary: { total: 1, succeeded: 0, failed: 1 },
      results: [{ stateFile: '1.json', resourceId: 'r1', status: 'failed', error: { code: 'RESULT_UNKNOWN', message: '先核对' } }],
    })}\n`]);
    expect(err).toEqual([]); expect(toJSON).not.toHaveBeenCalled();
  });
  it('成功 DTO 也只投影成功字段，不序列化 error/私有字段/toJSON', async () => {
    const toJSON = vi.fn(() => { throw new Error('不可调用成功 DTO toJSON'); });
    vi.spyOn(syncDomain, 'syncResourceTitles').mockResolvedValue({ schemaVersion: 1, env: 'dev', summary: { total: 1, succeeded: 1, failed: 0, toJSON },
      results: [{ stateFile: '1.json', resourceId: 'r1', status: 'synced', title: '线上标题', error: { Authorization: 'FAKE_AUTHORIZATION' }, toJSON }], toJSON,
    } as never);
    expect(await run()).toBe(0);
    expect(out).toEqual([`${JSON.stringify({ schemaVersion: 1, env: 'dev', summary: { total: 1, succeeded: 1, failed: 0 },
      results: [{ stateFile: '1.json', resourceId: 'r1', status: 'synced', title: '线上标题' }],
    })}\n`]);
    expect(err).toEqual([]); expect(toJSON).not.toHaveBeenCalled();
  });
  it('真实事务中断不输出 synced 批次，标准安全失败并保留日志恢复事实', async () => {
    vi.spyOn(FServiceAPI.Resource, 'info').mockImplementation(async (input) => ({ ret: 0, errCode: 0, data: { resourceId: input.resourceIdOrName, resourceTitle: '新标题' } }) as never);
    const originalRename = fs.renameSync;
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => { if (String(to) === identityFilePath(cwd, 2)) throw new Error('FAKE_DISK_PRIVATE'); return originalRename(from, to); });
    expect(await run()).toBe(1);
    expect(out).toEqual([`${JSON.stringify({ code: 'CLI_UNEXPECTED_ERROR', message: '命令执行失败；如涉及写入，请先核对实际结果，勿重复执行。' })}\n`]); expect(err).toEqual([]);
    expect(JSON.parse(fs.readFileSync(identityFilePath(cwd, 1), 'utf8')).title).toBe('新标题');
    expect(JSON.parse(fs.readFileSync(identityFilePath(cwd, 2), 'utf8')).title).toBe('旧 2'); expect(fs.existsSync(transactionFilePath(cwd))).toBe(true);
    rename.mockRestore(); withProjectLock(cwd, () => undefined, 'test-recover-command');
    expect(JSON.parse(fs.readFileSync(identityFilePath(cwd, 2), 'utf8')).title).toBe('新标题'); expect(fs.existsSync(transactionFilePath(cwd))).toBe(false);
  });
});
