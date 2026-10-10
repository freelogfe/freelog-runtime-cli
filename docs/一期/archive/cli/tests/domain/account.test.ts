import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors';
import * as passwordInput from '../../src/core/passwordInput';
import { loginAccount } from '../../src/domain/account/login';
import { logoutAccount } from '../../src/domain/account/logout';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import {
  globalAuthPath,
  loadAuth,
  setCredentialStoreForTests,
  writeAuth,
} from '../../src/local/auth';
import type { CredentialStore } from '../../src/ports/credential';

const originalFreelogEnv = process.env.FREELOG_ENV;

function memoryCredentialStore(): CredentialStore {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key),
    set: (key, value) => { values.set(key, value); },
    delete: (key) => values.delete(key),
  };
}

function mockLogin() {
  return vi.fn(async () => ({
    data: {
      userId: 42,
      username: 'alice',
      token: 'tok-1',
      jwtType: 'Bearer',
    },
  }));
}

describe('login / logout', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t22-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-home-'));
    setCredentialStoreForTests(memoryCredentialStore());
    delete process.env.FREELOG_ENV;
    applyCliEnv({ flag: 'test' });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    if (originalFreelogEnv === undefined) {
      delete process.env.FREELOG_ENV;
    } else {
      process.env.FREELOG_ENV = originalFreelogEnv;
    }
    resetEnvForTests();
    setCredentialStoreForTests();
  });

  it('工作区优先写入 .freelog/auth，往上能找到', async () => {
    const loginApi = mockLogin();
    await loginAccount({
      cwd,
      loginName: 'alice',
      password: 'secret',
      loginApi,
    });

    expect(loginApi).toHaveBeenCalledWith({
      loginName: 'alice',
      password: 'secret',
    });
    const loaded = loadAuth({ cwd });
    expect(loaded?.auth).toMatchObject({
      env: 'test',
      userId: 42,
      loginName: 'alice',
      token: 'Bearer tok-1',
    });
    const raw = JSON.parse(readFileSync(path.join(cwd, '.freelog', 'auth'), 'utf8'));
    expect(raw).not.toHaveProperty('token');
    expect(raw).not.toHaveProperty('cookie');
    expect(raw).not.toHaveProperty('password');
    expect(raw).toMatchObject({
      schemaVersion: 1,
      credentialKey: 'v1/test/42',
      username: 'alice',
    });

    const child = path.join(cwd, 'nested', 'more');
    mkdirSync(child, { recursive: true });
    const fromChild = loadAuth({ cwd: child });
    expect(fromChild?.auth.userId).toBe(42);
  });

  it('登录超时或网络失败前不写 selector', async () => {
    await expect(loginAccount({
      cwd,
      loginName: 'alice',
      password: 'secret',
      timeoutMs: 1,
      loginApi: async () => new Promise(() => {}),
    })).rejects.toMatchObject({ code: 'LOGIN_TIMEOUT' });
    expect(existsSync(path.join(cwd, '.freelog', 'auth'))).toBe(false);

    await expect(loginAccount({
      cwd,
      loginName: 'alice',
      password: 'secret',
      loginApi: async () => { throw new Error('offline'); },
    })).rejects.toMatchObject({ code: 'LOGIN_NETWORK_FAILED' });
    expect(existsSync(path.join(cwd, '.freelog', 'auth'))).toBe(false);
  });

  it('--global 写入机器默认号', async () => {
    const loginApi = mockLogin();
    await loginAccount({
      cwd,
      global: true,
      homeDir,
      loginName: 'alice',
      password: 'secret',
      loginApi,
    });
    expect(existsSync(path.join(cwd, '.freelog', 'auth'))).toBe(false);
    const loaded = loadAuth({ cwd, global: true, homeDir });
    expect(loaded?.auth.loginName).toBe('alice');
    expect(loaded?.path).toBe(globalAuthPath(homeDir));
  });

  it('已有目标凭据必须先 logout，不可静默覆盖', async () => {
    await loginAccount({
      cwd,
      loginName: 'alice',
      password: 'secret',
      loginApi: mockLogin(),
    });
    await expect(loginAccount({
      cwd,
      loginName: 'bob',
      password: 'secret',
      loginApi: mockLogin(),
    })).rejects.toMatchObject({ code: 'LOGIN_AUTH_EXISTS' });
    expect(loadAuth({ cwd })?.auth.loginName).toBe('alice');
  });

  it('坏的工作区凭据不准回退全局', () => {
    writeAuth(globalAuthPath(homeDir), {
      env: 'test',
      userId: 1,
      loginName: 'global-user',
      token: 'g-token',
    });
    mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    writeFileSync(path.join(cwd, '.freelog', 'auth'), '{not-json');

    expect(() => loadAuth({ cwd, homeDir })).toThrow(CliError);
    try {
      loadAuth({ cwd, homeDir });
    } catch (error) {
      expect((error as CliError).code).toBe('AUTH_INVALID');
      expect((error as CliError).message).toContain('凭据选择器损坏');
    }
  });

  it('logout 只删凭据、不调平台', async () => {
    const loginApi = mockLogin();
    await loginAccount({
      cwd,
      loginName: 'alice',
      password: 'secret',
      loginApi,
    });
    const result = logoutAccount({ cwd, homeDir });
    expect(result.deleted).toBe(path.join(cwd, '.freelog', 'auth'));
    expect(existsSync(path.join(cwd, '.freelog', 'auth'))).toBe(false);
    expect(loginApi).toHaveBeenCalledTimes(1);
  });

  it('--password-stdin --yes 走 mock 登录', async () => {
    const loginApi = mockLogin();
    vi.spyOn(passwordInput, 'readPasswordStdin').mockResolvedValue('stdin-pass');
    await loginAccount({
      cwd,
      loginName: 'alice',
      passwordStdin: true,
      yes: true,
      loginApi,
    });
    expect(loginApi).toHaveBeenCalledWith({
      loginName: 'alice',
      password: 'stdin-pass',
    });
    vi.restoreAllMocks();
  });

  it('prod 登录失败', async () => {
    applyCliEnv({ flag: 'prod' });
    const loginApi = mockLogin();
    await expect(
      loginAccount({
        cwd,
        loginName: 'alice',
        password: 'secret',
        loginApi,
      }),
    ).rejects.toMatchObject({
      message: 'prod 暂未开放，请用 --env test 或 --env dev',
    });
    expect(loginApi).not.toHaveBeenCalled();
  });

  it('发现旧 token 文件时拒绝读取，必须重新登录', () => {
    mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    writeFileSync(path.join(cwd, '.freelog', 'auth'), JSON.stringify({
      env: 'test',
      userId: 42,
      token: 'old-secret',
      iv: 'old-iv',
      tag: 'old-tag',
    }));

    expect(() => loadAuth({ cwd, homeDir })).toThrow(
      expect.objectContaining({ code: 'AUTH_LEGACY_RELOGIN' }),
    );
  });

  it('凭据库写入失败不创建 selector', async () => {
    setCredentialStoreForTests({
      get: () => undefined,
      set: () => { throw new Error('vault unavailable'); },
      delete: () => false,
    });

    await expect(loginAccount({
      cwd,
      loginName: 'alice',
      password: 'secret',
      loginApi: mockLogin(),
    })).rejects.toMatchObject({ code: 'CREDENTIAL_STORE_UNAVAILABLE' });
    expect(existsSync(path.join(cwd, '.freelog', 'auth'))).toBe(false);
  });
});
