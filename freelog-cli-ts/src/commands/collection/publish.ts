/**
 * collection publish 命令
 * 上线合集（更新合集信息并提交草稿）
 */

import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import { loadCollectionConfig } from '../../services/collectionConfigService';
import { updateCollectionResource } from '../../api/collection';
import { updateResource } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 collection publish 命令
 */
export async function executeCollectionPublish(
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 上线合集 ===\n'));

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

    // 3. 更新资源状态为上线
    const updateSpinner = ora('正在更新资源状态...').start();
    try {
      await updateResource(collectionConfig.resourceId, {
        status: 1, // 上线
      });
      updateSpinner.succeed('资源状态已更新为上线');
    } catch (err: any) {
      updateSpinner.fail('更新资源状态失败');
      throw err;
    }

    // 4. 更新合集信息（提交草稿）
    const collectionSpinner = ora('正在提交合集草稿...').start();
    try {
      await updateCollectionResource(collectionConfig.resourceId, {
        isMergeCatalogueDraft: 1, // 合并草稿
      });
      collectionSpinner.succeed('合集草稿已提交');
    } catch (err: any) {
      collectionSpinner.fail('提交合集草稿失败');
      throw err;
    }

    // 5. 更新本地配置
    collectionConfig.status = 1;
    await saveCollectionConfig(collectionConfig, options.config);

    // 6. 显示结果
    console.log(chalk.green('\n✔ ') + '合集已上线');
    console.log(chalk.blue('ℹ️ ') + `资源 ID: ${chalk.cyan(collectionConfig.resourceId)}`);

  } catch (err: any) {
    handleErrorAndExit(err, '上线合集失败', options.debug);
  }
}

/**
 * 执行 collection unpublish 命令
 */
export async function executeCollectionUnpublish(
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 下线合集 ===\n'));

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

    // 3. 更新资源状态为下线
    const updateSpinner = ora('正在更新资源状态...').start();
    try {
      await updateResource(collectionConfig.resourceId, {
        status: 4, // 下线
      });
      updateSpinner.succeed('资源状态已更新为下线');
    } catch (err: any) {
      updateSpinner.fail('更新资源状态失败');
      throw err;
    }

    // 4. 更新本地配置
    collectionConfig.status = 4;
    await saveCollectionConfig(collectionConfig, options.config);

    // 5. 显示结果
    console.log(chalk.green('\n✔ ') + '合集已下线');
    console.log(chalk.blue('ℹ️ ') + `资源 ID: ${chalk.cyan(collectionConfig.resourceId)}`);

  } catch (err: any) {
    handleErrorAndExit(err, '下线合集失败', options.debug);
  }
}

