import { describe, expect, it } from 'vitest';
import {
  applyResourceProject,
  listingFingerprint,
  shortName,
  toCollectionProject,
  toResourceProject,
  toVersionProject,
} from '../src/config/project/mapping.js';
import type { FreelogManifest, FreelogState } from '../src/config/project/types.js';

function makeManifest(): FreelogManifest {
  return {
    schemaVersion: 1,
    subject: 'resource',
    identity: { name: 'demo' },
    resource: {
      typeCode: 'RT005001',
      typeName: 'image',
      title: 'Local title',
      intro: 'Local intro',
      tags: ['local'],
      coverImages: ['local-cover'],
    },
    version: {
      version: '1.2.3',
      filePath: 'dist',
      description: 'Local version',
      dependencies: [{ resourceId: 'dep-1', versionRange: '^1.0.0' }],
    },
    collection: {
      version: '2.0.0',
      display: { layout: 'grid' },
      items: [{ resourceId: 'item-1' }],
    },
  };
}

function makeState(): FreelogState {
  return {
    schemaVersion: 1,
    env: 'dev',
    resource: {
      resourceId: 'resource-1',
      resourceName: 'owner/demo',
      resourceType: ['image'],
      resourceTypeCode: 'RT005001',
      resourceTypeName: 'image',
      owner: { userId: 7, username: 'owner' },
      status: 1,
      latestVersion: '1.2.3',
      policies: [{ policyId: 'policy-1', status: 1 }],
    },
    version: {
      fileSha1: 'sha1',
      filename: 'demo.png',
      lastPublishedVersion: '1.2.3',
      lastPublishedVersionId: 'version-1',
      draftSync: null,
    },
    collection: {
      catalogueDraft: [{ resourceId: 'item-2' }],
      catalogueProperty: { layout: 'list' },
      draftSync: null,
    },
    sync: { listingFingerprint: null, lastPulledAt: null, platformUpdateDate: null },
  };
}

describe('project DTO mapping', () => {
  it('keeps local listing intent separate from platform facts', () => {
    const project = toResourceProject(makeManifest(), makeState());

    expect(project.resourceId).toBe('resource-1');
    expect(project.resourceName).toBe('owner/demo');
    expect(project.resourceTitle).toBe('Local title');
    expect(project.tags).toEqual(['local']);
    expect(project.latestVersion).toBe('1.2.3');
    expect(project.policies).toEqual([{ policyId: 'policy-1', status: 1 }]);
  });

  it('maps version and collection intent without merging the wrong state section', () => {
    const manifest = makeManifest();
    const state = makeState();
    const version = toVersionProject(manifest, state);
    const collection = toCollectionProject({ ...manifest, subject: 'collection' }, state);

    expect(version.fileSha1).toBe('sha1');
    expect(version.dependencies).toEqual([{ resourceId: 'dep-1', versionRange: '^1.0.0' }]);
    expect(collection.catalogueItems).toEqual([{ resourceId: 'item-2' }]);
    expect(collection.display).toEqual({ layout: 'grid' });
    expect(collection.version).toBe('2.0.0');
  });

  it('applies a resource patch to intent and platform fields in one explicit mapping', () => {
    const manifest = makeManifest();
    const state = makeState();
    applyResourceProject(
      manifest,
      state,
      { resourceName: 'owner/renamed', resourceType: [], resourceTitle: 'Renamed' },
      'resource',
    );

    expect(manifest.identity.name).toBe('renamed');
    expect(manifest.resource.title).toBe('Renamed');
    expect(state.resource.resourceName).toBe('owner/renamed');
    expect(state.resource.resourceId).toBe('resource-1');
  });

  it('uses stable, null-aware listing fingerprints and names', () => {
    expect(shortName('owner/demo', 'fallback')).toBe('demo');
    expect(shortName(undefined, 'fallback')).toBe('fallback');
    expect(listingFingerprint({ resourceTitle: undefined, intro: undefined })).toBe(
      JSON.stringify({ title: null, intro: null, coverImages: [], tags: [] }),
    );
  });
});
