/**
 * batch sync 命令
 * 从服务器同步资源信息到批量配置
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
  updateBatchResourceItem,
} from '../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { getResourceInfo } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch sync 命令
 */
export async function executeBatchSync(
  resourceNames?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 同步资源信息 ===\n'));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载批量配置
    const spinner = ora('正在加载批量配置...').start();
    let batchConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      spinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      spinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 选择要同步的资源
    let resourcesToSync: BatchResourceItemConfig[] = [];
    
    if (resourceNames) {
      // 如果指定了资源名称（多个用逗号分隔）
      const names = resourceNames.split(',').map((n) => n.trim());
      resourcesToSync = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId && names.includes(item.name)
      );
      
      if (resourcesToSync.length === 0) {
        console.log(chalk.yellow('⚠️  未找到匹配的资源'));
        return;
      }
    } else {
      // 交互式选择资源
      const availableResources = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId
      );
      
      if (availableResources.length === 0) {
        console.log(chalk.blue('ℹ️  没有已创建的资源可同步'));
        return;
      }
      
      const { selectedResources } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedResources',
          message: '选择要同步的资源（可多选）:',
          choices: availableResources.map((item) => ({
            name: `${item.name} (${item.resourceId})`,
            value: item.name,
          })),
        },
      ]);
      
      if (selectedResources.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何资源'));
        return;
      }
      
      resourcesToSync = availableResources.filter((item) =>
        selectedResources.includes(item.name)
      );
    }

    // 4. 批量同步
    const results = {
      success: [] as Array<{ name: string; resourceId: string }>,
      failed: [] as Array<{ name: string; error: string }>,
    };

    for (const item of resourcesToSync) {
      if (!item.resourceId) {
        continue;
      }

      const itemSpinner = ora(`正在同步 ${item.name}...`).start();
      try {
        // 获取资源信息
        const resourceInfo = await getResourceInfo(item.resourceId, {
          isLoadLatestVersionInfo: 0,
        });

        // 更新批量配置
        const updates: Partial<BatchResourceItemConfig> = {
          resourceName: resourceInfo.resourceName,
          resourceTitle: resourceInfo.resourceTitle,
          intro: resourceInfo.intro,
          coverImages: resourceInfo.coverImages || [],
          tags: resourceInfo.tags || [],
        };

        batchConfig = updateBatchResourceItem(batchConfig, item.name, updates);

        itemSpinner.succeed(`${item.name} 同步成功`);
        results.success.push({
          name: item.name,
          resourceId: item.resourceId,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        itemSpinner.fail(`${item.name} 同步失败: ${errorMessage}`);
        results.failed.push({
          name: item.name,
          error: errorMessage,
        });
      }
    }

    // 5. 保存配置
    if (results.success.length > 0) {
      const saveSpinner = ora('正在保存批量配置...').start();
      try {
        await saveBatchResourceConfig(batchConfig, options.config);
        saveSpinner.succeed('批量配置已保存');
      } catch (err: unknown) {
        saveSpinner.fail('保存批量配置失败');
      }
    }

    // 6. 显示结果
    console.log(chalk.blue('\n📊 同步结果:'));
    console.log(chalk.green(`  成功: ${results.success.length}`));
    if (results.failed.length > 0) {
      console.log(chalk.red(`  失败: ${results.failed.length}`));
      results.failed.forEach((item) => {
        console.log(`    - ${chalk.red(item.name)}: ${item.error}`);
      });
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '同步资源信息失败', options.debug);
  }
}

