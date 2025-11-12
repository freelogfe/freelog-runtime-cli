/**
 * 资源创建相关 API
 */

import { freelogRequest } from "../core/http";
import type { ResourceDetailResponse } from "./responseTypes";

/**
 * 创建资源请求体
 */
export interface CreateResourceBody {
  /** 资源名称 */
  resourceName: string;
  /** 资源类型 */
  resourceType: string[];
  /** 资源介绍 */
  intro?: string;
  /** 封面图 */
  coverImages?: string[];
}

/**
 * 更新资源请求体
 */
export interface UpdateResourceBody {
  /** 资源介绍 */
  intro?: string;
  /** 封面图 */
  coverImages?: string[];
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
    intro?: string;
    coverImages?: string[];
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

