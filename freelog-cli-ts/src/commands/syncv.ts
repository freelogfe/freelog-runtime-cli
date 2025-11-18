/**
 * 同步版本信息命令
 * 从服务器获取版本信息，并同步到本地配置文件
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../core/auth';
import { CommandOptions } from '../types';
import {
  loadResourceConfig,
} from '../services/resourceConfigService';
import {
  loadVersionConfig,
  saveVersionConfig,
  responseToVersionConfig,
} from '../services/versionConfigService';
import type { VersionConfig } from '../../public/freelog.version';
import { checkConfigsExist } from '../services/configService';
import { getResourceInfo, getResourceVersionInfo } from '../api/resourceGet';
import { handleErrorAndExit } from '../utils/errorHandler';

/**
 * 执行同步版本信息命令
 */
export async function executeSyncv(
  resourceIdOrName?: string,
  options: CommandOptions = {}
): Promise<void> {
  const version = options.version as string | undefined;

  try {
    // 1. 检查登录
    const auth = requireAuth();
    console.log(chalk.cyan('\n=== 同步版本信息 ===\n'));
    console.log(chalk.blue('ℹ ') + `登录用户: ${auth.username || auth.userId || '未知'}`);

    // 2. 检查配置文件是否存在
    const configExists = checkConfigsExist();

    // 3. 确定资源 ID
    let targetResourceId: string | undefined;

    if (resourceIdOrName) {
      // 使用命令行传入的资源 ID 或名称
      targetResourceId = resourceIdOrName;
      console.log(chalk.blue('ℹ ') + `目标资源: ${targetResourceId}`);
    } else {
      // 从配置文件中读取资源 ID
      if (!configExists.resource) {
        console.log(chalk.red('\n❌ 找不到资源配置文件'));
        console.log(chalk.yellow('\n💡 请使用以下命令格式指定资源:'));
        console.log(chalk.cyan('  freelog-cli syncv <resourceIdOrName> [-v version]'));
        process.exit(1);
      }

      const spinner = ora('正在加载资源配置...').start();
      try {
        const resourceConfig = await loadResourceConfig(options.config);
        spinner.succeed('资源配置加载成功');

        if (!resourceConfig.resourceId) {
          spinner.fail('资源配置中缺少 resourceId');
          console.log(chalk.red('\n❌ 资源配置文件中没有 resourceId'));
          console.log(chalk.yellow('\n💡 请先执行 freelog-cli create 创建资源'));
          process.exit(1);
        }

        targetResourceId = resourceConfig.resourceId;
        console.log(chalk.blue('ℹ ') + `本地资源 ID: ${resourceConfig.resourceId}`);
      } catch (error: any) {
        spinner.fail('加载资源配置失败');
        throw error;
      }
    }

    // 4. 验证 resourceId
    if (!targetResourceId) {
      console.log(chalk.red('\n❌ 未指定资源ID'));
      process.exit(1);
    }

    // 5. 确定要同步的版本
    let targetVersion: string;

    if (version === 'latest' || !version) {
      targetVersion = 'latest';
    } else {
      targetVersion = version;
    }

    // 如果没有指定版本，且存在版本配置，使用配置中的版本
    if (!version && configExists.version) {
      try {
        const versionConfig = await loadVersionConfig(options.config);
        if (versionConfig.version) {
          const { useLocalVersion } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'useLocalVersion',
              message: `使用本地配置的版本 ${versionConfig.version}？（否则使用最新版本）`,
              default: true,
            },
          ]);

          if (useLocalVersion) {
            targetVersion = versionConfig.version;
          }
        }
      } catch {
        // 忽略错误，使用 latest
      }
    }

    console.log(chalk.blue('ℹ ') + `目标版本: ${targetVersion}`);

    // 6. 获取版本信息
    const versionSpinner = ora('正在获取版本信息...').start();
    try {
      let versionInfo;

      if (targetVersion === 'latest') {
        // 获取最新版本信息
        const resourceInfo = await getResourceInfo(targetResourceId, {
          isLoadLatestVersionInfo: 1,
        });

        if (!resourceInfo.latestVersionInfo) {
          versionSpinner.fail('该资源尚无版本');
          console.log(chalk.yellow('\n⚠️  该资源还没有发布任何版本'));
          console.log(chalk.blue('ℹ️  请先执行 freelog-cli publish 发布版本'));
          return;
        }

        versionInfo = resourceInfo.latestVersionInfo;
      } else {
        // 获取指定版本信息
        versionInfo = await getResourceVersionInfo(targetResourceId, targetVersion);
      }

      versionSpinner.succeed('版本信息获取成功');

      // 转换并保存版本配置（保留原配置中的本地字段）
      let existingConfig: VersionConfig | undefined;
      try {
        existingConfig = await loadVersionConfig(options.config);
      } catch {
        // 如果配置文件不存在，忽略错误
      }

      // 确定资源信息的来源：优先使用 existingConfig，如果没有则从 resource.config 获取
      // syncv 时，如果 version.config 中有资源信息，优先使用它；否则从 resource.config 获取
      let resourceConfig: { resourceId?: string; resourceName?: string; resourceType?: string[] } | undefined;
      
      // 如果 existingConfig 中没有资源信息，尝试从 resource.config 获取
      if (!existingConfig?.resourceId || !existingConfig?.resourceName || !existingConfig?.resourceType) {
        if (configExists.resource) {
          try {
            const loadedResourceConfig = await loadResourceConfig(options.config);
            resourceConfig = {
              resourceId: loadedResourceConfig.resourceId,
              resourceName: loadedResourceConfig.resourceName,
              resourceType: loadedResourceConfig.resourceType,
            };
          } catch {
            // 如果加载失败，忽略错误，使用服务器响应中的资源信息
          }
        }
      } else {
        // 如果 existingConfig 中有资源信息，使用它
        resourceConfig = {
          resourceId: existingConfig.resourceId,
          resourceName: existingConfig.resourceName,
          resourceType: [existingConfig.resourceType],
        };
      }

      // 显示版本信息
      console.log(chalk.blue('\n📌 版本信息:'));
      console.log(`  版本号: ${chalk.cyan(versionInfo.version)}`);
      if (existingConfig?.filename) {
        console.log(`  文件名: ${chalk.cyan(existingConfig.filename)}`);
      }
      console.log(`  SHA1: ${chalk.gray(versionInfo.fileSha1)}`);
      if (versionInfo.description) {
        console.log(`  描述: ${chalk.gray(versionInfo.description.substring(0, 50))}...`);
      }
      if (versionInfo.dependencies && versionInfo.dependencies.length > 0) {
        console.log(`  依赖数: ${chalk.cyan(versionInfo.dependencies.length)}`);
      }
      if (versionInfo.upcastResources && versionInfo.upcastResources.length > 0) {
        console.log(`  上抛资源数: ${chalk.cyan(versionInfo.upcastResources.length)}`);
      }

      // 使用 resourceConfig 参数，确保资源信息优先从 version.config 或 resource.config 获取
      const newVersionConfig = responseToVersionConfig(versionInfo, existingConfig, resourceConfig);
      // 确保发布相关字段被清空（空数组，类型正确）
      newVersionConfig.baseUpcastResources = [];
      newVersionConfig.batchSignContracts = [];
      newVersionConfig.inputAttrs = [];
      newVersionConfig.authExcludedItems = [];
      await saveVersionConfig(newVersionConfig, options.config);

      console.log(chalk.green('✔ ') + '版本配置已更新');
      console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.version.config.*')}`);
      console.log(chalk.gray('   包含: version, fileSha1, filename, dependencies 等'));

    } catch (err: any) {
      versionSpinner.fail('获取版本信息失败');
      throw err;
    }

    // 7. 完成
    console.log(chalk.green('\n✔ ') + '版本信息同步完成');
    console.log(chalk.blue('\n💡 提示:'));
    console.log(`  ${chalk.gray('$')} freelog-cli publish ${chalk.gray('# 发布新版本')}`);

  } catch (err: any) {
    handleErrorAndExit(err, '同步失败', options.debug);
  }
}

