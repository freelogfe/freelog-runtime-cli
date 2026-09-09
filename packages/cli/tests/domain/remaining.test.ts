import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { bindResource } from '../../src/domain/bind/bind';
import { createResource } from '../../src/domain/create/create';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { initProject } from '../../src/domain/init/scaffold';
import { updateListing } from '../../src/domain/listing/update';
import { offlineResource, onlineResource, validateForOnline } from '../../src/domain/online/online';
import { statusProject } from '../../src/domain/status';
import { runCreateVersion } from '../../src/domain/version/createVersion';
import { draftDiscard } from '../../src/domain/version/draftDiscard';
import { draftPull } from '../../src/domain/version/draftPull';
import { waitAnalyze } from '../../src/domain/version/file';
import { attrAdd, attrSet } from '../../src/domain/version/form/attr';
import { depAdd, depRange } from '../../src/domain/version/form/dep';
import { optionAdd, optionSet } from '../../src/domain/version/form/option';
import { assertKeyUnchanged, parseLine } from '../../src/domain/version/form/parseLine';
import { previewLine } from '../../src/domain/version/form/preview';
import { setDraftDescription } from '../../src/domain/version/draftDescription';
import { evaluateGates } from '../../src/domain/version/gates';
import { showLocal } from '../../src/domain/version/show';
import { buildVersionPayload, submitVersion } from '../../src/domain/version/submit';
import { runUpdateVersion } from '../../src/domain/version/updateVersion';
import { assertArtifactPath, zipDirectoryContents } from '../../src/domain/version/zip';
import { deleteDraft, readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity, readIdentity } from '../../src/local/identity';

const originalEnv = process.env.FREELOG_ENV;

async function login(cwd: string, homeDir: string) {
  applyCliEnv({ flag: 'test' });
  await loginAccount({
    cwd,
    homeDir,
    loginName: 'alice',
    password: 'x',
    loginApi: async () => ({
      data: { userId: 7, username: 'alice', token: 't' },
    }),
  });
}

describe('T4–T13 领域', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-rest-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-home-'));
    delete process.env.FREELOG_ENV;
    applyCliEnv({ flag: 'test' });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.FREELOG_ENV;
    } else {
      process.env.FREELOG_ENV = originalEnv;
    }
    resetEnvForTests();
  });

  it('create 建壳不上传；已绑定状态不妨碍同工程新增另一资源', async () => {
    await login(cwd, homeDir);
    const created = await createResource({
      cwd,
      homeDir,
      title: '标题',
      type: 'VIDEO',
      name: 'demo',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({
          data: { code, name: '视频', isTerminate: true, status: 1, subjectType: 1 },
        }),
        info: async () => ({ data: {} }),
        create: async (params) => {
          expect(params).not.toHaveProperty('policies');
          return { data: { resourceId: 'res_1', resourceName: 'alice/demo' } };
        },
      },
    });
    expect(created.resourceId).toBe('res_1');
    expect(created.title).toBe('标题');
    expect(created.env).toBe('test');

    const second = await createResource({
      cwd,
      homeDir,
      title: '标题2',
      type: 'VIDEO',
      name: 'demo2',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({
          data: { code, isTerminate: true, status: 1, subjectType: 1 },
        }),
        info: async () => ({ data: {} }),
        create: async () => ({ data: { resourceId: 'res_2' } }),
      },
    });
    expect(second).toMatchObject({ n: 2, resourceId: 'res_2', name: 'demo2' });
  });

  it('已有主题/插件工程可显式指定构建目录后创建资源壳', async () => {
    await login(cwd, homeDir);
    await expect(createResource({
      cwd,
      homeDir,
      title: '主题',
      name: 'theme-without-template',
      type: 'RT001',
      yes: true,
    })).rejects.toMatchObject({ code: 'CREATE_FIXED_TYPE_FILE_REQUIRED' });

    const created = await createResource({
      cwd,
      homeDir,
      title: '已有主题',
      name: 'existing-theme',
      type: 'RT001',
      file: 'dist',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({ data: { code, name: '主题', isTerminate: true, status: 1, subjectType: [1] } }),
        info: async () => ({ data: {} }),
        create: async (body) => {
          expect(body).toMatchObject({ resourceTypeCode: 'RT001' });
          return { data: { resourceId: 'res_existing_theme' } };
        },
      },
    });
    expect(created).toMatchObject({ typeCode: 'RT001', filePath: 'dist', resourceId: 'res_existing_theme' });
    expect(existsSync(path.join(cwd, '.freelog', '1.template.json'))).toBe(false);

    const dist = path.join(cwd, 'dist');
    mkdirSync(dist);
    writeFileSync(path.join(dist, 'index.html'), '<main>theme</main>');
    const createVersion = vi.fn(async () => ({ data: {} }));
    await runCreateVersion({
      cwd,
      homeDir,
      artifact: 'dist',
      prepare: true,
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_existing_theme' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    });
    expect(readDraft(cwd, created.n)?.filename).toMatch(/\.zip$/u);
    await runCreateVersion({
      cwd,
      homeDir,
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_existing_theme' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    });
    expect(createVersion).toHaveBeenCalledWith(expect.objectContaining({ version: '1.0.0', filename: expect.stringMatching(/\.zip$/u) }));
    expect(readDraft(cwd, created.n)).toBeUndefined();
  });

  it('bind 接入身份，只接受单资源，status 不写盘', async () => {
    await login(cwd, homeDir);
    await expect(
      bindResource({
        cwd,
        homeDir,
        target: 'col_1',
        apis: {
          info: async () => ({
            data: { resourceId: 'col_1', subjectType: 4, userId: 7 },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: 'BIND_COLLECTION' });

    await expect(
      bindResource({
        cwd,
        homeDir,
        target: 'other_1',
        apis: {
          info: async () => ({
            data: { resourceId: 'other_1', subjectType: 5, userId: 7 },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: 'BIND_SUBJECT_INVALID' });

    const bound = await bindResource({
      cwd,
      homeDir,
      target: 'res_9',
      file: 'a.mp4',
      apis: {
        info: async () => ({
          data: {
            resourceId: 'res_9',
            subjectType: [1],
            userId: 7,
            resourceName: 'alice/clip',
            resourceTypeCode: 'VIDEO',
          },
        }),
      },
    });
    expect(bound.resourceId).toBe('res_9');
    expect(bound.filePath).toBe('a.mp4');
    expect(bound.title).toBe('clip');

    const before = readIdentity(cwd, 1);
    const text = await statusProject({
      cwd,
      homeDir,
      apis: {
        info: async () => ({
          data: { resourceId: 'res_9', latestVersion: '1.0.0' },
        }),
      },
    });
    expect(text).toContain('res_9');
    expect(readIdentity(cwd, 1)).toEqual(before);
  });

  it('多资源工程 bind 可新增状态，也可接续唯一未绑定状态', async () => {
    await login(cwd, homeDir);
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_a', name: 'a', title: 'A', typeCode: 'VIDEO', filePath: 'a.mp4', env: 'test' });
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_b', name: 'b', title: 'B', typeCode: 'VIDEO', filePath: 'b.mp4', env: 'test' });
    const info = async () => ({
      data: {
        resourceId: 'res_c', resourceName: 'alice/c', resourceTitle: 'C', resourceTypeCode: 'VIDEO',
        subjectType: [1], userId: 7,
      },
    });
    const added = await bindResource({ cwd, homeDir, target: 'res_c', file: 'c.mp4', apis: { info } });
    expect(added).toMatchObject({ n: 3, resourceId: 'res_c', filePath: 'c.mp4' });

    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO' });
    const infoD = async () => ({
      data: {
        resourceId: 'res_d', resourceName: 'alice/d', resourceTitle: 'D', resourceTypeCode: 'VIDEO',
        subjectType: [1], userId: 7,
      },
    });
    const continued = await bindResource({ cwd, homeDir, target: 'res_d', file: 'd.mp4', apis: { info: infoD } });
    expect(continued).toMatchObject({ n: 4, resourceId: 'res_d', filePath: 'd.mp4' });
  });

  it('已有主题工程 bind 必须记录构建目录，且不写模板元数据', async () => {
    await login(cwd, homeDir);
    const info = async () => ({
      data: {
        resourceId: 'res_bound_theme', resourceName: 'alice/bound-theme', resourceTypeCode: 'RT001',
        subjectType: [1], userId: 7,
      },
    });
    await expect(bindResource({
      cwd, homeDir, target: 'res_bound_theme', apis: { info },
    })).rejects.toMatchObject({ code: 'BIND_FIXED_TYPE_FILE_REQUIRED' });
    const bound = await bindResource({
      cwd, homeDir, target: 'res_bound_theme', file: 'dist', apis: { info },
    });
    expect(bound).toMatchObject({ resourceId: 'res_bound_theme', typeCode: 'RT001', filePath: 'dist' });
    expect(existsSync(path.join(cwd, '.freelog', '1.template.json'))).toBe(false);

    const dist = path.join(cwd, 'dist');
    mkdirSync(dist);
    writeFileSync(path.join(dist, 'index.html'), '<main>bound theme</main>');
    writeDraft(cwd, bound.n, { fromVersion: '1.0.0' });
    const createVersion = vi.fn(async () => ({ data: {} }));
    await expect(runUpdateVersion({
      cwd,
      homeDir,
      artifact: 'dist',
      bump: 'patch',
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_bound_theme', latestVersion: '1.0.0' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    })).resolves.toBe('1.0.1');
    expect(createVersion).toHaveBeenCalledWith(expect.objectContaining({ version: '1.0.1', filename: expect.stringMatching(/\.zip$/u) }));
    expect(readDraft(cwd, bound.n)).toBeUndefined();
  });

  it('工作稿读写删，坏文件失败', () => {
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_draft', name: 'a', typeCode: 'VIDEO' });
    const draft = writeDraft(cwd, 1, {
      fileSha1: 'abc',
      filename: 'a.mp4',
      description: 'd',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    expect(readDraft(cwd, 1)?.fileSha1).toBe('abc');
    expect(draft.baseUpcastResources).toEqual([]);
    writeFileSync(path.join(cwd, '.freelog', '1.version.json'), '{');
    expect(() => readDraft(cwd, 1)).toThrow(/无法解析/);
    writeDraft(cwd, 1, draft);
    expect(deleteDraft(cwd, 1)).toBe(true);
    expect(readDraft(cwd, 1)).toBeUndefined();
  });

  it('show --local 不打版本接口；discard 没稿退出句', async () => {
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_show', name: 'a', typeCode: 'VIDEO' });
    await expect(draftDiscard(cwd)).resolves.toBe('没有工作稿');
    writeDraft(cwd, 1, {
      fileSha1: 'abc',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    expect(showLocal(cwd)).toContain('abc');
    expect(showLocal(cwd)).toContain('这是本地未提交的版本工作稿');
    await expect(draftDiscard(cwd, undefined, true)).resolves.toBe('已丢掉工作稿');
    expect(() => showLocal(cwd)).toThrow(/没有本地版本工作稿/);
  });

  it('zip 仅 RT001/002 目录；其它目录失败', async () => {
    const dir = path.join(cwd, 'dist');
    mkdirSync(dir);
    writeFileSync(path.join(dir, 'index.js'), 'ok');
    expect(() => assertArtifactPath('VIDEO', dir)).toThrow(/不支持文件夹/);
    expect(() => assertArtifactPath('RT001', path.join(cwd, 'a.zip'))).not.toThrow();
    writeFileSync(path.join(cwd, 'a.zip'), 'zip');
    expect(() => assertArtifactPath('RT001', path.join(cwd, 'a.zip'))).toThrow(/不要自己打 zip/);
    const zip = await zipDirectoryContents(dir);
    expect(zip.endsWith('.zip')).toBe(true);
  });

  it('filesListInfo 超时与完成', async () => {
    let calls = 0;
    await expect(
      waitAnalyze(
        'sha',
        'VIDEO',
        {
          filesListInfo: async () => {
            calls += 1;
            return { data: { metaAnalyzeStatus: 1 } };
          },
        },
        () => (calls > 2 ? 200_000 : 0),
        async () => {},
      ),
    ).rejects.toMatchObject({ message: '属性解析超时' });

    const done = await waitAnalyze(
      'sha',
      'VIDEO',
      { filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }) },
      () => 0,
      async () => {},
    );
    expect(done.metaAnalyzeStatus).toBe(2);
  });

  it('一行式与预览，键不能改', () => {
    const parsed = parseLine('名称=宽 键=width 值=1920');
    expect(parsed).toMatchObject({ name: '宽', key: 'width', value: '1920' });
    expect(previewLine(parsed)).toBe('预览：\n  名称=宽\n  键=width\n  值=1920');
    expect(() => assertKeyUnchanged('width', 'w')).toThrow(/键不能改/);
  });

  it('attr / option 写稿', async () => {
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_attr', name: 'a', typeCode: 'VIDEO' });
    await attrAdd(cwd, { line: '名称=宽 键=width 值=1', yes: true });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]?.key).toBe('width');
    writeDraft(cwd, 1, {
      ...readDraft(cwd, 1)!,
      fileSha1: 'abc',
    });
    await optionAdd(cwd, {
      line: '名称=颜色 键=color 方式=文本 默认=red',
      supportOptionalConfig: true,
      yes: true,
    });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.some((item) => item.key === 'color')).toBe(true);
    await expect(optionAdd(cwd, { line: '名称=x 键=x', supportOptionalConfig: false, yes: true })).rejects.toMatchObject({
      message: '当前类型不支持可选配置',
    });
  });

  it('依赖只看 isAuth，上抛不加', async () => {
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_dep', name: 'a', typeCode: 'VIDEO' });
    await expect(
      depAdd({
        cwd,
        resourceId: 'up',
        apis: {
          info: async () => ({
            data: {
              resourceId: 'up',
              latestVersion: '1.0.0',
              status: 1,
              subjectType: 1,
              baseUpcastResources: [{ resourceId: 'x' }],
            },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: 'DEP_UPCAST' });

    await depAdd({
      cwd,
      resourceId: 'dep1',
      apis: {
        info: async () => ({
          data: {
            resourceId: 'dep1',
            latestVersion: '1.0.0',
            status: 1,
            subjectType: 1,
            baseUpcastResources: [],
          },
        }),
        getVersionListByResourceID: async () => ({
          data: { dataList: [{ version: '1.0.0' }] },
        }),
        cycleDependencyCheck: async () => ({ data: { isCycle: false } }),
        batchAuth: async () => ({ data: { isAuth: true } }),
      },
    });
    expect(readDraft(cwd, 1)?.dependencies?.[0]?.resourceId).toBe('dep1');
  });

  it('未授权签约不分免费/付费：只签显式选择的启用策略，签后直接写稿', async () => {
    createIdentity(cwd, { subject: 'resource', name: 'a', typeCode: 'VIDEO', resourceId: 'me1' });
    const signCalls: Record<string, unknown>[] = [];
    const batchAuthCalls: number[] = [];

    await depAdd({
      cwd,
      resourceId: 'paid-dep',
      policyId: 'paid-1',
      apis: {
        info: async () => ({
          data: {
            resourceId: 'paid-dep',
            latestVersion: '1.0.0',
            status: 1,
            subjectType: 1,
            baseUpcastResources: [],
            policies: [
              { policyId: 'paid-1', policyName: '付费订阅', status: 1, policyText: '...TransactionEvent...' },
              { policyId: 'off-1', policyName: '停用', status: 0 },
            ],
          },
        }),
        getVersionListByResourceID: async () => ({
          data: { dataList: [{ version: '1.0.0' }] },
        }),
        cycleDependencyCheck: async () => ({ data: true }),
        batchAuth: async () => {
          batchAuthCalls.push(1);
          return { data: { isAuth: false } };
        },
        sign: async (params) => {
          signCalls.push(params);
          return { data: {} };
        },
      },
    });

    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]).toMatchObject({
      subjectType: 1,
      licenseeId: 'me1',
      licenseeIdentityType: 1,
      subjects: [{ subjectId: 'paid-dep', policyId: 'paid-1', subjectType: 1 }],
    });
    // 只在签约前查一次授权，签后不复查直接写稿
    expect(batchAuthCalls).toHaveLength(1);
    expect(readDraft(cwd, 1)?.dependencies?.[0]?.resourceId).toBe('paid-dep');
  });

  it('未授权依赖拒绝缺失或不属于当前列表的 policyId', async () => {
    createIdentity(cwd, { subject: 'resource', name: 'a', typeCode: 'VIDEO', resourceId: 'me-policy' });
    const apis = {
      info: async () => ({
        data: {
          resourceId: 'dep-policy', latestVersion: '1.0.0', status: 1, subjectType: 1,
          baseUpcastResources: [], policies: [{ policyId: 'policy-a', policyName: '策略 A', status: 1 }],
        },
      }),
      getVersionListByResourceID: async () => ({ data: { dataList: [{ version: '1.0.0' }] } }),
      cycleDependencyCheck: async () => ({ data: true }),
      batchAuth: async () => ({ data: { isAuth: false } }),
      sign: async () => ({ data: {} }),
    };
    await expect(depAdd({ cwd, resourceId: 'dep-policy', yes: true, apis })).rejects.toMatchObject({
      code: 'DEP_POLICY_REQUIRED',
    });
    await expect(depAdd({ cwd, resourceId: 'dep-policy', policyId: 'other', apis })).rejects.toMatchObject({
      code: 'DEP_POLICY_INVALID',
    });
  });

  it('对方没有任何启用策略时拒绝', async () => {
    createIdentity(cwd, { subject: 'resource', name: 'b', typeCode: 'VIDEO', resourceId: 'me2' });
    await expect(
      depAdd({
        cwd,
        resourceId: 'nopolicy',
        apis: {
          info: async () => ({
            data: {
              resourceId: 'nopolicy',
              latestVersion: '1.0.0',
              status: 1,
              subjectType: 1,
              baseUpcastResources: [],
              policies: [{ policyId: 'off-1', policyName: '停用', status: 0 }],
            },
          }),
          getVersionListByResourceID: async () => ({
            data: { dataList: [{ version: '1.0.0' }] },
          }),
          cycleDependencyCheck: async () => ({ data: true }),
          batchAuth: async () => ({ data: { isAuth: false } }),
        },
      }),
    ).rejects.toMatchObject({ code: 'DEP_NO_POLICY' });
  });

  it('dep range 与 add 同一套校验：范围不命中/环/上抛拒，未授权则签所选策略后写稿', async () => {
    createIdentity(cwd, { subject: 'resource', name: 'c', typeCode: 'VIDEO', resourceId: 'me3' });
    writeDraft(cwd, 1, {
      baseUpcastResources: [],
      authExcludedItems: [],
      dependencies: [{ resourceId: 'dep1', versionRange: '^1.0.0' }],
    });
    const signCalls: Record<string, unknown>[] = [];
    const rangeApis = {
      info: async () => ({
        data: {
          resourceId: 'dep1',
          latestVersion: '2.0.0',
          status: 1,
          subjectType: 1,
          baseUpcastResources: [],
          policies: [{ policyId: 'free-1', policyName: '免费', status: 1 }],
        },
      }),
      getVersionListByResourceID: async () => ({
        data: { dataList: [{ version: '1.0.0' }, { version: '2.0.0' }] },
      }),
      cycleDependencyCheck: async () => ({ data: true }),
      batchAuth: async () => ({ data: { isAuth: false } }),
      sign: async (params: Record<string, unknown>) => {
        signCalls.push(params);
        return { data: [] };
      },
    };

    // 范围不命中对方发号
    await expect(
      depRange(cwd, 'dep1', '^9.0.0', undefined, rangeApis),
    ).rejects.toMatchObject({ code: 'DEP_RANGE' });
    // 对方有基础上抛拒
    await expect(
      depRange(cwd, 'dep1', '^1.0.0', undefined, {
        ...rangeApis,
        info: async () => ({
          data: {
            resourceId: 'dep1', latestVersion: '2.0.0', status: 1, subjectType: 1,
            baseUpcastResources: [{ resourceId: 'x' }],
          },
        }),
      }),
    ).rejects.toMatchObject({ code: 'DEP_UPCAST' });
    // 循环依赖拒
    await expect(
      depRange(cwd, 'dep1', '^1.0.0', undefined, {
        ...rangeApis,
        cycleDependencyCheck: async () => ({ data: false }),
      }),
    ).rejects.toMatchObject({ code: 'DEP_CYCLE' });
    expect(signCalls).toHaveLength(0);

    // isAuth=false → 签约（带 subjectType）→ 写稿
    const out = await depRange(cwd, 'dep1', '^2.0.0', undefined, rangeApis, { policyId: 'free-1' });
    expect(out).toBe('dep1@^2.0.0');
    expect(signCalls).toHaveLength(1);
    expect(signCalls[0]).toMatchObject({
      subjectType: 1,
      licenseeId: 'me3',
      licenseeIdentityType: 1,
      subjects: [{ subjectId: 'dep1', policyId: 'free-1', subjectType: 1 }],
    });
    const draft = readDraft(cwd, 1);
    expect(draft?.dependencies).toEqual([{ resourceId: 'dep1', versionRange: '^2.0.0' }]);

    // isAuth=true → 不签直接写稿
    await depRange(cwd, 'dep1', '^1.0.0', undefined, {
      ...rangeApis,
      batchAuth: async () => ({ data: { isAuth: true } }),
      sign: async () => {
        throw new Error('不应签约');
      },
    });
    expect(readDraft(cwd, 1)?.dependencies).toEqual([{ resourceId: 'dep1', versionRange: '^1.0.0' }]);
  });

  it('gates 与 create-version --prepare 不 POST', async () => {
    expect(() =>
      evaluateGates({ latestVersion: '1.0.0' }, 'create-version'),
    ).toThrow(/已经有发行版本/);
    expect(() => evaluateGates({}, 'update-version')).toThrow(/请先 create-version/);

    await login(cwd, homeDir);
    await createResource({
      cwd,
      homeDir,
      title: 't',
      type: 'VIDEO',
      name: 'n',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1, subjectType: 1 } }),
        info: async () => ({ data: {} }),
        create: async () => ({ data: { resourceId: 'res_p' } }),
      },
    });
    const createVersion = vi.fn();
    writeFileSync(path.join(cwd, 'clip.mp4'), 'x');
    await runCreateVersion({
      cwd,
      homeDir,
      prepare: true,
      artifact: 'clip.mp4',
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_p' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    });
    expect(createVersion).toHaveBeenCalledTimes(0);
    expect(readDraft(cwd, 1)?.fileSha1).toBeTruthy();
  });

  it('create-version --yes POST 1.0.0，成功删稿，体里上抛恒 []', async () => {
    await login(cwd, homeDir);
    await createResource({
      cwd,
      homeDir,
      title: 't',
      type: 'VIDEO',
      name: 'n',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1, subjectType: 1 } }),
        info: async () => ({ data: {} }),
        create: async () => ({ data: { resourceId: 'res_s' } }),
      },
    });
    writeFileSync(path.join(cwd, 'a.mp4'), 'x');
    writeDraft(cwd, 1, {
      fileSha1: 'abc',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const createVersion = vi.fn(async (payload) => {
      expect(payload.version).toBe('1.0.0');
      expect(payload.baseUpcastResources).toEqual([]);
      expect(payload.authExcludedItems).toEqual([]);
      return { data: {} };
    });
    await runCreateVersion({
      cwd,
      homeDir,
      yes: true,
      artifact: 'a.mp4',
      apis: {
        info: async () => ({ data: { resourceId: 'res_s' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    });
    expect(createVersion).toHaveBeenCalledTimes(1);
    expect(readDraft(cwd, 1)).toBeUndefined();
  });

  it('draft pull 打摘要；update-version 新号必须更大', async () => {
    await login(cwd, homeDir);
    createIdentity(cwd, {
      subject: 'resource',
      name: 'n',
      typeCode: 'VIDEO',
      resourceId: 'res_u',
      env: 'test',
    });
    writeDraft(cwd, 1, {
      fromVersion: '1.0.0',
      fileSha1: 'old',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const text = await draftPull({
      cwd,
      homeDir,
      yes: true,
      apis: {
        info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_u' } }),
        getVersionListByResourceID: async () => ({
          data: { dataList: [{ version: '1.0.0' }] },
        }),
        resourceVersionInfo1: async () => ({
          data: { fileSha1: 'newsha', filename: 'b.mp4' },
        }),
      },
    });
    expect(text).toContain('将覆盖本地工作稿');

    const createVersion = vi.fn(async () => ({ data: {} }));
    writeFileSync(path.join(cwd, 'b.mp4'), 'x');
    await expect(
      runUpdateVersion({
        cwd,
        homeDir,
        version: '1.0.0',
        yes: true,
        apis: {
          info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_u' } }),
          createVersion,
        },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('线上已经是 1.0.0') });

    await runUpdateVersion({
      cwd,
      homeDir,
      version: '1.0.1',
      yes: true,
      artifact: 'b.mp4',
      apis: {
        info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_u' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    });
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        version: '1.0.1',
        baseUpcastResources: [],
        authExcludedItems: [],
      }),
    );
    expect(readDraft(cwd, 1)).toBeUndefined();
  });

  it('listing payload 无 status；online 门禁；offline status 4', async () => {
    await login(cwd, homeDir);
    createIdentity(cwd, {
      subject: 'resource',
      name: 'n',
      typeCode: 'VIDEO',
      resourceId: 'res_l',
      env: 'test',
    });
    const payload = await updateListing({
      cwd,
      homeDir,
      title: '新标题',
      yes: true,
      apis: {
        update: async (body) => {
          expect(body).not.toHaveProperty('status');
          return { data: {} };
        },
      },
    });
    expect(payload).not.toHaveProperty('status');

    expect(() => validateForOnline({ latestVersion: '1.0.0', policies: [] })).toThrow(
      /至少一条启用策略/,
    );
    const update = vi.fn(async () => ({ data: {} }));
    await onlineResource({
      cwd,
      homeDir,
      apis: {
        info: async () => ({
          data: {
            latestVersion: '1.0.0',
            policies: [{ status: 1 }],
          },
        }),
        update,
      },
    });
    expect(update).toHaveBeenCalledWith({ resourceId: 'res_l', status: 1 });
    await offlineResource({
      cwd,
      homeDir,
      apis: { update },
    });
    expect(update).toHaveBeenLastCalledWith({ resourceId: 'res_l', status: 4 });
  });

  it('提交体构造不含上抛/排除', () => {
    const payload = buildVersionPayload({
      resourceId: 'r',
      version: '1.0.0',
      draft: {
        fileSha1: 'a',
        filename: 'a.mp4',
        baseUpcastResources: [],
        authExcludedItems: [],
      },
    });
    expect(payload.baseUpcastResources).toEqual([]);
    expect(payload.authExcludedItems).toEqual([]);
  });

  it('提交失败点名字段且稿留下', async () => {
    createIdentity(cwd, {
      subject: 'resource',
      name: 'n',
      typeCode: 'VIDEO',
      resourceId: 'res_f',
    });
    writeDraft(cwd, 1, {
      fileSha1: 'abc',
      analyzedSha1: 'abc',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    await expect(
      submitVersion({
        cwd,
        identity: readIdentity(cwd, 1),
        version: '1.0.0',
        apis: {
          createVersion: async () => {
            throw { field: 'filename' };
          },
        },
      }),
    ).rejects.toMatchObject({ message: '提交失败：filename' });
    expect(readDraft(cwd, 1)?.fileSha1).toBe('abc');
  });

  it('S16 description 只改线上不写稿', async () => {
    await login(cwd, homeDir);
    createIdentity(cwd, {
      subject: 'resource',
      name: 'n',
      typeCode: 'VIDEO',
      resourceId: 'res_d',
      env: 'test',
    });
    writeDraft(cwd, 1, {
      fromVersion: '1.0.0',
      fileSha1: 'abc',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    const { updateOnlineDescription } = await import('../../src/domain/version/description');
    const updateResourceVersionInfo = vi.fn(async () => ({ data: {} }));
    await updateOnlineDescription({
      cwd,
      homeDir,
      version: '1.0.0',
      description: '只改描述',
      apis: {
        info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_d' } }),
        updateResourceVersionInfo,
      },
    });
    expect(updateResourceVersionInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'res_d',
        version: '1.0.0',
        description: '只改描述',
      }),
    );
    expect(readDraft(cwd, 1)?.fileSha1).toBe('abc');
  });

  it('字段校验对齐 Console：稿描述/attr 长度/option 选项/listing 标签', async () => {
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_fields', name: 'n', typeCode: 'RT001' });

    // 首版稿不能改描述（规格 05：首版稿失败）
    writeDraft(cwd, 1, { baseUpcastResources: [], authExcludedItems: [] });
    expect(() => setDraftDescription(cwd, 'x')).toThrow(/首版稿不能改描述/);
    writeDraft(cwd, 1, {
      fromVersion: '1.0.0',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    setDraftDescription(cwd, '更新稿描述');
    expect(readDraft(cwd, 1)?.description).toBe('更新稿描述');

    // attr：name ≤50、remark ≤50、value ≤140（对照 Console 版本创建页 140；创建向导为 100，取宽者）
    await attrAdd(cwd, { line: `名称=${'长'.repeat(50)} 键=k1`, yes: true });
    await expect(
      attrAdd(cwd, { line: `名称=${'长'.repeat(51)} 键=k2`, yes: true }),
    ).rejects.toMatchObject({ code: 'ATTR_NAME_LONG' });
    await expect(
      attrAdd(cwd, { line: `名称=a2 键=k3 说明=${'长'.repeat(51)}`, yes: true }),
    ).rejects.toMatchObject({ code: 'ATTR_REMARK_LONG' });
    await expect(
      attrAdd(cwd, { line: `名称=a3 键=k4 值=${'值'.repeat(141)}`, yes: true }),
    ).rejects.toMatchObject({ code: 'ATTR_VALUE_LONG' });
    await attrAdd(cwd, { line: `名称=a3 键=k4 值=${'值'.repeat(140)}`, yes: true });
    // 名称与已有条目撞（key 不同）→ 拒；改名撞别人 → 拒
    await expect(
      attrAdd(cwd, { line: `名称=${'长'.repeat(50)} 键=k5`, yes: true }),
    ).rejects.toMatchObject({ code: 'ATTR_NAME_DUPLICATE' });
    await expect(
      attrSet(cwd, { line: `键=k1 名称=a3`, yes: true }),
    ).rejects.toMatchObject({ code: 'ATTR_NAME_DUPLICATE' });

    // option：选项值 ≤140、去重（对照 alert_cutstom_option_value_exist）
    writeDraft(cwd, 1, { ...readDraft(cwd, 1)!, fileSha1: 'abc' });
    await expect(
      optionAdd(cwd, {
        line: `名称=主题 键=theme 方式=下拉 选项=${'a'.repeat(141)}`,
        supportOptionalConfig: true,
        yes: true,
      }),
    ).rejects.toMatchObject({ code: 'OPTION_VALUE_LONG' });
    await expect(
      optionAdd(cwd, {
        line: '名称=语言 键=lang 方式=下拉 选项=中文|中文',
        supportOptionalConfig: true,
        yes: true,
      }),
    ).rejects.toMatchObject({ code: 'OPTION_DUPLICATE_OPTION' });
    await expect(
      optionAdd(cwd, {
        line: '名称=语言 键=lang 方式=下拉 选项=',
        supportOptionalConfig: true,
        yes: true,
      }),
    ).rejects.toMatchObject({ code: 'OPTION_OPTIONS' });
    await expect(
      optionAdd(cwd, {
        line: `名称=${'长'.repeat(51)} 键=copy 方式=文本 默认=dark`,
        supportOptionalConfig: true,
        yes: true,
      }),
    ).rejects.toMatchObject({ code: 'OPTION_NAME_LONG' });
    await expect(
      optionAdd(cwd, {
        line: `名称=文案 键=copy 方式=文本 默认=${'长'.repeat(141)}`,
        supportOptionalConfig: true,
        yes: true,
      }),
    ).rejects.toMatchObject({ code: 'OPTION_VALUE_LONG' });
    // 名称与已有 attr/option 撞 → 拒（对照 Console disabledNames 全局唯一）
    await expect(
      optionAdd(cwd, {
        line: '名称=a3 键=size 方式=文本',
        supportOptionalConfig: true,
        yes: true,
      }),
    ).rejects.toMatchObject({ code: 'OPTION_NAME_DUPLICATE' });
    await optionAdd(cwd, { line: '名称=语言 键=lang 方式=下拉 选项=中文|英文', supportOptionalConfig: true, yes: true });
    await expect(
      optionSet(cwd, { line: `键=lang 名称=a3`, yes: true }),
    ).rejects.toMatchObject({ code: 'OPTION_NAME_DUPLICATE' });

    // listing：title ≤100、intro ≤200、tags 20×20 去重禁#
    const listingCwd = mkdtempSync(path.join(tmpdir(), 'freelog-listing-'));
    const listingHome = mkdtempSync(path.join(tmpdir(), 'freelog-listing-home-'));
    await login(listingCwd, listingHome);
    createIdentity(listingCwd, {
      subject: 'resource',
      name: 'm',
      typeCode: 'VIDEO',
      resourceId: 'res_field',
      env: 'test',
    });
    await expect(
      updateListing({
        cwd: listingCwd,
        homeDir: listingHome,
        title: '标'.repeat(101),
        yes: true,
        apis: { update: async () => ({ data: {} }) },
      }),
    ).rejects.toMatchObject({ code: 'UPDATE_TITLE_LONG' });
    await expect(
      updateListing({
        cwd: listingCwd,
        homeDir: listingHome,
        intro: '简'.repeat(201),
        yes: true,
        apis: { update: async () => ({ data: {} }) },
      }),
    ).rejects.toMatchObject({ code: 'UPDATE_INTRO_LONG' });
    await expect(
      updateListing({
        cwd: listingCwd,
        homeDir: listingHome,
        tags: `a,${'标'.repeat(21)}`,
        yes: true,
        apis: { update: async () => ({ data: {} }) },
      }),
    ).rejects.toMatchObject({ code: 'UPDATE_TAG_LONG' });
    await expect(
      updateListing({
        cwd: listingCwd,
        homeDir: listingHome,
        tags: 'x,y,x',
        yes: true,
        apis: { update: async () => ({ data: {} }) },
      }),
    ).rejects.toMatchObject({ code: 'UPDATE_TAG_DUPLICATE' });
    await expect(
      updateListing({
        cwd: listingCwd,
        homeDir: listingHome,
        tags: Array.from({ length: 21 }, (_, i) => `t${i}`).join(','),
        yes: true,
        apis: { update: async () => ({ data: {} }) },
      }),
    ).rejects.toMatchObject({ code: 'UPDATE_TAGS_TOO_MANY' });
    const okPayload = await updateListing({
      cwd: listingCwd,
      homeDir: listingHome,
      tags: ' 标签一, #colour ,t2',
      yes: true,
      apis: { update: async () => ({ data: {} }) },
    });
    expect(okPayload.tags).toEqual(['标签一', 'colour', 't2']);
    rmSync(listingCwd, { recursive: true, force: true });
    rmSync(listingHome, { recursive: true, force: true });
  });

  it('init theme 后可走 S36 字段', async () => {
    const created = await initProject({
      cwd,
      shortcut: 'theme',
      template: 'vite-vue',
      yes: true,
      templateSource: async () => undefined,
    });
    expect(created.typeCode).toBe('RT001');
    expect(created.filePath).toBe('dist');
  });

  it('主题工程建壳沿用固定 RT001，--yes 不要求重复 --type', async () => {
    const created = await initProject({
      cwd,
      shortcut: 'theme',
      template: 'vite-vue',
      yes: true,
      templateSource: async () => undefined,
    });
    await login(cwd, homeDir);
    const shell = await createResource({
      cwd,
      homeDir,
      title: '主题',
      name: 'my-theme',
      yes: true,
      apis: {
        getByCode: async ({ code }) => ({
          data: { code, name: '主题', isTerminate: true, status: 1, subjectType: [1] },
        }),
        info: async () => ({ data: {} }),
        create: async (body) => {
          expect(body).toMatchObject({ resourceTypeCode: 'RT001' });
          return { data: { resourceId: 'res_theme' } };
        },
      },
    });
    expect(shell).toMatchObject({ n: created.n, resourceId: 'res_theme', typeCode: 'RT001' });

    const anotherCwd = mkdtempSync(path.join(tmpdir(), 'freelog-fixed-theme-'));
    try {
      await initProject({
        cwd: anotherCwd,
        shortcut: 'theme',
        template: 'vite-vue',
        yes: true,
        templateSource: async () => undefined,
      });
      await login(anotherCwd, homeDir);
      await expect(createResource({
        cwd: anotherCwd,
        homeDir,
        title: '主题',
        name: 'wrong-theme',
        type: 'RT005001',
        yes: true,
      })).rejects.toMatchObject({ code: 'CREATE_FIXED_TYPE' });
    } finally {
      rmSync(anotherCwd, { recursive: true, force: true });
    }
  });
});
