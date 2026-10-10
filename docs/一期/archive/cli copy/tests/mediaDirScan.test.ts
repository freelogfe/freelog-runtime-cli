import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatMediaDirHint, scanMediaDir } from '../src/services/mediaDirScan.js';

describe('mediaDirScan', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  function mkTempDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-media-'));
    dirs.push(d);
    return d;
  }

  it('counts flat media files only', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, 'a.jpg'), 'x');
    fs.writeFileSync(path.join(dir, 'b.png'), 'x');
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'freelog.batch.json'), '{}');

    const scan = scanMediaDir(dir);
    expect(scan.mediaFiles).toBe(2);
    expect(scan.nonMediaFiles).toBe(1);
  });

  it('hints when multiple media files', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, '1.jpg'), 'x');
    fs.writeFileSync(path.join(dir, '2.jpg'), 'x');
    const hint = formatMediaDirHint(scanMediaDir(dir));
    expect(hint).toMatch(/resource import-dir|init-from-folder/);
  });

  it('no hint for single media file', () => {
    const dir = mkTempDir();
    fs.writeFileSync(path.join(dir, '1.jpg'), 'x');
    expect(formatMediaDirHint(scanMediaDir(dir))).toBeUndefined();
  });
});
