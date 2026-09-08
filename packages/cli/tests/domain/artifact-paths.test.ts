import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { bindResource } from '../../src/domain/bind/bind';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { runCreateVersion } from '../../src/domain/version/createVersion';
import { setIdentityFilePath } from '../../src/domain/version/setPath';
import { runUpdateVersion } from '../../src/domain/version/updateVersion';
import { readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { normalizeProjectPath } from '../../src/local/projectPath';
import { templateCachePath, writeTemplateCache } from '../../src/local/template';

describe('路径规范、身份选择与产物切换', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-artifact-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-artifact-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd,
      homeDir,
      loginName: 'alice',
      password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 't' } }),
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('规范为工作区内相对路径，并拒绝绝对与越界路径', () => {
    expect(normalizeProjectPath(cwd, './dist')).toBe('dist');
    expect(() => normalizeProjectPath(cwd, path.join(cwd, 'dist'))).toThrow(
      /路径必须落在当前工程里/,
    );
    expect(() => normalizeProjectPath(cwd, '../outside')).toThrow(
      /路径必须落在当前工程里/,
    );
  });

  it('多份资源以 --file 选身份、以 --artifact 改记录；单份保留旧写法', () => {
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_video', name: 'clip', typeCode: 'VIDEO', filePath: 'clip.mp4',
    });
    const theme = createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_theme', name: 'theme', typeCode: 'RT001', filePath: 'dist',
    });

    const updated = setIdentityFilePath(cwd, { file: './dist', artifact: './build' });
    expect(updated).toMatchObject({ n: theme.n, filePath: 'build' });
    expect(readIdentity(cwd, theme.n)?.filePath).toBe('build');
    try {
      setIdentityFilePath(cwd, { file: 'clip.mp4' });
      throw new Error('expected setIdentityFilePath to reject an ambiguous multi-resource update');
    } catch (error) {
      expect(error).toMatchObject({ code: 'SET_ARTIFACT_REQUIRED' });
    }

    const single = mkdtempSync(path.join(tmpdir(), 'freelog-artifact-single-'));
    try {
      const identity = createIdentity(single, {
        subject: 'resource', resourceId: 'res_one', name: 'one', typeCode: 'VIDEO', filePath: 'old.mp4',
      });
      expect(setIdentityFilePath(single, { file: './new.mp4' })).toMatchObject({
        n: identity.n,
        filePath: 'new.mp4',
      });
    } finally {
      rmSync(single, { recursive: true, force: true });
    }
  });

  it('多份资源可以选择主题身份并上传新的构建目录', async () => {
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_video', name: 'clip', typeCode: 'VIDEO', filePath: 'clip.mp4',
    });
    const theme = createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_theme', name: 'theme', typeCode: 'RT001', filePath: 'dist',
    });
    mkdirSync(path.join(cwd, 'build'));
    writeFileSync(path.join(cwd, 'build', 'index.html'), '<main>new</main>');
    writeDraft(cwd, theme.n, { fromVersion: '1.0.0' });
    const createVersion = vi.fn(async () => ({ data: {} }));

    await expect(runUpdateVersion({
      cwd,
      homeDir,
      file: 'dist',
      artifact: './build',
      bump: 'patch',
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_theme', latestVersion: '1.0.0' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
        createVersion,
      },
    })).resolves.toBe('1.0.1');

    expect(readIdentity(cwd, theme.n)?.filePath).toBe('build');
    expect(createVersion).toHaveBeenCalledWith(expect.objectContaining({
      filename: expect.stringMatching(/\.zip$/u), version: '1.0.1',
    }));
  });

  it('首版同样可在多份资源中选身份并指定新产物', async () => {
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_other', name: 'other', typeCode: 'VIDEO', filePath: 'other.mp4',
    });
    const target = createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_first', name: 'first', typeCode: 'VIDEO', filePath: 'old.mp4',
    });
    writeFileSync(path.join(cwd, 'new.mp4'), 'new bytes');

    await runCreateVersion({
      cwd,
      homeDir,
      file: 'old.mp4',
      artifact: 'new.mp4',
      prepare: true,
      yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_first' } }),
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
      },
    });
    expect(readIdentity(cwd, target.n)?.filePath).toBe('new.mp4');
    expect(readDraft(cwd, target.n)?.filename).toBe('new.mp4');
  });

  it('bind 规范路径，并在模板身份改绑为普通资源时清理模板缓存', async () => {
    const identity = createIdentity(cwd, {
      subject: 'resource', typeCode: 'RT001', filePath: 'dist',
    });
    writeTemplateCache(cwd, identity.n, {
      templateId: 'vite-react-ts', templateVersion: '4.0.0', npmName: '@freelog-cli/template-vite-react-ts',
      projectName: 'theme', projectVersion: '0.1.0',
    });

    const bound = await bindResource({
      cwd,
      homeDir,
      target: 'res_normal',
      file: './video.mp4',
      apis: {
        info: async () => ({ data: {
          resourceId: 'res_normal', resourceName: 'alice/video', resourceTypeCode: 'VIDEO', subjectType: [1], userId: 7,
        } }),
      },
    });
    expect(bound).toMatchObject({ n: identity.n, typeCode: 'VIDEO', filePath: 'video.mp4' });
    expect(existsSync(templateCachePath(cwd, identity.n))).toBe(false);

    await expect(bindResource({
      cwd,
      homeDir,
      target: 'res_outside',
      file: path.join(cwd, '..', 'outside.mp4'),
    })).rejects.toMatchObject({ code: 'BIND_FILE_OUTSIDE' });
  });
});
