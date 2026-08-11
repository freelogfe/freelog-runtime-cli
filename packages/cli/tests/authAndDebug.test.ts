import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalAuth,
  clearResolvedAuth,
  findWorkspaceAuthFile,
  formatAuthContextLine,
  getCurrentAuth,
  getGlobalAuthPath,
  resolveCurrentAuth,
  saveAuth,
  setAuthResolveCwd,
} from '../src/core/auth.js';
import { redactSensitiveValue } from '../src/core/command.js';

const originalEnv = { ...process.env };
const originalCwd = process.cwd();

describe('auth storage and debug redaction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-cli-auth-'));
    process.env = { ...originalEnv };
    process.env.FREELOG_CRYPTO_KEY = 'test-key';
    process.env.FREELOG_AUTH_PATH_GLOBAL = path.join(tempDir, 'global', '.freelog-auth');
    delete process.env.FREELOG_AUTH_PATH_WORKSPACE;
    setAuthResolveCwd(undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    setAuthResolveCwd(undefined);
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
    expect(getCurrentAuth(projectDir)?.token).toBe('workspace-token');
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
});
