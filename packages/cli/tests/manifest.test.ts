import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
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

  it('rejects a template package without template.manifest.json', () => {
    const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-template-package-'));
    const missingManifest = path.join(packageRoot, 'template.manifest.json');
    expect(() => loadManifest(missingManifest)).toThrow(CliError);
    try {
      loadManifest(missingManifest);
    } catch (error) {
      expect((error as CliError).details).toMatchObject({ manifestPath: missingManifest });
    }
  });
});
