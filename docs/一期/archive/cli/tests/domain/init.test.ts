import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/core/errors';
import { initProject } from '../../src/domain/init/scaffold';
import { readIdentity } from '../../src/local/identity';

describe('init', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t31-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('普通 init 只写未绑定身份，不写 resourceId / name / env', async () => {
    writeFileSync(path.join(cwd, 'video.mp4'), 'video');
    const created = await initProject({
      cwd,
      typeCode: 'VIDEO',
      typeValidator: async (code) => ({ code, name: '视频', isTerminate: true, status: 1, subjectType: 1 }),
      artifact: 'video.mp4',
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

  it('init theme 从受控模板创建工程，只写固定身份', async () => {
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
    expect(existsSync(path.join(cwd, '.freelog', '1.template.json'))).toBe(false);
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

  it('已有主题工程可用通用 init 锚定固定类型，不复制模板', async () => {
    mkdirSync(path.join(cwd, 'dist'));
    const created = await initProject({
      cwd,
      typeCode: 'RT001',
      typeValidator: async (code) => ({ code, name: '主题', isTerminate: true, status: 1, subjectType: 1 }),
      artifact: 'dist',
      yes: true,
    });
    expect(created).toMatchObject({ typeCode: 'RT001', filePath: 'dist' });
    expect(existsSync(path.join(cwd, 'package.json'))).toBe(false);
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

  it('模板 init 在已有非空目录拒绝覆盖', async () => {
    writeFileSync(path.join(cwd, 'keep.txt'), 'keep');
    await expect(initProject({
      cwd,
      shortcut: 'theme', template: 'vite-vue',
      yes: true,
    })).rejects.toMatchObject({ code: 'INIT_TARGET_NOT_EMPTY' });
    expect(readFileSync(path.join(cwd, 'keep.txt'), 'utf8')).toBe('keep');
  });

  it('login 留下的唯一 auth 选择器可被 init 保留', async () => {
    const authDir = path.join(cwd, '.freelog');
    // login 的选择器内容由认证模块校验；init 只承诺不覆盖它。
    mkdirSync(authDir, { recursive: true });
    writeFileSync(path.join(authDir, 'auth'), '{"schemaVersion":1}\n');
    writeFileSync(path.join(cwd, 'video.mp4'), 'video');
    const created = await initProject({
      cwd,
      typeCode: 'VIDEO',
      typeValidator: async (code) => ({ code, name: '视频', isTerminate: true, status: 1, subjectType: 1 }),
      artifact: 'video.mp4',
      yes: true,
    });
    expect(created.n).toBe(1);
    expect(readFileSync(path.join(authDir, 'auth'), 'utf8')).toBe('{"schemaVersion":1}\n');
    expect(readIdentity(cwd, 1)).toEqual(created);
  });

  it('同一目标的并发 init 必须在下载前互斥，且不产生目标内锁文件', async () => {
    let releaseFirst: (() => void) | undefined;
    const first = initProject({
      cwd,
      dir: 'target',
      shortcut: 'theme',
      template: 'vite-vue',
      yes: true,
      templateSource: async () => new Promise<void>((resolve) => { releaseFirst = resolve; }),
    });
    await expect(initProject({
      cwd,
      dir: 'target',
      shortcut: 'theme',
      template: 'vite-vue',
      yes: true,
      templateSource: async () => undefined,
    })).rejects.toMatchObject({ code: 'PROJECT_LOCKED' });
    releaseFirst?.();
    await first;
    expect(existsSync(path.join(cwd, 'target', '.freelog', '.lock'))).toBe(false);
  });
});
