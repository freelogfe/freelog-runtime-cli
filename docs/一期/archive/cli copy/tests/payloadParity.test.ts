import { describe, expect, it } from 'vitest';
import {
  diffCustomPropertyDescriptors,
  diffInputAttrsByValue,
} from '../src/services/payloadParity.js';

describe('payloadParity', () => {
  it('diffInputAttrsByValue detects value mismatch', () => {
    expect(
      diffInputAttrsByValue(
        [{ key: 'author', value: 'cli' }],
        [{ key: 'author', value: 'platform' }],
      ),
    ).toEqual([{ key: 'author', expected: 'cli', actual: 'platform' }]);
  });

  it('diffInputAttrsByValue passes when values match', () => {
    expect(
      diffInputAttrsByValue(
        [
          { key: 'a', value: '1' },
          { key: 'b', value: 'true' },
        ],
        [
          { key: 'b', value: 'true' },
          { key: 'a', value: '1' },
        ],
      ),
    ).toEqual([]);
  });

  it('diffCustomPropertyDescriptors compares defaultValue', () => {
    expect(
      diffCustomPropertyDescriptors(
        [{ type: 'readonlyText', key: 'copyright', defaultValue: '2026' }],
        [{ type: 'readonlyText', key: 'copyright', defaultValue: '2025' }],
      ),
    ).toEqual([
      { key: 'copyright', field: 'defaultValue', expected: '2026', actual: '2025' },
    ]);
  });
});
