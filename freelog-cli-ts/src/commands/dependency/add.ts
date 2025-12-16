/**
 * 添加依赖命令
 * 使用通用的依赖添加逻辑
 */

import chalk from "chalk";
import { CommandOptions } from "../../types";
import { requireAuth } from "../../core/auth";
import { confirmAuth } from "../../utils/authConfirm";
import {
  loadVersionConfig,
  saveVersionConfig,
} from "../../services/versionConfigService";
import { loadResourceConfig } from "../../services/resourceConfigService";
import { handleErrorAndExit } from "../../utils/errorHandler";
import type { VersionConfig } from "../../../public/freelog.version";
import {
  addDependency,
  type DependencyConfigOperations,
} from "../../services/dependencyAddService";

/**
 * 执行添加依赖命令
 */
export async function executeAdd(
  resourceIdentifier: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 获取当前项目的 resourceId（用于判断是否可以选择上抛）
    let currentResourceId: string | undefined;
    try {
      const versionConfig = await loadVersionConfig(options.config).catch(() => null);
      if (versionConfig?.resourceId) {
        currentResourceId = versionConfig.resourceId;
      } else {
        const resourceConfig = await loadResourceConfig(options.config).catch(() => null);
        if (resourceConfig?.resourceId) {
          currentResourceId = resourceConfig.resourceId;
        }
      }
    } catch (err) {
      // 忽略错误，继续执行
    }

    // 配置操作接口
    const configOps: DependencyConfigOperations<VersionConfig> = {
      loadConfig: loadVersionConfig,
      saveConfig: saveVersionConfig,
      getCurrentResourceId: (config) => config.resourceId,
      addDependencyToConfig: async (config, dependency) => {
        if (!config.dependencies) {
          config.dependencies = [];
        }
        const existingIndex = config.dependencies.findIndex(
          dep => dep.resourceId === dependency.resourceId
        );
        if (existingIndex >= 0) {
          config.dependencies[existingIndex] = dependency;
        } else {
          config.dependencies.push(dependency);
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
          config.baseUpcastResources.push(upcastResource);
        }
        return config;
      },
    };

    // 调用通用依赖添加逻辑
    const result = await addDependency(resourceIdentifier, options, configOps, 'resource');

    console.log(chalk.green("\n✔️ ") + `依赖添加成功: ${result.resourceInfo.resourceName}`);
    console.log(chalk.blue("ℹ️ ") + `版本范围: ${result.targetVersion}`);
    console.log(
      chalk.gray(
        "\n提示: 请确保完成所有必要的签约和支付，否则依赖资源可能无法使用。"
      )
    );
  } catch (err: any) {
    handleErrorAndExit(err, "执行添加依赖命令失败");
  }
}
