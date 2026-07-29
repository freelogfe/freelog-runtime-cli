import { describe, expect, it } from 'vitest';
import { computeBumpedVersion } from '../src/services/publishService.js';
import {
  assertLocalCoverFile,
  looksLikeRemoteCoverUrl,
} from '../src/services/coverUpload.js';
import { CliError } from '../src/core/errors.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('computeBumpedVersion', () => {
  it('defaults to 1.0.0 without latest', () => {
    expect(computeBumpedVersion()).toBe('1.0.0');
    expect(computeBumpedVersion('bad')).toBe('1.0.0');
  });

  it('increments patch', () => {
    expect(computeBumpedVersion('1.2.3')).toBe('1.2.4');
  });
});

describe('cover helpers', () => {
  it('detects remote urls', () => {
    expect(looksLikeRemoteCoverUrl('https://cdn.example/a.png')).toBe(true);
    expect(looksLikeRemoteCoverUrl('./cover.png')).toBe(false);
  });

  it('validates local cover constraints', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-'));
    const ok = path.join(dir, 'a.png');
    fs.writeFileSync(ok, Buffer.alloc(100));
    expect(() => assertLocalCoverFile(ok)).not.toThrow();

    const badExt = path.join(dir, 'a.webp');
    fs.writeFileSync(badExt, Buffer.alloc(10));
    expect(() => assertLocalCoverFile(badExt)).toThrow(CliError);

    const big = path.join(dir, 'big.jpg');
    fs.writeFileSync(big, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(() => assertLocalCoverFile(big)).toThrow(CliError);
  });
});
