import fs from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { describe, expect, it } from 'vitest';
import {
  cleanupTempFile,
  compressDirectory,
  planFileForPublish,
  processFileForPublish,
} from '../src/services/processFile.js';
import { CliError } from '../src/core/errors.js';

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
        artifactMode: 'directory-zip',
      },
    });
    expect(result.isTempFile).toBe(true);
    expect(result.filename).toContain('1.2.3.zip');
    expect(result.fileSha1).toHaveLength(40);
    expect(fs.existsSync(result.filePath)).toBe(true);
    cleanupTempFile(result.filePath);
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
        versionConfig: { version: '1.0.0', filePath: 'dist', artifactMode: 'file' },
      }),
    ).rejects.toBeInstanceOf(CliError);
  });

  it('applies project-root ignore rules and mandatory exclusions when zipping', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-ignore-'));
    const dist = path.join(cwd, 'dist');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-ignore-out-'));
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(dist, '.freelog'), { recursive: true });
    fs.writeFileSync(path.join(cwd, '.freelogignore'), 'dist/**/*.map\n');
    fs.writeFileSync(path.join(dist, 'main.js'), 'ok');
    fs.writeFileSync(path.join(dist, 'main.js.map'), 'map');
    fs.writeFileSync(path.join(dist, 'assets', 'main.js.map'), 'map');
    fs.writeFileSync(path.join(dist, '.freelog', 'state.json'), '{}');

    const zipPath = await compressDirectory(dist, out, 'ignored.zip', { ignoreRoot: cwd });
    const names = new AdmZip(zipPath).getEntries().map((entry) => entry.entryName);
    expect(names).toEqual(['main.js']);
  });

  it('creates byte-stable archives for identical contents', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-stable-'));
    const dist = path.join(cwd, 'dist');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-stable-out-'));
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'b.js'), 'b');
    fs.writeFileSync(path.join(dist, 'a.js'), 'a');

    const first = await compressDirectory(dist, out, 'first.zip', { ignoreRoot: cwd });
    const firstBytes = fs.readFileSync(first);
    fs.utimesSync(path.join(dist, 'a.js'), new Date(), new Date());
    const second = await compressDirectory(dist, out, 'second.zip', { ignoreRoot: cwd });
    expect(fs.readFileSync(second)).toEqual(firstBytes);
  });

  it('creates the same archive hash in UTC, Asia/Shanghai and America/Los_Angeles', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-timezone-'));
    const dist = path.join(cwd, 'dist');
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-zip-timezone-out-'));
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'main.js'), 'same bytes');
    const previousTz = process.env.TZ;
    const hashes: string[] = [];
    try {
      for (const timezone of ['UTC', 'Asia/Shanghai', 'America/Los_Angeles']) {
        process.env.TZ = timezone;
        const zipPath = await compressDirectory(dist, out, `${hashes.length}.zip`, { ignoreRoot: cwd });
        hashes.push(createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex'));
      }
    } finally {
      if (previousTz === undefined) delete process.env.TZ;
      else process.env.TZ = previousTz;
    }
    expect(new Set(hashes)).toHaveLength(1);
  });

  it('uses explicit artifactMode instead of a display-name guess', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-artifact-mode-'));
    const dist = path.join(cwd, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'main.js'), 'ok');

    const result = await processFileForPublish({
      cwd,
      resourceName: 'user/custom-engineering-resource',
      resourceType: ['其它资源'],
      versionConfig: {
        version: '1.0.0',
        filePath: 'dist',
        artifactMode: 'directory-zip',
      },
    });

    expect(result.isTempFile).toBe(true);
    cleanupTempFile(result.filePath);
  });

  it('rejects artifactMode that conflicts with platform type capability', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-artifact-conflict-'));
    fs.writeFileSync(path.join(cwd, 'a.png'), 'ok');

    await expect(
      processFileForPublish({
        cwd,
        resourceName: 'r',
        resourceTypeInfo: { resourceConfig: { compress: true } },
        versionConfig: {
          version: '1.0.0',
          filePath: 'a.png',
          artifactMode: 'file',
        },
      }),
    ).rejects.toThrow('artifactMode');
  });

  it('rejects packaging when both capability and artifactMode are missing', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-artifact-missing-'));
    fs.writeFileSync(path.join(cwd, 'theme.bin'), 'ok');

    await expect(
      processFileForPublish({
        cwd,
        resourceName: 'theme-label-must-not-drive-packaging',
        resourceType: ['主题', 'theme'],
        resourceTypeCode: 'THEME',
        versionConfig: { version: '1.0.0', filePath: 'theme.bin' },
      }),
    ).rejects.toMatchObject({ code: 4 });
  });

  it('uses platform capability when manifest artifactMode is absent', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-artifact-capability-'));
    const dist = path.join(cwd, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'main.js'), 'ok');

    const result = await processFileForPublish({
      cwd,
      resourceName: 'r',
      resourceTypeInfo: { resourceConfig: { artifactMode: 'directory-zip' } },
      versionConfig: { version: '1.0.0', filePath: 'dist' },
    });

    expect(result.isTempFile).toBe(true);
    cleanupTempFile(result.filePath);
  });

  it('uses unique temporary archives for concurrent publishes and cleans both', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-artifact-concurrent-'));
    const dist = path.join(cwd, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'main.js'), 'ok');
    const options = {
      cwd,
      resourceName: 'same-resource',
      versionConfig: {
        version: '1.0.0',
        filePath: 'dist',
        artifactMode: 'directory-zip' as const,
      },
    };

    const [first, second] = await Promise.all([
      processFileForPublish(options),
      processFileForPublish(options),
    ]);
    expect(first.filePath).not.toBe(second.filePath);
    expect(first.fileSha1).toBe(second.fileSha1);
    const parents = [path.dirname(first.filePath), path.dirname(second.filePath)];
    cleanupTempFile(first.filePath);
    cleanupTempFile(second.filePath);
    expect(parents.every((directory) => !fs.existsSync(directory))).toBe(true);
  });

  it('removes its temporary archive when validation fails after compression', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-artifact-failed-cleanup-'));
    const dist = path.join(cwd, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'main.js'), 'ok');
    const listOwnedTempDirs = () => new Set(
      fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith('freelog-publish-')),
    );
    const before = listOwnedTempDirs();

    await expect(processFileForPublish({
      cwd,
      resourceName: 'r',
      resourceTypeInfo: {
        resourceConfig: { artifactMode: 'directory-zip', formats: ['.png'] },
      },
      versionConfig: { version: '1.0.0', filePath: 'dist', artifactMode: 'directory-zip' },
    })).rejects.toBeInstanceOf(CliError);

    expect(listOwnedTempDirs()).toEqual(before);
  });

  it('dry-run plans a theme archive without creating it', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-plan-'));
    const dist = path.join(cwd, 'dist');
    fs.mkdirSync(dist);
    fs.writeFileSync(path.join(dist, 'main.js'), 'ok');

    const tempArchive = path.join(os.tmpdir(), 'freelog-publish', 'user_my-theme-1.2.3.zip');
    if (fs.existsSync(tempArchive)) fs.unlinkSync(tempArchive);

    const result = await planFileForPublish({
      cwd,
      resourceName: 'user/my-theme',
      resourceType: ['主题'],
      versionConfig: {
        version: '1.2.3',
        filePath: 'dist',
        artifactMode: 'directory-zip',
      },
    });

    expect(result.requiresCompression).toBe(true);
    expect(result.fileSha1).toBe('unresolved');
    expect(result.unresolved).toContain('createVersionParams.fileSha1');
    expect(fs.existsSync(tempArchive)).toBe(false);
  });

  it('validates processed file against platform type capabilities', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-cap-'));
    fs.writeFileSync(path.join(cwd, 'a.png'), Buffer.alloc(8));

    await expect(
      processFileForPublish({
        cwd,
        resourceName: 'r',
        resourceType: ['图片'],
        resourceTypeInfo: { resourceConfig: { formats: ['.jpg'], fileMaxSize: 100, fileMaxSizeUnit: 0 } },
        versionConfig: { version: '1.0.0', filePath: 'a.png', artifactMode: 'file' },
      }),
    ).rejects.toBeInstanceOf(CliError);

    await expect(
      processFileForPublish({
        cwd,
        resourceName: 'r',
        resourceType: ['图片'],
        resourceTypeInfo: { resourceConfig: { formats: ['.png'], fileMaxSize: 7, fileMaxSizeUnit: 0 } },
        versionConfig: { version: '1.0.0', filePath: 'a.png', artifactMode: 'file' },
      }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
