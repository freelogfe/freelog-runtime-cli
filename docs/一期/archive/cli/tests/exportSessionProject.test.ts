import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportSessionProject } from '../src/services/store/exportSessionProject.js';
import { EphemeralStore } from '../src/services/store/ephemeralStore.js';

const tempDirs: string[] = [];

function mkTempDir(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('exportSessionProject P4', () => {
  it('writes manifest, state, and gitignore to empty dir', () => {
    const store = new EphemeralStore({
      resourceId: 'res-export',
      seed: {
        resource: {
          resourceName: 'alice/export-demo',
          resourceTitle: 'Export Demo',
          resourceTypeCode: 'RT005001',
          resourceTypeName: '图片',
          intro: 'hello',
          tags: ['tag-a'],
        },
        version: {
          version: '1.0.0',
          filePath: 'dist',
          description: 'first',
          dependencies: [{ resourceId: 'dep-1', versionRange: '*' }],
        },
      },
    });
    store.saveResource({
      resourceId: 'res-export',
      latestVersion: '1.0.0',
      policies: [{ policyId: 'policy-1', policyName: '免费', status: 1 }],
    });
    store.saveVersionFacts({ fileSha1: 'a'.repeat(40), filename: 'demo.zip' });

    const target = mkTempDir('freelog-export-');
    const resolved = exportSessionProject(store, target);

    expect(resolved).toBe(path.resolve(target));
    expect(fs.existsSync(path.join(target, 'freelog.manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(target, '.freelog', 'state.json'))).toBe(true);
    expect(fs.readFileSync(path.join(target, '.gitignore'), 'utf8')).toContain('.freelog/state.json');

    const manifest = JSON.parse(fs.readFileSync(path.join(target, 'freelog.manifest.json'), 'utf8'));
    expect(manifest.identity.name).toBe('alice/export-demo');
    expect(manifest.version.version).toBe('1.0.0');
    expect(manifest.version.dependencies).toHaveLength(1);
    expect(manifest.policies).toEqual([]);
    expect(JSON.stringify(manifest)).not.toContain('policy-1');
    expect(JSON.stringify(manifest)).not.toContain('policyText');

    const state = JSON.parse(fs.readFileSync(path.join(target, '.freelog', 'state.json'), 'utf8'));
    expect(state.resource.resourceId).toBe('res-export');
    expect(state.resource.policies).toEqual([
      { policyId: 'policy-1', policyName: '免费', status: 1 },
    ]);
    expect(state.version.fileSha1).toBe('a'.repeat(40));
    expect(state.version.draftSync).toBeNull();
  });

  it('rejects non-empty export directory', () => {
    const store = new EphemeralStore({
      seed: { resource: { resourceName: 'alice/x', resourceId: 'rid' } },
    });
    const target = mkTempDir('freelog-export-busy-');
    fs.writeFileSync(path.join(target, 'readme.txt'), 'busy', 'utf8');

    expect(() => exportSessionProject(store, target)).toThrow(/非空|not empty/i);
  });

  it('rejects export when resource identity is missing', () => {
    const store = new EphemeralStore();
    const target = mkTempDir('freelog-export-empty-');

    expect(() => exportSessionProject(store, target)).toThrow(/资源|resource/i);
  });
});
