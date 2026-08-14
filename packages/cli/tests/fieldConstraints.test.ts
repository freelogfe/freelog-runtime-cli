import { describe, expect, it } from 'vitest';
import {
  FIELD_SPECS,
  fieldPromptMessage,
  helpSnippet,
  normalizePromptCreateName,
} from '../src/services/shared/fieldConstraints.js';
import { FIELD_LIMITS } from '../src/services/validation.js';

describe('fieldConstraints', () => {
  it('includes FIELD_LIMITS in title hint and help', () => {
    expect(fieldPromptMessage('FORM-RES-TITLE')).toContain(String(FIELD_LIMITS.resourceTitleMax));
    expect(helpSnippet('FORM-RES-TITLE')).toContain(String(FIELD_LIMITS.resourceTitleMax));
  });

  it('rejects title over max in validate', () => {
    const err = FIELD_SPECS['FORM-RES-TITLE'].validate('x'.repeat(FIELD_LIMITS.resourceTitleMax + 1));
    expect(err).toBeTruthy();
  });

  it('normalizes create name like Console (invalid chars → underscore)', () => {
    const { normalized, wasModified } = normalizePromptCreateName('My theme@$#');
    expect(normalized).toBe('My_theme_');
    expect(wasModified).toBe(true);
    expect(FIELD_SPECS['FORM-RES-NAME'].validate('My theme@$#')).toBeUndefined();
  });

  it('rejects auth id longer than 60 characters', () => {
    const err = FIELD_SPECS['FORM-RES-NAME'].validate(`a${'b'.repeat(60)}`);
    expect(err).toMatch(/60/);
  });

  it('validates intro and tags limits', () => {
    expect(FIELD_SPECS['FORM-LIST-INTRO'].validate('x'.repeat(201))).toBeTruthy();
    expect(
      FIELD_SPECS['FORM-LIST-TAGS'].validate(
        Array.from({ length: 21 }, (_, i) => `t${i}`).join(','),
      ),
    ).toBeTruthy();
  });

  it('allows empty optional batch title prefix', () => {
    expect(FIELD_SPECS['FORM-BATCH-TITLE'].validate('')).toBeUndefined();
  });
});
