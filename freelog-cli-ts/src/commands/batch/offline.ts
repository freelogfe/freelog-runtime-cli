/**
 * batch offline 命令
 * 批量下架资源
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
import { setResourceStatus } from '../../services/resourceOperationService';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch offline 命令
 */
export async function executeBatchOffline(
  resourceNames?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量下架资源 ===\n'));

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

    // 3. 选择要下架的资源
    let resourcesToOffline: BatchResourceItemConfig[] = [];
    
    if (resourceNames) {
      // 如果指定了资源名称（多个用逗号分隔）
      const names = resourceNames.split(',').map((n) => n.trim());
      resourcesToOffline = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId && names.includes(item.name)
      );
      
      if (resourcesToOffline.length === 0) {
        console.log(chalk.yellow('⚠️  未找到匹配的资源'));
        return;
      }
    } else {
      // 交互式选择资源
      const availableResources = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId
      );
      
      if (availableResources.length === 0) {
        console.log(chalk.blue('ℹ️  没有已创建的资源可下架'));
        return;
      }
      
      const { selectedResources } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedResources',
          message: '选择要下架的资源（可多选）:',
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
      
      resourcesToOffline = availableResources.filter((item) =>
        selectedResources.includes(item.name)
      );
    }

    // 4. 确认下架
    console.log(chalk.blue('\n📋 将要下架的资源:'));
    resourcesToOffline.forEach((item) => {
      console.log(`  - ${chalk.cyan(item.name)} (${item.resourceId})`);
    });

    const { confirmOffline } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmOffline',
        message: `确认下架 ${resourcesToOffline.length} 个资源？`,
        default: true,
      },
    ]);

    if (!confirmOffline) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 5. 批量下架
    const results = {
      success: [] as Array<{ name: string; resourceId: string }>,
      failed: [] as Array<{ name: string; error: string }>,
    };

    for (const item of resourcesToOffline) {
      if (!item.resourceId) {
        continue;
      }

      const itemSpinner = ora(`正在下架 ${item.name}...`).start();
      try {
        // 使用统一的服务下架资源（status = 4）
        await setResourceStatus(item.resourceId, 4);

        // 注意：批量配置不存储资源状态，状态由服务器管理

        itemSpinner.succeed(`${item.name} 下架成功`);
        results.success.push({
          name: item.name,
          resourceId: item.resourceId,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        itemSpinner.fail(`${item.name} 下架失败: ${errorMessage}`);
        results.failed.push({
          name: item.name,
          error: errorMessage,
        });
      }
    }

    // 6. 保存配置
    if (results.success.length > 0) {
      const saveSpinner = ora('正在保存批量配置...').start();
      try {
        await saveBatchResourceConfig(batchConfig, options.config);
        saveSpinner.succeed('批量配置已保存');
      } catch (err: unknown) {
        saveSpinner.fail('保存批量配置失败');
      }
    }

    // 7. 显示结果
    console.log(chalk.blue('\n📊 下架结果:'));
    console.log(chalk.green(`  成功: ${results.success.length}`));
    if (results.failed.length > 0) {
      console.log(chalk.red(`  失败: ${results.failed.length}`));
      results.failed.forEach((item) => {
        console.log(`    - ${chalk.red(item.name)}: ${item.error}`);
      });
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量下架失败', options.debug);
  }
}

