/**
 * batch dep list 命令
 * 查看批量配置中某个资源的依赖列表
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import Table from 'cli-table3';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import {
  loadBatchResourceConfig,
} from '../../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../../public/freelog.batch-resources';
import { getResourceInfo } from '../../../api/resource';
import { handleErrorAndExit } from '../../../utils/errorHandler';

/**
 * 执行 batch dep list 命令
 */
export async function executeBatchDepList(
  resourceName?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量查看依赖列表 ===\n'));

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

    // 3. 选择要查看的资源
    let item: BatchResourceItemConfig | undefined;
    
    if (resourceName) {
      // 如果指定了资源名称
      item = batchConfig.resources.find((r) => r.name === resourceName);
      
      if (!item) {
        console.log(chalk.red(`❌ 未找到资源: ${resourceName}`));
        console.log(chalk.blue('\n💡 可用资源列表:'));
        batchConfig.resources.forEach((r) => {
          console.log(`  - ${chalk.cyan(r.name)}`);
        });
        return;
      }
    } else {
      // 交互式选择资源
      const availableResources = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId
      );
      
      if (availableResources.length === 0) {
        console.log(chalk.blue('ℹ️  没有已创建的资源'));
        return;
      }
      
      const { selectedResource } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedResource',
          message: '选择要查看依赖的资源:',
          choices: availableResources.map((r) => ({
            name: `${r.name} (${r.resourceId})`,
            value: r.name,
          })),
        },
      ]);
      
      item = availableResources.find((r) => r.name === selectedResource);
    }

    if (!item || !item.resourceId) {
      console.log(chalk.blue('ℹ️  资源尚未创建'));
      return;
    }

    // 4. 获取资源的依赖信息
    const fetchSpinner = ora(`正在获取 ${item.name} 的依赖信息...`).start();
    
    try {
      const resourceInfo = await getResourceInfo(item.resourceId, {
        isLoadLatestVersionInfo: 1,
      });

      const dependencies: Array<{ resourceId: string; resourceName: string; versionRange: string }> = [];
      
      if (resourceInfo.latestVersionInfo?.dependencies) {
        for (const dep of resourceInfo.latestVersionInfo.dependencies) {
          dependencies.push({
            resourceId: dep.resourceId,
            resourceName: dep.resourceName || dep.resourceId,
            versionRange: dep.versionRange || '*',
          });
        }
      }

      fetchSpinner.succeed('依赖信息获取完成');

      // 5. 显示依赖列表
      console.log(chalk.blue(`\n📋 资源: ${chalk.cyan(item.name)} (${item.resourceId})\n`));
      
      if (dependencies.length === 0) {
        console.log(chalk.gray('  无依赖\n'));
      } else {
        const table = new Table({
          head: ['依赖资源ID', '资源名称', '版本范围'],
          colWidths: [28, 30, 20],
        });

        dependencies.forEach((dep) => {
          table.push([
            dep.resourceId,
            dep.resourceName,
            dep.versionRange,
          ]);
        });

        console.log(table.toString());
        console.log();
      }

      // 6. 统计信息
      console.log(chalk.blue('📊 统计信息:'));
      console.log(`  依赖数量: ${dependencies.length}`);
    } catch (err: unknown) {
      fetchSpinner.fail('获取依赖信息失败');
      throw err;
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量查看依赖失败', options.debug);
  }
}

