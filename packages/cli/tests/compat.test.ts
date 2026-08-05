import { describe, expect, it } from 'vitest';
import { listTemplateRefs, loadCompat, resolveTemplateRef } from '../src/services/compat.js';

describe('template-compat', () => {
  it('loads and resolves runtime template under 0.5', () => {
    const compat = loadCompat();
    expect(compat.cliVersion).toMatch(/^0\.5\./);
    expect(compat.defaultRuntime).toBe('0.5');
    const ref = resolveTemplateRef(compat, {
      scaffold: 'runtime',
      runtime: '0.5',
      templateId: 'vite-vue-ts',
    });
    expect(ref.version.startsWith('0.5.')).toBe(true);
    expect(ref.npmName).toContain('template-vite-vue-ts');
  });

  it('resolves package templates from noRuntime', () => {
    const compat = loadCompat();
    const ref = resolveTemplateRef(compat, {
      scaffold: 'package',
      templateId: 'package-vue',
    });
    expect(ref.version.startsWith('0.5.')).toBe(true);
  });

  it('lists runtime and package templates for CLI discovery', () => {
    const rows = listTemplateRefs(loadCompat());
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'vite-vue-ts',
          scaffold: 'runtime',
          runtime: '0.5',
          defaultRuntime: true,
        }),
        expect.objectContaining({
          id: 'package-vue',
          scaffold: 'package',
        }),
      ]),
    );
  });
});
