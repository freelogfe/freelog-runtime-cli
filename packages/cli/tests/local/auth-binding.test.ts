import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { globalAuthPath, loadAuth, setCredentialStoreForTests, workspaceAuthPath, writeAuth } from '../../src/local/auth';

describe('选择器、环境与用户的精确凭据绑定', () => {
  let cwd: string, homeDir: string;
  let values: Map<string, string>;
  let get: ReturnType<typeof vi.fn<(key: string) => string | undefined>>;
  let set: ReturnType<typeof vi.fn<(key: string, value: string) => void>>;
  let remove: ReturnType<typeof vi.fn<(key: string) => boolean>>;
  const auth = { env: 'dev' as const, userId: 7, loginName: 'synthetic-user', token: 'synthetic-only-token' };
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-auth-binding-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-auth-binding-home-'));
    values = new Map();
    get = vi.fn((key: string) => values.get(key));
    set = vi.fn((key: string, value: string) => { values.set(key, value); });
    remove = vi.fn((key: string) => values.delete(key));
    setCredentialStoreForTests({ get, set, delete: remove });
    writeAuth(workspaceAuthPath(cwd), auth);
    writeAuth(globalAuthPath(homeDir), { ...auth, userId: 8, loginName: 'synthetic-global' });
    writeFileSync(path.join(cwd, '.freelog/1.json'), '{"keep":"identity"}\n');
    writeFileSync(path.join(cwd, '.freelog/1.version.json'), '{"keep":"draft"}\n');
    get.mockClear(); set.mockClear(); remove.mockClear();
  });
  afterEach(() => {
    setCredentialStoreForTests(); resetEnvForTests();
    rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true });
  });
  function preserved() {
    const files = [workspaceAuthPath(cwd), globalAuthPath(homeDir), path.join(cwd, '.freelog/1.json'), path.join(cwd, '.freelog/1.version.json')];
    const before = files.map((file) => readFileSync(file));
    return () => {
      files.forEach((file, index) => expect(readFileSync(file)).toEqual(before[index]));
      expect(set).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled();
    };
  }
  it.each(['v1/test/7', 'v1/dev/8', 'v2/dev/7', 'v1/dev/07', 'v1/DEV/7', ' v1/dev/7', 'v1/dev/7 ', 'v1/dev/7/suffix'])('工作区拒绝不匹配键 %s，零凭据查询且不回退', (key) => {
    const file = workspaceAuthPath(cwd);
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), credentialKey: key }));
    const unchanged = preserved();
    expect(() => loadAuth({ cwd, homeDir })).toThrow(expect.objectContaining({ code: 'AUTH_INVALID' }));
    expect(get).not.toHaveBeenCalled(); unchanged();
  });
  it('显式全局也拒绝不匹配键，不读工作区凭据', () => {
    const file = globalAuthPath(homeDir);
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), credentialKey: 'v1/dev/7' }));
    const unchanged = preserved();
    expect(() => loadAuth({ cwd, homeDir, global: true })).toThrow(expect.objectContaining({ code: 'AUTH_INVALID' }));
    expect(get).not.toHaveBeenCalled(); unchanged();
  });
  it('规范键只读取最近工作区的精确项', () => {
    const unchanged = preserved();
    expect(loadAuth({ cwd, homeDir })?.auth).toMatchObject(auth);
    expect(get.mock.calls).toEqual([['v1/dev/7']]); unchanged();
  });
  it.each([
    ['missing', undefined, 'AUTH_CREDENTIAL_MISSING'],
    ['malformed JSON', '{broken', 'AUTH_CREDENTIAL_INVALID'],
    ['empty token', '{"schemaVersion":1,"token":""}', 'AUTH_CREDENTIAL_INVALID'],
    ['wrong schema', '{"schemaVersion":2,"token":"synthetic"}', 'AUTH_CREDENTIAL_INVALID'],
    ['unknown field', '{"schemaVersion":1,"token":"synthetic","extra":1}', 'AUTH_CREDENTIAL_INVALID'],
  ])('%s 失败不换全局账号或改稿', (_label, value, code) => {
    if (value === undefined) values.delete('v1/dev/7'); else values.set('v1/dev/7', value);
    const unchanged = preserved();
    expect(() => loadAuth({ cwd, homeDir })).toThrow(expect.objectContaining({ code }));
    expect(get.mock.calls).toEqual([['v1/dev/7']]); unchanged();
  });
  it('凭据库不可用只返回受控错误，不输出底层异常', () => {
    get.mockImplementation(() => { throw new Error('SYNTHETIC_DIAGNOSTIC_MUST_NOT_ESCAPE'); });
    const unchanged = preserved();
    expect(() => loadAuth({ cwd, homeDir })).toThrow(expect.objectContaining({ code: 'CREDENTIAL_STORE_UNAVAILABLE', message: '系统凭据库不可用，请解锁后重试 login' }));
    expect(get.mock.calls).toEqual([['v1/dev/7']]); unchanged();
  });
  it('显式全局读取不受损坏工作区选择器影响', () => {
    writeFileSync(workspaceAuthPath(cwd), '{broken');
    const unchanged = preserved();
    expect(loadAuth({ cwd, homeDir, global: true })?.auth.userId).toBe(8);
    expect(get.mock.calls).toEqual([['v1/dev/8']]); unchanged();
  });
  it('规范键仍不能跨本次请求环境使用', () => {
    applyCliEnv({ flag: 'test' });
    const unchanged = preserved();
    expect(() => requireAuth({ cwd, homeDir })).toThrow(expect.objectContaining({ code: 'AUTH_ENV_MISMATCH' }));
    expect(get.mock.calls).toEqual([['v1/dev/7']]); unchanged();
  });
});
