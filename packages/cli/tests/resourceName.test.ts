import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { normalizeCreateName } from '../src/services/resourceName.js';

describe('normalizeCreateName', () => {
  it('matches Console Step1 normalization for invalid characters', () => {
    expect(normalizeCreateName('My theme@$#')).toBe('My_theme_');
    expect(normalizeCreateName('a😀b')).toBe('a_b');
  });

  it('rejects a qualified name because Resource.create accepts only the short name', () => {
    expect(() => normalizeCreateName('alice/my-theme')).toThrow(CliError);
  });
});
