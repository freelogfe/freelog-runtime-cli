import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertVersionGreaterThanLatest,
  isFrozenStatus,
} from '../src/services/publishService.js';

describe('publish guards', () => {
  it('detects frozen status', () => {
    expect(isFrozenStatus(2)).toBe(true);
    expect(isFrozenStatus(3)).toBe(true); // bit 1 set
    expect(isFrozenStatus(1)).toBe(false);
    expect(isFrozenStatus(4)).toBe(false);
    expect(isFrozenStatus(undefined)).toBe(false);
  });

  it('requires version > latest', () => {
    expect(() => assertVersionGreaterThanLatest('1.0.0', '1.0.0')).toThrow(CliError);
    expect(() => assertVersionGreaterThanLatest('0.9.0', '1.0.0')).toThrow(CliError);
    expect(() => assertVersionGreaterThanLatest('1.0.1', '1.0.0')).not.toThrow();
  });

  it('skips gt when no latest', () => {
    expect(() => assertVersionGreaterThanLatest('1.0.0')).not.toThrow();
  });
});
