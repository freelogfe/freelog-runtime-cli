/**
 * offline 命令
 * 下架资源（支持普通资源和合集资源）
 */

import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";
import { CommandOptions } from "../types";
import { requireAuth } from "../core/auth";
import { confirmAuth } from "../utils/authConfirm";
import {
  loadResourceConfig,
  saveResourceConfig,
  responseToResourceConfig,
} from "../services/resourceConfigService";
import {
  loadCollectionConfig,
  saveCollectionConfig,
  responseToCollectionConfig,
} from "../services/collectionConfigService";
import { updateResource, getResourceInfo } from "../api/resource";
import { handleErrorAndExit } from "../utils/errorHandler";
import fs from "fs-extra";
import path from "path";

/**
 * 检查配置文件是否存在
 */
function checkConfigFiles(): {
  hasResourceConfig: boolean;
  hasCollectionConfig: boolean;
} {
  const resourceConfigs = [
    "freelog.resource.config.ts",
    "freelog.resource.config.js",
  ];

  const collectionConfigs = [
    "freelog.collection.config.ts",
    "freelog.collection.config.js",
  ];

  let hasResourceConfig = false;
  let hasCollectionConfig = false;

  for (const file of resourceConfigs) {
    if (fs.existsSync(path.join(process.cwd(), file))) {
      hasResourceConfig = true;
      break;
    }
  }

  for (const file of collectionConfigs) {
    if (fs.existsSync(path.join(process.cwd(), file))) {
      hasCollectionConfig = true;
      break;
    }
  }

  return { hasResourceConfig, hasCollectionConfig };
}

/**
 * 执行 offline 命令
 */
export async function executeOffline(
  resourceIdOrName?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan("\n=== 下架资源 ===\n"));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    let resourceId: string | undefined = resourceIdOrName;

    // 2. 如果没有提供资源ID，尝试从配置文件读取
    if (!resourceId) {
      const configFiles = checkConfigFiles();

      if (configFiles.hasResourceConfig || configFiles.hasCollectionConfig) {
        console.log(chalk.blue("ℹ️  检测到配置文件"));

        // 优先使用 resource.config
        if (configFiles.hasResourceConfig) {
          try {
            const resourceConfig = await loadResourceConfig(options.config);
            if (resourceConfig.resourceId) {
              const { confirmUseConfig } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "confirmUseConfig",
                  message: `是否下架配置文件中的资源: ${chalk.cyan(
                    resourceConfig.resourceName || resourceConfig.resourceId
                  )} (ID: ${resourceConfig.resourceId})?`,
                  default: true,
                },
              ]);

              if (confirmUseConfig) {
                resourceId = resourceConfig.resourceId;
              } else {
                console.log(chalk.blue("ℹ️  操作已取消"));
                return;
              }
            }
          } catch (err: any) {
            console.log(chalk.yellow(`⚠️  加载资源配置失败: ${err.message}`));
          }
        }

        // 如果没有 resource.config 或没有 resourceId，尝试 collection.config
        if (!resourceId && configFiles.hasCollectionConfig) {
          try {
            const collectionConfig = await loadCollectionConfig(options.config);
            if (collectionConfig.resourceId) {
              const { confirmUseConfig } = await inquirer.prompt([
                {
                  type: "confirm",
                  name: "confirmUseConfig",
                  message: `是否下架配置文件中的合集资源: ${chalk.cyan(
                    collectionConfig.resourceName || collectionConfig.resourceId
                  )} (ID: ${collectionConfig.resourceId})?`,
                  default: true,
                },
              ]);

              if (confirmUseConfig) {
                resourceId = collectionConfig.resourceId;
              } else {
                console.log(chalk.blue("ℹ️  操作已取消"));
                return;
              }
            }
          } catch (err: any) {
            console.log(chalk.yellow(`⚠️  加载合集配置失败: ${err.message}`));
          }
        }

        if (!resourceId) {
          console.log(chalk.red("\n❌ 配置文件中未设置 resourceId"));
          console.log(chalk.yellow("\n💡 请使用以下方式之一:"));
          console.log(chalk.cyan("  1. 在配置文件中设置 resourceId"));
          console.log(
            chalk.cyan("  2. 使用命令参数: freelog-cli2 offline <resourceId>")
          );
          throw new Error("未指定资源 ID");
        }
      } else {
        console.log(chalk.red("\n❌ 未找到配置文件，也未提供资源ID"));
        console.log(chalk.yellow("\n💡 请使用以下方式之一:"));
        console.log(chalk.cyan("  1. 在配置文件中设置 resourceId"));
        console.log(
          chalk.cyan("  2. 使用命令参数: freelog-cli2 offline <resourceId>")
        );
        throw new Error("未指定资源 ID");
      }
    }

    // 3. 获取资源信息
    const fetchSpinner = ora("正在获取资源信息...").start();
    let resourceInfo;
    try {
      resourceInfo = await getResourceInfo(resourceId, {
        isLoadLatestVersionInfo: 0,
      });
      fetchSpinner.succeed("资源信息获取成功");
    } catch (err: any) {
      fetchSpinner.fail("获取资源信息失败");
      throw err;
    }
    resourceId = resourceInfo.resourceId;
    // 4. 显示资源信息
    console.log(chalk.blue("\nℹ️  资源信息:"));
    console.log(`  资源名称: ${chalk.cyan(resourceInfo.resourceName)}`);
    console.log(`  资源ID: ${chalk.cyan(resourceInfo.resourceId)}`);
    console.log(
      `  当前状态: ${chalk.cyan(
        resourceInfo.status === 1
          ? "上架"
          : resourceInfo.status === 4
          ? "下架"
          : `状态${resourceInfo.status}`
      )}`
    );

    if (resourceInfo.status === 4) {
      console.log(chalk.yellow("\n⚠️  资源已经处于下架状态"));
      const { confirmContinue } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmContinue",
          message: "是否继续下架操作?",
          default: false,
        },
      ]);

      if (!confirmContinue) {
        console.log(chalk.blue("ℹ️  操作已取消"));
        return;
      }
    }

    // 5. 确认下架
    const { confirmOffline } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmOffline",
        message: "确认下架此资源?",
        default: true,
      },
    ]);

    if (!confirmOffline) {
      console.log(chalk.blue("ℹ️  操作已取消"));
      return;
    }

    // 6. 更新资源状态
    const updateSpinner = ora("正在下架资源...").start();
    try {
      const result = await updateResource(resourceId, {
        status: 4, // 下架
      });
      updateSpinner.succeed("资源下架成功");

      // 7. 更新配置文件（如果存在）
      const configFiles = checkConfigFiles();

      if (configFiles.hasResourceConfig) {
        try {
          const resourceConfig = await loadResourceConfig(options.config);
          if (resourceConfig.resourceId === resourceId) {
            const updatedConfig = responseToResourceConfig(result);
            resourceConfig.status = updatedConfig.status;
            await saveResourceConfig(resourceConfig, options.config);
            console.log(chalk.green("✔ 资源配置文件已更新"));
          }
        } catch (err: any) {
          // 忽略配置文件更新错误
        }
      }

      if (configFiles.hasCollectionConfig) {
        try {
          const collectionConfig = await loadCollectionConfig(options.config);
          if (collectionConfig.resourceId === resourceId) {
            const updatedConfig = responseToCollectionConfig(result);
            collectionConfig.status = updatedConfig.status;
            await saveCollectionConfig(collectionConfig, options.config);
            console.log(chalk.green("✔ 合集配置文件已更新"));
          }
        } catch (err: any) {
          // 忽略配置文件更新错误
        }
      }

      // 8. 显示结果
      console.log(chalk.green("\n✔ ") + "资源下架完成");
      console.log(chalk.blue("ℹ️  资源 ID: ") + chalk.cyan(result.resourceId));
      console.log(
        chalk.blue("ℹ️  资源名称: ") + chalk.cyan(result.resourceName)
      );
      console.log(chalk.blue("ℹ️  资源状态: ") + chalk.cyan("下架"));
    } catch (err: any) {
      updateSpinner.fail("下架资源失败");
      throw err;
    }
  } catch (err: any) {
    handleErrorAndExit(err, "下架资源失败", options.debug);
  }
}
