import { describe, expect, it } from 'vitest';
import { resolveFixedScaffoldCategory } from '../src/services/resourceTypePicker.js';
import { INIT_CATEGORY_META, scaffoldForCategory } from '../src/services/initCatalog.js';
import {
  parseResourceTypeForest,
  resolveScaffoldResourceTypeFromForest,
} from '../src/services/resourceTypeTree.js';

const mockForest = parseResourceTypeForest([
  { code: 'theme', name: '主题' },
  { code: 'widget', name: '插件' },
  {
    code: 'dev-lib',
    name: '开发库',
    children: [{ code: 'freelog-lib', name: '前端库' }],
  },
]);

describe('scaffoldPreset', () => {
  it('resolveScaffoldResourceTypeFromForest finds theme/widget/package codes from tree', () => {
    expect(resolveScaffoldResourceTypeFromForest(mockForest, 'theme').node.code).toBe('theme');
    expect(resolveScaffoldResourceTypeFromForest(mockForest, 'widget').node.code).toBe('widget');
    expect(resolveScaffoldResourceTypeFromForest(mockForest, 'package').node.code).toBe(
      'freelog-lib',
    );
  });

  it('resolveFixedScaffoldCategory sets scaffold hints from resolved tree node', async () => {
    const theme = await resolveFixedScaffoldCategory('theme', mockForest);
    expect(theme.code).toBe('theme');
    expect(theme.suggestedScaffold).toBe('runtime');
    expect(theme.category).toBe('theme');
    expect(theme.resourceTypeLabels).toEqual(['主题']);

    const pkg = await resolveFixedScaffoldCategory('package', mockForest);
    expect(pkg.code).toBe('freelog-lib');
    expect(pkg.suggestedScaffold).toBe('package');
    expect(pkg.resourceTypeLabels).toEqual(['前端库', '开发库']);
    expect(scaffoldForCategory('package')).toBe('package');
    expect(INIT_CATEGORY_META.package.fixedTypeNames).toEqual(['前端库', '软件库']);
  });

  it('throws when preset type name is missing from tree', () => {
    const sparse = parseResourceTypeForest([{ code: 'image', name: '图片' }]);
    expect(() => resolveScaffoldResourceTypeFromForest(sparse, 'theme')).toThrow(/未找到/);
  });
});
