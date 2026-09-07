import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { draftPull } from '../../src/domain/version/draftPull';
import { runUpdateVersion } from '../../src/domain/version/updateVersion';
import { createIdentity } from '../../src/local/identity';
import { readDraft, writeDraft } from '../../src/local/draft';

describe('S18–S25 工作稿覆盖', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-s3-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-s3h-'));
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
      resourceId: 'res_s3',
      env: 'test',
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('S12/S19 pull 盖之前打摘要', async () => {
    writeDraft(cwd, 1, {
      fromVersion: '1.0.0',
      fileSha1: 'oldsha1xx',
      filename: 'old.mp4',
      customPropertyDescriptors: [{ key: 'a' }],
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const text = await draftPull({
      cwd,
      homeDir,
      yes: true,
      apis: {
        info: async () => ({ data: { latestVersion: '1.1.0', resourceId: 'res_s3' } }),
        getVersionListByResourceID: async () => ({
          data: { dataList: [{ version: '1.1.0' }] },
        }),
        resourceVersionInfo1: async () => ({
          data: { fileSha1: 'new', filename: 'new.mp4' },
        }),
      },
    });
    expect(text).toContain('将覆盖本地工作稿');
    expect(text).toContain('来源：1.0.0');
  });

  it('S18/S20 新号不够大，文案写死线上已经是', async () => {
    writeDraft(cwd, 1, {
      fromVersion: '1.2.0',
      fileSha1: 'sha',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    await expect(
      runUpdateVersion({
        cwd,
        homeDir,
        version: '1.2.0',
        yes: true,
        apis: {
          info: async () => ({ data: { latestVersion: '1.2.0', resourceId: 'res_s3' } }),
        },
      }),
    ).rejects.toMatchObject({
      message: '线上已经是 1.2.0，不能发 1.2.0',
    });
    expect(readDraft(cwd, 1)?.fileSha1).toBe('sha');
  });

  it('S21 首版残留稿 --yes 不默默盖', async () => {
    writeDraft(cwd, 1, {
      fileSha1: 'first',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    await expect(
      runUpdateVersion({
        cwd,
        homeDir,
        version: '1.0.1',
        yes: true,
        apis: {
          info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_s3' } }),
        },
      }),
    ).rejects.toMatchObject({ message: '请先 version draft pull --yes' });
  });
});
