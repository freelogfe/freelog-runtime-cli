/**
 * batch load-from-collection 命令
 * 从合集中拉取单品列表并填充到批量配置
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
import { loadCollectionConfig } from '../../services/collectionConfigService';
import { getCollectionItems } from '../../api/collection';
import { getResourceInfo } from '../../api/resource';
import type { BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch load-from-collection 命令
 */
export async function executeBatchLoadFromCollection(
  collectionConfig?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 从合集拉取单品列表 ===\n'));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载合集配置
    const spinner = ora('正在加载合集配置...').start();
    let collectionConfigData;
    let collectionId: string;
    
    try {
      if (collectionConfig) {
        collectionConfigData = await loadCollectionConfig(collectionConfig);
      } else {
        collectionConfigData = await loadCollectionConfig();
      }
      
      if (!collectionConfigData.resourceId) {
        throw new Error('合集配置中缺少 resourceId');
      }
      
      collectionId = collectionConfigData.resourceId;
      spinner.succeed(`合集配置加载成功: ${collectionId}`);
    } catch (err: unknown) {
      spinner.fail('加载合集配置失败');
      
      // 如果加载失败，尝试直接使用 collectionId
      if (options.collectionId) {
        collectionId = options.collectionId as string;
        spinner.succeed(`使用指定的合集ID: ${collectionId}`);
      } else {
        throw err;
      }
    }

    // 3. 选择模式（覆盖/追加）
    const mode = (options.mode as string) || 'append';
    let syncMode: 'cover' | 'append' = mode === 'cover' ? 'cover' : 'append';
    
    if (!options.mode) {
      const { mode: selectedMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'mode',
          message: '选择同步模式:',
          choices: [
            { name: '追加模式（保留现有资源，添加新资源）', value: 'append' },
            { name: '覆盖模式（清空现有资源，只保留从合集拉取的）', value: 'cover' },
          ],
          default: 'append',
        },
      ]);
      syncMode = selectedMode;
    }

    // 4. 加载批量配置
    const batchSpinner = ora('正在加载批量配置...').start();
    let batchConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      batchSpinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      // 如果批量配置不存在，创建新的
      batchSpinner.warn('批量配置文件不存在，将创建新配置');
      
      // 需要先初始化批量配置
      const { executeBatchInit } = await import('./init');
      // 这里不能直接调用，需要用户先初始化
      throw new Error('批量配置文件不存在，请先执行 batch init 初始化配置');
    }

    // 5. 从合集拉取单品列表
    const fetchSpinner = ora('正在从合集拉取单品列表...').start();
    let collectionItems;
    try {
      const response = await getCollectionItems(collectionId, {
        page: 1,
        pageSize: 1000, // 获取所有单品
      });
      collectionItems = response.items;
      fetchSpinner.succeed(`成功拉取 ${collectionItems.length} 个单品`);
    } catch (err: unknown) {
      fetchSpinner.fail('拉取单品列表失败');
      throw err;
    }

    if (collectionItems.length === 0) {
      console.log(chalk.blue('ℹ️  合集中没有单品'));
      return;
    }

    // 6. 获取每个单品的详细信息
    const detailSpinner = ora('正在获取单品详细信息...').start();
    const newItems: BatchResourceItemConfig[] = [];
    
    try {
      for (let i = 0; i < collectionItems.length; i++) {
        const item = collectionItems[i];
        detailSpinner.text = `正在获取 ${i + 1}/${collectionItems.length} 个单品信息...`;
        
        try {
          // 获取资源详细信息
          const resourceInfo = await getResourceInfo(item.resourceId, {
            isLoadLatestVersionInfo: 1, // 加载最新版本信息
          });

          // 构建批量资源项配置
          const batchItem: BatchResourceItemConfig = {
            name: item.resourceName || item.resourceId,
            resourceName: item.resourceName,
            resourceTitle: resourceInfo.resourceTitle,
            intro: resourceInfo.intro,
            coverImages: resourceInfo.coverImages || [],
            tags: resourceInfo.tags || [],
            resourceId: item.resourceId,
            resourceType: Array.isArray(resourceInfo.resourceType) 
              ? resourceInfo.resourceType 
              : [resourceInfo.resourceType || ''],
            resourceTypeCode: resourceInfo.resourceTypeCode,
            filePath: '', // 文件路径需要用户后续配置
          };

          // 如果有版本信息，填充版本相关字段
          if (resourceInfo.latestVersionInfo) {
            const version = resourceInfo.latestVersionInfo;
            batchItem.version = version.version;
            batchItem.description = version.description ?? undefined;
            batchItem.versionId = version.versionId ?? undefined;
            batchItem.fileSha1 = version.fileSha1 ?? undefined;
          } else if (item.version) {
            batchItem.version = item.version;
            batchItem.versionId = item.versionId;
          }

          newItems.push(batchItem);
        } catch (err: unknown) {
          console.log(chalk.yellow(`\n⚠️  获取资源 ${item.resourceId} 信息失败: ${err instanceof Error ? err.message : String(err)}`));
        }
      }
      
      detailSpinner.succeed(`成功获取 ${newItems.length} 个单品的详细信息`);
    } catch (err: unknown) {
      detailSpinner.fail('获取单品详细信息失败');
      throw err;
    }

    // 7. 合并到批量配置
    if (syncMode === 'cover') {
      // 覆盖模式：清空现有资源，只保留从合集拉取的
      batchConfig.resources = newItems;
      console.log(chalk.blue(`\n📋 覆盖模式：已清空现有资源，添加 ${newItems.length} 个新资源`));
    } else {
      // 追加模式：保留现有资源，添加新资源（去重）
      const existingNames = new Set(batchConfig.resources.map((item) => item.name));
      const existingResourceIds = new Set(
        batchConfig.resources
          .map((item) => item.resourceId)
          .filter((id): id is string => !!id)
      );

      let addedCount = 0;
      let skippedCount = 0;

      for (const newItem of newItems) {
        // 检查是否已存在（通过 name 或 resourceId）
        if (
          existingNames.has(newItem.name) ||
          (newItem.resourceId && existingResourceIds.has(newItem.resourceId))
        ) {
          skippedCount++;
          continue;
        }

        batchConfig.resources.push(newItem);
        existingNames.add(newItem.name);
        if (newItem.resourceId) {
          existingResourceIds.add(newItem.resourceId);
        }
        addedCount++;
      }

      console.log(chalk.blue(`\n📋 追加模式：添加 ${addedCount} 个新资源，跳过 ${skippedCount} 个已存在的资源`));
    }

    // 8. 保存批量配置
    const saveSpinner = ora('正在保存批量配置...').start();
    try {
      await saveBatchResourceConfig(batchConfig, options.config);
      saveSpinner.succeed('批量配置已保存');
    } catch (err: unknown) {
      saveSpinner.fail('保存批量配置失败');
      throw err;
    }

    // 9. 显示结果
    console.log(chalk.green('\n✔ ') + '从合集拉取单品完成');
    console.log(chalk.blue(`\n📊 统计:`));
    console.log(`  从合集拉取: ${collectionItems.length} 个`);
    console.log(`  成功获取信息: ${newItems.length} 个`);
    if (syncMode === 'append') {
      console.log(`  新增到配置: ${batchConfig.resources.length - (batchConfig.resources.length - newItems.length)} 个`);
    } else {
      console.log(`  配置中资源总数: ${batchConfig.resources.length} 个`);
    }

    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch list                  ${chalk.gray('# 查看资源列表')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch update-version       ${chalk.gray('# 更新文件路径等信息')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish               ${chalk.gray('# 发布版本')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '从合集拉取单品失败', options.debug);
  }
}

