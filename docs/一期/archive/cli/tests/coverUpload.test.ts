import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertLocalCoverFile,
  isAnimatedGif,
  looksLikeRemoteCoverUrl,
  readImageDimensions,
} from '../src/services/coverUpload.js';

/** 1×1 静态 GIF */
const STATIC_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

/** 2 帧动画 GIF（1×1，标准最小样例） */
const ANIMATED_GIF = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff,
  0xff, 0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x0a, 0x00, 0x01, 0x00, 0x2c, 0x00, 0x00,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4c, 0x01, 0x00, 0x21, 0xf9, 0x04,
  0x01, 0x0a, 0x00, 0x02, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);

function writePng(dir: string, name: string, width: number, height: number): string {
  const file = path.join(dir, name);
  const buf = Buffer.alloc(24 + 8);
  buf.writeUInt32BE(0x89504e47, 0);
  buf.writeUInt32BE(0x0d0a1a0a, 4);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12);
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  buf.writeUInt8(8, 24);
  buf.writeUInt8(2, 25);
  buf.writeUInt8(0, 26);
  buf.writeUInt8(0, 27);
  buf.writeUInt8(0, 28);
  fs.writeFileSync(file, buf);
  return file;
}

describe('coverUpload constraints', () => {
  it('detects remote urls', () => {
    expect(looksLikeRemoteCoverUrl('https://cdn.example/a.png')).toBe(true);
    expect(looksLikeRemoteCoverUrl('./cover.png')).toBe(false);
  });

  it('reads png dimensions', () => {
    const dim = readImageDimensions(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
        0, 0, 0x03, 0x20, 0, 0, 0x02, 0x58, 0x08, 0x02, 0, 0, 0,
      ]),
      '.png',
    );
    expect(dim).toEqual({ width: 800, height: 600 });
  });

  it('detects animated gif', () => {
    expect(isAnimatedGif(STATIC_GIF)).toBe(false);
    expect(isAnimatedGif(ANIMATED_GIF)).toBe(true);
  });

  it('validates format size and static gif', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-val-'));
    const ok = writePng(dir, 'ok.png', 100, 100);
    expect(() => assertLocalCoverFile(ok)).not.toThrow();

    const badExt = path.join(dir, 'a.webp');
    fs.writeFileSync(badExt, Buffer.alloc(10));
    expect(() => assertLocalCoverFile(badExt)).toThrow(/JPEG、PNG、GIF/);

    const big = path.join(dir, 'big.jpg');
    fs.writeFileSync(big, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(() => assertLocalCoverFile(big)).toThrow(/图片不能超过5M/);

    const gif = path.join(dir, 'anim.gif');
    fs.writeFileSync(gif, ANIMATED_GIF);
    expect(() => assertLocalCoverFile(gif)).toThrow(/GIF 文件不能动画化/);
  });
});
