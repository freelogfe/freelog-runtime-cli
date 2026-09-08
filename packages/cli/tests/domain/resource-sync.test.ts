import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { syncResourceTitles } from '../../src/domain/resource/sync';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { setCredentialStoreForTests } from '../../src/local/auth';
import type { CredentialStore } from '../../src/ports/credential';

function memoryCredentialStore(): CredentialStore {
  const values = new Map<string, string>();
  return { get: (key) => values.get(key), set: (key, value) => { values.set(key, value); }, delete: (key) => values.delete(key) };
}

describe('资源标题同步', () => {
  beforeEach(() => {
    applyCliEnv({ flag: 'dev' });
    setCredentialStoreForTests(memoryCredentialStore());
  });
  afterEach(() => {
    resetEnvForTests();
    setCredentialStoreForTests();
  });

  it('只同步当前环境的成功项，失败时保留旧标题', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-title-sync-'));
    const homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-title-home-'));
    await loginAccount({
      cwd, homeDir, loginName: 'alice', password: 'pw',
      loginApi: async () => ({ data: { userId: 1, username: 'alice', token: 'token' } }),
    });
    createIdentity(cwd, { subject: 'resource', resourceId: 'r1', name: 'a', title: '旧 A', typeCode: 'VIDEO', env: 'dev' });
    createIdentity(cwd, { subject: 'resource', resourceId: 'r2', name: 'b', title: '旧 B', typeCode: 'VIDEO', env: 'dev' });
    await expect(syncResourceTitles({
      cwd,
      homeDir,
      apis: {
        info: async ({ resourceIdOrName }) => {
          if (resourceIdOrName === 'r2') throw new Error('网络失败');
          return { data: { resourceTitle: '新 A' } };
        },
      },
    })).rejects.toMatchObject({ code: 'RESOURCE_SYNC_PARTIAL' });
    expect(readIdentity(cwd, 1).title).toBe('新 A');
    expect(readIdentity(cwd, 2).title).toBe('旧 B');
  });
});
