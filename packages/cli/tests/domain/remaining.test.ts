import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { attrAdd } from '../../src/domain/version/form/attr';
import { depAdd } from '../../src/domain/version/form/dep';
import { optionAdd } from '../../src/domain/version/form/option';
import { assertKeyUnchanged, parseLine } from '../../src/domain/version/form/parseLine';
import { previewLine } from '../../src/domain/version/form/preview';
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

  it('create 建壳不上传，自己的壳禁止再 create', async () => {
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
          data: { code, name: '视频', isTerminate: true, status: 1 },
        }),
        info: async () => ({ data: {} }),
        create: async (params) => {
          expect(params).not.toHaveProperty('policies');
          return { data: { resourceId: 'res_1', resourceName: 'alice/demo' } };
        },
      },
    });
    expect(created.resourceId).toBe('res_1');
    expect(created).not.toHaveProperty('title');
    expect(created.env).toBe('test');

    await expect(
      createResource({
        cwd,
        homeDir,
        title: '标题2',
        type: 'VIDEO',
        name: 'demo2',
        yes: true,
        apis: {
          getByCode: async ({ code }) => ({
            data: { code, isTerminate: true, status: 1 },
          }),
          info: async () => ({ data: {} }),
          create: async () => ({ data: { resourceId: 'res_2' } }),
        },
      }),
    ).rejects.toMatchObject({ code: 'CREATE_ALREADY_SHELL' });
  });

  it('bind 接入身份，合集失败，status 不写盘', async () => {
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

    const bound = await bindResource({
      cwd,
      homeDir,
      target: 'res_9',
      file: 'a.mp4',
      apis: {
        info: async () => ({
          data: {
            resourceId: 'res_9',
            subjectType: 1,
            userId: 7,
            resourceName: 'alice/clip',
            resourceTypeCode: 'VIDEO',
          },
        }),
      },
    });
    expect(bound.resourceId).toBe('res_9');
    expect(bound.filePath).toBe('a.mp4');
    expect(bound).not.toHaveProperty('title');

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

  it('工作稿读写删，坏文件失败', () => {
    createIdentity(cwd, { subject: 'resource', name: 'a', typeCode: 'VIDEO' });
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

  it('show --local 不打版本接口；discard 没稿退出句', () => {
    createIdentity(cwd, { subject: 'resource', name: 'a', typeCode: 'VIDEO' });
    expect(draftDiscard(cwd)).toBe('没有工作稿');
    writeDraft(cwd, 1, {
      fileSha1: 'abc',
      filename: 'a.mp4',
      baseUpcastResources: [],
      authExcludedItems: [],
    });
    expect(showLocal(cwd)).toContain('abc');
    expect(showLocal(cwd)).toContain('这是本地未提交的版本工作稿');
    expect(draftDiscard(cwd)).toBe('已丢掉工作稿');
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
    createIdentity(cwd, { subject: 'resource', name: 'a', typeCode: 'VIDEO' });
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
    createIdentity(cwd, { subject: 'resource', name: 'a', typeCode: 'VIDEO' });
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
        batchAuth: async () => ({ data: { isAuth: true } }),
      },
    });
    expect(readDraft(cwd, 1)?.dependencies?.[0]?.resourceId).toBe('dep1');
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
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1 } }),
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
      file: path.join(cwd, 'clip.mp4'),
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
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1 } }),
        info: async () => ({ data: {} }),
        create: async () => ({ data: { resourceId: 'res_s' } }),
      },
    });
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
      apis: {
        info: async () => ({ data: { resourceId: 'res_s' } }),
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
      apis: {
        info: async () => ({ data: { latestVersion: '1.0.0', resourceId: 'res_u' } }),
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

  it('init theme 后可走 S36 字段', () => {
    const created = initProject({
      cwd,
      scaffold: 'runtime',
      shortcut: 'theme',
      template: 'vite-theme',
      yes: true,
    });
    expect(created.typeCode).toBe('RT001');
    expect(created.filePath).toBe('dist');
  });
});
