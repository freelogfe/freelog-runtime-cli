import { describe, expect, it } from 'vitest';
import { isFrozenStatus } from '../../src/services/shared/guards/frozenStatus.js';

describe('isFrozenStatus', () => {
  it('detects exact freeze status 2', () => {
    expect(isFrozenStatus(2)).toBe(true);
  });

  it('detects composite status with freeze bit set', () => {
    expect(isFrozenStatus(3)).toBe(true);
    expect(isFrozenStatus(6)).toBe(true);
  });

  it('returns false for online, offline, and unreleased', () => {
    expect(isFrozenStatus(0)).toBe(false);
    expect(isFrozenStatus(1)).toBe(false);
    expect(isFrozenStatus(4)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isFrozenStatus(undefined)).toBe(false);
  });
});
