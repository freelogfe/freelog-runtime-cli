import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors';
import * as passwordInput from '../../src/core/passwordInput';
import { loginAccount } from '../../src/domain/account/login';
import { logoutAccount } from '../../src/domain/account/logout';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { loadAuth, writeAuth } from '../../src/local/auth';

const originalFreelogEnv = process.env.FREELOG_ENV;

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
    expect(raw.token).not.toBe('Bearer tok-1');
    expect(raw).not.toHaveProperty('password');

    const child = path.join(cwd, 'nested', 'more');
    mkdirSync(child, { recursive: true });
    const fromChild = loadAuth({ cwd: child });
    expect(fromChild?.auth.userId).toBe(42);
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
    expect(loaded?.path).toBe(path.join(homeDir, '.freelog-auth'));
  });

  it('坏的工作区凭据不准回退全局', () => {
    writeAuth(path.join(homeDir, '.freelog-auth'), {
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
      expect((error as CliError).message).toContain('凭据文件损坏');
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
});
