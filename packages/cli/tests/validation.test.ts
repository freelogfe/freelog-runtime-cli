import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertCollectionItemTitle,
  assertIntro,
  assertPolicyName,
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

  it('matches the Console 100-character collection item title limit', () => {
    expect(() => assertCollectionItemTitle('x'.repeat(100), true)).not.toThrow();
    expect(() => assertCollectionItemTitle('x'.repeat(101), true)).toThrow(/100/);
    expect(() => assertCollectionItemTitle('   ', true)).toThrow(CliError);
  });

  it('matches the Console 2-20 character policy name limit', () => {
    expect(() => assertPolicyName('免费')).not.toThrow();
    expect(() => assertPolicyName('x')).toThrow(/2.*20/);
    expect(() => assertPolicyName('x'.repeat(21))).toThrow(/2.*20/);
    expect(() => assertPolicyName('')).toThrow(/策略名称/);
  });

  it('rejects too many tags / too long tag / empty tag', () => {
    expect(() => assertTags(Array.from({ length: 21 }, (_, i) => `t${i}`))).toThrow(CliError);
    expect(() => assertTags(['x'.repeat(21)])).toThrow(CliError);
    expect(() => assertTags([''])).toThrow(CliError);
    expect(() => assertTags(['   '])).toThrow(CliError);
  });

  it('matches the Console 200-character introduction limit', () => {
    expect(() => assertIntro('x'.repeat(FIELD_LIMITS.introMax))).not.toThrow();
    expect(() => assertIntro('x'.repeat(FIELD_LIMITS.introMax + 1))).toThrow(/200/);
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
