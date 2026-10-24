import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as atomic from '../../src/core/atomicWrite';
import { reportCliError } from '../../src/core/errors';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { globalAuthPath, loadAuth, setCredentialStoreForTests, workspaceAuthPath, writeAuth } from '../../src/local/auth';

const originalAtomicWrite = atomic.atomicWriteFile;
const oldAuth = { env: 'dev' as const, userId: 42, loginName: 'synthetic-user', token: 'synthetic-old-token' };
const newAuth = { ...oldAuth, token: 'synthetic-new-token', cookie: 'authInfo=synthetic-cookie; uid=42' };

describe('login persistence failure (account01 §1.1)', () => {
  let root: string;
  let cwd: string;
  let homeDir: string;
  let other: string;
  let values: Map<string, string>;
  let set: ReturnType<typeof vi.fn>;
  let del: ReturnType<typeof vi.fn>;
  let preserved: Map<string, string>;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'freelog-account-save-'));
    cwd = path.join(root, 'work'); homeDir = path.join(root, 'home'); other = path.join(root, 'other');
    for (const dir of [cwd, homeDir, other]) mkdirSync(path.join(dir, '.freelog'), { recursive: true });
    values = new Map();
    set = vi.fn((key: string, value: string) => { values.set(key, value); });
    del = vi.fn(() => false);
    setCredentialStoreForTests({ get: (key) => values.get(key), set, delete: del });
    applyCliEnv({ flag: 'dev' });
    writeAuth(workspaceAuthPath(other), oldAuth);
    preserved = new Map([[workspaceAuthPath(other), readFileSync(workspaceAuthPath(other), 'utf8')]]);
    for (const name of ['1.json', '1.version.json', '2.json', '2.collection.json']) {
      const file = path.join(cwd, '.freelog', name);
      const bytes = JSON.stringify({ synthetic: name });
      writeFileSync(file, bytes); preserved.set(file, bytes);
    }
    set.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks(); setCredentialStoreForTests(); resetEnvForTests();
    rmSync(root, { recursive: true, force: true });
  });

  function assertPreserved() {
    for (const [file, bytes] of preserved) expect(readFileSync(file, 'utf8')).toBe(bytes);
    expect(del).not.toHaveBeenCalled();
  }
  function assertFailure(error: unknown, file: string) {
    let out = ''; let err = '';
    const exit = reportCliError(error, ['--json'], { writeOut: (s) => { out += s; }, writeErr: (s) => { err += s; } });
    expect(exit).toBe(1); expect(err).toBe('');
    expect(JSON.parse(out)).toEqual({ code: 'LOGIN_SELECTOR_SAVE_UNCONFIRMED',
      message: `系统凭据已保存，但选择器写入未确认：${file}。请核对该路径；如已存在，先在该目标 logout（全局目标加 --global），处理磁盘问题后再 login。不要手动删除系统凭据。` });
  }

  it.each([false, true].flatMap((global) => [false, true].map((committed) => ({ global, committed }))))(
    'global=$global committed=$committed: preserves shared credentials', async ({ global, committed }) => {
      const targetCwd = path.join(cwd, committed ? 'after' : 'before');
      const targetHome = path.join(homeDir, committed ? 'after' : 'before');
      const target = global ? globalAuthPath(targetHome) : workspaceAuthPath(targetCwd);
      const write = vi.spyOn(atomic, 'atomicWriteFile').mockImplementation((file, content) => {
        if (committed) originalAtomicWrite(file, content);
        throw new Error('synthetic-new-token synthetic-cookie filesystem diagnostic');
      });
      const api = vi.fn(async () => ({ data: { userId: 42, username: 'synthetic-user', authorization: newAuth.token } }));
      let caught: unknown;
      try { await loginAccount({ cwd: targetCwd, homeDir: targetHome, global, loginName: 'synthetic-user', password: 'synthetic-password', loginApi: api }); }
      catch (error) { caught = error; }
      assertFailure(caught, target);
      expect(api).toHaveBeenCalledTimes(1); expect(set).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0]?.[0]).toBe(target);
      expect(existsSync(target)).toBe(committed);
      if (committed) {
        expect(JSON.parse(readFileSync(target, 'utf8'))).toEqual({ schemaVersion: 1, credentialKey: 'v1/dev/42', env: 'dev', userId: 42,
          username: 'synthetic-user', createdAt: expect.any(String) });
      }
      expect(JSON.parse(values.get('v1/dev/42')!)).toEqual({ schemaVersion: 1, token: newAuth.token });
      expect(loadAuth({ cwd: other, homeDir })?.auth).toMatchObject({ ...oldAuth, token: newAuth.token });
      assertPreserved();
    });

  it('real parent-directory conflict retains the shared key and the conflicting file', () => {
    const blocked = path.join(root, 'blocked'); writeFileSync(blocked, 'synthetic-existing-file');
    const target = workspaceAuthPath(blocked);
    let caught: unknown;
    try { writeAuth(target, newAuth); } catch (error) { caught = error; }
    assertFailure(caught, target);
    expect(readFileSync(blocked, 'utf8')).toBe('synthetic-existing-file');
    expect(existsSync(target)).toBe(false);
    expect(JSON.parse(values.get('v1/dev/42')!)).toEqual({ schemaVersion: 1, token: newAuth.token, cookie: newAuth.cookie });
    expect(set).toHaveBeenCalledTimes(1); assertPreserved();
  });

  it('credential-store rejection never calls selector writer or compensating delete', () => {
    const write = vi.spyOn(atomic, 'atomicWriteFile');
    set.mockImplementation(() => { throw new Error('synthetic-cookie credential diagnostic'); });
    expect(() => writeAuth(workspaceAuthPath(cwd), newAuth)).toThrow(expect.objectContaining({ code: 'CREDENTIAL_STORE_UNAVAILABLE' }));
    expect(write).not.toHaveBeenCalled(); expect(existsSync(workspaceAuthPath(cwd))).toBe(false);
    expect(JSON.parse(values.get('v1/dev/42')!)).toEqual({ schemaVersion: 1, token: oldAuth.token });
    assertPreserved();
  });

  it('successful save still roundtrips new credentials without changing existing selectors or drafts', () => {
    writeAuth(workspaceAuthPath(cwd), newAuth);
    expect(loadAuth({ cwd, homeDir })?.auth).toMatchObject(newAuth);
    expect(set).toHaveBeenCalledTimes(1); assertPreserved();
  });
});
