import { describe, expect, it } from 'vitest';
import { INIT_CATEGORY_META, initNextSteps, INIT_CATEGORY_OPTIONS } from '../src/services/init/index.js';

describe('init five-choice (scheme A)', () => {
  it('INIT_CATEGORY_OPTIONS has exactly five scaffold categories', () => {
    expect(INIT_CATEGORY_OPTIONS).toHaveLength(5);
    expect(INIT_CATEGORY_OPTIONS.map((o) => o.value)).toEqual([
      'theme',
      'widget',
      'package',
      'other',
      'collection',
    ]);
  });

  it('INIT_CATEGORY_META keys match five-choice options', () => {
    expect(Object.keys(INIT_CATEGORY_META).sort()).toEqual(
      ['collection', 'other', 'package', 'theme', 'widget'].sort(),
    );
  });

  it('initNextSteps for collection follows C0 item add, not folder scan', () => {
    const lines = initNextSteps({
      scaffold: 'collection',
      category: 'collection',
      projectDir: 'my-album',
    });
    const text = lines.join('\n');
    expect(text).toMatch(/collection create/);
    expect(text).toContain('freelog-cli collection item add <resourceId> --env dev');
    expect(text).not.toMatch(/item import-dir/);
    expect(text).not.toMatch(/resource import-dir/);
    expect(text).toContain('freelog-cli collection policy template list --env dev');
    expect(text).toContain('freelog-cli collection policy template apply <templateId> --yes --env dev');
    expect(text).not.toContain('collection policy apply --from-file');
    expect(text).toMatch(/collection init-from-folder/);
  });

  it('other category label is 其余资源', () => {
    expect(INIT_CATEGORY_META.other.label).toBe('其余资源');
    expect(INIT_CATEGORY_OPTIONS.find((o) => o.value === 'other')?.label).toBe('其余资源');
  });

  it('initNextSteps makes Console template Builder the primary policy path', () => {
    const lines = initNextSteps({
      scaffold: 'runtime',
      category: 'theme',
      projectDir: 'my-theme',
    });
    expect(lines.join('\n')).toContain('freelog-cli policy template list --env dev');
    expect(lines.join('\n')).toContain('freelog-cli policy template apply <templateId> --yes --env dev');
    expect(lines.join('\n')).not.toContain('policy apply --from-file');
  });
});
