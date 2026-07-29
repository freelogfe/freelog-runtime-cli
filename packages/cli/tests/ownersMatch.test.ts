import { describe, expect, it } from 'vitest';
import { ownersMatch } from '../src/services/syncService.js';

describe('ownersMatch', () => {
  it('matches numeric and string userIds', () => {
    expect(ownersMatch(100, '100')).toBe(true);
    expect(ownersMatch('42', 42)).toBe(true);
  });

  it('rejects mismatch or missing', () => {
    expect(ownersMatch(1, 2)).toBe(false);
    expect(ownersMatch(undefined, 1)).toBe(false);
    expect(ownersMatch('x', 1)).toBe(false);
  });
});
