/**
 * 资源查询相关 API
 */

import { freelogRequest } from "../core/http";
import type {
  ResourceDetailResponse,
  ResourceListResponse,
  ResourceVersionDetailResponse,
  ResourceVersionListResponse,
  BatchResourceVersionListResponse,
  ResourceDependencyTreeResponse,
  ResourceAuthTreeResponse,
  ResourceVersionDraftResponse,
} from "./responseTypes";

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
    /** 自定义需要返回的字段,多个用逗号分隔 */
    projection?: string;
  }
): Promise<ResourceDetailResponse> {
  return freelogRequest.get<ResourceDetailResponse>(
    `/v2/resources/${resourceIdOrName}`,
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
}): Promise<ResourceListResponse> {
  return freelogRequest.get<ResourceListResponse>(`/v2/resources/list`, {
    params: query,
  });
}

/**
 * 查看资源版本信息
 * 获取指定资源的某个版本详细信息
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E4%BF%A1%E6%81%AF.html
 */
export async function getResourceVersionInfo(
  resourceId: string,
  version: string,
  query?: {
    /** 自定义需要返回的字段,多个用逗号分隔 */
    projection?: string;
  }
): Promise<ResourceVersionDetailResponse> {
  return freelogRequest.get<ResourceVersionDetailResponse>(
    `/v2/resources/${resourceId}/versions/${version}`,
    { params: query }
  );
}

/**
 * 查看资源版本列表
 * 获取指定资源的所有版本列表
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E5%88%97%E8%A1%A8.html
 */
export async function getResourceVersionInfoList(
  resourceId: string,
  query?: {
    /** 自定义需要返回的字段,多个用逗号分隔 */
    projection?: string;
  }
): Promise<ResourceVersionListResponse> {
  return freelogRequest.get<ResourceVersionListResponse>(
    `/v2/resources/${resourceId}/versions`,
    { params: query }
  );
}

/**
 * 批量查询资源版本列表
 * 根据资源ID或版本ID批量获取资源版本信息
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E5%88%97%E8%A1%A8.html
 */
export async function getBatchResourceVersionList(
  query: {
    /** 资源ID,多个用逗号分隔 */
    resourceIds?: string;
    /** 版本ID,多个用逗号分隔 */
    versionIds?: string;
    /** 自定义需要返回的字段,多个用逗号分隔 */
    projection?: string;
  }
): Promise<BatchResourceVersionListResponse> {
  return freelogRequest.get<BatchResourceVersionListResponse>(
    `/v2/resources/versions/list`,
    { params: query }
  );
}

/**
 * 查看资源的依赖树
 * 获取资源的完整依赖关系树
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E7%9A%84%E4%BE%9D%E8%B5%96%E6%A0%91.html
 */
export async function getResourceDependencyTree(
  resourceId: string,
  query?: {
    /** 资源版本号 */
    version?: string;
    /** 最大深度 */
    maxDeep?: string;
    /** 忽略的字段,多个用逗号分隔 */
    omitFields?: string;
    /** 是否包含根节点 */
    isContainRootNode?: boolean;
  }
): Promise<ResourceDependencyTreeResponse> {
  return freelogRequest.get<ResourceDependencyTreeResponse>(
    `/v2/resources/${resourceId}/dependencyTree`,
    { params: query }
  );
}

/**
 * 查看资源的授权树
 * 获取资源的授权关系树结构
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E7%9A%84%E6%8E%88%E6%9D%83%E6%A0%91.html
 */
export async function getResourceAuthTree(
  resourceIdOrName: string,
  query?: {
    /** 资源版本号 */
    version?: string;
    /** 版本范围 */
    versionRange?: string;
  }
): Promise<ResourceAuthTreeResponse> {
  return freelogRequest.get<ResourceAuthTreeResponse>(
    `/v2/resources/${resourceIdOrName}/authTree`,
    { params: query }
  );
}

/**
 * 查看资源版本草稿
 * 获取资源的版本草稿信息
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E8%8D%89%E7%A8%BF.html
 */
export async function getResourceVersionDraft(
  resourceId: string,
  query?: {
    /** 资源版本号 */
    version?: string;
  }
): Promise<ResourceVersionDraftResponse> {
  return freelogRequest.get<ResourceVersionDraftResponse>(
    `/v2/resources/${resourceId}/versions/drafts`,
    { params: query }
  );
}

