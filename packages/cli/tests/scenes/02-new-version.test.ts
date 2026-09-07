import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { runUpdateVersion } from '../../src/domain/version/updateVersion';
import { createIdentity } from '../../src/local/identity';
import { writeDraft } from '../../src/local/draft';

describe('S9–S17 发新号', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-s2-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-s2h-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd,
      homeDir,
      loginName: 'alice',
      password: 'x',
      loginApi: async () => ({ data: { userId: 1, username: 'alice', token: 't' } }),
    });
    createIdentity(cwd, {
      subject: 'resource',
      name: 'clip',
      typeCode: 'VIDEO',
      resourceId: 'res_s2',
      env: 'test',
    });
    writeDraft(cwd, 1, {
      fromVersion: '1.0.0',
      fileSha1: 'sha',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('S9/S13 新号必须大于 latest，对不上 --yes 失败并点名来源', async () => {
    await expect(
      runUpdateVersion({
        cwd,
        homeDir,
        reuseVersion: '1.1.0',
        version: '1.0.1',
        yes: true,
        apis: {
          info: async () => ({ data: { latestVersion: '1.1.0', resourceId: 'res_s2' } }),
        },
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('稿来自 1.0.0、底是 1.1.0'),
    });
  });

  it('S15 没有 latest 不能 update-version', async () => {
    await expect(
      runUpdateVersion({
        cwd,
        homeDir,
        version: '1.0.1',
        yes: true,
        apis: {
          info: async () => ({ data: { resourceId: 'res_s2' } }),
        },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('请先 create-version') });
  });

  it('S17 --yes 必须指定 --version 或 --bump；两者不能一起', async () => {
    await expect(
      runUpdateVersion({
        cwd,
        homeDir,
        yes: true,
        apis: {
          info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_s2' } }),
        },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('请指定 --version 或 --bump') });

    await expect(
      runUpdateVersion({
        cwd,
        homeDir,
        version: '1.1.0',
        bump: 'patch',
        yes: true,
        apis: {
          info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_s2' } }),
        },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('--version 与 --bump 不能一起用') });
  });
});
