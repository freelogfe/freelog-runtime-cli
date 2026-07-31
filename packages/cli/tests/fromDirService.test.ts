import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { normalizeCreateBatchResults } from '../src/services/fromDirService.js';

describe('normalizeCreateBatchResults', () => {
  it('accepts array payloads', () => {
    const rows = normalizeCreateBatchResults([{ resourceId: 'r1', name: 'a' }], ['a']);
    expect(rows).toEqual([{ resourceId: 'r1', name: 'a' }]);
  });

  it('accepts Console-style keyed payloads', () => {
    const rows = normalizeCreateBatchResults(
      {
        a: { data: { resourceId: 'r1', resourceName: 'alpha' }, message: '', status: 0 },
        b: { data: { resourceId: 'r2', resourceName: 'beta' }, message: '', status: 0 },
      },
      ['a', 'b'],
    );
    expect(rows).toEqual([
      { name: 'a', resourceId: 'r1', resourceName: 'alpha' },
      { name: 'b', resourceId: 'r2', resourceName: 'beta' },
    ]);
  });

  it('rejects unknown payloads', () => {
    expect(() => normalizeCreateBatchResults({ foo: 'bar' }, ['a'])).toThrow(CliError);
  });
});
