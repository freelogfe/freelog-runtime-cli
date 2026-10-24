import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as passwordInput from '../../src/core/passwordInput';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { globalAuthPath, loadAuth, setCredentialStoreForTests, workspaceAuthPath } from '../../src/local/auth';
import { bootstrapPlatform } from '../../src/platform/bootstrap';

const validBody = { userId: 42, username: 'synthetic-user', token: 'synthetic-token' };
const failure = { code: 'LOGIN_FAILED', message: '登录失败：平台拒绝登录或未返回有效凭据' };
const invalidResponses: [string, unknown][] = [
  ['null', null], ['array', []], ['string', 'synthetic-secret'],
  ['missing data', {}], ['null data', { data: null }], ['array data', { data: [] }],
  ...['ret', 'errCode', 'errcode'].flatMap((key): [string, unknown][] => [
    [`${key} nonzero`, { [key]: 1, data: validBody }],
    [`${key} string zero`, { [key]: '0', data: validBody }],
    [`${key} null`, { [key]: null, data: validBody }],
  ]),
  ...[0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '42'].map((userId): [string, unknown] =>
    [`invalid user id ${String(userId)}`, { data: { ...validBody, userId } }]),
  ...['', '   ', null, 42].map((username): [string, unknown] =>
    [`invalid username ${String(username)}`, { data: { ...validBody, username } }]),
  ...['token', 'authorization', 'tokenSn', 'jwtType'].flatMap((key): [string, unknown][] =>
    ['', '   ', 42].map((value) => [`invalid ${key} ${String(value)}`, { data: { ...validBody, [key]: value } }])),
  ['missing token', { data: { userId: 42, username: 'synthetic-user' } }],
  ['platform diagnostic', { msg: 'synthetic-password synthetic-cookie' }],
];

describe('login response and pre-write boundaries', () => {
  let root: string;
  let cwd: string;
  let homeDir: string;
  let values: Map<string, string>;
  let get: ReturnType<typeof vi.fn>;
  let set: ReturnType<typeof vi.fn>;
  let del: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'freelog-login-boundary-'));
    cwd = path.join(root, 'work'); homeDir = path.join(root, 'home');
    mkdirSync(cwd); mkdirSync(homeDir);
    values = new Map();
    get = vi.fn((key: string) => values.get(key));
    set = vi.fn((key: string, value: string) => { values.set(key, value); });
    del = vi.fn(() => false);
    setCredentialStoreForTests({ get, set, delete: del });
    applyCliEnv({ flag: 'dev' });
    bootstrapPlatform();
  });
  afterEach(() => {
    vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
    setCredentialStoreForTests(); resetEnvForTests();
    rmSync(root, { recursive: true, force: true });
  });

  function input() { return { cwd, homeDir, loginName: 'synthetic-user', password: 'synthetic-password' }; }
  function noWrites() {
    expect(set).not.toHaveBeenCalled(); expect(del).not.toHaveBeenCalled();
    expect(existsSync(workspaceAuthPath(cwd))).toBe(false);
    expect(existsSync(globalAuthPath(homeDir))).toBe(false);
  }

  it.each(invalidResponses)('%s: refuses before any secret write', async (_name, response) => {
    const api = vi.fn(async () => response);
    await expect(loginAccount({ ...input(), loginApi: api })).rejects.toMatchObject(failure);
    expect(api).toHaveBeenCalledTimes(1); noWrites();
  });

  it.each([400, 401, 403, 500, 202])('HTTP %s with valid-looking body is not a login', async (status) => {
    const request = vi.fn(async () => new Response(JSON.stringify({ data: validBody }), { status }));
    vi.stubGlobal('fetch', request);
    await expect(loginAccount(input())).rejects.toMatchObject(failure);
    expect(request).toHaveBeenCalledTimes(1); noWrites();
  });

  it.each([
    ['token', { token: 'synthetic-token' }, 'synthetic-token'],
    ['bearer', { token: 'synthetic-token', jwtType: 'Bearer' }, 'Bearer synthetic-token'],
    ['tokenSn', { tokenSn: 'synthetic-sn' }, 'synthetic-sn'],
    ['authorization', { authorization: 'Custom synthetic-auth', token: 'unused' }, 'Custom synthetic-auth'],
  ])('%s credential survives canonical selector roundtrip', async (_name, fields, token) => {
    const api = vi.fn(async () => ({ ret: 0, errCode: 0, errcode: 0,
      data: { userId: 42, username: 'synthetic-user', ...fields } }));
    const auth = await loginAccount({ ...input(), global: true, loginApi: api });
    expect(auth).toEqual({ env: 'dev', userId: 42, loginName: 'synthetic-user', token });
    expect(loadAuth({ cwd, homeDir })?.auth).toMatchObject(auth);
    expect(set).toHaveBeenCalledTimes(1); expect(del).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledExactlyOnceWith({ loginName: 'synthetic-user', password: 'synthetic-password' });
    const selector = JSON.parse(readFileSync(globalAuthPath(homeDir), 'utf8'));
    expect(selector).toEqual({ schemaVersion: 1, credentialKey: 'v1/dev/42', env: 'dev', userId: 42,
      username: 'synthetic-user', createdAt: expect.any(String) });
    expect(existsSync(workspaceAuthPath(cwd))).toBe(false);
  });

  it.each([200, 201])('HTTP %s validates POST and stores cookie only in credential store', async (status) => {
    const headers = new Headers();
    headers.append('set-cookie', 'authInfo=synthetic-cookie; Path=/; HttpOnly');
    headers.append('set-cookie', 'uid=42; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/');
    const request = vi.fn(async () => new Response(JSON.stringify({ ret: 0, errCode: 0, data: validBody }), { status, headers }));
    vi.stubGlobal('fetch', request);
    await loginAccount(input());
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.devfreelog.com/v2/passport/login');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({ 'content-type': 'application/json' });
    expect(JSON.parse(options.body as string)).toEqual({ loginName: 'synthetic-user', password: 'synthetic-password', isRemember: 1 });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(values.get('v1/dev/42')!)).toEqual({ schemaVersion: 1, token: 'synthetic-token', cookie: 'authInfo=synthetic-cookie; uid=42' });
    const selector = JSON.parse(readFileSync(workspaceAuthPath(cwd), 'utf8'));
    expect(Object.keys(selector).sort()).toEqual(['createdAt', 'credentialKey', 'env', 'schemaVersion', 'userId', 'username']);
    expect(set).toHaveBeenCalledTimes(1); expect(del).not.toHaveBeenCalled();
  });

  it.each([
    ['blank name', { loginName: '  ' }, 'LOGIN_NAME_REQUIRED'],
    ['empty password', { password: '' }, 'LOGIN_PASSWORD_REQUIRED'],
    ['stdin without yes', { passwordStdin: true }, 'LOGIN_PASSWORD_STDIN'],
    ['empty stdin', { passwordStdin: true, yes: true }, 'LOGIN_PASSWORD_REQUIRED'],
  ])('%s makes no request', async (_name, overrides, code) => {
    const stdin = vi.spyOn(passwordInput, 'readPasswordStdin').mockResolvedValue('');
    const api = vi.fn(async () => ({ data: validBody }));
    await expect(loginAccount({ ...input(), ...overrides, loginApi: api })).rejects.toMatchObject({ code });
    expect(api).not.toHaveBeenCalled();
    expect(stdin).toHaveBeenCalledTimes(code === 'LOGIN_PASSWORD_REQUIRED' && 'passwordStdin' in overrides ? 1 : 0);
    noWrites();
  });

  it('existing target is preserved before reading stdin or authenticating', async () => {
    mkdirSync(path.dirname(workspaceAuthPath(cwd)), { recursive: true });
    writeFileSync(workspaceAuthPath(cwd), 'synthetic-existing-selector');
    const stdin = vi.spyOn(passwordInput, 'readPasswordStdin');
    const api = vi.fn();
    await expect(loginAccount({ ...input(), passwordStdin: true, yes: true, loginApi: api })).rejects.toMatchObject({ code: 'LOGIN_AUTH_EXISTS' });
    expect(stdin).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
    expect(readFileSync(workspaceAuthPath(cwd), 'utf8')).toBe('synthetic-existing-selector');
    expect(set).not.toHaveBeenCalled(); expect(del).not.toHaveBeenCalled();
  });

  it('late success after timeout cannot write credentials', async () => {
    vi.useFakeTimers();
    let finish!: (value: unknown) => void;
    const api = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const pending = loginAccount({ ...input(), loginApi: api, timeoutMs: 10 });
    const rejection = expect(pending).rejects.toMatchObject({ code: 'LOGIN_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(11); await rejection;
    finish({ data: validBody }); await vi.runAllTimersAsync();
    expect(api).toHaveBeenCalledTimes(1); noWrites();
  });

  it('credential store rejection does not create a selector or delete a shared key', async () => {
    set.mockImplementation(() => { throw new Error('synthetic-password synthetic-cookie'); });
    await expect(loginAccount({ ...input(), loginApi: async () => ({ data: validBody }) }))
      .rejects.toMatchObject({ code: 'CREDENTIAL_STORE_UNAVAILABLE', message: '系统凭据库不可用，登录未保存' });
    expect(set).toHaveBeenCalledTimes(1); expect(del).not.toHaveBeenCalled();
    expect(existsSync(workspaceAuthPath(cwd))).toBe(false);
  });
});
