import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { confirmLocalPath } from '../../src/domain/version/file';
import { assertArtifactAnchor, assertArtifactPath, prepareUploadPath, zipDirectoryContents } from '../../src/domain/version/zip';

function zipEntryNames(zipPath: string): string[] {
  const buf = readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('zip eocd missing');
  }
  const cdOffset = buf.readUInt32LE(eocd + 16);
  const cdCount = buf.readUInt16LE(eocd + 10);
  const names: string[] = [];
  let offset = cdOffset;
  for (let i = 0; i < cdCount; i += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    names.push(buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8'));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

describe('T6.1 路径确认与 zip', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t61-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('四种路径组合', async () => {
    const dist = path.join(cwd, 'dist');
    mkdirSync(dist);
    writeFileSync(path.join(dist, 'index.js'), 'ok');
    writeFileSync(path.join(cwd, 'clip.mp4'), 'bin');
    writeFileSync(path.join(cwd, 'me.zip'), 'zip');

    const zip = await zipDirectoryContents(dist);
    expect(zip.endsWith('.zip')).toBe(true);
    expect(() => assertArtifactPath('RT001', dist)).not.toThrow();

    expect(() => assertArtifactPath('RT001', path.join(cwd, 'me.zip'))).not.toThrow();
    expect(() => assertArtifactPath('RT002', path.join(cwd, 'me.zip'))).not.toThrow();
    expect(() => assertArtifactAnchor('RT001', path.join(cwd, 'me.zip'))).not.toThrow();
    expect(() => assertArtifactAnchor('RT002', path.join(cwd, 'clip.mp4'))).not.toThrow();
    await expect(prepareUploadPath('RT001', path.join(cwd, 'me.zip'))).resolves.toBe(path.join(cwd, 'me.zip'));

    expect(() => assertArtifactPath('VIDEO', dist)).toThrow(/不支持文件夹/);
    expect(() => assertArtifactPath('VIDEO', path.join(cwd, 'clip.mp4'))).not.toThrow();
  });

  it('zip 根没有套一层文件夹', async () => {
    const dist = path.join(cwd, 'dist');
    mkdirSync(path.join(dist, 'assets'), { recursive: true });
    writeFileSync(path.join(dist, 'index.js'), '1');
    writeFileSync(path.join(dist, 'assets', 'a.css'), 'c');
    const zip = await zipDirectoryContents(dist);
    const names = zipEntryNames(zip);
    expect(names.some((name) => name === 'index.js' || name.startsWith('index.js'))).toBe(true);
    expect(names.some((name) => name.startsWith('assets/'))).toBe(true);
    expect(names.every((name) => !name.startsWith('dist/'))).toBe(true);
  });

  it('工程根不能打 zip；--yes 且记录不在须 --artifact', async () => {
    mkdirSync(path.join(cwd, '.freelog'));
    writeFileSync(path.join(cwd, 'package.json'), '{}');
    await expect(zipDirectoryContents(cwd)).rejects.toMatchObject({
      message: '不要把工程根当产物目录，请指定 dist 或 build。',
    });

    const identity = {
      n: 1,
      schemaVersion: 1 as const,
      subject: 'resource' as const,
      name: 'clip',
      typeCode: 'VIDEO',
      filePath: 'gone.mp4',
    };
    expect(() => confirmLocalPath(identity, undefined, true, cwd)).toThrow(
      '请 --artifact 指定本地文件或目录',
    );
    writeFileSync(path.join(cwd, 'gone.mp4'), 'x');
    expect(confirmLocalPath(identity, undefined, true, cwd)).toBe(
      path.resolve(cwd, 'gone.mp4'),
    );
  });
});
