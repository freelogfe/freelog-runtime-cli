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

  it('initNextSteps for collection does not reference batch import', () => {
    const lines = initNextSteps({
      scaffold: 'collection',
      category: 'collection',
      projectDir: 'my-album',
    });
    expect(lines.join('\n')).toMatch(/collection create/);
    expect(lines.join('\n')).not.toMatch(/resource import-dir/);
  });

  it('other category label is 其余资源', () => {
    expect(INIT_CATEGORY_META.other.label).toBe('其余资源');
    expect(INIT_CATEGORY_OPTIONS.find((o) => o.value === 'other')?.label).toBe('其余资源');
  });
});
