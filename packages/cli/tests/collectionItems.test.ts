import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { assertAddCollectionItemsResult } from '../src/services/collection/items.js';

describe('collection catalogue item result guards', () => {
  it('accepts a complete successful add result', () => {
    expect(() =>
      assertAddCollectionItemsResult(
        {
          data: {
            addSuccessfulItems: [{ resourceId: 'resource-1' }],
            addFailedItems: [],
            ignoreItems: [],
          },
        },
        1,
      ),
    ).not.toThrow();
  });

  it('rejects failed collection item add results instead of reporting success', () => {
    expect(() =>
      assertAddCollectionItemsResult(
        {
          data: {
            addSuccessfulItems: [],
            addFailedItems: [
              {
                resourceId: 'resource-1',
                itemName: 'Photo',
                reason: '单品资源未上架',
              },
            ],
            ignoreItems: [],
          },
        },
        1,
      ),
    ).toThrow(CliError);
  });

  it('rejects ignored items because they were not written to the draft', () => {
    expect(() =>
      assertAddCollectionItemsResult(
        {
          data: {
            addSuccessfulItems: [],
            addFailedItems: [],
            ignoreItems: [{ resourceId: 'resource-1' }],
          },
        },
        1,
      ),
    ).toThrow('部分目录项未能加入合集目录草稿');
  });
});
