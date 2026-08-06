import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { normalizeCreateName, resolveCreateApiResourceTypeName } from '../src/services/resourceName.js';

describe('normalizeCreateName', () => {
  it('matches Console Step1 normalization for invalid characters', () => {
    expect(normalizeCreateName('My theme@$#')).toBe('My_theme_');
    expect(normalizeCreateName('a😀b')).toBe('a_b');
  });

  it('rejects a qualified name because Resource.create accepts only the short name', () => {
    expect(() => normalizeCreateName('alice/my-theme')).toThrow(CliError);
  });
});

describe('resolveCreateApiResourceTypeName', () => {
  it('omits manifest typeName for standard RT codes', () => {
    expect(
      resolveCreateApiResourceTypeName('RT005001', { manifest: '照片' }),
    ).toBeUndefined();
  });

  it('keeps explicit --type-name and custom codes', () => {
    expect(
      resolveCreateApiResourceTypeName('RT005001', { explicit: '自定义' }),
    ).toBe('自定义');
    expect(
      resolveCreateApiResourceTypeName('custom-image', { manifest: '自定义图片' }),
    ).toBe('自定义图片');
  });
});
