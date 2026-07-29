import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertManifestMatchesRef,
  loadCompat,
  loadManifest,
  resolveTemplateRef,
} from '../src/services/compat.js';

const templatesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../templates',
);

describe('template.manifest', () => {
  it('vite-vue-ts manifest matches compat', () => {
    const compat = loadCompat();
    const ref = resolveTemplateRef(compat, {
      scaffold: 'runtime',
      runtime: '0.5',
      templateId: 'vite-vue-ts',
    });
    const manifest = loadManifest(path.join(templatesRoot, 'vite-vue-ts', 'template.manifest.json'));
    assertManifestMatchesRef(manifest, ref, '0.5');
    expect(manifest.tags).toContain('runtime');
    expect(manifest.runtimeVersions).toContain('0.5');
  });
});
