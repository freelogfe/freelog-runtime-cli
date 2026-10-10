import { describe, expect, it } from 'vitest';
import { createEmptyState, createResourceManifest } from '../src/config/project/index.js';
import {
  assertProjectRevision,
  attachProjectRevision,
  mergeProjectPatch,
} from '../src/config/project/revision.js';

describe('project revision helpers', () => {
  it('retains the fresh revision when applying an intent patch', () => {
    const manifest = createResourceManifest({
      resourceName: 'demo',
      resourceTypeCode: 'RT005001',
      resourceTitle: 'Demo',
    });
    const state = createEmptyState();
    const loaded = attachProjectRevision({ title: 'old', untouched: true }, manifest, state);
    const merged = mergeProjectPatch(loaded, { title: 'new' });

    expect(() => assertProjectRevision(merged, manifest, state)).not.toThrow();
    expect(merged).toMatchObject({ title: 'new', untouched: true });
  });

  it('rejects a DTO when the on-disk manifest/state snapshot has changed', () => {
    const manifest = createResourceManifest({
      resourceName: 'demo',
      resourceTypeCode: 'RT005001',
      resourceTitle: 'Demo',
    });
    const state = createEmptyState();
    const loaded = attachProjectRevision({ title: 'old' }, manifest, state);
    const changedState = structuredClone(state);
    changedState.resource.status = 1;

    expect(() => assertProjectRevision(loaded, manifest, changedState)).toThrow();
  });
});
