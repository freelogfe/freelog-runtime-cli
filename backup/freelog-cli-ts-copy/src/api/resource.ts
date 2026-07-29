/**
 * 资源相关 API
 * 包括资源的创建、更新、查询等功能
 */

import { freelogRequest } from "../core/http";
import type { ResourceDetailResponse } from "./types";
import { formatResourceIdOrNameSync } from "../utils/resourceName";

/**
 * 策略信息
 */
export interface PolicyInfo {
  /** 策略名称（必填，数组内唯一） */
  policyName: string;
  /** 策略文本（必填，encodeURIComponent编码） */
  policyText: string;
  /** 策略启用状态（可选，1:启用 0:停用） */
  status?: number;
}

/**
 * 更新策略信息
 */
export interface UpdatePolicyInfo {
  /** 策略ID（必填） */
  policyId: string;
  /** 策略启用状态（必填，1:启用 0:停用） */
  status: number;
}

/**
 * 创建资源请求体
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90.html
 */
export interface CreateResourceBody {
  /** 资源名称（必填），此处无需加上用户名 */
  name: string;
  /** 标的物类型（可选，1:普通资源 4:合集资源，默认是1） */
  subjectType?: number;
  /** 资源标题（可选） */
  resourceTitle?: string;
  /** 资源类型编号（必填），当resourceTypeName不为空时，为父资源类型编号 */
  resourceTypeCode: string;
  /** 资源类型名称（可选） */
  resourceTypeName?: string;
  /** 资源策略信息（可选） */
  policies?: PolicyInfo[];
  /** 资源封面图（可选，最多10张） */
  coverImages?: string[];
  /** 资源简介信息（可选） */
  intro?: string;
  /** 资源标签信息（可选，最多20个） */
  tags?: string[];
}

/**
 * 更新资源请求体
 * @see https://doc.freelog.com/resourceV2/%E6%9B%B4%E6%96%B0%E8%B5%84%E6%BA%90%E4%BF%A1%E6%81%AF.html
 */
export interface UpdateResourceBody {
  /** 资源状态（可选，1:上架 4:下架） */
  status?: number;
  /** 资源简介信息（可选） */
  intro?: string;
  /** 资源标签信息（可选，最多20个） */
  tags?: string[];
  /** 资源封面图（可选，最多10张） */
  coverImages?: string[];
  /** 新增的策略对象集合（可选） */
  addPolicies?: PolicyInfo[];
  /** 更新的策略对象集合（可选） */
  updatePolicies?: UpdatePolicyInfo[];
}

/**
 * 批量创建资源请求体
 */
export interface BatchCreateResourceBody {
  resources: CreateResourceBody[];
}

/**
 * 批量更新资源请求体
 */
export interface BatchUpdateResourceBody {
  resources: Array<{
    resourceId: string;
    status?: number;
    intro?: string;
    tags?: string[];
    coverImages?: string[];
    addPolicies?: PolicyInfo[];
    updatePolicies?: UpdatePolicyInfo[];
  }>;
}

/**
 * 创建资源
 * @param body 创建资源请求体
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90.html
 */
export async function createResource(
  body: CreateResourceBody
): Promise<ResourceDetailResponse> {
  return freelogRequest.post<ResourceDetailResponse>("/v2/resources", body);
}

/**
 * 更新资源信息
 * @param resourceIdOrName 资源ID或资源名
 * @param body 更新资源请求体
 * @see https://doc.freelog.com/resourceV2/%E6%9B%B4%E6%96%B0%E8%B5%84%E6%BA%90%E4%BF%A1%E6%81%AF.html
 */
export async function updateResource(
  resourceIdOrName: string,
  body: UpdateResourceBody
): Promise<ResourceDetailResponse> {
  // 格式化资源名称：如果资源名称不包含 `/`，则添加当前用户名作为前缀
  const formattedResourceIdOrName =
    formatResourceIdOrNameSync(resourceIdOrName);
  let encodedResourceIdOrName = formattedResourceIdOrName;
  // URL 编码资源标识符，处理特殊字符（如 /、空格等）
  // 注意：只编码路径部分，不编码整个 URL
  if (formattedResourceIdOrName.includes("/")) {
    encodedResourceIdOrName = encodeURIComponent(formattedResourceIdOrName);
  }
  return freelogRequest.put<ResourceDetailResponse>(
    `/v2/resources/${encodedResourceIdOrName}`,
    body
  );
}

/**
 * 批量创建资源
 * @param body 批量创建资源请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90.html
 */
export async function batchCreateResources(
  body: BatchCreateResourceBody
): Promise<ResourceDetailResponse[]> {
  return freelogRequest.post<ResourceDetailResponse[]>(
    "/v2/resources/batch",
    body
  );
}

/**
 * 批量更新资源信息
 * @param body 批量更新资源请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9B%B4%E6%96%B0%E8%B5%84%E6%BA%90%E4%BF%A1%E6%81%AF.html
 */
export async function batchUpdateResources(
  body: BatchUpdateResourceBody
): Promise<ResourceDetailResponse[]> {
  return freelogRequest.put<ResourceDetailResponse[]>(
    "/v2/resources/batch",
    body
  );
}
/**
 * 查看单个资源详情
 * 获取资源信息，包含上抛信息，可以包括策略信息
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E5%8D%95%E4%B8%AA%E8%B5%84%E6%BA%90%E8%AF%A6%E6%83%85.html
 */
export async function getResourceInfo(
  resourceIdOrName: string,
  query?: {
    /** 是否加载策略详情信息 0:否(默认) 1:是 */
    isLoadPolicyInfo?: 0 | 1;
    /** 是否加载资源最新版本详情信息 0:否(默认) 1:是 */
    isLoadLatestVersionInfo?: 0 | 1;
    /** 是否加载已被冻结的资源的冻结原因 */
    isLoadFreezeReason?: 0 | 1;
    /** 是否翻译策略信息 0:否(默认) 1:是 */
    isTranslate?: 0 | 1;
    /** 自定义需要返回的字段,多个用逗号分隔 */
    projection?: string;
  }
): Promise<ResourceDetailResponse> {
  // 格式化资源名称：如果资源名称不包含 `/`，则添加当前用户名作为前缀
  const formattedResourceIdOrName =
    formatResourceIdOrNameSync(resourceIdOrName);
  let encodedResourceIdOrName = formattedResourceIdOrName;
  // URL 编码资源标识符，处理特殊字符（如 /、空格等）
  // 注意：只编码路径部分，不编码整个 URL
  if (formattedResourceIdOrName.includes("/")) {
    encodedResourceIdOrName = encodeURIComponent(formattedResourceIdOrName);
  }
  return freelogRequest.get<ResourceDetailResponse>(
    `/v2/resources/${encodedResourceIdOrName}`,
    { params: query }
  );
}

/**
 * 批量查询资源列表
 * 获取多个资源信息，包含上抛信息，可以包括策略信息
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E8%B5%84%E6%BA%90%E5%88%97%E8%A1%A8.html
 */
export async function getResourceInfoList(query: {
  /** 资源ID,多个用逗号分隔 */
  resourceIds?: string;
  /** 资源名称,多个用逗号分隔 */
  resourceNames?: string;
  /** 是否加载策略详情信息 0:否(默认) 1:是 */
  isLoadPolicyInfo?: 0 | 1;
  /** 是否加载资源最新版本详情信息 0:否(默认) 1:是 */
  isLoadLatestVersionInfo?: 0 | 1;
  /** 是否加载已被冻结的资源的冻结原因 */
  isLoadFreezeReason?: 0 | 1;
  /** 自定义需要返回的字段,多个用逗号分隔 */
  projection?: string;
}): Promise<ResourceDetailResponse[]> {
  // 格式化资源名称：如果资源名称不包含 `/`，则添加当前用户名作为前缀
  const formattedQuery = { ...query };
  if (formattedQuery.resourceNames) {
    const names = formattedQuery.resourceNames
      .split(",")
      .map((name) => name.trim());
    const formattedNames = names.map((name) =>
      formatResourceIdOrNameSync(name)
    );
    formattedQuery.resourceNames = formattedNames.join(",");
  }

  return freelogRequest.get<ResourceDetailResponse[]>(`/v2/resources/list`, {
    params: formattedQuery,
  });
}

// ==================== 资源类型相关 ====================

/**
 * 资源类型信息
 */
export interface ResourceTypeInfo {
  /** 资源类型编号 */
  code: string;
  /** 资源类型名称 */
  name: string;
  /** 父类型编号 */
  parentCode: string;
  /** 资源数量 */
  resourceCount?: number;
  /** 权重 */
  priority?: number;
  /** 种类 1：基础资源类型 2：自定义资源类型 */
  category?: number;
  /** 子类型数组 */
  children?: ResourceTypeInfo[];
}

/**
 * 列出资源类型分组排序
 * 获取资源类型列表，按分组排序
 * @param query 查询参数
 * @see https://doc.freelog.com/resourceV2/%E8%B5%84%E6%BA%90%E7%B1%BB%E5%9E%8B%E6%8E%A5%E5%8F%A3%E6%96%87%E6%A1%A3.html
 */
export async function listResourceTypesByGroup(query?: {
  /** 标的物类型 1：资源标的物 2：集合标的物 */
  subjectType?: number[];
  /** 编号或者名称 */
  codeOrName?: string;
  /** 种类 1：基础资源类型 2：自定义资源类型 */
  category?: number;
  /** 排序字段，用逗号分隔 */
  sortOptions?: string;
  /** 状态 1：启用 2：停用 */
  status?: number;
  /** 是否支持批量 1：不支持 2：支持 */
  supportCreateBatch?: number;
}): Promise<ResourceTypeInfo[]> {
  return freelogRequest.get<ResourceTypeInfo[]>(
    "/v2/resources/types/listSimpleByGroup",
    { params: query }
  );
}
