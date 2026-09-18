import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { showOnline } from '../../src/domain/version/show';
import { createIdentity } from '../../src/local/identity';

describe('version show 线上版本事实', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-show-online-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-show-online-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd,
      homeDir,
      loginName: 'alice',
      password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }),
    });
    createIdentity(cwd, {
      subject: 'resource',
      name: 'show-online',
      typeCode: 'VIDEO',
      filePath: 'video.mp4',
      resourceId: 'resource-show-online',
      env: 'test',
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  const info = async () => ({ data: { resourceId: 'resource-show-online', latestVersion: '1.0.0' } });

  it('成功信封中的空 data 必须明确视为版本不存在', async () => {
    await expect(showOnline({
      cwd,
      homeDir,
      version: '1.2.0',
      apis: { info, resourceVersionInfo1: async () => ({ ret: 0, data: null }) },
    })).rejects.toMatchObject({ code: 'VERSION_NOT_FOUND' });
  });

  it('版本详情必须证明请求的 resourceId 与 version，不能只回成功信封', async () => {
    await expect(showOnline({
      cwd,
      homeDir,
      version: '1.0.0',
      apis: { info, resourceVersionInfo1: async () => ({ data: { resourceId: 'other', version: '1.0.0' } }) },
    })).rejects.toMatchObject({ code: 'VERSION_INFO_INVALID' });
  });

  it('返回完整版本事实后才打印线上详情', async () => {
    await expect(showOnline({
      cwd,
      homeDir,
      version: '1.0.0',
      apis: { info, resourceVersionInfo1: async () => ({ data: { resourceId: 'resource-show-online', version: '1.0.0', filename: 'video.mp4' } }) },
    })).resolves.toContain('video.mp4');
  });
});
