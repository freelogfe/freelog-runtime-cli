/** 单资源类型解析：init 与 create 只通过此模块取得已启用的最终叶子。 */

import { CliError } from '../../core/errors';
import { askInput, selectQuestion } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';

export type TypeNode = {
  code: string;
  name: string;
  nameChain?: string;
  isTerminate?: boolean;
  status?: number;
  /** 旧接口兼容字段；当前详情接口的权威值在 resourceConfig 内。 */
  supportOptionalConfig?: number;
  resourceConfig?: {
    /** Console 与当前详情接口的权威字段：仅值为 2 时允许版本可选配置。 */
    supportOptionalConfig?: number | string;
  };
  /** 平台在不同接口中会返回 1、"1"、[1] 或 ["1"]。 */
  subjectType?: number | string | Array<number | string>;
  /** 类型树的叶子有时为 []，有时为 ""；详情接口才稳定给 isTerminate。 */
  children?: TypeNode[] | string;
};

export type TypeApis = {
  resourceTypes?: (params: Record<string, unknown>) => Promise<unknown>;
  searchLeaves?: (params: Record<string, unknown>) => Promise<unknown>;
  getByCode?: (params: { code: string }) => Promise<unknown>;
};

function unwrapList(result: unknown): TypeNode[] {
  const envelope = result as { data?: unknown };
  const data = envelope.data ?? result;
  if (Array.isArray(data)) {
    return data as TypeNode[];
  }
  if (data && typeof data === 'object' && Array.isArray((data as { dataList?: unknown }).dataList)) {
    return (data as { dataList: TypeNode[] }).dataList;
  }
  return [];
}

function unwrapOne(result: unknown): TypeNode | undefined {
  const envelope = result as { data?: unknown };
  const data = envelope.data ?? result;
  return data && typeof data === 'object' && !Array.isArray(data) ? data as TypeNode : undefined;
}

/**
 * 类型能力 DTO 归一化：当前详情接口把能力放在 resourceConfig；顶层字段仅兼容旧响应。
 * 所有调用方只读归一化后的 top-level 值，避免 type info、表单门禁和验收发现器出现分歧。
 */
function normalizeTypeInfo(node: TypeNode): TypeNode {
  const support = node.resourceConfig?.supportOptionalConfig ?? node.supportOptionalConfig;
  if (support === undefined || support === null || support === '') return node;
  const numeric = Number(support);
  return Number.isFinite(numeric) ? { ...node, supportOptionalConfig: numeric } : node;
}

/** 平台可选配置能力：详情的 resourceConfig 优先，顶层字段仅兼容旧接口。 */
export function supportsOptionalConfig(node: Pick<TypeNode, 'resourceConfig' | 'supportOptionalConfig'>): boolean {
  return Number(node.resourceConfig?.supportOptionalConfig ?? node.supportOptionalConfig) === 2;
}

/** 最终判定：平台显示值也必须满足启用、单资源、最终叶子三个条件。 */
export function isEnabledResourceLeaf(node: TypeNode): boolean {
  return node.isTerminate === true && node.status === 1 && supportsResourceSubject(node.subjectType);
}

/** 类型树接口不提供 isTerminate 时，用“无子节点”仅作选择候选；最终仍由详情接口复验。 */
function isEnabledResourceLeafCandidate(node: TypeNode): boolean {
  return node.status === 1
    && supportsResourceSubject(node.subjectType)
    && (node.isTerminate === true || node.isTerminate === undefined && !hasChildren(node));
}

function supportsResourceSubject(subjectType: TypeNode['subjectType']): boolean {
  const values = Array.isArray(subjectType) ? subjectType : [subjectType];
  return values.some((value) => Number(value) === 1);
}

function hasChildren(node: TypeNode): node is TypeNode & { children: TypeNode[] } {
  return Array.isArray(node.children) && node.children.length > 0;
}

/**
 * 将叶子转换为可直接展示的类型。`nameChain` 不能相信接口偶然返回的值：
 * 完整路径必须由同一棵类型树逐级推导，才能区分同名叶子。
 */
function flattenLeaves(
  nodes: readonly TypeNode[],
  ancestors: readonly TypeNode[] = [],
  acc: TypeNode[] = [],
): TypeNode[] {
  for (const node of nodes) {
    const path = [...ancestors, node];
    if (hasChildren(node)) {
      flattenLeaves(node.children, path, acc);
    }
    if (isEnabledResourceLeafCandidate(node)) {
      const names = path.map((item) => item.name.trim());
      if (names.some((name) => !name)) {
        throw new CliError('平台类型链存在缺失名称，无法展示完整层级', 'TYPE_HIERARCHY_INVALID');
      }
      acc.push({ ...node, nameChain: names.join(' / ') });
    }
  }
  return acc;
}

async function resourceTypeTree(apis: TypeApis): Promise<TypeNode[]> {
  assertPlatformAllowed();
  const request = apis.resourceTypes ?? ((params) => FServiceAPI.Resource.resourceTypes(params));
  return unwrapList(await request({ category: 1, status: 1, subjectType: 1 }));
}

/** 在平台类型树中定位一个节点，并保留从根到它的所有祖先。 */
function findTypePath(nodes: readonly TypeNode[], code: string, ancestors: readonly TypeNode[] = []): TypeNode[] | undefined {
  for (const node of nodes) {
    const path = [...ancestors, node];
    if (node.code === code) return path;
    if (hasChildren(node)) {
      const found = findTypePath(node.children, code, path);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * 返回从根到指定类型的完整名称链。列表展示不能把 `nameChain` 或单个叶子名
 * 当作可信祖先：必须在同一棵平台树中实际找到每一级节点。
 */
export async function getTypeHierarchy(code: string, apis: TypeApis = {}): Promise<string[]> {
  const normalized = code.trim();
  if (!normalized) throw new CliError('请提供资源类型编号', 'TYPE_CODE_REQUIRED');
  const path = findTypePath(await resourceTypeTree(apis), normalized);
  if (!path) throw new CliError(`平台类型树不包含当前类型 ${normalized}`, 'TYPE_HIERARCHY_NOT_FOUND');
  const names = path.map((node) => node.name.trim());
  if (names.some((name) => !name)) {
    throw new CliError('平台类型链存在缺失名称，无法展示完整层级', 'TYPE_HIERARCHY_INVALID');
  }
  return names;
}

/** 全量启用的单资源最终叶子。 */
export async function listLeafTypes(apis: TypeApis = {}): Promise<TypeNode[]> {
  return flattenLeaves(await resourceTypeTree(apis));
}

/** 按名称链检索；平台返回值仍须在本地严格复验。 */
export async function searchLeafTypes(keyword: string, apis: TypeApis = {}): Promise<TypeNode[]> {
  assertPlatformAllowed();
  const request = apis.searchLeaves ?? ((params) => FServiceAPI.Resource.ListSimpleByParentCode(params));
  const [tree, response] = await Promise.all([
    resourceTypeTree(apis),
    request({
    category: 1,
    nameChain: keyword,
    isTerminate: true,
    status: 1,
    subjectType: 1,
    }),
  ]);
  const codes = new Set<string>();
  return unwrapList(response).flatMap((item): TypeNode[] => {
    // 搜索接口真实只返回 code/name，不稳定携带 isTerminate、status、subjectType；
    // 它只能当候选集，叶子资格必须回到同一棵完整类型树复验。
    if (!item.code || codes.has(item.code)) return [];
    codes.add(item.code);
    const path = findTypePath(tree, item.code);
    // 搜索服务偶尔混入当前 category=1 类型树之外的候选；没有可信完整路径
    // 的项目不能展示、更不能作为最终类型，因此只忽略该条而不中断其它匹配。
    if (!path) return [];
    const leaf = path[path.length - 1]!;
    if (!isEnabledResourceLeafCandidate(leaf)) return [];
    const names = path.map((node) => node.name.trim());
    if (names.some((name) => !name)) {
      throw new CliError('平台类型链存在缺失名称，无法展示完整层级', 'TYPE_HIERARCHY_INVALID');
    }
    return [{ ...leaf, nameChain: names.join(' / ') }];
  });
}

/** 直接 code 与选择器的最终校验共用；没有精确、启用叶子即失败。 */
export async function getTypeInfo(code: string, apis: TypeApis = {}): Promise<TypeNode> {
  const normalized = code.trim();
  if (!normalized) {
    throw new CliError('请提供资源类型编号', 'TYPE_CODE_REQUIRED');
  }
  assertPlatformAllowed();
  const request = apis.getByCode ?? ((params) => FServiceAPI.Resource.getResourceTypeInfoByCode(params));
  const rawInfo = unwrapOne(await request({ code: normalized }));
  const info = rawInfo ? normalizeTypeInfo(rawInfo) : undefined;
  if (!info?.code) {
    throw new CliError(`找不到类型 ${normalized}`, 'TYPE_NOT_FOUND');
  }
  if (!isEnabledResourceLeaf(info)) {
    throw new CliError('必须是启用中的单资源最终叶子类型', 'TYPE_NOT_LEAF');
  }
  return info;
}

type TreeFrame = { nodes: TypeNode[]; title: string };

async function selectFromLeaves(items: TypeNode[], message: string): Promise<TypeNode> {
  if (items.length === 0) {
    throw new CliError('没有匹配的启用最终叶子类型', 'TYPE_NOT_FOUND');
  }
  const byCode = new Map(items.map((item) => [item.code, item]));
  const code = await selectQuestion(message, items.map((item) => ({
    name: `${item.nameChain ?? item.name} (${item.code})`,
    value: item.code,
  })));
  return byCode.get(code)!;
}

/**
 * TTY 统一选择器：逐级树形选择，同时在每一层可搜索或精确输入 code；只有叶子才能确认。
 * 搜索结果和直接输入都再走 getTypeInfo，避免把显示数据当作最终契约。
 */
export async function chooseLeafType(apis: TypeApis = {}): Promise<TypeNode> {
  const frames: TreeFrame[] = [{ nodes: await resourceTypeTree(apis), title: '资源类型' }];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    const choices = [
      ...frame.nodes.map((node) => ({
        name: `${node.name}${node.code ? ` (${node.code})` : ''}`,
        value: `node:${node.code}`,
      })),
      { name: '搜索资源类型', value: '__search__' },
      { name: '直接输入类型编号', value: '__code__' },
      ...(frames.length > 1 ? [{ name: '返回上一级', value: '__back__' }] : []),
      { name: '取消', value: '__cancel__' },
    ];
    const picked = await selectQuestion(`选择${frame.title}`, choices);
    if (picked === '__cancel__') {
      throw new CliError('已取消资源类型选择', 'TYPE_PICK_CANCELLED');
    }
    if (picked === '__back__') {
      frames.pop();
      continue;
    }
    if (picked === '__code__') {
      return getTypeInfo(await askInput('输入最终叶子类型编号'), apis);
    }
    if (picked === '__search__') {
      const keyword = (await askInput('搜索资源类型')).trim();
      const result = await selectFromLeaves(await searchLeafTypes(keyword, apis), '选择搜索结果');
      return getTypeInfo(result.code, apis);
    }
    const node = frame.nodes.find((item) => `node:${item.code}` === picked);
    if (!node) {
      throw new CliError('资源类型选择无效', 'TYPE_PICK_INVALID');
    }
    if (isEnabledResourceLeafCandidate(node)) {
      return getTypeInfo(node.code, apis);
    }
    if (!hasChildren(node)) {
      throw new CliError('该类型不是可用的最终叶子', 'TYPE_NOT_LEAF');
    }
    frames.push({ nodes: node.children, title: node.nameChain ?? node.name });
  }
  throw new CliError('已取消资源类型选择', 'TYPE_PICK_CANCELLED');
}

/** type list/search/pick 的固定页大小；不暴露 page/page-size 参数。 */
export const TYPE_LIST_PAGE_SIZE = 50;

export type TypeListPage = {
  page: number;
  pageCount: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  items: TypeNode[];
};

/** 已取到的叶子类型纯本地翻页，不在切换页面时重复请求平台。 */
export function typeListPage(items: readonly TypeNode[], page: number): TypeListPage {
  const pageCount = Math.max(1, Math.ceil(items.length / TYPE_LIST_PAGE_SIZE));
  if (!Number.isInteger(page) || page < 1 || page > pageCount) {
    throw new CliError(`类型页码超出范围，当前共 ${pageCount} 页`, 'TYPE_LIST_PAGE');
  }
  return {
    page,
    pageCount,
    total: items.length,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
    items: items.slice((page - 1) * TYPE_LIST_PAGE_SIZE, page * TYPE_LIST_PAGE_SIZE),
  };
}

/** 将类型结果转为稳定的 CLI 列表行，始终包含根到叶子的完整路径。 */
export function formatTypeList(items: readonly TypeNode[]): string {
  return items.map((item) => `${item.code}\t${item.nameChain ?? item.name}`).join('\n');
}

/** 单个类型列表页，页头明确当前范围，空搜索结果也保持稳定输出。 */
export function formatTypeListPage(page: TypeListPage): string {
  const header = `第 ${page.page}/${page.pageCount} 页，共 ${page.total} 个可用最终叶子类型`;
  const rows = formatTypeList(page.items);
  return rows ? `${header}\n${rows}` : `${header}\n没有匹配的启用最终叶子类型`;
}

/** 类型详情的稳定展示行；能力只能使用详情接口最终复验后的值。 */
export function formatTypeInfo(item: TypeNode, hierarchy?: readonly string[]): string {
  const optionalConfig = supportsOptionalConfig(item) ? '支持' : '不支持';
  const label = hierarchy?.join(' / ') || item.nameChain || item.name;
  return `${item.code}\t${label}\t可选配置：${optionalConfig}`;
}
