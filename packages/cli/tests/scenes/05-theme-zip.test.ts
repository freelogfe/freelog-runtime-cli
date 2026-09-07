import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initProject } from '../../src/domain/init/scaffold';
import { assertArtifactPath, zipDirectoryContents } from '../../src/domain/version/zip';

describe('S36–S42 主题插件', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-s5-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('S36 theme 立项 RT001+dist；目录打 zip，zip 文件失败', async () => {
    const created = initProject({
      cwd,
      scaffold: 'runtime',
      shortcut: 'theme',
      template: 'vite-theme',
      yes: true,
    });
    expect(created.typeCode).toBe('RT001');
    expect(created.filePath).toBe('dist');

    const dist = path.join(cwd, 'dist');
    mkdirSync(dist);
    writeFileSync(path.join(dist, 'index.js'), '1');
    const zip = await zipDirectoryContents(dist);
    expect(zip.endsWith('.zip')).toBe(true);
    writeFileSync(path.join(cwd, 'out.zip'), 'x');
    expect(() => assertArtifactPath('RT001', path.join(cwd, 'out.zip'))).toThrow(/不要自己打 zip/);
  });

  it('S38 空目录不能打 zip', async () => {
    const empty = path.join(cwd, 'empty');
    mkdirSync(empty);
    await expect(zipDirectoryContents(empty)).rejects.toMatchObject({
      message: '构建产物是空的，请先构建',
    });
  });
});
