import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { depAdd, depRange } from '../../src/domain/version/form/dep';
import { submitVersion } from '../../src/domain/version/submit';
import { readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { FServiceAPI } from '../../src/platform/api';

// tools-lib 的 ESM 命名空间不可重定义；在 CLI 出口替换为真实调用边界上的 spy。
vi.mock('../../src/platform/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/api')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Contract: { ...actual.FServiceAPI.Contract, batchContracts: vi.fn(), batchCreateContracts: vi.fn() },
      Resource: { ...actual.FServiceAPI.Resource, batchAuth: vi.fn() },
    },
  };
});

describe('版本依赖只声明，不在 CLI 签约', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-dep-declaration-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-dep-declaration-home-'));
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
      resourceId: 'res_current',
      name: 'current',
      typeCode: 'VIDEO',
      filePath: 'current.mp4',
      env: 'test',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  function baseApis(overrides: Record<string, unknown> = {}) {
    return {
      ownInfo: async () => ({ data: { resourceId: 'res_current', userId: 7, status: 4 } }),
      info: async () => ({
        data: {
          resourceId: 'dep_image',
          latestVersion: '1.0.0',
          status: 1,
          subjectType: 1,
          baseUpcastResources: [],
          policies: [],
        },
      }),
      getVersionListByResourceID: async () => ({ data: { dataList: [{ version: '1.0.0' }] } }),
      cycleDependencyCheck: async () => ({ data: true }),
      ...overrides,
    };
  }

  it('add 无合约、无策略也只写依赖声明，不调用合约或签约接口', async () => {
    await depAdd({
      cwd,
      resourceId: 'dep_image',
      apis: baseApis(),
    });

    expect(readDraft(cwd, 1)?.dependencies).toEqual([{ resourceId: 'dep_image', versionRange: '^1.0.0' }]);
  });

  it('add 不调用真实平台出口上的合约查询、batchAuth 或签约', async () => {
    const batchContracts = vi.mocked(FServiceAPI.Contract.batchContracts);
    const batchAuth = vi.mocked(FServiceAPI.Resource.batchAuth);
    const sign = vi.mocked(FServiceAPI.Contract.batchCreateContracts);

    await depAdd({
      cwd,
      resourceId: 'dep_image',
      apis: baseApis(),
    });

    expect(batchContracts).not.toHaveBeenCalled();
    expect(batchAuth).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(readDraft(cwd, 1)?.dependencies).toEqual([{ resourceId: 'dep_image', versionRange: '^1.0.0' }]);
  });

  it('add 重复依赖只替换范围，不创建重复声明', async () => {
    await depAdd({
      cwd,
      resourceId: 'dep_image',
      versionRange: '^1.0.0',
      apis: baseApis(),
    });
    await depAdd({
      cwd,
      resourceId: 'dep_image',
      versionRange: '~1.0.0',
      apis: baseApis(),
    });

    expect(readDraft(cwd, 1)?.dependencies).toEqual([{ resourceId: 'dep_image', versionRange: '~1.0.0' }]);
  });

  it('range 重走目标、范围、循环校验后改声明，不调用签约接口', async () => {
    writeDraft(cwd, 1, {
      dependencies: [{ resourceId: 'dep_image', versionRange: '^1.0.0' }],
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const sign = vi.mocked(FServiceAPI.Contract.batchCreateContracts);

    const out = await depRange(cwd, 'dep_image', '~1.0.0', undefined, baseApis());

    expect(out).toBe('dep_image@~1.0.0');
    expect(sign).not.toHaveBeenCalled();
    expect(FServiceAPI.Contract.batchContracts).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.batchAuth).not.toHaveBeenCalled();
    expect(readDraft(cwd, 1)?.dependencies).toEqual([{ resourceId: 'dep_image', versionRange: '~1.0.0' }]);
  });

  it('目标事实、范围和循环校验失败时仍拒绝且保留原稿', async () => {
    writeDraft(cwd, 1, {
      dependencies: [{ resourceId: 'dep_image', versionRange: '^1.0.0' }],
      baseUpcastResources: [],
      authExcludedItems: [],
    });

    await expect(depRange(cwd, 'dep_image', '^9.0.0', undefined, baseApis()))
      .rejects.toMatchObject({ code: 'DEP_RANGE' });
    await expect(depRange(cwd, 'dep_image', '^1.0.0', undefined, baseApis({
      info: async () => ({
        data: {
          resourceId: 'dep_image',
          latestVersion: '1.0.0',
          status: 1,
          subjectType: 1,
          baseUpcastResources: [{ resourceId: 'up' }],
        },
      }),
    }))).rejects.toMatchObject({ code: 'DEP_UPCAST' });
    await expect(depRange(cwd, 'dep_image', '^1.0.0', undefined, baseApis({
      cycleDependencyCheck: async () => ({ data: false }),
    }))).rejects.toMatchObject({ code: 'DEP_CYCLE' });

    expect(readDraft(cwd, 1)?.dependencies).toEqual([{ resourceId: 'dep_image', versionRange: '^1.0.0' }]);
  });

  it('submit 有依赖时不查合约，payload 保留声明且不含 batchSignContracts', async () => {
    writeDraft(cwd, 1, {
      fileSha1: 'sha',
      filename: 'current.mp4',
      analyzedSha1: 'sha',
      dependencies: [{ resourceId: 'dep_image', versionRange: '^1.0.0' }],
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const batchContracts = vi.mocked(FServiceAPI.Contract.batchContracts);
    const createVersion = vi.fn(async (_params: Record<string, unknown>) => ({ data: {} }));
    const apis = { createVersion };

    await submitVersion({
      cwd,
      identity: readIdentity(cwd, 1),
      version: '1.0.0',
      apis,
    });

    expect(batchContracts).not.toHaveBeenCalled();
    expect(createVersion).toHaveBeenCalledWith(expect.objectContaining({
      dependencies: [{ resourceId: 'dep_image', versionRange: '^1.0.0' }],
      baseUpcastResources: [],
      authExcludedItems: [],
    }));
    const payload = createVersion.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('batchSignContracts');
    expect(FServiceAPI.Contract.batchCreateContracts).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.batchAuth).not.toHaveBeenCalled();
    expect(readDraft(cwd, 1)).toBeUndefined();
  });

  it('submit 手写畸形依赖仍拒绝，不创建未决记录、不 POST', async () => {
    writeDraft(cwd, 1, {
      fileSha1: 'sha',
      filename: 'current.mp4',
      analyzedSha1: 'sha',
      dependencies: [{ resourceId: '', versionRange: '^1.0.0' }, { versionRange: '^1.0.0' }],
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const createVersion = vi.fn(async () => ({ data: {} }));

    await expect(submitVersion({
      cwd,
      identity: readIdentity(cwd, 1),
      version: '1.0.0',
      apis: { createVersion },
    })).rejects.toMatchObject({ code: 'SUBMIT_DEP_INVALID' });

    expect(createVersion).not.toHaveBeenCalled();
    expect(readDraft(cwd, 1)?.fileSha1).toBe('sha');
  });
});
