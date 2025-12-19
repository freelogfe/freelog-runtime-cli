/**
 * batch remove 命令
 * 从批量配置中移除资源项
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
} from '../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch remove 命令
 */
export async function executeBatchRemove(
  resourceNames?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 移除批量资源项 ===\n'));

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

    if (batchConfig.resources.length === 0) {
      console.log(chalk.blue('ℹ️  批量配置中没有资源'));
      return;
    }

    // 3. 选择要移除的资源
    let resourcesToRemove: BatchResourceItemConfig[] = [];
    
    if (resourceNames) {
      // 如果指定了资源名称（多个用逗号分隔）
      const names = resourceNames.split(',').map((n) => n.trim());
      resourcesToRemove = batchConfig.resources.filter((item) =>
        names.includes(item.name)
      );
      
      if (resourcesToRemove.length === 0) {
        console.log(chalk.yellow('⚠️  未找到匹配的资源'));
        return;
      }
    } else {
      // 交互式选择资源
      const { selectedResources } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedResources',
          message: '选择要移除的资源（可多选）:',
          instructions: '使用空格键选择/取消，按 a 全选/取消全选，按 i 反选，回车确认',
          choices: batchConfig.resources.map((item) => ({
            name: `${item.name} (${item.resourceName || item.name}) ${item.resourceId ? `[${chalk.gray(item.resourceId)}]` : ''}`,
            value: item.name,
          })),
        },
      ]);
      
      if (selectedResources.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何资源'));
        return;
      }
      
      resourcesToRemove = batchConfig.resources.filter((item) =>
        selectedResources.includes(item.name)
      );
    }

    // 4. 显示将要移除的资源
    console.log(chalk.yellow('\n⚠️  将要移除的资源:'));
    resourcesToRemove.forEach((item) => {
      console.log(`  - ${chalk.cyan(item.name)}`);
      if (item.resourceId) {
        console.log(`    资源ID: ${item.resourceId}`);
      }
      if (item.versionId) {
        console.log(`    版本ID: ${item.versionId}`);
      }
    });

    // 5. 确认移除
    const { confirmRemove } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmRemove',
        message: `确认移除 ${resourcesToRemove.length} 个资源项？${chalk.yellow('（此操作不会删除服务器上的资源）')}`,
        default: false,
      },
    ]);

    if (!confirmRemove) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 6. 移除资源项
    const removeSpinner = ora('正在移除资源项...').start();
    try {
      const namesToRemove = new Set(resourcesToRemove.map((item) => item.name));
      batchConfig.resources = batchConfig.resources.filter(
        (item) => !namesToRemove.has(item.name)
      );
      
      await saveBatchResourceConfig(batchConfig, options.config);
      removeSpinner.succeed(`成功移除 ${resourcesToRemove.length} 个资源项`);
    } catch (err: unknown) {
      removeSpinner.fail('移除资源项失败');
      throw err;
    }

    // 7. 显示结果
    console.log(chalk.green('\n✔ ') + `已移除 ${resourcesToRemove.length} 个资源项`);
    console.log(chalk.blue(`ℹ️  剩余资源: ${batchConfig.resources.length} 个`));

  } catch (err: unknown) {
    handleErrorAndExit(err, '移除资源项失败', options.debug);
  }
}

