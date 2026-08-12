import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertBatchItemAuthorizationReady,
  assertPreparedBatchAuthorization,
} from '../src/services/batch/authorization.js';
import {
  normalizeCreateBatchResults,
  parseBatchConfig,
  shouldUseSingleCreatePath,
} from '../src/services/batch/index.js';
import type { PreparedFile } from '../src/services/batch/types.js';

function sampleItem(overrides: Partial<PreparedFile> = {}): PreparedFile {
  return {
    absolutePath: '/tmp/a.png',
    filename: 'a.png',
    sha1: 'abc',
    name: 'photo-a',
    resourceTitle: 'Photo A',
    resourceTypeCode: 'RT005001',
    safeDir: 'a',
    version: '1.0.0',
    description: '',
    ...overrides,
  };
}

describe('batch authorization preflight', () => {
  it('allows items without dependencies or baseUpcast', () => {
    expect(() => assertBatchItemAuthorizationReady(sampleItem())).not.toThrow();
  });

  it('blocks items with dependencies but no batchSignContracts', () => {
    expect(() =>
      assertBatchItemAuthorizationReady(
        sampleItem({ dependencies: [{ resourceId: 'dep-1', versionRange: '*' }] }),
      ),
    ).toThrow(CliError);
  });

  it('accepts batchSignContracts covering dependencies and baseUpcast', () => {
    expect(() =>
      assertPreparedBatchAuthorization([
        sampleItem({
          dependencies: [{ resourceId: 'dep-1', versionRange: '*' }],
          baseUpcastResources: [{ resourceId: 'up-1' }],
          batchSignContracts: [
            { resourceId: 'dep-1', policyIds: ['p1'] },
            { resourceId: 'up-1', policyIds: ['p2'] },
          ],
        }),
      ]),
    ).not.toThrow();
  });
});

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

  it('uses single-resource creation only when createBatch is unavailable', () => {
    expect(shouldUseSingleCreatePath(new Error('404 /v2/resources/createBatch'))).toBe(true);
    expect(shouldUseSingleCreatePath(new Error('createBatch is not a function'))).toBe(true);
    expect(shouldUseSingleCreatePath(new Error('resource name already exists'))).toBe(false);
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

  it('rejects listing and collection item values beyond Console limits', () => {
    expect(() =>
      parseBatchConfig({
        defaults: { intro: 'x'.repeat(201) },
        items: [{ filePath: 'a.txt' }],
      }),
    ).toThrow(/200/);
    expect(() =>
      parseBatchConfig({
        items: [{ filePath: 'a.txt', resourceTitle: 'x'.repeat(101) }],
      }),
    ).toThrow(/100/);
    expect(() =>
      parseBatchConfig({
        items: [{ filePath: 'a.txt', itemTitle: 'x'.repeat(101) }],
      }),
    ).toThrow(/100/);
    expect(() =>
      parseBatchConfig({
        defaults: { policies: { policyName: 'x', policyText: 'FOR PUBLIC' } },
        items: [{ filePath: 'a.txt' }],
      }),
    ).toThrow(/2.*20/);
    expect(() =>
      parseBatchConfig({
        items: [{ filePath: 'a.txt', name: 'x'.repeat(61) }],
      }),
    ).toThrow(/60/);
  });
});
