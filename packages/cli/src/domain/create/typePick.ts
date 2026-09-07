/** 平台资源类型树查询：type list/search/info/pick，帮人拿到叶子 typeCode。 */

import { CliError } from '../../core/errors';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';

export type TypeNode = {
  code: string;
  name: string;
  nameChain?: string;
  isTerminate?: boolean;
  status?: number;
  children?: TypeNode[];
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
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as TypeNode;
  }
  return undefined;
}

function flattenLeaves(nodes: readonly TypeNode[], acc: TypeNode[] = []): TypeNode[] {
  for (const node of nodes) {
    if (node.children?.length) {
      flattenLeaves(node.children, acc);
    } else if (node.isTerminate !== false && node.status !== 0) {
      acc.push(node);
    }
  }
  return acc;
}

/** 全量叶子类型（递归拉类型树后展平，只留启用的 isTerminate 节点）。 */
export async function listLeafTypes(apis: TypeApis = {}): Promise<TypeNode[]> {
  assertPlatformAllowed();
  const request = apis.resourceTypes ?? ((params) => FServiceAPI.Resource.resourceTypes(params));
  const result = await request({ category: 1, status: 1, subjectType: 1 });
  return flattenLeaves(unwrapList(result));
}

/** 按名称链关键字搜叶子类型（用于 create 交互选择）。 */
export async function searchLeafTypes(keyword: string, apis: TypeApis = {}): Promise<TypeNode[]> {
  assertPlatformAllowed();
  const request =
    apis.searchLeaves ?? ((params) => FServiceAPI.Resource.ListSimpleByParentCode(params));
  const result = await request({
    nameChain: keyword,
    isTerminate: true,
    status: 1,
    subjectType: 1,
  });
  return unwrapList(result).filter((item) => item.isTerminate !== false && item.status !== 0);
}

/** 按编码取单个类型；不存在或不是启用叶子都报错（create/bind 的类型校验）。 */
export async function getTypeInfo(code: string, apis: TypeApis = {}): Promise<TypeNode> {
  assertPlatformAllowed();
  const request =
    apis.getByCode ?? ((params) => FServiceAPI.Resource.getResourceTypeInfoByCode(params));
  const info = unwrapOne(await request({ code }));
  if (!info?.code) {
    // i18n: cli.type.not_found
    throw new CliError(`找不到类型 ${code}`, 'TYPE_NOT_FOUND');
  }
  if (info.isTerminate === false || info.status === 0) {
    // i18n: cli.type.not_leaf
    throw new CliError('必须是启用中的叶子类型', 'TYPE_NOT_LEAF');
  }
  return info;
}

/** 类型列表行文本（code + 名称链，tab 分隔）。 */
export function formatTypeList(items: readonly TypeNode[]): string {
  return items
    .map((item) => `${item.code}\t${item.nameChain ?? item.name}`)
    .join('\n');
}
