/**
 * 授权相关 API
 */

import { freelogRequest } from "../core/http";

/**
 * 资源授权结果
 */
export interface ResourceAuthResult {
  /** 资源 ID */
  resourceId: string;
  
  /** 资源名称 */
  resourceName: string;
  
  /** 资源版本 */
  version: string;
  
  /** 是否授权 */
  isAuth: boolean;
}

/**
 * 批量查询资源授权结果
 * 
 * @param resourceIds 资源ID，多个用逗号分隔
 * @param versions 资源版本，多个用逗号分隔，需要与资源ID的下标对应（可选）
 * @param versionRanges 资源版本范围，多个用逗号分隔，需要与资源ID的下标对应（可选）
 * @returns 授权结果列表
 * 
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E8%B5%84%E6%BA%90%E6%8E%88%E6%9D%83%E7%BB%93%E6%9E%9C.html
 * 
 * @example
 * // 查询单个资源
 * await batchCheckResourceAuth('61aecd346a6d95003425ac2f');
 * 
 * @example
 * // 查询多个资源的指定版本
 * await batchCheckResourceAuth(
 *   '61aecd346a6d95003425ac2f,62bfda457b7e06004536bd3e',
 *   '0.1.1,1.0.0'
 * );
 * 
 * @example
 * // 查询多个资源的版本范围
 * await batchCheckResourceAuth(
 *   '61aecd346a6d95003425ac2f,62bfda457b7e06004536bd3e',
 *   undefined,
 *   '^0.1.0,^1.0.0'
 * );
 */
export async function batchCheckResourceAuth(
  resourceIds: string,
  versions?: string,
  versionRanges?: string
): Promise<ResourceAuthResult[]> {
  const params: any = { resourceIds };
  
  if (versions) {
    params.versions = versions;
  }
  
  if (versionRanges) {
    params.versionRanges = versionRanges;
  }
  
  return freelogRequest.get<ResourceAuthResult[]>(
    '/v2/auths/resources/batchAuth/results',
    { params }
  );
}

/**
 * 检查单个资源的授权状态
 * 
 * @param resourceId 资源ID
 * @param version 资源版本（可选）
 * @param versionRange 资源版本范围（可选）
 * @returns 授权结果
 */
export async function checkResourceAuth(
  resourceId: string,
  version?: string,
  versionRange?: string
): Promise<ResourceAuthResult> {
  const results = await batchCheckResourceAuth(
    resourceId,
    version,
    versionRange
  );
  
  return results[0];
}

