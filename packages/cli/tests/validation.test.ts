import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertIntro,
  assertResourceTitle,
  assertSemverLike,
  assertTags,
  assertValidVersionRange,
  FIELD_LIMITS,
} from '../src/services/validation.js';

describe('validation', () => {
  it('rejects empty title when required', () => {
    expect(() => assertResourceTitle('', true)).toThrow(CliError);
    expect(() => assertResourceTitle('   ', true)).toThrow(CliError);
  });

  it('rejects title over max length', () => {
    expect(() => assertResourceTitle('x'.repeat(FIELD_LIMITS.resourceTitleMax + 1), true)).toThrow(
      /不超过100个字符/,
    );
  });

  it('accepts title within limit', () => {
    expect(() => assertResourceTitle('你好标题', true)).not.toThrow();
  });

  it('rejects too many tags / too long tag / empty tag', () => {
    expect(() => assertTags(Array.from({ length: 21 }, (_, i) => `t${i}`))).toThrow(CliError);
    expect(() => assertTags(['x'.repeat(21)])).toThrow(CliError);
    expect(() => assertTags([''])).toThrow(CliError);
    expect(() => assertTags(['   '])).toThrow(CliError);
  });

  it('rejects intro over 1000 characters', () => {
    expect(() => assertIntro('x'.repeat(1001))).toThrow(/1000/);
    expect(() => assertIntro('ok')).not.toThrow();
  });

  it('accepts semver-like and rejects junk', () => {
    expect(() => assertSemverLike('1.0.0')).not.toThrow();
    expect(() => assertSemverLike('1.0.0-beta.1')).not.toThrow();
    expect(() => assertSemverLike('v1')).toThrow(CliError);
  });

  it('accepts valid versionRange and rejects junk', () => {
    expect(() => assertValidVersionRange('*')).not.toThrow();
    expect(() => assertValidVersionRange('^1.0.0')).not.toThrow();
    expect(() => assertValidVersionRange('>=1.0.0')).not.toThrow();
    expect(() => assertValidVersionRange('')).toThrow(CliError);
    expect(() => assertValidVersionRange('not-a-range')).toThrow(CliError);
  });
});
