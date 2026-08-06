import { describe, expect, it } from 'vitest';
import {
  assertScaffoldCategoryMatch,
  defaultVersionFilePath,
  inferCategoryFromTypeCode,
  resolveScaffold,
  scaffoldForCategory,
} from '../src/services/initCatalog.js';

describe('initCatalog', () => {
  it('maps theme/widget to runtime scaffold', () => {
    expect(scaffoldForCategory('theme')).toBe('runtime');
    expect(scaffoldForCategory('widget')).toBe('runtime');
    expect(scaffoldForCategory('package')).toBe('package');
    expect(scaffoldForCategory('collection')).toBe('collection');
  });

  it('infers category from type code', () => {
    expect(inferCategoryFromTypeCode('theme')).toBe('theme');
    expect(inferCategoryFromTypeCode('widget')).toBe('widget');
    expect(inferCategoryFromTypeCode('my-package-lib')).toBe('package');
  });

  it('resolveScaffold prefers explicit scaffold', () => {
    expect(resolveScaffold({ scaffold: 'none', category: 'theme' })).toBe('none');
    expect(resolveScaffold({ resourceTypeCode: 'theme' })).toBe('runtime');
  });

  it('defaultVersionFilePath for media vs compress', () => {
    expect(
      defaultVersionFilePath({
        category: 'theme',
        resourceTypeCode: 'theme',
        scaffold: 'runtime',
      }),
    ).toBe('dist');
    expect(
      defaultVersionFilePath({
        category: 'other',
        resourceTypeCode: 'image',
        scaffold: 'none',
      }),
    ).toBe('');
  });

  it('assertScaffoldCategoryMatch allows none for theme接入', () => {
    expect(() =>
      assertScaffoldCategoryMatch({ scaffold: 'none', category: 'theme' }),
    ).not.toThrow();
  });

  it('assertScaffoldCategoryMatch rejects runtime for package', () => {
    expect(() =>
      assertScaffoldCategoryMatch({ scaffold: 'runtime', category: 'package' }),
    ).toThrow(/package/);
  });
});
