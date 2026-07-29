import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertResourceTitle,
  assertSemverLike,
  assertTags,
  FIELD_LIMITS,
} from '../src/services/validation.js';

describe('validation', () => {
  it('rejects empty title when required', () => {
    expect(() => assertResourceTitle('', true)).toThrow(CliError);
    expect(() => assertResourceTitle('   ', true)).toThrow(CliError);
  });

  it('rejects title over max length', () => {
    expect(() => assertResourceTitle('x'.repeat(FIELD_LIMITS.resourceTitleMax + 1), true)).toThrow(
      CliError,
    );
  });

  it('accepts title within limit', () => {
    expect(() => assertResourceTitle('你好标题', true)).not.toThrow();
  });

  it('rejects too many tags / too long tag', () => {
    expect(() => assertTags(Array.from({ length: 21 }, (_, i) => `t${i}`))).toThrow(CliError);
    expect(() => assertTags(['x'.repeat(21)])).toThrow(CliError);
  });

  it('accepts semver-like and rejects junk', () => {
    expect(() => assertSemverLike('1.0.0')).not.toThrow();
    expect(() => assertSemverLike('1.0.0-beta.1')).not.toThrow();
    expect(() => assertSemverLike('v1')).toThrow(CliError);
  });
});
