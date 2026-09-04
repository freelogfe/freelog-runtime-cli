import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearEphemeralAuth,
  clearResolvedAuth,
  getCurrentAuth,
  resolveCurrentAuth,
  saveAuth,
  setEphemeralAuth,
} from '../src/core/auth.js';

const originalEnv = { ...process.env };

describe('ephemeral logout via clearResolvedAuth', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-ephemeral-logout-'));
    process.env = { ...originalEnv };
    process.env.FREELOG_CRYPTO_KEY = 'test-key';
    process.env.FREELOG_AUTH_PATH_GLOBAL = path.join(tempDir, 'global', '.freelog-auth');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('clears ephemeral memory without deleting workspace auth file', () => {
    const projectDir = path.join(tempDir, 'project');
    fs.mkdirSync(projectDir, { recursive: true });

    saveAuth(
      { token: 'file-token', environment: 'dev', username: 'file-user', userId: 1 },
      { scope: 'workspace', cwd: projectDir },
    );
    setEphemeralAuth({
      token: 'memory-token',
      environment: 'dev',
      username: 'memory-user',
      userId: 2,
    });

    expect(resolveCurrentAuth(projectDir)?.scope).toBe('ephemeral');
    expect(clearResolvedAuth(projectDir)).toBe(true);
    expect(getCurrentAuth(projectDir)?.token).toBe('file-token');
    expect(fs.existsSync(path.join(projectDir, '.freelog-auth'))).toBe(true);

    clearEphemeralAuth();
    expect(getCurrentAuth(projectDir)?.token).toBe('file-token');
  });
});
