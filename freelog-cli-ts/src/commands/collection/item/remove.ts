/**
 * collection item remove 命令
 * 删除合集单品
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import { loadCollectionConfig, saveCollectionConfig } from '../../../services/collectionConfigService';
import { batchDeleteCollectionItemsDraft } from '../../../api/collection';
import { handleErrorAndExit } from '../../../utils/errorHandler';

/**
 * 执行 collection item remove 命令
 */
export async function executeCollectionItemRemove(
  resourceIdOrName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 删除合集单品 ===\n'));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载合集配置
    const spinner = ora('正在加载合集配置...').start();
    let collectionConfig;
    try {
      collectionConfig = await loadCollectionConfig(options.config);
      spinner.succeed('合集配置加载成功');
    } catch (err: any) {
      spinner.fail('加载合集配置失败');
      throw err;
    }

    if (!collectionConfig.resourceId) {
      console.log(chalk.red('\n❌ 合集配置中未设置 resourceId'));
      throw new Error('未设置合集 resourceId');
    }

    if (!collectionConfig.items || collectionConfig.items.length === 0) {
      console.log(chalk.yellow('⚠️  配置文件中没有单品'));
      return;
    }

    // 3. 查找要删除的单品
    const itemToRemove = collectionConfig.items.find(
      item => item.resourceId === resourceIdOrName || item.resourceName === resourceIdOrName
    );

    if (!itemToRemove) {
      console.log(chalk.red(`\n❌ 未找到单品: ${resourceIdOrName}`));
      return;
    }

    // 4. 确认删除
    const { confirmRemove } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmRemove',
        message: `确认删除单品 "${itemToRemove.resourceName || itemToRemove.resourceId}"?`,
        default: false,
      },
    ]);

    if (!confirmRemove) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 5. 从草稿中删除（如果有 itemId）
    if (itemToRemove.itemId) {
      const deleteSpinner = ora('正在从草稿中删除单品...').start();
      try {
        await batchDeleteCollectionItemsDraft(
          collectionConfig.resourceId,
          itemToRemove.itemId
        );
        deleteSpinner.succeed('单品已从草稿中删除');
      } catch (err: any) {
        deleteSpinner.fail('从草稿删除失败');
        console.log(chalk.yellow(`⚠️  从草稿删除失败: ${err.message}`));
      }
    }

    // 6. 从配置中删除
    collectionConfig.items = collectionConfig.items.filter(
      item => item.resourceId !== itemToRemove.resourceId
    );

    await saveCollectionConfig(collectionConfig, options.config);

    // 7. 显示结果
    console.log(chalk.green('\n✔ ') + '单品删除成功');
    console.log(chalk.blue('ℹ️ ') + `配置文件已更新`);

  } catch (err: any) {
    handleErrorAndExit(err, '删除合集单品失败', options.debug);
  }
}

