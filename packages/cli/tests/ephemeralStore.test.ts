import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EphemeralStore } from '../src/services/store/ephemeralStore.js';
import { createProjectStore } from '../src/services/store/projectStore.js';

describe('EphemeralStore P1', () => {
  it('starts from EMPTY_RESOURCE and accepts seed', () => {
    const store = new EphemeralStore({
      resourceId: 'res-ephemeral',
      seed: {
        resource: { resourceTitle: 'Demo', resourceTypeCode: 'RT005001' },
        version: { version: '2.0.0', filePath: 'dist', description: 'seeded' },
      },
    });

    expect(store.mode()).toBe('session');
    expect(store.supportsListingSync()).toBe(false);
    expect(store.resolveResourceId()).toBe('res-ephemeral');
    expect(store.loadResource().resourceTitle).toBe('Demo');
    expect(store.loadVersion()?.version).toBe('2.0.0');
    expect(store.loadVersion()?.description).toBe('seeded');
  });

  it('save* only mutates memory', () => {
    const store = new EphemeralStore({
      seed: { version: { version: '1.0.0', filePath: 'a.zip' } },
    });
    store.saveVersion({ description: 'in-memory' });
    store.saveResource({ resourceName: 'user/demo' });

    expect(store.loadVersion()?.description).toBe('in-memory');
    expect(store.loadResource().resourceName).toBe('user/demo');
  });

  it('normalizes a partial version seed into a publishable version shape', () => {
    const store = new EphemeralStore({ seed: { version: { description: 'later' } } });

    expect(store.loadVersion()).toMatchObject({ version: '1.0.0', filePath: '', description: 'later' });
  });

  it('createProjectStore(session) returns EphemeralStore', () => {
    const store = createProjectStore({ session: true, resourceId: 'rid' });
    expect(store.mode()).toBe('session');
    expect(store.resolveResourceId()).toBe('rid');
  });

  it('exportProject writes minimal project to disk', () => {
    const store = new EphemeralStore({
      resourceId: 'res-ephemeral',
      seed: {
        resource: { resourceName: 'user/demo', resourceTitle: 'Demo', resourceTypeCode: 'RT005001' },
        version: { version: '1.0.0', filePath: 'dist' },
      },
    });
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-ephemeral-export-'));
    try {
      const resolved = store.exportProject(target);
      expect(resolved).toBe(path.resolve(target));
      expect(fs.existsSync(path.join(target, 'freelog.manifest.json'))).toBe(true);
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
});
