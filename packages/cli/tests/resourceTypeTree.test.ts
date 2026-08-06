import { describe, expect, it } from 'vitest';
import {
  buildResourceTypeLabels,
  findTypePath,
  flattenResourceTypes,
  parseResourceTypeForest,
  resolveScaffoldResourceTypeFromForest,
  searchResourceTypes,
} from '../src/services/resourceTypeTree.js';

describe('resourceTypeTree', () => {
  const sample = [
    {
      code: 'image',
      name: '图片',
      children: [{ code: 'custom-image', name: '自定义图片' }],
    },
    { code: 'theme', name: '主题' },
  ];

  it('parses nested forest', () => {
    const forest = parseResourceTypeForest(sample);
    expect(forest).toHaveLength(2);
    expect(forest[0]?.children?.[0]?.code).toBe('custom-image');
  });

  it('finds path to leaf', () => {
    const forest = parseResourceTypeForest(sample);
    const leaf = flattenResourceTypes(forest).find((n) => n.code === 'custom-image')!;
    const path = findTypePath(leaf, forest)!;
    expect(path.map((n) => n.code)).toEqual(['image', 'custom-image']);
  });

  it('builds resourceType labels like old CLI', () => {
    const forest = parseResourceTypeForest(sample);
    const leaf = forest[0]!.children![0]!;
    const path = findTypePath(leaf, forest)!;
    expect(buildResourceTypeLabels(path)).toEqual(['自定义图片', '图片']);
  });

  it('searches by name or code', () => {
    const forest = parseResourceTypeForest(sample);
    const hits = searchResourceTypes(forest, 'theme');
    expect(hits.map((n) => n.code)).toEqual(['theme']);
  });

  it('resolves scaffold presets by display name not hardcoded code', () => {
    const forest = parseResourceTypeForest([
      { code: 'theme', name: '主题' },
      { code: 'widget', name: '插件' },
      { code: 'custom-package', name: '软件库' },
    ]);
    expect(resolveScaffoldResourceTypeFromForest(forest, 'package').node.code).toBe('custom-package');
  });
});
