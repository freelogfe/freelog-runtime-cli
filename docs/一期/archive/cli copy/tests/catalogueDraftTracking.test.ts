import { describe, expect, it } from 'vitest';
import {
  fingerprintCatalogueDraft,
  resolveMergeCatalogueDraft,
} from '../src/services/catalogueDraftTracking.js';

describe('catalogueDraftTracking', () => {
  const itemsA = [
    { itemId: 'i1', itemTitle: 'A', sortId: 1, mountResourceInfo: { resourceId: 'r1' } },
    { itemId: 'i2', itemTitle: 'B', sortId: 2, mountResourceInfo: { resourceId: 'r2' } },
  ];

  it('fingerprint is stable for equivalent rows', () => {
    const fp1 = fingerprintCatalogueDraft(itemsA);
    const fp2 = fingerprintCatalogueDraft([
      { itemId: 'i2', itemTitle: 'B', sortId: 2, resourceId: 'r2' },
      { itemId: 'i1', itemTitle: 'A', sortId: 1, resourceId: 'r1' },
    ]);
    expect(fp1).toBe(fp2);
  });

  it('merge=1 when draft changed since last publish', () => {
    const published = fingerprintCatalogueDraft(itemsA);
    const changed = [
      ...itemsA,
      { itemId: 'i3', itemTitle: 'C', sortId: 3, mountResourceInfo: { resourceId: 'r3' } },
    ];
    expect(
      resolveMergeCatalogueDraft({
        currentItems: changed,
        publishedFingerprint: published,
      }),
    ).toBe(1);
  });

  it('merge=0 when only collection metadata changed', () => {
    const published = fingerprintCatalogueDraft(itemsA);
    expect(
      resolveMergeCatalogueDraft({
        currentItems: itemsA,
        publishedFingerprint: published,
      }),
    ).toBe(0);
  });

  it('merge=1 on first publish with items', () => {
    expect(
      resolveMergeCatalogueDraft({
        currentItems: itemsA,
        publishedFingerprint: null,
      }),
    ).toBe(1);
  });

  it('merge=0 on first publish without items', () => {
    expect(
      resolveMergeCatalogueDraft({
        currentItems: [],
        publishedFingerprint: null,
      }),
    ).toBe(0);
  });
});
