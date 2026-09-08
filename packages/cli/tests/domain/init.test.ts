import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import { initProject } from '../../src/domain/init/scaffold';
import { readIdentity } from '../../src/local/identity';
import { readTemplateCache } from '../../src/local/template';

describe('init', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t31-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('普通 init 只写未绑定身份，不写 resourceId / name / env', async () => {
    const created = await initProject({
      cwd,
      typeCode: 'VIDEO',
      typeValidator: async (code) => ({ code, name: '视频', isTerminate: true, status: 1, subjectType: 1 }),
      yes: true,
    });
    expect(created.n).toBe(1);
    expect(created.typeCode).toBe('VIDEO');
    expect(created).not.toHaveProperty('resourceId');
    expect(created).not.toHaveProperty('name');
    expect(created).not.toHaveProperty('env');
    expect(created).not.toHaveProperty('title');
    expect(readIdentity(cwd, 1)).toEqual(created);
  });

  it('init theme 从受控模板创建工程、写固定身份与模板缓存', async () => {
    const created = await initProject({
      cwd,
      shortcut: 'theme',
      template: 'vite-react-ts',
      yes: true,
      templateSource: async ({ targetDir }) => {
        writeFileSync(path.join(targetDir, 'package.json'), '<%= projectName %>');
      },
    });
    expect(created.typeCode).toBe('RT001');
    expect(created.filePath).toBe('dist');
    expect(created).not.toHaveProperty('resourceId');
    expect(existsSync(path.join(cwd, 'package.json'))).toBe(true);
    expect(readTemplateCache(cwd, 1)).toMatchObject({
      templateId: 'vite-react-ts',
      templateVersion: '4.0.0',
      projectName: path.basename(cwd).toLowerCase(),
      projectVersion: '0.1.0',
    });
  });

  it('init widget 写死 RT002 和 dist', async () => {
    const created = await initProject({
      cwd,
      shortcut: 'widget',
      template: 'vite-vue-ts',
      yes: true,
      templateSource: async ({ targetDir }) => {
        writeFileSync(path.join(targetDir, 'README.md'), 'template');
      },
    });
    expect(created.typeCode).toBe('RT002');
    expect(created.filePath).toBe('dist');
  });

  it('普通 init 不允许绕过主题/插件的模板入口', async () => {
    await expect(initProject({
      cwd,
      typeCode: 'RT001',
      typeValidator: async (code) => ({ code, name: '主题', isTerminate: true, status: 1, subjectType: 1 }),
      yes: true,
    })).rejects.toMatchObject({ code: 'INIT_TEMPLATE_SHORTCUT_REQUIRED' });
    expect(existsSync(path.join(cwd, '.freelog', '1.json'))).toBe(false);
  });

  it('未知模板不写身份或模板文件', async () => {
    await expect(initProject({
      cwd,
      shortcut: 'theme',
      template: 'not-exist',
      yes: true,
    })).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    expect(existsSync(path.join(cwd, '.freelog', '1.json'))).toBe(false);
  });

  it('模板复制失败时回滚目标目录内容', async () => {
    await expect(initProject({
      cwd,
      shortcut: 'theme',
      template: 'vite-vue',
      yes: true,
      templateSource: async ({ targetDir }) => {
        writeFileSync(path.join(targetDir, 'partial.txt'), 'partial');
        throw new CliError('下载失败', 'TEMPLATE_DOWNLOAD_FAILED');
      },
    })).rejects.toMatchObject({ code: 'TEMPLATE_DOWNLOAD_FAILED' });
    expect(existsSync(path.join(cwd, 'partial.txt'))).toBe(false);
    expect(existsSync(path.join(cwd, '.freelog', '1.json'))).toBe(false);
  });

  it('已有非空目录拒绝覆盖', async () => {
    writeFileSync(path.join(cwd, 'keep.txt'), 'keep');
    await expect(initProject({
      cwd,
      typeCode: 'VIDEO',
      typeValidator: async (code) => ({ code, name: '视频', isTerminate: true, status: 1, subjectType: 1 }),
      yes: true,
    })).rejects.toMatchObject({ code: 'INIT_TARGET_NOT_EMPTY' });
    expect(readFileSync(path.join(cwd, 'keep.txt'), 'utf8')).toBe('keep');
  });
});
