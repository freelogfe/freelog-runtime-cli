/**
 * batch publish 命令
 * 批量发布资源版本
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
  batchItemToVersionConfig,
  batchItemToVersionBody,
  batchItemToCreateBody,
  updateBatchResourceItem,
} from '../../services/batchResourceService';
import type {
  BatchResourceOperationResult,
  BatchResourceConfig,
  BatchResourceItemConfig,
} from '../../../public/freelog.batch-resources';
import { createResourceVersion } from '../../api/version';
import { getResourceInfo } from '../../api/resource';
import {
  processFileForPublish,
  checkAndUploadFile,
  cleanupTempFile,
} from '../../services/publishService';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 发布单个资源版本
 */
async function publishSingleResource(
  item: BatchResourceItemConfig,
  defaults: BatchResourceConfig['defaults'],
  userId: number
): Promise<{ versionId: string; fileSha1: string; filename: string }> {
  let tempFilePath: string | null = null;
  
  try {
    if (!item.resourceId) {
      throw new Error('资源ID不能为空');
    }
    
    // 1. 获取资源信息
    const resourceInfo = await getResourceInfo(item.resourceId, {
      isLoadLatestVersionInfo: 0,
    });
    
    if (!resourceInfo.userId) {
      throw new Error('无法获取用户ID');
    }
    
    // 2. 构建版本配置
    const versionConfig = batchItemToVersionConfig(
      item,
      defaults,
      item.resourceId,
      resourceInfo.userId
    );
    
    // 3. 处理文件（使用公共服务）
    const resourceName = item.resourceName || item.name;
    const fileResult = await processFileForPublish(versionConfig, resourceName);
    tempFilePath = fileResult.isTempFile ? fileResult.filePath : null;
    
    // 4. 检查文件是否已存在并上传（如果需要）
    await checkAndUploadFile(fileResult.filePath, fileResult.fileSha1);
    
    // 5. 创建版本
    const versionBody = batchItemToVersionBody(
      item,
      defaults,
      item.resourceId,
      fileResult.fileSha1,
      fileResult.filename
    );
    
    const versionResult = await createResourceVersion(versionConfig.resourceId, versionBody);
    
    if (!versionResult.versionId) {
      throw new Error('创建版本失败：未返回版本ID');
    }
    
    return {
      versionId: versionResult.versionId,
      fileSha1: fileResult.fileSha1,
      filename: fileResult.filename,
    };
  } finally {
    // 清理临时文件
    await cleanupTempFile(tempFilePath);
  }
}

/**
 * 执行 batch publish 命令
 */
export async function executeBatchPublish(
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量发布资源版本 ===\n'));

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

    // 3. 处理发布模式
    const forcePublish = options.force as boolean;
    let resourcesToPublish: BatchResourceItemConfig[] = [];
    const resourcesToCreate: BatchResourceItemConfig[] = [];

    if (forcePublish) {
      // 强制发布：没有 resourceId 的资源先创建，然后发布
      const allResources = batchConfig.resources.filter((item) => !item.skip);
      
      for (const item of allResources) {
        if (!item.resourceId) {
          // 需要先创建
          resourcesToCreate.push(item);
        } else if (!item.versionId) {
          // 可以直接发布
          resourcesToPublish.push(item);
        } else if (forcePublish) {
          // 强制发布：即使已有 versionId 也重新发布
          resourcesToPublish.push(item);
        }
      }
    } else {
      // 默认：只发布有 resourceId 但没有 versionId 的
      resourcesToPublish = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId && !item.versionId
      );
    }

    // 4. 如果有需要先创建的资源，先创建它们
    if (resourcesToCreate.length > 0 && forcePublish) {
      console.log(chalk.blue(`\n📋 发现 ${resourcesToCreate.length} 个资源需要先创建:`));
      resourcesToCreate.forEach((item) => {
        console.log(`  - ${chalk.cyan(item.name)}`);
      });

      const { confirmCreate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmCreate',
          message: `是否先创建这 ${resourcesToCreate.length} 个资源？`,
          default: true,
        },
      ]);

      if (confirmCreate) {
        const createBodies = resourcesToCreate.map((item: BatchResourceItemConfig) =>
          batchItemToCreateBody(item, batchConfig.defaults)
        );

        const createSpinner = ora(`正在创建 ${resourcesToCreate.length} 个资源...`).start();
        try {
          const { batchCreateResources } = await import('../../api/resource');
          const results = await batchCreateResources({ resources: createBodies });
          
          // 更新批量配置
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const item = resourcesToCreate[i];
            batchConfig = updateBatchResourceItem(batchConfig, item.name, {
              resourceId: result.resourceId,
              resourceName: result.resourceName,
            });
            // 添加到发布列表
            resourcesToPublish.push({
              ...item,
              resourceId: result.resourceId,
              resourceName: result.resourceName,
            });
          }
          
          createSpinner.succeed(`成功创建 ${results.length} 个资源`);
          await saveBatchResourceConfig(batchConfig, options.config);
        } catch (err: unknown) {
          createSpinner.fail('创建资源失败');
          throw err;
        }
      } else {
        console.log(chalk.blue('ℹ️  跳过创建，只发布已有 resourceId 的资源'));
      }
    }

    if (resourcesToPublish.length === 0) {
      console.log(chalk.blue('\nℹ️  没有需要发布的资源'));
      return;
    }

    // 4. 显示将要发布的资源列表
    console.log(chalk.blue('\n📋 将要发布的资源列表:'));
    resourcesToPublish.forEach((item: BatchResourceItemConfig, index: number) => {
      console.log(
        `  ${index + 1}. ${chalk.cyan(item.resourceName || item.name)} ${chalk.gray(`(${item.resourceId})`)}`
      );
    });

    // 5. 确认发布
    const { confirmPublish } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmPublish',
        message: `确认批量发布 ${resourcesToPublish.length} 个资源版本？`,
        default: true,
      },
    ]);

    if (!confirmPublish) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 6. 批量发布
    const results: BatchResourceOperationResult = {
      success: [],
      failed: [],
      skipped: [],
    };

    for (const item of resourcesToPublish as BatchResourceItemConfig[]) {
      const itemSpinner = ora(`正在发布 ${item.name}...`).start();
      try {
        if (!item.resourceId) {
          throw new Error('资源ID不能为空');
        }
        
        // publishSingleResource 内部会获取资源信息（包括 userId），这里直接调用即可
        const publishResult = await publishSingleResource(
          item,
          batchConfig.defaults,
          0 // userId 会在 publishSingleResource 内部获取
        );
        
        // 更新批量配置
        batchConfig = updateBatchResourceItem(batchConfig, item.name, {
          versionId: publishResult.versionId,
          fileSha1: publishResult.fileSha1,
        });
        
        itemSpinner.succeed(`${item.name} 发布成功`);
        results.success.push({
          name: item.name,
          resourceId: item.resourceId,
          resourceName: item.resourceName,
          versionId: publishResult.versionId,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        itemSpinner.fail(`${item.name} 发布失败: ${errorMessage}`);
        results.failed.push({
          name: item.name,
          error: errorMessage,
        });
      }
    }

    // 7. 保存批量配置
    if (results.success.length > 0) {
      const saveSpinner = ora('正在保存批量配置...').start();
      try {
        await saveBatchResourceConfig(batchConfig, options.config);
        saveSpinner.succeed('批量配置已保存');
      } catch (err: unknown) {
        saveSpinner.fail('保存批量配置失败');
        console.log(chalk.yellow(`⚠️  请手动更新配置文件`));
      }
    }

    // 8. 显示结果
    console.log(chalk.blue('\n📊 发布结果:'));
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
      console.log(`  ${chalk.gray('$')} freelog-cli batch add-to-collection ${chalk.gray('# 批量添加到合集')}\n`);
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量发布失败', options.debug);
  }
}

