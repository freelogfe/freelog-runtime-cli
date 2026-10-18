import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { systemCredentialStore } from '../../src/adapters/credential/systemKeyring';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { loadAuth, setCredentialStoreForTests, workspaceAuthPath, writeAuth } from '../../src/local/auth';

describe.sequential('单元凭据边界：默认内存且原生访问拒绝', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-unit-credential-'));
  const homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-unit-credential-home-'));
  const auth = { env: 'test' as const, userId: 7, loginName: 'synthetic-user', token: 'synthetic-only-token' };

  afterAll(() => {
    resetEnvForTests();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('无需逐文件注入：假登录可从默认内存store精确读回', async () => {
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: auth.loginName, password: 'synthetic-password',
      loginApi: async () => ({ data: { userId: auth.userId, username: auth.loginName, token: auth.token } }) });
    expect(loadAuth({ cwd, homeDir })).toEqual({ path: workspaceAuthPath(cwd), auth: { schemaVersion: 1, ...auth } });
  });

  it('同key及selector仍在时，上一用例的秘密不能残留到下一用例', () => {
    expect(existsSync(workspaceAuthPath(cwd))).toBe(true);
    expect(() => loadAuth({ cwd, homeDir })).toThrow(expect.objectContaining({ code: 'AUTH_CREDENTIAL_MISSING' }));
  });

  it.each(['get', 'set', 'delete'] as const)('直接调用原生适配器的%s也必须被守卫拒绝', (operation) => {
    expect(() => operation === 'set' ? systemCredentialStore.set('synthetic-key', 'synthetic-value')
      : systemCredentialStore[operation]('synthetic-key')).toThrow('UNIT_NATIVE_CREDENTIAL_ACCESS_FORBIDDEN');
  });

  it('误恢复生产默认store也不能访问宿主或写selector', () => {
    setCredentialStoreForTests();
    const destination = path.join(cwd, 'must-not-exist');
    expect(() => writeAuth(destination, auth)).toThrow(expect.objectContaining({ code: 'CREDENTIAL_STORE_UNAVAILABLE' }));
    expect(existsSync(destination)).toBe(false);
  });

  it('resetModules不解除原生守卫，重新导入后必须失败且不写selector', async () => {
    // 留下静态旧模块持有的内存秘密，证明后继用例不只清了最新import实例。
    writeAuth(path.join(cwd, 'old-module-selector'), auth);
    vi.resetModules();
    const reloaded = await import('../../src/local/auth');
    const destination = path.join(cwd, 'must-not-exist-after-reset');
    expect(() => reloaded.writeAuth(destination, auth)).toThrow(expect.objectContaining({ code: 'CREDENTIAL_STORE_UNAVAILABLE' }));
    expect(existsSync(destination)).toBe(false);
  });

  it('模块重置后，上一用例静态旧引用也已还原为受守卫store', () => {
    expect(() => loadAuth({ cwd, homeDir })).toThrow(expect.objectContaining({ code: 'CREDENTIAL_STORE_UNAVAILABLE' }));
    const oldDirectory = path.join(cwd, 'old-module');
    // 上一项的selector指向同key；直接用旧模块writeAuth不能沿用旧Map。
    expect(() => writeAuth(path.join(oldDirectory, '.freelog/auth'), auth))
      .toThrow(expect.objectContaining({ code: 'CREDENTIAL_STORE_UNAVAILABLE' }));
    expect(existsSync(oldDirectory)).toBe(false);
  });
});
