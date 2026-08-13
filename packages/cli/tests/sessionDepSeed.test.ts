import { describe, expect, it } from 'vitest';
import { EphemeralStore } from '../src/services/store/ephemeralStore.js';
import { ensureSessionVersionIntent } from '../src/services/store/sessionVersionSeed.js';

describe('ensureSessionVersionIntent (Console versionInput parity)', () => {
  it('seeds version block for session dep when --target-version provided', () => {
    const store = new EphemeralStore({ resourceId: 'res-parent' });
    ensureSessionVersionIntent(store, '2.0.0');
    expect(store.loadVersion()?.version).toBe('2.0.0');
  });

  it('throws when session store has no version and no target-version', () => {
    const store = new EphemeralStore({ resourceId: 'res-parent' });
    expect(() => ensureSessionVersionIntent(store)).toThrow(/target-version|下一版/i);
  });

  it('no-op for project store', () => {
    // ManifestStateStore would throw on loadVersion if missing manifest — not testing here.
    const store = new EphemeralStore();
    store.saveVersion({ version: '1.0.0', filePath: 'x' });
    ensureSessionVersionIntent(store);
    expect(store.loadVersion()?.version).toBe('1.0.0');
  });
});
