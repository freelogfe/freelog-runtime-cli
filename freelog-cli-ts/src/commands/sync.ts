/**
 * 同步命令（新版本 - 支持双配置文件）
 * 从服务器获取资源和版本信息，并同步到本地配置文件
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../core/auth';
import { CommandOptions } from '../types';
import {
  loadResourceConfig,
  saveResourceConfig,
  responseToResourceConfig,
} from '../services/resourceConfigService';
import {
  loadVersionConfig,
  saveVersionConfig,
  responseToVersionConfig,
} from '../services/versionConfigService';
import { checkConfigsExist } from '../services/configService';
import { getResourceInfo, getResourceVersionInfo } from '../api/resourceGet';

/**
 * 执行同步命令
 */
export async function executeSync(
  resourceIdOrName?: string,
  options: CommandOptions = {}
): Promise<void> {
  const version = options.version as string | undefined;
  const resourceOnly = options.resourceOnly as boolean | undefined;
  const versionOnly = options.versionOnly as boolean | undefined;

  try {
    // 1. 检查登录
    const auth = requireAuth();
    console.log(chalk.cyan('\n=== 同步资源信息 ===\n'));
    console.log(chalk.blue('ℹ ') + `登录用户: ${auth.username}`);

    // 2. 检查配置文件是否存在
    const configExists = checkConfigsExist();

    // 3. 确定资源 ID
    let targetResourceId: string | undefined;
    let hasLocalConfig = false;

    if (resourceIdOrName) {
      // 使用命令行传入的资源 ID 或名称
      targetResourceId = resourceIdOrName;
      console.log(chalk.blue('ℹ ') + `目标资源: ${targetResourceId}`);
    } else {
      // 从配置文件中读取资源 ID
      if (!configExists.resource) {
        console.log(chalk.red('\n❌ 找不到资源配置文件'));
        console.log(chalk.yellow('\n💡 请使用以下命令格式指定资源:'));
        console.log(chalk.cyan('  freelog-cli sync <resourceIdOrName> [-v version]'));
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
        hasLocalConfig = true;
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
    if (!version && configExists.version && !versionOnly) {
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

    // 6. 获取资源信息（同步到 resource.config）
    if (!versionOnly) {
      const resourceSpinner = ora('正在获取资源信息...').start();
      try {
        // 如果只需要同步资源信息，不需要加载版本信息
        const resourceInfo = await getResourceInfo(targetResourceId, {
          isLoadLatestVersionInfo: resourceOnly ? 0 : 1,
        });

        resourceSpinner.succeed('资源信息获取成功');

        // 显示资源信息
        console.log(chalk.blue('\n📦 资源信息:'));
        console.log(`  资源 ID: ${chalk.cyan(resourceInfo.resourceId)}`);
        console.log(`  资源名称: ${chalk.cyan(resourceInfo.resourceName)}`);
        console.log(`  资源类型: ${chalk.cyan(resourceInfo.resourceType.join(', '))}`);
        if (resourceInfo.latestVersion) {
          console.log(`  最新版本: ${chalk.cyan(resourceInfo.latestVersion)}`);
        }
        if (resourceInfo.intro) {
          console.log(`  介绍: ${chalk.gray(resourceInfo.intro.substring(0, 50))}...`);
        }

        // 转换并保存资源配置
        const newResourceConfig = responseToResourceConfig(resourceInfo);
        
        // 如果本地已有配置，保留 resourceId（如果存在）
        if (hasLocalConfig) {
          try {
            const localConfig = await loadResourceConfig(options.config);
            if (localConfig.resourceId && localConfig.resourceId === newResourceConfig.resourceId) {
              // 保留本地配置的其他字段（如果有的话）
              // 这里主要确保 resourceId 一致
            }
          } catch {
            // 忽略错误，直接使用新的配置
          }
        }
        
        await saveResourceConfig(newResourceConfig, options.config);

        console.log(chalk.green('✔ ') + '资源配置已更新');
        console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.resource.config.*')}`);
      } catch (err: any) {
        resourceSpinner.fail('获取资源信息失败');
        throw err;
      }
    }

    // 7. 获取版本信息
    if (!resourceOnly) {
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

        // 显示版本信息
        console.log(chalk.blue('\n📌 版本信息:'));
        console.log(`  版本号: ${chalk.cyan(versionInfo.version)}`);
        console.log(`  文件名: ${chalk.cyan(versionInfo.filename)}`);
        console.log(`  SHA1: ${chalk.gray(versionInfo.fileSha1)}`);
        if (versionInfo.description) {
          console.log(`  描述: ${chalk.gray(versionInfo.description.substring(0, 50))}...`);
        }
        if (versionInfo.dependencies && versionInfo.dependencies.length > 0) {
          console.log(`  依赖数: ${chalk.cyan(versionInfo.dependencies.length)}`);
        }
        if (versionInfo.baseUpcastResources && versionInfo.baseUpcastResources.length > 0) {
          console.log(`  上抛资源数: ${chalk.cyan(versionInfo.baseUpcastResources.length)}`);
        }

        // 转换并保存版本配置
        const newVersionConfig = responseToVersionConfig(versionInfo);
        await saveVersionConfig(newVersionConfig, options.config);

        console.log(chalk.green('✔ ') + '版本配置已更新');
      } catch (err: any) {
        versionSpinner.fail('获取版本信息失败');
        throw err;
      }
    }

    // 8. 完成
    console.log(chalk.green('\n✔ ') + '同步完成');
    console.log(chalk.blue('\nℹ️  配置文件已更新:'));
    if (!versionOnly) {
      console.log(`  ${chalk.cyan('freelog.resource.config.*')} - 资源信息`);
      console.log(chalk.gray('   包含: resourceId, resourceName, resourceType, intro, coverImages'));
    }
    if (!resourceOnly) {
      console.log(`  ${chalk.cyan('freelog.version.config.*')} - 版本信息`);
      console.log(chalk.gray('   包含: version, fileSha1, filename, dependencies 等'));
    }
    
    if (!versionOnly) {
      console.log(chalk.blue('\n💡 提示:'));
      console.log(`  ${chalk.gray('$')} freelog-cli update --intro "介绍" ${chalk.gray('# 更新资源介绍')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli update --cover "url1,url2" ${chalk.gray('# 更新封面图')}`);
    }

  } catch (err: any) {
    console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
    if (options.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

