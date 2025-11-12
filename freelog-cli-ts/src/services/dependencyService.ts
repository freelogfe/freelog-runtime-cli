/**
 * 依赖服务
 * 提供依赖管理的通用函数
 */

import type { VersionConfig, Dependency } from '../../public/freelog.version';
import { loadVersionConfig, saveVersionConfig } from './versionConfigService';

/**
 * 添加依赖
 */
export async function addDependency(
  dependency: Dependency,
  configPath?: string
): Promise<VersionConfig> {
  const versionConfig = await loadVersionConfig(configPath);
  
  if (!versionConfig.dependencies) {
    versionConfig.dependencies = [];
  }
  
  // 检查是否已存在
  const existingIndex = versionConfig.dependencies.findIndex(
    (dep) => dep.resourceId === dependency.resourceId
  );
  
  if (existingIndex >= 0) {
    // 更新现有依赖
    versionConfig.dependencies[existingIndex] = dependency;
  } else {
    // 添加新依赖
    versionConfig.dependencies.push(dependency);
  }
  
  await saveVersionConfig(versionConfig, configPath);
  return versionConfig;
}

/**
 * 移除依赖
 */
export async function removeDependency(
  resourceId: string,
  configPath?: string
): Promise<VersionConfig> {
  const versionConfig = await loadVersionConfig(configPath);
  
  if (!versionConfig.dependencies) {
    versionConfig.dependencies = [];
  }
  
  versionConfig.dependencies = versionConfig.dependencies.filter(
    (dep) => dep.resourceId !== resourceId
  );
  
  await saveVersionConfig(versionConfig, configPath);
  return versionConfig;
}

/**
 * 获取所有依赖
 */
export async function getAllDependencies(
  configPath?: string
): Promise<Dependency[]> {
  const versionConfig = await loadVersionConfig(configPath);
  return versionConfig.dependencies || [];
}

/**
 * 获取单个依赖
 */
export async function getDependency(
  resourceId: string,
  configPath?: string
): Promise<Dependency | undefined> {
  const dependencies = await getAllDependencies(configPath);
  return dependencies.find((dep) => dep.resourceId === resourceId);
}

/**
 * 更新依赖版本范围
 */
export async function updateDependencyVersion(
  resourceId: string,
  versionRange: string,
  configPath?: string
): Promise<VersionConfig> {
  const versionConfig = await loadVersionConfig(configPath);
  
  if (!versionConfig.dependencies) {
    throw new Error(`依赖 ${resourceId} 不存在`);
  }
  
  const dependency = versionConfig.dependencies.find(
    (dep) => dep.resourceId === resourceId
  );
  
  if (!dependency) {
    throw new Error(`依赖 ${resourceId} 不存在`);
  }
  
  dependency.versionRange = versionRange;
  
  await saveVersionConfig(versionConfig, configPath);
  return versionConfig;
}

/**
 * 批量更新依赖
 */
export async function batchUpdateDependencies(
  dependencies: Dependency[],
  configPath?: string
): Promise<VersionConfig> {
  const versionConfig = await loadVersionConfig(configPath);
  versionConfig.dependencies = dependencies;
  await saveVersionConfig(versionConfig, configPath);
  return versionConfig;
}

