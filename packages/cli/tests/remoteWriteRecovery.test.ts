import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyState,
  createResourceManifest,
  loadCollectionProject,
  loadResourceProject,
  loadVersionProject,
  saveCollectionProject,
  saveProjectSnapshot,
  saveVersionProject,
} from '../src/config/project/index.js';
import { toCollectionDraftData } from '../src/adapters/collectionVersionDraftAdapter.js';

const mocks = vi.hoisted(() => ({
  ensureSynced: vi.fn(),
  ensureOwner: vi.fn(),
  ensureCollectionSynced: vi.fn(),
  ensureCollectionOwner: vi.fn(),
  lookDraft: vi.fn(),
  saveDraft: vi.fn(),
  deleteDraft: vi.fn(),
  getRules: vi.fn(),
  setRules: vi.fn(),
  rssPreview: vi.fn(),
  rssBindFeed: vi.fn(),
  getDraftItems: vi.fn(),
  addDraftItems: vi.fn(),
  deleteDraftItems: vi.fn(),
  updateDraftItems: vi.fn(),
  updateResource: vi.fn(),
  updateCollection: vi.fn(),
}));

vi.mock('../src/core/command.js', () => ({
  assertExplicitEnvForWriteOperation: vi.fn(),
}));

vi.mock('../src/services/sync/index.js', () => ({
  ensureSynced: mocks.ensureSynced,
  ensureOwner: mocks.ensureOwner,
}));

vi.mock('../src/services/collection/owner.js', () => ({
  ensureCollectionSynced: mocks.ensureCollectionSynced,
  ensureCollectionOwner: mocks.ensureCollectionOwner,
}));

vi.mock('../src/platform/index.js', () => ({
  unwrapData: (value: { data?: unknown } | unknown) =>
    value && typeof value === 'object' && 'data' in value ? value.data : value,
  FServiceAPI: {
    Resource: {
      lookDraft: mocks.lookDraft,
      saveVersionsDraft: mocks.saveDraft,
      deleteResourceDraft: mocks.deleteDraft,
      getCollectionCollectRules: mocks.getRules,
      setCollectRules: mocks.setRules,
      getCollectionItems_Draft: mocks.getDraftItems,
      addResourceItems_Draft: mocks.addDraftItems,
      deleteCollectionItems_Draft: mocks.deleteDraftItems,
      updateCollectionItemsInfo_Draft: mocks.updateDraftItems,
      update: mocks.updateResource,
      updateCollection: mocks.updateCollection,
    },
  },
}));

vi.mock('../src/services/platformExtra.js', () => ({
  rssCompare: vi.fn(),
  rssBindFeed: mocks.rssBindFeed,
  rssGetSyncProgress: vi.fn(),
  rssPreview: mocks.rssPreview,
  rssSendVerificationCode: vi.fn(),
  rssSyncBinding: vi.fn(),
}));

import { draftPush } from '../src/services/draftService.js';
import { collectionDraftPush } from '../src/services/collectionDraftService.js';
import { collectRulesSet, collectionRssBind } from '../src/services/collection/platform.js';
import {
  addCollectionItemDraftReconciled,
  itemRemove,
  itemUpdate,
} from '../src/services/collection/items.js';
import { collectionUpdate } from '../src/services/collection/maintenance.js';

const tempDirs: string[] = [];

function createProject(subject: 'resource' | 'collection') {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), `freelog-remote-recovery-${subject}-`));
  tempDirs.push(cwd);
  const manifest = createResourceManifest({
    subject,
    resourceName: `${subject}-demo`,
    resourceTypeCode: subject === 'collection' ? 'collection' : 'RT005001',
    resourceTitle: 'Demo',
  });
  const state = createEmptyState(subject);
  state.resource.resourceId = `${subject}-1`;
  state.resource.owner = { userId: 101, username: 'alice' };
  saveProjectSnapshot(manifest, state, cwd);
  return cwd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('remote write reconciliation', () => {
  it('records a resource draft result without overwriting concurrent local intent', async () => {
    const cwd = createProject('resource');
    const resource = loadResourceProject(cwd).data;
    mocks.ensureSynced.mockResolvedValue({ resource, version: loadVersionProject(cwd).data });
    let postedDraft: unknown;
    mocks.lookDraft.mockImplementation(() =>
      postedDraft
        ? { data: { resourceId: 'resource-1', updateDate: '2026-08-18', draftData: postedDraft } }
        : { data: null },
    );
    mocks.saveDraft.mockImplementation(async ({ draftData }: { draftData: unknown }) => {
      postedDraft = draftData;
      const concurrent = loadVersionProject(cwd).data;
      saveVersionProject({ ...concurrent, description: 'concurrent local intent' }, cwd);
      return { data: { updateDate: '2026-08-18' } };
    });

    await expect(draftPush({ cwd })).resolves.toMatchObject({ skippedPost: false });
    const saved = loadVersionProject(cwd).data;
    expect(saved.description).toBe('concurrent local intent');
    expect(saved.draftSync?.lastFingerprint).toBeTruthy();
    expect(mocks.saveDraft).toHaveBeenCalledTimes(1);
  });

  it('reconciles an aligned collection draft and preserves concurrent fields', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    const remoteDraft = toCollectionDraftData(collection);
    mocks.ensureCollectionSynced.mockResolvedValue({ collection, info: { resourceId: 'collection-1' } });
    mocks.lookDraft.mockImplementation(() => {
      const concurrent = loadCollectionProject(cwd).data;
      if (concurrent.description !== 'concurrent local intent') {
        saveCollectionProject({ ...concurrent, description: 'concurrent local intent' }, cwd);
      }
      return {
        data: { resourceId: 'collection-1', updateDate: '2026-08-18', draftData: remoteDraft },
      };
    });

    await expect(collectionDraftPush({ cwd })).resolves.toMatchObject({ skippedPost: true });
    const saved = loadCollectionProject(cwd).data;
    expect(saved.description).toBe('concurrent local intent');
    expect(saved.draftSync?.lastFingerprint).toBeTruthy();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it('skips a duplicate collect-rules write after remote success and repairs local state', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    const rules = {
      status: 1 as const,
      serializeStatus: 0 as const,
      conditionType: 1 as const,
      filterConditions: [
        { key: 'resourceTitle' as const, limitOperatorType: 'INCLUDES' as const, value: 'podcast' },
      ],
    };
    mocks.ensureCollectionSynced.mockResolvedValue({
      collection,
      info: { resourceId: 'collection-1', username: 'alice', serializeStatus: 0 },
    });
    mocks.getRules.mockImplementation(() => {
      const concurrent = loadCollectionProject(cwd).data;
      saveCollectionProject({ ...concurrent, description: 'concurrent local intent' }, cwd);
      const { serializeStatus: _serializeStatus, ...remoteRules } = rules;
      return { data: remoteRules };
    });

    await expect(collectRulesSet({ cwd, ...rules })).resolves.toEqual(rules);
    expect(mocks.setRules).not.toHaveBeenCalled();
    const saved = loadCollectionProject(cwd).data;
    expect(saved.description).toBe('concurrent local intent');
    expect(saved.collectRules).toEqual(rules);
  });

  it('treats a remotely bound RSS feed with stale local state as a retry reconciliation', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    const feedUrl = 'https://example.com/feed.xml';
    mocks.ensureCollectionSynced.mockResolvedValue({
      collection,
      info: { resourceId: 'collection-1', feedUrl },
    });
    mocks.rssPreview.mockResolvedValue({
      feedData: { channel: { title: 'Podcast', ownerEmail: 'owner@example.com' } },
      matchedItemCount: 1,
    });

    await expect(
      collectionRssBind({ cwd, feedUrl, code: '123456' }),
    ).resolves.toEqual({ alreadyBound: true, feedUrl });
    expect(mocks.rssBindFeed).not.toHaveBeenCalled();
    expect(loadCollectionProject(cwd).data.rssFeedUrl).toBe(feedUrl);
  });

  it('reconciles an unknown remove outcome by reading the collection draft', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    mocks.ensureCollectionSynced.mockResolvedValue({ collection, info: { resourceId: 'collection-1' } });
    let items = [{ itemId: 'item-1', itemTitle: 'Old', resourceId: 'resource-1' }];
    mocks.getDraftItems.mockImplementation(() => ({ data: { dataList: items } }));
    mocks.deleteDraftItems.mockImplementation(async () => {
      items = [];
      throw new Error('connection closed after platform commit');
    });

    await expect(itemRemove({ cwd, itemIds: ['item-1'] })).resolves.toBeUndefined();
    expect(mocks.deleteDraftItems).toHaveBeenCalledTimes(1);
    expect(loadCollectionProject(cwd).data.catalogueItems).toEqual([]);
  });

  it('reconciles an add committed before the connection closed', async () => {
    let items: Array<{ itemId: string; itemTitle: string; resourceId: string }> = [];
    mocks.getDraftItems.mockImplementation(() => ({ data: { dataList: items } }));
    mocks.addDraftItems.mockImplementation(async () => {
      items = [{ itemId: 'item-1', itemTitle: 'Added', resourceId: 'resource-1' }];
      throw new Error('connection closed after platform commit');
    });

    await expect(
      addCollectionItemDraftReconciled({
        collectionId: 'collection-1',
        resourceId: 'resource-1',
        itemTitle: 'Added',
        authExcludedItems: [],
      }),
    ).resolves.toBeUndefined();
    expect(mocks.addDraftItems).toHaveBeenCalledTimes(1);
  });

  it('rejects an existing collection item whose requested metadata differs', async () => {
    mocks.getDraftItems.mockResolvedValue({
      data: {
        dataList: [
          {
            itemId: 'item-1',
            itemTitle: 'Existing',
            resourceId: 'resource-1',
            authExcludedItems: [],
          },
        ],
      },
    });

    await expect(
      addCollectionItemDraftReconciled({
        collectionId: 'collection-1',
        resourceId: 'resource-1',
        itemTitle: 'Requested',
        authExcludedItems: [],
      }),
    ).rejects.toMatchObject({
      code: 3,
      details: { error: 'COLLECTION_ITEM_INTENT_CONFLICT', conflictingFields: ['itemTitle'] },
    });
    expect(mocks.addDraftItems).not.toHaveBeenCalled();
  });

  it('reports an explicit unknown outcome when both an item write and its reconciliation fail', async () => {
    mocks.getDraftItems
      .mockResolvedValueOnce({ data: { dataList: [] } })
      .mockRejectedValueOnce(new Error('draft read unavailable'));
    mocks.addDraftItems.mockRejectedValue(new Error('write response unavailable'));

    await expect(
      addCollectionItemDraftReconciled({
        collectionId: 'collection-1',
        resourceId: 'resource-1',
        authExcludedItems: [],
      }),
    ).rejects.toMatchObject({ details: { error: 'REMOTE_OUTCOME_UNKNOWN' } });
  });

  it('reconciles an unknown item update outcome without repeating a completed mutation', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    mocks.ensureCollectionSynced.mockResolvedValue({ collection, info: { resourceId: 'collection-1' } });
    let items = [{ itemId: 'item-1', itemTitle: 'Old', resourceId: 'resource-1' }];
    mocks.getDraftItems.mockImplementation(() => ({ data: { dataList: items } }));
    mocks.updateDraftItems.mockImplementation(async () => {
      items = [{ ...items[0]!, itemTitle: 'New' }];
      throw new Error('connection closed after platform commit');
    });

    await expect(itemUpdate({ cwd, itemId: 'item-1', title: 'New' })).resolves.toBeUndefined();
    expect(mocks.updateDraftItems).toHaveBeenCalledTimes(1);
    expect(loadCollectionProject(cwd).data.catalogueItems).toEqual(items);
  });

  it('persists only requested collection fields after idempotent remote patches', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    mocks.ensureCollectionSynced.mockResolvedValue({ collection, info: { resourceId: 'collection-1' } });
    mocks.updateResource.mockImplementation(async () => {
      const concurrent = loadCollectionProject(cwd).data;
      saveCollectionProject({ ...concurrent, description: 'concurrent local intent' }, cwd);
      return { data: {} };
    });
    mocks.updateCollection.mockResolvedValue({ data: {} });

    await expect(
      collectionUpdate({ cwd, title: 'Updated title', displayView: 'card' }),
    ).resolves.toMatchObject({ resourceTitle: 'Updated title' });
    const saved = loadCollectionProject(cwd).data;
    expect(saved.description).toBe('concurrent local intent');
    expect(saved.display?.collection_view).toBe('collection_view_card');
  });

  it('persists the same normalized title and tags that were sent to the platform', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    mocks.ensureCollectionSynced.mockResolvedValue({ collection, info: { resourceId: 'collection-1' } });
    mocks.updateResource.mockResolvedValue({ data: {} });

    await collectionUpdate({ cwd, title: '  Updated title  ', tags: [' one ', 'one', ' two '] });

    expect(mocks.updateResource).toHaveBeenCalledWith({
      resourceId: 'collection-1',
      resourceTitle: 'Updated title',
      tags: ['one', 'two'],
    });
    expect(loadCollectionProject(cwd).data).toMatchObject({
      resourceTitle: 'Updated title',
      tags: ['one', 'two'],
    });
  });

  it('reports which collection update stage completed so the same idempotent request can retry', async () => {
    const cwd = createProject('collection');
    const collection = loadCollectionProject(cwd).data;
    mocks.ensureCollectionSynced.mockResolvedValue({ collection, info: { resourceId: 'collection-1' } });
    mocks.updateResource.mockResolvedValue({ data: {} });
    mocks.updateCollection.mockRejectedValue(new Error('display update failed'));

    await expect(
      collectionUpdate({ cwd, title: 'Updated title', displayView: 'card' }),
    ).rejects.toMatchObject({
      details: { error: 'REMOTE_WRITE_PARTIAL', completedRemoteStages: ['listing'] },
    });
  });
});
