/**
 * batch create 命令
 * 批量创建资源
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
  batchItemToCreateBody,
  updateBatchResourceItem,
} from '../../services/batchResourceService';
import type { BatchResourceConfig, BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { batchCreateResources } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch create 命令
 */
export async function executeBatchCreate(
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量创建资源 ===\n'));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载批量配置
    const spinner = ora('正在加载批量配置...').start();
    let batchConfig: BatchResourceConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      spinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      spinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 过滤需要创建的资源（跳过已创建的和标记为 skip 的）
    const resourcesToCreate = batchConfig.resources.filter(
      (item) => !item.skip && !item.resourceId
    );

    if (resourcesToCreate.length === 0) {
      console.log(chalk.blue('\nℹ️  所有资源都已创建，无需重复创建'));
      return;
    }

    // 4. 显示将要创建的资源列表
    console.log(chalk.blue('\n📋 将要创建的资源列表:'));
    resourcesToCreate.forEach((item: BatchResourceItemConfig, index: number) => {
      console.log(
        `  ${index + 1}. ${chalk.cyan(item.resourceName || item.name)} ${chalk.gray(`(${item.name})`)}`
      );
    });

    // 5. 确认创建
    const { confirmCreate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmCreate',
        message: `确认批量创建 ${resourcesToCreate.length} 个资源？`,
        default: true,
      },
    ]);

    if (!confirmCreate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 6. 准备批量创建请求体
    const createBodies = resourcesToCreate.map((item: BatchResourceItemConfig) =>
      batchItemToCreateBody(item, batchConfig.defaults)
    );

    // 7. 批量创建资源
    const createSpinner = ora(`正在批量创建 ${resourcesToCreate.length} 个资源...`).start();
    let results: Array<{ resourceId: string; resourceName: string }>;
    try {
      results = await batchCreateResources({ resources: createBodies });
      createSpinner.succeed(`成功创建 ${results.length} 个资源`);
    } catch (err: unknown) {
      createSpinner.fail('批量创建资源失败');
      throw err;
    }

    // 8. 更新批量配置中的 resourceId
    const updateSpinner = ora('正在更新批量配置...').start();
    try {
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const item = resourcesToCreate[i];
        
        batchConfig = updateBatchResourceItem(batchConfig, item.name, {
          resourceId: result.resourceId,
          resourceName: result.resourceName,
        });
      }
      
      await saveBatchResourceConfig(batchConfig, options.config);
      updateSpinner.succeed('批量配置已更新');
    } catch (err: unknown) {
      updateSpinner.fail('更新批量配置失败');
      console.log(chalk.yellow(`⚠️  请手动更新配置文件中的 resourceId`));
      throw err;
    }

    // 9. 显示结果
    console.log(chalk.green('\n✔ ') + '批量创建完成');
    console.log(chalk.blue('\n📊 创建结果:'));
    results.forEach((result, index) => {
      const item = resourcesToCreate[index];
      console.log(
        `  ${chalk.green('✓')} ${chalk.cyan(item.name)}: ${chalk.cyan(result.resourceId)} ${chalk.gray(`(${result.resourceName})`)}`
      );
    });

    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish ${chalk.gray('# 批量发布版本')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch add-to-collection ${chalk.gray('# 批量添加到合集')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量创建资源失败', options.debug);
  }
}

