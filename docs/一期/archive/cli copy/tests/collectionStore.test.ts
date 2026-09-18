import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEmptyState,
  createResourceManifest,
  saveProjectSnapshot,
} from '../src/config/project/index.js';
import { ManifestCollectionStore } from '../src/services/store/collectionStore.js';

const tempDirs: string[] = [];

function createCollectionStore() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-collection-store-'));
  tempDirs.push(cwd);
  const manifest = createResourceManifest({
    subject: 'collection',
    resourceName: 'collection-demo',
    resourceTypeCode: 'collection',
    resourceTitle: 'Collection demo',
  });
  const state = createEmptyState('collection');
  state.resource.resourceId = 'collection-1';
  state.resource.userId = 7;
  saveProjectSnapshot(manifest, state, cwd);
  return { cwd, store: new ManifestCollectionStore(cwd) };
}

afterEach(() => {
  while (tempDirs.length) {
    const cwd = tempDirs.pop();
    if (cwd && fs.existsSync(cwd)) fs.rmSync(cwd, { recursive: true, force: true });
  }
});

describe('ManifestCollectionStore', () => {
  it('keeps collection intent patches behind the collection persistence port', () => {
    const { store } = createCollectionStore();

    store.savePatch({ description: 'local intent' });

    expect(store.load().description).toBe('local intent');
  });

  it('writes confirmed platform facts without replacing collection intent', () => {
    const { store } = createCollectionStore();
    store.savePatch({ description: 'local intent' });
    const current = store.load();

    store.savePlatformFacts(
      { ...current, status: 1 },
      { catalogueDraft: [{ itemId: 'item-1' }], cataloguePublishedFingerprint: 'fp-1' },
      { remoteWriteConfirmed: true },
    );

    expect(store.load().description).toBe('local intent');
    expect(store.loadState().collection.cataloguePublishedFingerprint).toBe('fp-1');
    expect(store.loadState().collection.catalogueDraft).toEqual([{ itemId: 'item-1' }]);
  });
});
