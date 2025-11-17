/**
 * 资源创建相关 API
 */

import { freelogRequest } from "../core/http";
import type { ResourceDetailResponse } from "./responseTypes";

/**
 * 策略信息
 */
export interface PolicyInfo {
  /** 策略名称（必填，数组内唯一） */
  policyName: string;
  /** 策略文本（必填，encodeURIComponent编码） */
  policyText: string;
  /** 策略启用状态（可选，1:上线 0:下线） */
  status?: number;
}

/**
 * 更新策略信息
 */
export interface UpdatePolicyInfo {
  /** 策略ID（必填） */
  policyId: string;
  /** 策略启用状态（必填，1:上线 0:下线） */
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
  /** 资源状态（可选，1:上线 4:下线） */
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
  return freelogRequest.post<ResourceDetailResponse>('/v2/resources', body);
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
  return freelogRequest.put<ResourceDetailResponse>(
    `/v2/resources/${resourceIdOrName}`,
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
  return freelogRequest.post<ResourceDetailResponse[]>('/v2/resources/batch', body);
}

/**
 * 批量更新资源信息
 * @param body 批量更新资源请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9B%B4%E6%96%B0%E8%B5%84%E6%BA%90%E4%BF%A1%E6%81%AF.html
 */
export async function batchUpdateResources(
  body: BatchUpdateResourceBody
): Promise<ResourceDetailResponse[]> {
  return freelogRequest.put<ResourceDetailResponse[]>('/v2/resources/batch', body);
}

