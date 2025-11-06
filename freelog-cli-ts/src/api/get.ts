import apiClient from "../core/http";
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

// 获取单个资源信息，包含上抛信息，可以包括策略信息
export function getResourceInfo(
  resourceIdOrName: string,
  query?: {
    isLoadPolicyInfo?: 0 | 1;
    isLoadLatestVersionInfo?: 0 | 1;
    isLoadFreezeReason?: 0 | 1;
    projection?: string;
  }
): Promise<ResourceDetailResponse> {
  return apiClient.get(`/v2/resources/${resourceIdOrName}`, { params: query });
}

// 获取多个资源信息，包含上抛信息，可以包括策略信息
export function getResourceInfoList(query: {
  resourceIds?: string;
  resourceNames?: string;
  isLoadPolicyInfo?: 0 | 1;
  isLoadLatestVersionInfo?: 0 | 1;
  isLoadFreezeReason?: 0 | 1;
  projection?: string;
}): Promise<ResourceListResponse> {
  return apiClient.get(`/v2/resources/list`, {
    params: query,
  });
}

// 获取资源的版本信息
export function getResourceVersionInfo(
  resourceId: string,
  version: string,
  query?: {
    projection?: string;
  }
): Promise<ResourceVersionDetailResponse> {
  return apiClient.get(`/v2/resources/${resourceId}/versions/${version}`, {
    params: query,
  });
}

// 获取资源的版本列表
export function getResourceVersionInfoList(
  resourceId: string,
  query?: {
    projection?: string;
  }
): Promise<ResourceVersionListResponse> {
  return apiClient.get(`/v2/resources/${resourceId}/versions`, {
    params: query,
  });
}

// 批量查询资源版本列表
export function getBatchResourceVersionList(
  query: {
    resourceIds?: string;
    versionIds?: string;
    projection?: string;
  }
): Promise<BatchResourceVersionListResponse> {
  return apiClient.get(`/v2/resources/versions/list`, {
    params: query,
  });
}

// 查看资源的依赖树
export function getResourceDependencyTree(
  resourceId: string,
  query?: {
    version?: string;
    maxDeep?: string;
    omitFields?: string;
    isContainRootNode?: boolean;
  }
): Promise<ResourceDependencyTreeResponse> {
  return apiClient.get(`/v2/resources/${resourceId}/dependencyTree`, {
    params: query,
  });
}

// 查看资源的授权树
export function getResourceAuthTree(
  resourceIdOrName: string,
  query?: {
    version?: string;
    versionRange?: string;
  }
): Promise<ResourceAuthTreeResponse> {
  return apiClient.get(`/v2/resources/${resourceIdOrName}/authTree`, {
    params: query,
  });
}

// 查看资源版本草稿
export function getResourceVersionDraft(
  resourceId: string,
  query?: {
    version?: string;
  }
): Promise<ResourceVersionDraftResponse> {
  return apiClient.get(`/v2/resources/${resourceId}/versions/drafts`, {
    params: query,
  });
}

