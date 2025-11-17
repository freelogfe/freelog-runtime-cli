/**
 * 同步资源信息命令
 * 从服务器获取资源信息，并同步到本地配置文件
 */

import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../core/auth';
import { CommandOptions } from '../types';
import {
  loadResourceConfig,
  saveResourceConfig,
  responseToResourceConfig,
} from '../services/resourceConfigService';
import { checkConfigsExist } from '../services/configService';
import { getResourceInfo } from '../api/resourceGet';

/**
 * 执行同步资源信息命令
 */
export async function executeSyncr(
  resourceIdOrName?: string,
  options: CommandOptions = {}
): Promise<void> {
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
        console.log(chalk.cyan('  freelog-cli syncr <resourceIdOrName>'));
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

    // 5. 获取资源信息（同步到 resource.config）
    const resourceSpinner = ora('正在获取资源信息...').start();
    try {
      const resourceInfo = await getResourceInfo(targetResourceId, {
        isLoadLatestVersionInfo: 0, // 不加载版本信息
      });

      resourceSpinner.succeed('资源信息获取成功');

      // 显示资源信息
      console.log(chalk.blue('\n📦 资源信息:'));
      console.log(`  资源 ID: ${chalk.cyan(resourceInfo.resourceId)}`);
      console.log(`  资源名称: ${chalk.cyan(resourceInfo.resourceName)}`);
      console.log(`  资源类型: ${chalk.cyan(resourceInfo.resourceType.join(', '))}`);
      if (resourceInfo.resourceTitle) {
        console.log(`  资源标题: ${chalk.cyan(resourceInfo.resourceTitle)}`);
      }
      if (resourceInfo.intro) {
        console.log(`  介绍: ${chalk.gray(resourceInfo.intro.substring(0, 50))}...`);
      }
      if (resourceInfo.status !== undefined) {
        const statusText = resourceInfo.status === 0 ? '待发行' : 
                          resourceInfo.status === 1 ? '上架' : 
                          resourceInfo.status === 2 ? '冻结' : 
                          resourceInfo.status === 4 ? '下架' : `状态${resourceInfo.status}`;
        console.log(`  状态: ${chalk.cyan(statusText)}`);
      }
      if (resourceInfo.policies && resourceInfo.policies.length > 0) {
        console.log(`  策略数量: ${chalk.cyan(resourceInfo.policies.length)}`);
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
      console.log(chalk.gray('   包含: resourceId, resourceName, resourceType, resourceTitle, intro, coverImages, tags, status, policies 等'));
      
      console.log(chalk.blue('\n💡 提示:'));
      console.log(`  ${chalk.gray('$')} freelog-cli update --intro "介绍" ${chalk.gray('# 更新资源介绍')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli update --cover "url1,url2" ${chalk.gray('# 更新封面图')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli syncv ${chalk.gray('# 同步版本信息')}`);

    } catch (err: any) {
      resourceSpinner.fail('获取资源信息失败');
      throw err;
    }

    // 6. 完成
    console.log(chalk.green('\n✔ ') + '资源信息同步完成');

  } catch (err: any) {
    console.log(chalk.red('✖ ') + `同步失败: ${err.message}`);
    if (options.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

