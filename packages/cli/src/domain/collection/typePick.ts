/** 合集专用类型选择；不复用单资源选择器，固定只接受 subjectType=4。 */

import { CliError } from '../../core/errors';
import { askInput, selectQuestion } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';

export type CollectionTypeNode = {
  code: string;
  name: string;
  isTerminate?: boolean;
  status?: number;
  subjectType?: number | string | Array<number | string>;
  children?: CollectionTypeNode[];
  attrs?: unknown;
  resourceConfig?: {
    supportOptionalConfig?: number | string;
  };
};

export type ResolvedCollectionType = CollectionTypeNode & { pathLabel: string };

export type CollectionTypeApis = {
  resourceTypes?: (params: Record<string, unknown>) => Promise<unknown>;
  searchLeaves?: (params: Record<string, unknown>) => Promise<unknown>;
  getByCode?: (params: { code: string }) => Promise<unknown>;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function responseError(): CliError {
  return new CliError('平台合集类型查询失败或响应不完整，请核对后重试', 'COLLECTION_TYPE_RESPONSE_INVALID');
}

async function readType(request: () => Promise<unknown>): Promise<unknown> {
  try { return await request(); } catch { throw responseError(); }
}

function data(result: unknown): unknown {
  if (!record(result) || result.ret !== 0 || result.errCode !== 0 || !Object.hasOwn(result, 'data')) throw responseError();
  return result.data;
}

function unwrapList(result: unknown): CollectionTypeNode[] {
  const list = data(result);
  if (!Array.isArray(list) || list.some((node) => !record(node) || typeof node.code !== 'string' || !node.code.trim())) throw responseError();
  return list as CollectionTypeNode[];
}

function unwrapOne(result: unknown): CollectionTypeNode | undefined {
  const info = data(result);
  if (info === null) return undefined;
  if (!record(info)) throw responseError();
  return info as CollectionTypeNode;
}

/** 树是路径的唯一依据；失败、缺层或重复code不能退化成可选择的候选。 */
function assertTree(nodes: unknown, seen = new Set<string>()): asserts nodes is CollectionTypeNode[] {
  if (!Array.isArray(nodes)) throw responseError();
  for (const node of nodes) {
    if (!record(node) || typeof node.code !== 'string' || !node.code.trim()
      || typeof node.name !== 'string' || !node.name.trim() || seen.has(node.code)) throw responseError();
    seen.add(node.code);
    if (node.children !== undefined) assertTree(node.children, seen);
  }
}

function supportsCollection(subjectType: CollectionTypeNode['subjectType']): boolean {
  const values = Array.isArray(subjectType) ? subjectType : [subjectType];
  return values.some((value) => value === 4 || value === '4');
}

function hasChildren(node: CollectionTypeNode): node is CollectionTypeNode & { children: CollectionTypeNode[] } {
  return Array.isArray(node.children) && node.children.length > 0;
}

function candidateLeaf(node: CollectionTypeNode): boolean {
  return node.status === 1 && supportsCollection(node.subjectType)
    && !hasChildren(node) && (node.isTerminate === true || node.isTerminate === undefined);
}

function isLeaf(node: CollectionTypeNode): boolean {
  return node.status === 1 && node.isTerminate === true && supportsCollection(node.subjectType);
}

async function tree(apis: CollectionTypeApis): Promise<CollectionTypeNode[]> {
  assertPlatformAllowed();
  const request = apis.resourceTypes ?? ((params) => FServiceAPI.Resource.resourceTypes(params));
  const nodes = unwrapList(await readType(() => request({ category: 1, status: 1, subjectType: 4 })));
  assertTree(nodes);
  return nodes;
}

function findPath(
  nodes: readonly CollectionTypeNode[],
  code: string,
  ancestors: readonly CollectionTypeNode[] = [],
): CollectionTypeNode[] | undefined {
  for (const node of nodes) {
    const next = [...ancestors, node];
    if (node.code === code) return next;
    if (hasChildren(node)) {
      const found = findPath(node.children, code, next);
      if (found) return found;
    }
  }
  return undefined;
}

/** 直接 code 的最终复验：详情与同一次 subjectType=4 树都必须认可。 */
export async function getCollectionTypeInfo(code: string, apis: CollectionTypeApis = {}): Promise<ResolvedCollectionType> {
  const normalized = code.trim();
  if (!normalized) throw new CliError('请提供合集类型编号', 'COLLECTION_TYPE_REQUIRED');
  assertPlatformAllowed();
  const request = apis.getByCode ?? ((params) => FServiceAPI.Resource.getResourceTypeInfoByCode(params));
  const [nodes, raw] = await Promise.all([tree(apis), readType(() => request({ code: normalized }))]);
  const info = unwrapOne(raw);
  if (!info?.code || info.code !== normalized) {
    throw new CliError(`找不到合集类型 ${normalized}`, 'COLLECTION_TYPE_NOT_FOUND');
  }
  const path = findPath(nodes, normalized);
  if (!isLeaf(info) || !path || !candidateLeaf(path[path.length - 1]!)) {
    throw new CliError('必须是启用中的合集最终叶子类型', 'COLLECTION_TYPE_NOT_LEAF');
  }
  return { ...info, pathLabel: label(path) };
}

function label(path: readonly CollectionTypeNode[]): string {
  const names = path.map((node) => node.name?.trim());
  if (names.some((name) => !name)) throw new CliError('平台合集类型链缺少名称', 'COLLECTION_TYPE_HIERARCHY');
  return names.join(' / ');
}

async function searchCollectionLeaves(keyword: string, apis: CollectionTypeApis): Promise<Array<{ code: string; label: string }>> {
  assertPlatformAllowed();
  const request = apis.searchLeaves ?? ((params) => FServiceAPI.Resource.ListSimpleByParentCode(params));
  const [nodes, response] = await Promise.all([
    tree(apis),
    readType(() => request({ category: 1, nameChain: keyword, isTerminate: true, status: 1, subjectType: 4 })),
  ]);
  const seen = new Set<string>();
  return unwrapList(response).flatMap((item) => {
    if (!item.code || seen.has(item.code)) return [];
    seen.add(item.code);
    const path = findPath(nodes, item.code);
    if (!path || !candidateLeaf(path[path.length - 1]!)) return [];
    return [{ code: item.code, label: label(path) }];
  });
}

/** TTY 提供分层、搜索、精确 code 三种路径，最终都回到详情接口复验。 */
export async function chooseCollectionLeafType(apis: CollectionTypeApis = {}): Promise<ResolvedCollectionType> {
  const frames: Array<{ nodes: CollectionTypeNode[]; path: string[] }> = [{ nodes: await tree(apis), path: [] }];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    const action = await selectQuestion(`选择合集类型${frame.path.length ? `（${frame.path.join(' / ')}）` : ''}`, [
      ...frame.nodes.map((node) => ({ name: `${[...frame.path, node.name].join(' / ')} (${node.code})`, value: `node:${node.code}` })),
      { name: '搜索合集类型', value: '__search__' },
      { name: '直接输入类型编号', value: '__code__' },
      ...(frames.length > 1 ? [{ name: '返回上一级', value: '__back__' }] : []),
      { name: '取消', value: '__cancel__' },
    ]);
    if (action === '__cancel__') throw new CliError('已取消合集类型选择', 'COLLECTION_TYPE_CANCELLED');
    if (action === '__back__') { frames.pop(); continue; }
    if (action === '__code__') return getCollectionTypeInfo(await askInput('输入合集最终叶子类型编号'), apis);
    if (action === '__search__') {
      const found = await searchCollectionLeaves(await askInput('搜索合集类型'), apis);
      if (found.length === 0) throw new CliError('没有匹配的启用合集最终叶子类型', 'COLLECTION_TYPE_NOT_FOUND');
      const code = await selectQuestion('选择搜索结果', found.map((item) => ({ name: `${item.label} (${item.code})`, value: item.code })));
      return getCollectionTypeInfo(code, apis);
    }
    const node = frame.nodes.find((item) => `node:${item.code}` === action);
    if (!node) throw new CliError('合集类型选择无效', 'COLLECTION_TYPE_INVALID');
    if (candidateLeaf(node)) return getCollectionTypeInfo(node.code, apis);
    if (!hasChildren(node)) throw new CliError('该类型不是可用的合集最终叶子', 'COLLECTION_TYPE_NOT_LEAF');
    frames.push({ nodes: node.children, path: [...frame.path, node.name] });
  }
  throw new CliError('已取消合集类型选择', 'COLLECTION_TYPE_CANCELLED');
}
