import { describe, expect, it } from 'vitest';
import { computeBumpedVersion } from '../src/services/resource/index.js';
import { looksLikeRemoteCoverUrl } from '../src/services/coverUpload.js';

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
});
