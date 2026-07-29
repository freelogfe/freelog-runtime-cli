import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import {
  compressDirectory,
  processFileForPublish,
  shouldCompress,
  shouldCompressLoose,
} from '../src/services/processFile.js';
import { CliError } from '../src/core/errors.js';

describe('shouldCompress', () => {
  it('matches 主题/插件/软件库 like old CLI', () => {
    expect(shouldCompress('主题')).toBe(true);
    expect(shouldCompress(['应用', '主题'])).toBe(true);
    expect(shouldCompress('插件')).toBe(true);
    expect(shouldCompress('软件库')).toBe(true);
    expect(shouldCompress('图片')).toBe(false);
  });

  it('loose match covers english aliases', () => {
    expect(shouldCompressLoose(undefined, 'THEME')).toBe(true);
    expect(shouldCompressLoose(['widget'])).toBe(true);
  });
});

describe('compressDirectory / processFileForPublish', () => {
  it('zips directory contents for theme types', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-src-'));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-out-'));
    fs.writeFileSync(path.join(dir, 'index.js'), 'console.log(1)');
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'a.txt'), 'a');

    const zipPath = await compressDirectory(dir, out, 'app-1.0.0.zip');
    expect(fs.existsSync(zipPath)).toBe(true);
    const zip = new AdmZip(zipPath);
    const names = zip.getEntries().map((e) => e.entryName.replace(/\\/g, '/'));
    expect(names).toEqual(expect.arrayContaining(['index.js', 'assets/a.txt']));
  });

  it('processFileForPublish compresses theme directory', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-pub-'));
    const dist = path.join(cwd, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'main.js'), 'ok');

    const result = await processFileForPublish({
      cwd,
      resourceName: 'user/my-theme',
      resourceType: ['主题'],
      versionConfig: {
        version: '1.2.3',
        filePath: 'dist',
      },
    });
    expect(result.isTempFile).toBe(true);
    expect(result.filename).toContain('1.2.3.zip');
    expect(result.fileSha1).toHaveLength(40);
    expect(fs.existsSync(result.filePath)).toBe(true);
    fs.unlinkSync(result.filePath);
  });

  it('non-compress type rejects directory without filename', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-file-'));
    const dist = path.join(cwd, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'a.bin'), 'x');
    await expect(
      processFileForPublish({
        cwd,
        resourceName: 'r',
        resourceType: ['图片'],
        versionConfig: { version: '1.0.0', filePath: 'dist' },
      }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
