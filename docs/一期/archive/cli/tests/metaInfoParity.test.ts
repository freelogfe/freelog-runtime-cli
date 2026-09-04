import { describe, expect, it } from 'vitest';
import { metaInfoArraysEqual } from '../src/services/metaInfoParity.js';

describe('metaInfoParity', () => {
  it('metaInfoArraysEqual ignores row order', () => {
    const a = [
      {
        insertMode: 1 as const,
        key: 'Title',
        name: 'Title',
        remark: '',
        value: null,
        valueDisplay: 'x',
        valueUnit: '',
      },
      {
        insertMode: 2 as const,
        key: 'author',
        name: 'Author',
        remark: '',
        value: 'cli',
        valueDisplay: 'cli',
        valueUnit: '',
      },
    ];
    const b = [a[1]!, a[0]!];
    expect(metaInfoArraysEqual(a, b)).toBe(true);
  });

  it('metaInfoArraysEqual detects value mismatch', () => {
    const a = [
      {
        insertMode: 2 as const,
        key: 'author',
        name: 'Author',
        remark: '',
        value: 'a',
        valueDisplay: 'a',
        valueUnit: '',
      },
    ];
    const b = [
      {
        ...a[0]!,
        valueDisplay: 'b',
      },
    ];
    expect(metaInfoArraysEqual(a, b)).toBe(false);
  });
});
