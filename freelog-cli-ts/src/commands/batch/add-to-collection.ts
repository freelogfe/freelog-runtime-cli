/**
 * batch add-to-collection 命令
 * 批量将资源添加到合集
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import { loadBatchResourceConfig } from '../../services/batchResourceService';
import type {
  BatchResourceOperationResult,
  BatchResourceConfig,
  BatchResourceItemConfig,
} from '../../../public/freelog.batch-resources';
import { loadCollectionConfig, saveCollectionConfig } from '../../services/collectionConfigService';
import {
  batchAddCollectionItemsDraft,
  type BatchAddCollectionItemsDraftBody,
  type ResolveResource,
} from '../../api/collection';
import { getResourceInfo } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';
import type { CollectionItemConfig, CollectionConfig } from '../../../public/freelog.collection';
import {
  addCollectionItem,
  type CollectionItemConfigOperations,
} from '../../services/dependencyAddService';

/**
 * 执行 batch add-to-collection 命令
 */
export async function executeBatchAddToCollection(
  collectionConfigPath?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量添加到合集 ===\n'));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载批量配置
    const batchSpinner = ora('正在加载批量配置...').start();
    let batchConfig: BatchResourceConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      batchSpinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      batchSpinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 加载合集配置
    const collectionSpinner = ora('正在加载合集配置...').start();
    let collectionConfig: CollectionConfig;
    try {
      collectionConfig = await loadCollectionConfig(collectionConfigPath);
      collectionSpinner.succeed('合集配置加载成功');
    } catch (err: unknown) {
      collectionSpinner.fail('加载合集配置失败');
      throw err;
    }

    if (!collectionConfig.resourceId) {
      throw new Error('合集配置中未设置 resourceId，请先创建合集');
    }

    // 4. 过滤需要添加的资源（有 resourceId 和 versionId 的，跳过标记为 skip 的）
    const resourcesToAdd = batchConfig.resources.filter(
      (item) => !item.skip && item.resourceId && item.versionId
    );

    if (resourcesToAdd.length === 0) {
      console.log(chalk.blue('\nℹ️  没有可添加的资源（需要 resourceId 和 versionId）'));
      return;
    }

    // 5. 检查哪些资源已经在合集中
    const existingResourceIds = new Set(
      (collectionConfig.items || []).map((item) => item.resourceId)
    );

    const newResources = resourcesToAdd.filter(
      (item) => !existingResourceIds.has(item.resourceId!)
    );

    if (newResources.length === 0) {
      console.log(chalk.blue('\nℹ️  所有资源都已添加到合集中'));
      return;
    }

    // 6. 显示将要添加的资源列表
    console.log(chalk.blue('\n📋 将要添加到合集的资源列表:'));
    newResources.forEach((item: BatchResourceItemConfig, index: number) => {
      const isExisting = existingResourceIds.has(item.resourceId!);
      console.log(
        `  ${index + 1}. ${chalk.cyan(item.resourceName || item.name)} ${chalk.gray(`(${item.resourceId})`)} ${isExisting ? chalk.yellow('[已存在]') : ''}`
      );
    });

    // 7. 确认添加
    const { confirmAdd } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmAdd',
        message: `确认批量添加 ${newResources.length} 个资源到合集？`,
        default: true,
      },
    ]);

    if (!confirmAdd) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 8. 批量添加资源到合集
    const results: BatchResourceOperationResult = {
      success: [],
      failed: [],
      skipped: [],
    };

    // 配置操作接口（用于处理上抛资源）
    const configOps: CollectionItemConfigOperations<typeof collectionConfig> = {
      loadConfig: loadCollectionConfig,
      saveConfig: async (config, customPath) => {
        return saveCollectionConfig(config, customPath);
      },
      getCurrentResourceId: (config) => config.resourceId,
      addItemToConfig: async (config, item) => {
        if (!config.items) {
          config.items = [];
        }
        const existingIndex = config.items.findIndex(
          (existingItem: CollectionItemConfig) => existingItem.resourceId === item.resourceId
        );
        const itemConfig: CollectionItemConfig = {
          resourceId: item.resourceId,
          resourceName: item.resourceName,
          version: item.version,
        };
        if (existingIndex >= 0) {
          config.items[existingIndex] = itemConfig;
        } else {
          config.items.push(itemConfig);
        }
        return config;
      },
      itemExists: async (config, resourceId) => {
        const existing = config.items?.find((item: CollectionItemConfig) => item.resourceId === resourceId);
        return {
          exists: !!existing,
          item: existing,
        };
      },
    };

    // 准备批量添加请求体
    const itemsToAdd: BatchAddCollectionItemsDraftBody['items'] = [];

    for (const item of newResources) {
      const itemSpinner = ora(`正在处理 ${item.name}...`).start();
      try {
        // 获取资源信息（用于处理上抛资源）
        const resourceInfo = await getResourceInfo(item.resourceId!, {
          isLoadLatestVersionInfo: 0,
        });

        // 获取版本号
        const version = item.version || batchConfig.defaults.version || '1.0.0';

        // 处理上抛资源（如果需要）
        let resolveResources: ResolveResource[] | undefined;
        try {
          // 调用 addCollectionItem 来处理上抛资源（但不实际添加到配置）
          const tempResult = await addCollectionItem(item.resourceId!, options, configOps);
          resolveResources = tempResult.resolveResources.length > 0 
            ? (tempResult.resolveResources as ResolveResource[])
            : undefined;
        } catch (err: unknown) {
          // 如果处理上抛资源失败，继续（可能没有上抛资源）
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.log(chalk.yellow(`  ⚠️  处理上抛资源失败: ${errorMessage}`));
        }

        itemsToAdd.push({
          resourceId: item.resourceId!,
          version: version,
          itemTitle: item.resourceTitle,
          itemDescription: item.intro,
          coverImage: item.coverImages && item.coverImages.length > 0 ? item.coverImages[0] : undefined,
          resolveResources,
        });

        itemSpinner.succeed(`${item.name} 准备完成`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        itemSpinner.fail(`${item.name} 处理失败: ${errorMessage}`);
        results.failed.push({
          name: item.name,
          error: errorMessage,
        });
      }
    }

    // 9. 批量添加到草稿
    if (itemsToAdd.length > 0) {
      const addSpinner = ora(`正在批量添加 ${itemsToAdd.length} 个资源到合集草稿...`).start();
      try {
        await batchAddCollectionItemsDraft(collectionConfig.resourceId, {
          items: itemsToAdd,
        });
        addSpinner.succeed('资源已添加到合集草稿');

        // 更新合集配置
        if (!collectionConfig.items) {
          collectionConfig.items = [];
        }

        for (const item of itemsToAdd) {
          const existingIndex = collectionConfig.items.findIndex(
            (existingItem) => existingItem.resourceId === item.resourceId
          );
          
          const itemConfig: CollectionItemConfig = {
            resourceId: item.resourceId,
            version: item.version,
            itemTitle: item.itemTitle,
            itemDescription: item.itemDescription,
            coverImage: item.coverImage,
          };

          // 从批量配置中获取资源名称
          const batchItem = batchConfig.resources.find((r) => r.resourceId === item.resourceId);
          if (batchItem) {
            itemConfig.resourceName = batchItem.resourceName || batchItem.name;
          }

          if (existingIndex >= 0) {
            collectionConfig.items[existingIndex] = itemConfig;
          } else {
            collectionConfig.items.push(itemConfig);
          }

          results.success.push({
            name: batchItem?.name || item.resourceId,
            resourceId: item.resourceId,
            resourceName: itemConfig.resourceName,
          });
        }

        // 保存合集配置
        await saveCollectionConfig(collectionConfig, collectionConfigPath);
        console.log(chalk.green('✔ ') + '合集配置已更新');
      } catch (err: unknown) {
        addSpinner.fail('批量添加到草稿失败');
        throw err;
      }
    }

    // 10. 显示结果
    console.log(chalk.blue('\n📊 添加结果:'));
    console.log(chalk.green(`  成功: ${results.success.length}`));
    if (results.failed.length > 0) {
      console.log(chalk.red(`  失败: ${results.failed.length}`));
      results.failed.forEach((item) => {
        console.log(`    - ${chalk.red(item.name)}: ${item.error}`);
      });
    }
    if (results.skipped.length > 0) {
      console.log(chalk.yellow(`  跳过: ${results.skipped.length}`));
    }

    if (results.success.length > 0) {
      console.log(chalk.blue('\n💡 下一步:'));
      console.log(`  ${chalk.gray('$')} freelog-cli collection publish ${chalk.gray('# 发布合集（提交草稿）')}\n`);
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量添加到合集失败', options.debug);
  }
}

