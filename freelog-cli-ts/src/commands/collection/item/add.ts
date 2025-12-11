/**
 * collection item add 命令
 * 添加合集单品（只处理上抛资源，不需要与单品本身签约）
 */

import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { loadCollectionConfig } from '../../../services/collectionConfigService';
import { 
  batchAddCollectionItemsDraft,
  type BatchAddCollectionItemsDraftBody,
  type ResolveResource,
} from '../../../api/collection';
import { handleErrorAndExit } from '../../../utils/errorHandler';
import type { CollectionConfig, CollectionItemConfig } from '../../../../public/freelog.collection';
import {
  addCollectionItem,
  type CollectionItemConfigOperations,
} from '../../../services/dependencyAddService';


/**
 * 执行 collection item add 命令
 */
export async function executeCollectionItemAdd(
  resourceIdOrName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    // 配置操作接口
    const configOps: CollectionItemConfigOperations<CollectionConfig> = {
      loadConfig: loadCollectionConfig,
      saveConfig: async (config, customPath) => {
        const { saveCollectionConfig } = await import('../../../services/collectionConfigService');
        return saveCollectionConfig(config, customPath);
      },
      getCurrentResourceId: (config) => config.resourceId,
      addItemToConfig: async (config, item) => {
        if (!config.items) {
          config.items = [];
        }
        const existingIndex = config.items.findIndex(
          item => item.resourceId === item.resourceId
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
        const existing = config.items?.find(item => item.resourceId === resourceId);
        return {
          exists: !!existing,
          item: existing,
        };
      },
    };

    // 调用合集单品添加逻辑（只处理上抛资源，不处理单品本身签约）
    const result = await addCollectionItem(resourceIdOrName, options, configOps);

    // 添加到草稿（合集特有，使用返回的 resolveResources）
    const collectionConfig = await loadCollectionConfig(options.config);
    if (!collectionConfig.resourceId) {
      console.log(chalk.red('\n❌ 合集配置中未设置 resourceId'));
      throw new Error('未设置合集 resourceId');
    }

    const addSpinner = ora('正在添加单品到草稿...').start();
    try {
      const version = result.targetVersion === "*" 
        ? result.resourceInfo.latestVersion || "*" 
        : result.targetVersion.replace(/^\^/, "");
      
      const addBody: BatchAddCollectionItemsDraftBody = {
        items: [{
          resourceId: result.resourceInfo.resourceId,
          version: version,
          resolveResources: result.resolveResources.length > 0 ? result.resolveResources as ResolveResource[] : undefined,
        }],
      };

      await batchAddCollectionItemsDraft(collectionConfig.resourceId, addBody);
      addSpinner.succeed('单品已添加到草稿');
    } catch (err: any) {
      addSpinner.fail('添加单品到草稿失败');
      console.log(chalk.yellow(`⚠️  请手动将单品添加到草稿: ${err.message}`));
    }

    console.log(chalk.blue('\n💡 提示:'));
    console.log(`  ${chalk.gray('$')} freelog-cli2 collection publish  ${chalk.gray('# 发布合集（提交草稿）')}`);

  } catch (err: any) {
    if (err.message === "用户取消添加单品") {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }
    handleErrorAndExit(err, '添加合集单品失败', options.debug);
  }
}

