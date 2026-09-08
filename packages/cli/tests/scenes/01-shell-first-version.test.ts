import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { createResource } from '../../src/domain/create/create';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { runCreateVersion } from '../../src/domain/version/createVersion';
import { evaluateGates } from '../../src/domain/version/gates';
import { readDraft } from '../../src/local/draft';

describe('S1–S8 壳与首版', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-s1-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-s1h-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd,
      homeDir,
      loginName: 'alice',
      password: 'x',
      loginApi: async () => ({ data: { userId: 1, username: 'alice', token: 't' } }),
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('S1/S4 建壳不上传，再 --prepare 不 POST，--yes 提交 1.0.0', async () => {
    const created = await createResource({
      cwd,
      homeDir,
      title: '片',
      type: 'VIDEO',
      name: 'clip',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1, subjectType: 1 } }),
        info: async () => ({ data: {} }),
        create: async () => ({ data: { resourceId: 'res_s1' } }),
      },
    });
    expect(created.resourceId).toBe('res_s1');
    expect(created).not.toHaveProperty('title');

    writeFileSync(path.join(cwd, 'a.mp4'), 'bin');
    const createVersion = vi.fn();
    await runCreateVersion({
      cwd,
      homeDir,
      prepare: true,
      yes: true,
      file: 'a.mp4',
      apis: {
        info: async () => ({ data: { resourceId: 'res_s1' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    });
    expect(createVersion).toHaveBeenCalledTimes(0);
    expect(readDraft(cwd, 1)?.fileSha1).toBeTruthy();

    await runCreateVersion({
      cwd,
      homeDir,
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_s1' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion: async (payload) => {
          expect(payload.version).toBe('1.0.0');
          return { data: {} };
        },
      },
    });
    expect(readDraft(cwd, 1)).toBeUndefined();
  });

  it('S5 已有 latest 不能 create-version，文案带 latest', () => {
    expect(() => evaluateGates({ latestVersion: '1.2.0' }, 'create-version')).toThrow(
      /线上 latest 是 1.2.0/,
    );
  });

  it('名称查重接口除 404 外失败时，绝不把未知状态当作可创建', async () => {
    await expect(createResource({
      cwd,
      homeDir,
      title: '片',
      type: 'VIDEO',
      name: 'clip',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1, subjectType: 1 } }),
        info: async () => { throw Object.assign(new Error('offline'), { response: { status: 503 } }); },
        create: async () => ({ data: { resourceId: 'must-not-create' } }),
      },
    })).rejects.toMatchObject({ code: 'CREATE_LOOKUP_FAILED' });
  });

  it('S6 更新稿不能当首版用', () => {
    expect(() =>
      evaluateGates({ draft: { fromVersion: '1.0.0', baseUpcastResources: [], authExcludedItems: [] } }, 'create-version'),
    ).toThrow(/这是更新版本的稿，发行版本不用/);
  });
});
