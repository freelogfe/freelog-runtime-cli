import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalAuth,
  clearEphemeralAuth,
  clearResolvedAuth,
  findWorkspaceAuthFile,
  formatAuthContextLine,
  getCurrentAuth,
  getGlobalAuthPath,
  resolveCurrentAuth,
  saveAuth,
  setAuthResolveCwd,
  setEphemeralAuth,
} from '../src/core/auth.js';
import { redactSensitiveValue } from '../src/core/command.js';
import { ensureEphemeralLogin } from '../src/services/interactive/ephemeralLogin.js';

const originalEnv = { ...process.env };
const originalCwd = process.cwd();

describe('auth storage and debug redaction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cli-auth-'));
    process.env = { ...originalEnv };
    process.env.FREELOG_CRYPTO_KEY = 'test-key';
    process.env.FREELOG_CRYPTO_KEY_PATH = path.join(tempDir, 'keys', 'auth.key');
    process.env.FREELOG_AUTH_PATH_GLOBAL = path.join(tempDir, 'global', '.freelog-auth');
    delete process.env.FREELOG_AUTH_PATH_WORKSPACE;
    setAuthResolveCwd(undefined);
    clearEphemeralAuth();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    setAuthResolveCwd(undefined);
    clearEphemeralAuth();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves global credentials outside project cwd', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    process.chdir(projectDir);

    saveAuth(
      {
        token: 'secret-token',
        authorization: 'Bearer secret-token',
        environment: 'dev',
        username: 'freelog-test11',
      },
      { scope: 'global' },
    );

    expect(fs.existsSync(path.join(projectDir, '.freelog-auth'))).toBe(false);
    expect(fs.existsSync(getGlobalAuthPath())).toBe(true);
    expect(getCurrentAuth()?.token).toBe('secret-token');
  });

  it('creates a private per-user encryption key when no explicit key is configured', () => {
    delete process.env.FREELOG_CRYPTO_KEY;
    const keyPath = process.env.FREELOG_CRYPTO_KEY_PATH!;
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    saveAuth({ token: 'private-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });

    expect(fs.existsSync(keyPath)).toBe(true);
    expect(Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64')).toHaveLength(32);
    expect(fs.readFileSync(path.join(projectDir, '.freelog-auth'), 'utf8')).not.toContain('private-token');
    expect(getCurrentAuth(projectDir)?.token).toBe('private-token');
  });

  it('does not create a replacement key while reading credentials whose key is missing', () => {
    delete process.env.FREELOG_CRYPTO_KEY;
    const keyPath = process.env.FREELOG_CRYPTO_KEY_PATH!;
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    saveAuth({ token: 'private-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });
    fs.unlinkSync(keyPath);

    expect(() => resolveCurrentAuth(projectDir)).toThrowError(
      expect.objectContaining({ code: 2 }),
    );
    expect(fs.existsSync(keyPath)).toBe(false);
  });

  it('saves workspace credentials in cwd by default', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    process.chdir(projectDir);

    saveAuth(
      {
        token: 'workspace-token',
        environment: 'dev',
        username: 'ws-user',
      },
      { scope: 'workspace', cwd: projectDir },
    );

    expect(fs.existsSync(path.join(projectDir, '.freelog-auth'))).toBe(true);
    expect(fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8')).toContain('.freelog-auth');
    expect(getCurrentAuth(projectDir)?.token).toBe('workspace-token');
  });

  it('preserves existing gitignore rules and adds the workspace auth rule only once', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, '.gitignore'), 'node_modules\n', 'utf8');

    saveAuth({ token: 'first-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });
    saveAuth({ token: 'second-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });

    const gitignore = fs.readFileSync(path.join(projectDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore.match(/^\/?\.freelog-auth$/gm)).toHaveLength(1);
    expect(getCurrentAuth(projectDir)?.token).toBe('second-token');
    expect(fs.readdirSync(projectDir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it('appends a final ignore rule when an earlier auth rule is negated', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, '.gitignore'),
      '.freelog-auth\n!**/.freelog-auth\n',
      'utf8',
    );

    saveAuth({ token: 'workspace-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });

    const rules = fs
      .readFileSync(path.join(projectDir, '.gitignore'), 'utf8')
      .trim()
      .split(/\r?\n/);
    expect(rules.at(-1)).toBe('/.freelog-auth');
  });

  it('walks up from cwd and prefers nearest workspace auth', () => {
    const root = path.join(tempDir, 'monorepo');
    const child = path.join(root, 'packages', 'theme-a');
    fs.mkdirSync(child, { recursive: true });

    saveAuth({ token: 'root-token', environment: 'dev', username: 'root-user' }, {
      scope: 'workspace',
      cwd: root,
    });
    saveAuth({ token: 'child-token', environment: 'dev', username: 'child-user' }, {
      scope: 'workspace',
      cwd: child,
    });

    const fromChild = resolveCurrentAuth(child);
    expect(fromChild?.auth.token).toBe('child-token');
    expect(fromChild?.scope).toBe('workspace');

    const fromRoot = resolveCurrentAuth(root);
    expect(fromRoot?.auth.token).toBe('root-token');

    const deep = path.join(child, 'src');
    fs.mkdirSync(deep, { recursive: true });
    expect(resolveCurrentAuth(deep)?.auth.token).toBe('child-token');
  });

  it('falls back to global auth when no workspace auth exists', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    saveAuth({ token: 'global-token', environment: 'dev' }, { scope: 'global' });

    const resolved = resolveCurrentAuth(projectDir);
    expect(resolved?.auth.token).toBe('global-token');
    expect(resolved?.scope).toBe('global');
    expect(formatAuthContextLine(resolved!)).toContain('全局凭据');
  });

  it('does not misclassify a global auth file on the cwd ancestor chain as workspace auth', () => {
    const root = path.join(tempDir, 'home-like-root');
    const projectDir = path.join(root, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    process.env.FREELOG_AUTH_PATH_GLOBAL = path.join(root, '.freelog-auth');
    saveAuth({ token: 'global-token', environment: 'dev' }, { scope: 'global' });

    expect(resolveCurrentAuth(projectDir)?.scope).toBe('global');
  });

  it('fails explicitly when the nearest workspace auth is invalid instead of using global auth', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    saveAuth({ token: 'global-token', environment: 'dev' }, { scope: 'global' });
    fs.writeFileSync(path.join(projectDir, '.freelog-auth'), '{broken-json', 'utf8');

    expect(() => resolveCurrentAuth(projectDir)).toThrow(
      expect.objectContaining({ code: 2, message: expect.stringContaining('登录凭据无法读取或解密') }),
    );
  });

  it('rejects plaintext auth files and recovers through logout then login', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const workspaceAuthPath = path.join(projectDir, '.freelog-auth');
    fs.writeFileSync(
      workspaceAuthPath,
      JSON.stringify({
        token: 'plaintext-token',
        environment: 'dev',
        scope: 'workspace',
      }),
      'utf8',
    );

    expect(() => resolveCurrentAuth(projectDir)).toThrow(
      expect.objectContaining({ code: 2, message: expect.stringContaining('登录凭据无法读取或解密') }),
    );

    expect(clearResolvedAuth(projectDir)).toBe(true);
    saveAuth({ token: 'replacement-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });

    expect(resolveCurrentAuth(projectDir)?.auth.token).toBe('replacement-token');
    expect(fs.readFileSync(workspaceAuthPath, 'utf8')).not.toContain('replacement-token');
  });

  it.each([
    ['invalid encrypted marker', { encrypted: 'true' }],
    ['missing persisted scope', { scope: undefined }],
    ['scope that does not match its location', { scope: 'global' }],
    ['invalid environment', { environment: 'staging' }],
    ['invalid optional secret', { authorization: 123 }],
    ['malformed encrypted token', { token: 'not-base64!' }],
  ])('rejects an encrypted auth file with %s', (_label, mutation) => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    const workspaceAuthPath = path.join(projectDir, '.freelog-auth');
    saveAuth({ token: 'workspace-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });
    const persisted = JSON.parse(fs.readFileSync(workspaceAuthPath, 'utf8')) as Record<string, unknown>;
    Object.assign(persisted, mutation);
    fs.writeFileSync(workspaceAuthPath, JSON.stringify(persisted), 'utf8');

    expect(() => resolveCurrentAuth(projectDir)).toThrow(
      expect.objectContaining({ code: 2, message: expect.stringContaining('登录凭据无法读取或解密') }),
    );
  });

  it('can clear an invalid nearest workspace auth without deleting global auth', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    saveAuth({ token: 'global-token', environment: 'dev' }, { scope: 'global' });
    const workspaceAuthPath = path.join(projectDir, '.freelog-auth');
    fs.writeFileSync(workspaceAuthPath, '{broken-json', 'utf8');

    expect(clearResolvedAuth(projectDir)).toBe(true);
    expect(fs.existsSync(workspaceAuthPath)).toBe(false);
    expect(resolveCurrentAuth(projectDir)?.scope).toBe('global');
    expect(resolveCurrentAuth(projectDir)?.auth.token).toBe('global-token');
  });

  it('does not reuse disk auth when an interactive ephemeral login is required', async () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    saveAuth({ token: 'workspace-token', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });
    setAuthResolveCwd(projectDir);

    await expect(ensureEphemeralLogin()).rejects.toMatchObject({ code: 4 });
    expect(resolveCurrentAuth(projectDir)?.scope).toBe('workspace');
  });

  it('allows explicit workspace auth path override for tests', () => {
    const workspaceAuth = path.join(tempDir, 'workspace', '.freelog-auth');
    process.env.FREELOG_AUTH_PATH_WORKSPACE = workspaceAuth;

    saveAuth({ token: 'workspace-token', environment: 'dev', username: 'ws-user' }, {
      scope: 'workspace',
    });

    expect(fs.existsSync(workspaceAuth)).toBe(true);
    expect(findWorkspaceAuthFile()).toBe(workspaceAuth);
    expect(resolveCurrentAuth()?.auth.token).toBe('workspace-token');
  });

  it('clears resolved auth without touching global fallback', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    saveAuth({ token: 'ws', environment: 'dev' }, { scope: 'workspace', cwd: projectDir });
    saveAuth({ token: 'global', environment: 'dev' }, { scope: 'global' });

    expect(clearResolvedAuth(projectDir)).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.freelog-auth'))).toBe(false);
    expect(getCurrentAuth(projectDir)?.token).toBe('global');

    expect(clearGlobalAuth()).toBe(true);
    expect(getCurrentAuth(projectDir)).toBeNull();
  });

  it('redacts sensitive debug details recursively', () => {
    const redacted = redactSensitiveValue({
      token: 'token-value',
      nested: {
        password: 'password-value',
        cookie: 'cookie-value',
        authorization: 'Bearer token-value',
        keep: 'visible',
      },
    });

    const json = JSON.stringify(redacted);
    expect(json).not.toContain('token-value');
    expect(json).not.toContain('password-value');
    expect(json).not.toContain('cookie-value');
    expect(json).toContain('visible');
    expect(json).toContain('[redacted]');
  });

  it('prefers ephemeral auth over workspace file when set', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    saveAuth(
      { token: 'file-token', environment: 'dev', username: 'file-user' },
      { scope: 'workspace', cwd: projectDir },
    );
    setEphemeralAuth({
      token: 'memory-token',
      environment: 'dev',
      username: 'memory-user',
    });
    const resolved = resolveCurrentAuth(projectDir);
    expect(resolved?.scope).toBe('ephemeral');
    expect(resolved?.auth.token).toBe('memory-token');
    expect(formatAuthContextLine(resolved!)).toContain('临时会话·不落盘');
    clearEphemeralAuth();
    expect(getCurrentAuth(projectDir)?.token).toBe('file-token');
  });
});
