/**
 * 资源操作服务
 * 统一处理单独资源和批量资源的资源操作
 */

import type { ResourceConfig } from '../../public/freelog.resource';
import type { VersionConfig } from '../../public/freelog.version';
import type { UpdateResourceBody } from '../api/resource';
import { getResourceInfo } from '../api/resource';
import { getResourceVersionInfo } from '../api/version';
import { updateResource } from '../api/resource';
import {
  calculatePolicyChanges,
  resourceConfigToUpdateBody,
  responseToResourceConfig,
} from './resourceConfigService';
import {
  responseToVersionConfig,
} from './versionConfigService';
import {
  getPolicyChanges,
  buildPolicyUpdateBody,
} from './policyService';

/**
 * 更新资源信息的选项
 */
export interface UpdateResourceInfoOptions {
  /** 资源状态 */
  status?: number;
  /** 资源介绍 */
  intro?: string;
  /** 封面图列表 */
  coverImages?: string[];
  /** 标签列表 */
  tags?: string[];
}

/**
 * 更新资源信息
 * @param resourceId 资源ID
 * @param resourceConfig 资源配置
 * @param options 更新选项
 * @returns 更新后的资源信息
 */
export async function updateResourceInfo(
  resourceId: string,
  resourceConfig: ResourceConfig,
  options: UpdateResourceInfoOptions = {}
): Promise<ResourceConfig> {
  // 1. 获取服务器上的资源信息（用于比对策略）
  const remoteResourceInfo = await getResourceInfo(resourceId, {
    isLoadLatestVersionInfo: 0,
  });

  // 2. 更新本地配置（只更新要提交的字段）
  if (options.status !== undefined) {
    resourceConfig.status = options.status;
  }
  if (options.intro !== undefined) {
    resourceConfig.intro = options.intro;
  }
  if (options.coverImages !== undefined) {
    resourceConfig.coverImages = options.coverImages;
  }
  if (options.tags !== undefined) {
    resourceConfig.tags = options.tags;
  }

  // 3. 计算策略差异（比对本地配置和服务器策略）
  const remotePolicies = remoteResourceInfo.policies || [];
  const policyChanges = getPolicyChanges(
    resourceConfig.policies,
    remotePolicies
  );

  // 4. 构建更新请求体
  const updateBody = buildPolicyUpdateBody(resourceConfig, policyChanges);

  // 5. 调用 API 更新资源
  const result = await updateResource(resourceId, updateBody);

  // 6. 返回更新后的资源配置
  return responseToResourceConfig(result);
}

/**
 * 同步资源信息
 * @param resourceId 资源ID
 * @param mode 同步模式：'cover'（覆盖）或 'append'（追加）
 * @returns 同步后的资源配置
 */
export async function syncResourceInfo(
  resourceId: string,
  mode: 'cover' | 'append' = 'cover'
): Promise<ResourceConfig> {
  // 获取服务器上的资源信息
  const resourceInfo = await getResourceInfo(resourceId, {
    isLoadLatestVersionInfo: 0,
  });

  // 转换为资源配置
  return responseToResourceConfig(resourceInfo);
}

/**
 * 同步版本信息
 * @param resourceId 资源ID
 * @param version 版本号（'latest' 或具体版本号）
 * @param mode 同步模式：'cover'（覆盖）或 'append'（追加）
 * @returns 同步后的版本配置
 */
export async function syncVersionInfo(
  resourceId: string,
  version: string = 'latest',
  mode: 'cover' | 'append' = 'cover'
): Promise<VersionConfig> {
  // 获取版本信息
  let versionInfo;
  if (version === 'latest') {
    const resourceInfo = await getResourceInfo(resourceId, {
      isLoadLatestVersionInfo: 1,
    });
    if (!resourceInfo.latestVersion) {
      throw new Error('资源没有最新版本');
    }
    versionInfo = resourceInfo.latestVersion;
  } else {
    versionInfo = await getResourceVersionInfo(resourceId, version);
  }

  // 转换为版本配置
  return responseToVersionConfig(versionInfo, resourceId);
}

/**
 * 设置资源状态
 * @param resourceId 资源ID
 * @param status 资源状态（1: 上线, 4: 下线）
 * @returns 更新后的资源信息
 */
export async function setResourceStatus(
  resourceId: string,
  status: number
): Promise<ResourceConfig> {
  // 更新资源状态
  const result = await updateResource(resourceId, { status });

  // 返回更新后的资源配置
  return responseToResourceConfig(result);
}

/**
 * 更新版本信息
 * @param resourceId 资源ID
 * @param versionConfig 版本配置
 * @param options 更新选项
 * @returns 更新后的版本配置
 */
export async function updateVersionInfo(
  resourceId: string,
  versionConfig: VersionConfig,
  options: {
    version?: string;
    description?: string;
    filePath?: string;
  } = {}
): Promise<VersionConfig> {
  // 更新版本配置
  if (options.version !== undefined) {
    versionConfig.version = options.version;
  }
  if (options.description !== undefined) {
    versionConfig.description = options.description;
  }
  if (options.filePath !== undefined) {
    versionConfig.filePath = options.filePath;
  }

  // 注意：版本信息的更新通常通过发布新版本来实现
  // 这里只是更新本地配置，实际的版本更新需要通过 publish 命令
  return versionConfig;
}

