import apiClient from "./http";

export function getResourceData(
  resourceId: string,
  query?: {
    isLoadPolicyInfo: 0 | 1;
    isLoadLatestVersionInfo: 0 | 1;
    isLoadFreezeReason: 0 | 1;
    projection: any;
  }
) {
  return apiClient.get(`/v2/resources/${resourceId}`, { params: query });
}

export function getResourceVersionData(
  resourceId: string,
  version: string,
  query?: {
    projection: any;
  }
) {
  return apiClient.get(`/v2/resources/${resourceId}/versions/${version}`, { params: query });
}

export function getResourceVersionList(
  resourceId: string,
  query?: {
    projection: any;
  }
) {
  return apiClient.get(`/v2/resources/${resourceId}/versions`, { params: query });
}

 