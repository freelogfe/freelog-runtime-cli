/**
 * collection dep add 命令
 * 为合集添加依赖（需要完整的签约支付流程，包括主资源和上抛资源）
 */

import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { loadCollectionConfig, saveCollectionConfig } from '../../../services/collectionConfigService';
import { handleErrorAndExit } from '../../../utils/errorHandler';
import type { CollectionConfig } from '../../../../public/freelog.collection';
import type { Dependency } from '../../../../public/freelog.version';
import {
  addDependency,
  type DependencyConfigOperations,
} from '../../../services/dependencyAddService';


/**
 * 执行 collection dep add 命令
 */
export async function executeCollectionDepAdd(
  resourceIdOrName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    // 配置操作接口
    const configOps: DependencyConfigOperations<CollectionConfig> = {
      loadConfig: loadCollectionConfig,
      saveConfig: saveCollectionConfig,
      getCurrentResourceId: (config) => config.resourceId,
      addDependencyToConfig: async (config, dependency) => {
        if (!config.dependencies) {
          config.dependencies = [];
        }
        const existingIndex = config.dependencies.findIndex(
          dep => dep.resourceId === dependency.resourceId
        );
        const depConfig: Dependency = {
          resourceId: dependency.resourceId,
          resourceName: dependency.resourceName,
          versionRange: dependency.versionRange,
        };
        if (existingIndex >= 0) {
          config.dependencies[existingIndex] = depConfig;
        } else {
          config.dependencies.push(depConfig);
        }
        return config;
      },
      dependencyExists: async (config, resourceId) => {
        const existing = config.dependencies?.find(dep => dep.resourceId === resourceId);
        return {
          exists: !!existing,
          dependency: existing,
        };
      },
      addUpcastResource: async (config, upcastResource) => {
        if (!config.baseUpcastResources) {
          config.baseUpcastResources = [];
        }
        const exists = config.baseUpcastResources.some(
          upcast => upcast.resourceId === upcastResource.resourceId
        );
        if (!exists) {
          config.baseUpcastResources.push({
            resourceId: upcastResource.resourceId,
            resourceName: upcastResource.resourceName,
          });
        }
        return config;
      },
    };

    // 调用通用依赖添加逻辑（这会处理完整的签约和支付流程，包括主资源和上抛资源）
    // addDependency 内部已经输出了成功信息和授权状态，这里不需要再次输出
    await addDependency(resourceIdOrName, options, configOps, 'collection');

  } catch (err: any) {
    handleErrorAndExit(err, '添加合集依赖失败', options.debug);
  }
}

