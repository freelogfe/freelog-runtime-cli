import { describe, expect, it } from 'vitest';
import { computeManifestBumpVersion } from '../src/services/versionBumpService.js';

describe('computeManifestBumpVersion', () => {
  it('bumps patch from current manifest version', () => {
    expect(
      computeManifestBumpVersion({
        currentVersion: '1.0.0',
        latestPlatform: '1.0.0',
        level: 'patch',
      }),
    ).toBe('1.0.1');
  });

  it('bumps minor', () => {
    expect(
      computeManifestBumpVersion({
        currentVersion: '1.2.3',
        latestPlatform: '1.2.3',
        level: 'minor',
      }),
    ).toBe('1.3.0');
  });

  it('rejects bump not greater than platform latest', () => {
    expect(() =>
      computeManifestBumpVersion({
        currentVersion: '1.0.0',
        latestPlatform: '2.0.0',
        level: 'patch',
      }),
    ).toThrow();
  });
});

describe('diffProject (offline)', () => {
  it('reports missing manifest', async () => {
    const { diffProject } = await import('../src/services/diffService.js');
    const result = await diffProject({ cwd: '/nonexistent-freelog-diff-xyz' });
    expect(result.hasDrift).toBe(true);
    expect(result.entries[0]?.field).toBe('manifest');
  });
});
