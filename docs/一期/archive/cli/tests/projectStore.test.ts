import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createResourceManifest,
  createEmptyState,
  saveManifest,
  saveState,
} from '../src/config/project/index.js';
import { EphemeralStore } from '../src/services/store/ephemeralStore.js';
import { ManifestStateStore } from '../src/services/store/manifestStateStore.js';
import { createProjectStore } from '../src/services/store/projectStore.js';

describe('ProjectStore P0', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function scaffoldResourceProject() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-store-'));
    saveManifest(
      createResourceManifest({
        resourceName: 'demo',
        resourceTypeCode: 'RT005001',
        resourceTitle: 'Demo',
        version: '1.0.0',
        filePath: 'photo.png',
      }),
      tmpDir,
    );
    const state = createEmptyState('resource');
    state.resource.resourceId = 'res-001';
    state.resource.resourceName = 'alice/demo';
    saveState(state, tmpDir, 'resource');
    return tmpDir;
  }

  it('ManifestStateStore reads and writes version intent', () => {
    const cwd = scaffoldResourceProject();
    const store = new ManifestStateStore(cwd);
    expect(store.mode()).toBe('project');
    expect(store.resolveResourceId()).toBe('res-001');
    expect(store.loadVersion().version).toBe('1.0.0');

    store.saveVersion({ description: 'hello' });
    expect(store.loadVersion().description).toBe('hello');
  });

  it('createProjectStore session returns EphemeralStore', () => {
    const store = createProjectStore({ session: true, resourceId: 'res-session' });
    expect(store).toBeInstanceOf(EphemeralStore);
    expect(store.mode()).toBe('session');
  });
});
