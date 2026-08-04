import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCurrentAuth, saveAuth } from '../src/core/auth.js';
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
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves credentials to the user-level path by default, not the project cwd', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });
    process.chdir(projectDir);

    saveAuth({
      token: 'secret-token',
      authorization: 'Bearer secret-token',
      environment: 'dev',
      username: 'freelog-test11',
    });

    expect(fs.existsSync(path.join(projectDir, '.freelog-auth'))).toBe(false);
    expect(fs.existsSync(process.env.FREELOG_AUTH_PATH_GLOBAL!)).toBe(true);
    expect(getCurrentAuth()?.token).toBe('secret-token');
  });

  it('allows explicit workspace auth path only through env override', () => {
    const workspaceAuth = path.join(tempDir, 'workspace', '.freelog-auth');
    process.env.FREELOG_AUTH_PATH_WORKSPACE = workspaceAuth;

    saveAuth(
      {
        token: 'workspace-token',
        environment: 'dev',
      },
      false,
    );

    expect(fs.existsSync(workspaceAuth)).toBe(true);
    expect(getCurrentAuth()?.token).toBe('workspace-token');
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
