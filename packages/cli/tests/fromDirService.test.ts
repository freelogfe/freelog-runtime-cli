import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  normalizeCreateBatchResults,
  parseBatchConfig,
  shouldFallbackCreateBatch,
} from '../src/services/fromDirService.js';

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

  it('only falls back when createBatch is unavailable', () => {
    expect(shouldFallbackCreateBatch(new Error('404 /v2/resources/createBatch'))).toBe(true);
    expect(shouldFallbackCreateBatch(new Error('createBatch is not a function'))).toBe(true);
    expect(shouldFallbackCreateBatch(new Error('resource name already exists'))).toBe(false);
  });

  it('keeps createBatch names as short authorization names', () => {
    const rows = normalizeCreateBatchResults(
      {
        photo: { data: { resourceId: 'r1', resourceName: 'alice/photo' } },
      },
      ['photo'],
    );

    expect(rows[0].name).toBe('photo');
    expect(rows[0].resourceName).toBe('alice/photo');
  });

  it('parses declarative batch config with defaults and per-item metadata', () => {
    const parsed = parseBatchConfig({
      defaults: {
        resourceTypeCode: 'image',
        resourceTypeName: '图片',
        version: '1.0.0',
        tags: ['album'],
        policies: {
          policyName: '免费',
          policyText: 'for public\nterminate',
          status: 1,
        },
      },
      items: [
        {
          filePath: 'a.png',
          name: 'photo-a',
          resourceTitle: '图片 A',
          description: 'first',
          itemTitle: '合集条目 A',
        },
        {
          filePath: 'skip.png',
          skip: true,
        },
      ],
    });

    expect(parsed.defaults?.resourceTypeCode).toBe('image');
    expect(parsed.defaults?.policies?.[0]?.policyName).toBe('免费');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      filePath: 'a.png',
      name: 'photo-a',
      resourceTitle: '图片 A',
      itemTitle: '合集条目 A',
    });
  });
});
