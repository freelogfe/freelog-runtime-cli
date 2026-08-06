import * as p from '@clack/prompts';
import { consola } from 'consola';
import { CliError } from '../core/errors.js';
import { listResourceTypes } from './typeService.js';
import {
  buildResourceTypeLabels,
  findTypeInForestByCode,
  findTypePath,
  formatTypePath,
  isLeafType,
  parseResourceTypeForest,
  resolveScaffoldResourceTypeFromForest,
  searchResourceTypes,
  type ResourceTypeNode,
  type ScaffoldPreset,
} from './resourceTypeTree.js';

export type { ScaffoldPreset };

/** init 五选一 + type pick 可用的工程立项大类（方案 A：不含批量/文件夹合集） */
export type ScaffoldInitCategory = 'theme' | 'widget' | 'package' | 'other' | 'collection';

/** @deprecated 使用 ScaffoldInitCategory；保留别名减少 import 改动 */
export type InitCategory = ScaffoldInitCategory;

export const INIT_CATEGORY_OPTIONS = [
  {
    value: 'theme' as const,
    label: '主题',
    hint: '从平台类型树定稿「主题」，再选 runtime 工程模板',
  },
  {
    value: 'widget' as const,
    label: '插件',
    hint: '从平台类型树定稿「插件」，再选 runtime 工程模板',
  },
  {
    value: 'package' as const,
    label: '前端库 / 软件库',
    hint: '从平台类型树定稿「前端库/软件库」，再选 package 模板 + 命名空间',
  },
  {
    value: 'other' as const,
    label: '其余资源',
    hint: '图片 / 视频 / 文件等：一级级选到叶子类型，scaffold none',
  },
  {
    value: 'collection' as const,
    label: '合集',
    hint: 'init 合集 manifest，再 collection create → item *',
  },
] satisfies ReadonlyArray<{ value: ScaffoldInitCategory; label: string; hint: string }>;

export interface PickedResourceType {
  code: string;
  name: string;
  path: ResourceTypeNode[];
  pathLabel: string;
  resourceTypeLabels: string[];
  category: ScaffoldInitCategory;
  suggestedScaffold: 'runtime' | 'package' | 'none' | 'collection';
}

/** 与旧 initTemplate RESOURCE_TYPE_MAP 对齐：按展示名匹配，不是写死 code */
export async function resolveFixedScaffoldCategory(
  category: ScaffoldPreset,
  forest?: ResourceTypeNode[],
): Promise<PickedResourceType> {
  const types = forest ?? (await loadResourceTypeForest());
  try {
    const { node, path } = resolveScaffoldResourceTypeFromForest(types, category);
    return wrapPick(node, path, category);
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error), {
      code: 4,
      hint: 'freelog-cli login --env dev 后重试；或 init theme|widget|package --resource-type <code> 显式指定',
    });
  }
}

function wrapPick(
  node: ResourceTypeNode,
  path: ResourceTypeNode[],
  category: ScaffoldInitCategory,
): PickedResourceType {
  const suggestedScaffold =
    category === 'collection'
      ? 'collection'
      : category === 'package'
        ? 'package'
        : category === 'theme' || category === 'widget'
          ? 'runtime'
          : 'none';

  return {
    code: node.code,
    name: node.name,
    path,
    pathLabel: formatTypePath(path),
    resourceTypeLabels: buildResourceTypeLabels(path),
    category,
    suggestedScaffold,
  };
}

export async function loadResourceTypeForest(opts?: {
  subjectType?: 1 | 4;
}): Promise<ResourceTypeNode[]> {
  const envelope = await listResourceTypes({
    status: 1,
    subjectType: opts?.subjectType,
  });
  const forest = parseResourceTypeForest(envelope);
  if (!forest.length) {
    throw new CliError('平台未返回可用资源类型', {
      code: 4,
      hint: '先 freelog-cli login --env dev，再重试',
    });
  }
  return forest;
}

export async function pickInitCategory(): Promise<ScaffoldInitCategory> {
  const choice = await p.select({
    message:
      '请选择要创建的资源大类（工程立项五选一；批量发行请用 resource import-dir）',
    options: [...INIT_CATEGORY_OPTIONS],
  });
  if (p.isCancel(choice)) {
    throw new CliError('已取消资源类型选择', { code: 4 });
  }
  return choice;
}

async function pickFromList(
  message: string,
  nodes: ResourceTypeNode[],
  extras?: Array<{ value: string; label: string; hint?: string }>,
): Promise<ResourceTypeNode | '__back__' | '__search__'> {
  const options = [
    ...(extras || []),
    ...nodes.map((node) => ({
      value: node.code,
      label: node.name,
      hint: node.children?.length
        ? `${node.code} → 还有 ${node.children.length} 个子类型`
        : node.code,
    })),
  ];

  const selected = await p.select({ message, options });
  if (p.isCancel(selected)) {
    throw new CliError('已取消资源类型选择', { code: 4 });
  }
  if (selected === '__back__') return '__back__';
  if (selected === '__search__') return '__search__';
  const node = nodes.find((n) => n.code === selected);
  if (!node) {
    throw new CliError('选择的资源类型不存在', { code: 4 });
  }
  return node;
}

async function pickBySearch(
  forest: ResourceTypeNode[],
  category: ScaffoldInitCategory,
): Promise<PickedResourceType | null> {
  const keyword = await p.text({
    message: '搜索资源类型（名称或 code）',
    validate: (value) => (value?.trim() ? undefined : '请输入关键词'),
  });
  if (p.isCancel(keyword)) return null;

  const matches = searchResourceTypes(forest, String(keyword));
  if (!matches.length) {
    consola.warn('未找到匹配的资源类型');
    return null;
  }

  if (matches.length === 1) {
    const node = matches[0]!;
    const path = findTypePath(node, forest) || [node];
    return wrapPick(node, path, category);
  }

  const picked = await p.select({
    message: `找到 ${matches.length} 个匹配，请选择`,
    options: matches.map((node) => ({
      value: node.code,
      label: `${node.name} (${node.code})`,
    })),
  });
  if (p.isCancel(picked)) return null;
  const node = matches.find((n) => n.code === picked)!;
  const path = findTypePath(node, forest) || [node];
  return wrapPick(node, path, category);
}

/** 一级级往下选，直到叶子（与旧 selectResourceTypeRecursive 一致） */
export async function pickResourceTypeFromTree(opts: {
  forest: ResourceTypeNode[];
  category: ScaffoldInitCategory;
  rootMessage?: string;
}): Promise<PickedResourceType> {
  type Frame = { level: ResourceTypeNode[]; parentPath: string; depth: number };
  const stack: Frame[] = [{ level: opts.forest, parentPath: '', depth: 1 }];

  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    const extras: Array<{ value: string; label: string; hint?: string }> = [];
    if (frame.depth > 1) {
      extras.push({ value: '__back__', label: '← 返回上一级' });
    }
    extras.push({ value: '__search__', label: '🔍 搜索资源类型' });

    const message =
      frame.parentPath ||
      opts.rootMessage ||
      (frame.depth === 1 ? '请选择资源类型（一级）' : `请选择子类型（${frame.parentPath}）`);

    const picked = await pickFromList(message, frame.level, extras);

    if (picked === '__search__') {
      const searched = await pickBySearch(opts.forest, opts.category);
      if (searched) return searched;
      continue;
    }

    if (picked === '__back__') {
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    if (!isLeafType(picked) && picked.children?.length) {
      const nextPath = frame.parentPath ? `${frame.parentPath} > ${picked.name}` : picked.name;
      stack.push({
        level: picked.children,
        parentPath: nextPath,
        depth: frame.depth + 1,
      });
      continue;
    }

    const path = findTypePath(picked, opts.forest) || [picked];
    return wrapPick(picked, path, opts.category);
  }

  throw new CliError('已取消资源类型选择', { code: 4 });
}

export async function pickResourceTypeForCategory(
  category: ScaffoldInitCategory,
): Promise<PickedResourceType> {
  if (category === 'theme' || category === 'widget' || category === 'package') {
    return resolveFixedScaffoldCategory(category);
  }
  if (category === 'collection') {
    const forest = await loadResourceTypeForest({ subjectType: 4 });
    return pickResourceTypeFromTree({
      forest,
      category: 'collection',
      rootMessage: '请选择合集资源类型（一级）',
    });
  }
  const forest = await loadResourceTypeForest();
  return pickResourceTypeFromTree({
    forest,
    category: 'other',
    rootMessage: '请选择资源类型（一级）',
  });
}

export async function pickResourceTypeInteractive(opts?: {
  category?: ScaffoldInitCategory;
}): Promise<PickedResourceType> {
  const category = opts?.category || (await pickInitCategory());
  return pickResourceTypeForCategory(category);
}
