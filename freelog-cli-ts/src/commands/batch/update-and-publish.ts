/**
 * batch update-and-publish 命令
 * 更新版本信息并发布版本（一次性完成）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
  batchItemToVersionConfig,
  batchItemToVersionBody,
  updateBatchResourceItem,
} from '../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { createResourceVersion } from '../../api/version';
import { getResourceInfo } from '../../api/resource';
import {
  processFileForPublish,
  checkAndUploadFile,
  cleanupTempFile,
} from '../../services/publishService';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch update-and-publish 命令
 */
export async function executeBatchUpdateAndPublish(
  resourceNames?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 更新版本信息并发布 ===\n'));

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

    // 3. 选择要更新的资源
    let resourcesToUpdate: BatchResourceItemConfig[] = [];
    
    if (resourceNames) {
      // 如果指定了资源名称（多个用逗号分隔）
      const names = resourceNames.split(',').map((n) => n.trim());
      resourcesToUpdate = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId && names.includes(item.name)
      );
      
      if (resourcesToUpdate.length === 0) {
        console.log(chalk.yellow('⚠️  未找到匹配的资源'));
        return;
      }
    } else {
      // 交互式选择资源
      const availableResources = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId
      );
      
      if (availableResources.length === 0) {
        console.log(chalk.blue('ℹ️  没有已创建的资源可更新'));
        return;
      }
      
      const { selectedResources } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedResources',
          message: '选择要更新并发布的资源（可多选）:',
          choices: availableResources.map((item) => ({
            name: `${item.name} (${item.resourceName || item.name})`,
            value: item.name,
          })),
        },
      ]);
      
      if (selectedResources.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何资源'));
        return;
      }
      
      resourcesToUpdate = availableResources.filter((item) =>
        selectedResources.includes(item.name)
      );
    }

    // 4. 选择要更新的字段
    const { fields } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'fields',
        message: '选择要更新的版本字段:',
        choices: [
          { name: '版本号 (version)', value: 'version' },
          { name: '版本描述 (description)', value: 'description' },
          { name: '文件路径 (filePath)', value: 'filePath' },
        ],
      },
    ]);

    // 5. 获取更新值（统一设置）
    const updates: {
      version?: string;
      description?: string;
      filePath?: string;
    } = {};

    if (fields.includes('version')) {
      const { version } = await inquirer.prompt([
        {
          type: 'input',
          name: 'version',
          message: '请输入版本号（格式: x.y.z）:',
          default: batchConfig.defaults.version || '1.0.0',
          validate: (input: string) => {
            if (!input.trim()) {
              return '版本号不能为空';
            }
            const versionPattern = /^\d+\.\d+\.\d+$/;
            if (!versionPattern.test(input.trim())) {
              return '版本号格式不正确，应为 x.y.z（如: 1.0.0）';
            }
            return true;
          },
        },
      ]);
      updates.version = version.trim();
    }

    if (fields.includes('description')) {
      const { description } = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: '请输入版本描述:',
          default: batchConfig.defaults.description || '',
        },
      ]);
      updates.description = description.trim() || undefined;
    }

    if (fields.includes('filePath')) {
      const { filePath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filePath',
          message: '请输入文件路径（相对于当前目录）:',
          default: '',
          validate: (input: string) => {
            if (!input.trim()) {
              return '文件路径不能为空';
            }
            const fullPath = path.resolve(process.cwd(), input.trim());
            if (!fs.existsSync(fullPath)) {
              return '文件或目录不存在';
            }
            return true;
          },
        },
      ]);
      updates.filePath = path.relative(process.cwd(), path.resolve(process.cwd(), filePath.trim()));
    }

    // 6. 确认操作
    console.log(chalk.blue('\n📋 将要更新并发布的资源:'));
    resourcesToUpdate.forEach((item) => {
      console.log(`  - ${chalk.cyan(item.name)}`);
    });

    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: `确认更新版本信息并发布 ${resourcesToUpdate.length} 个资源？`,
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 7. 更新并发布
    const results = {
      success: [] as Array<{ name: string; versionId: string }>,
      failed: [] as Array<{ name: string; error: string }>,
    };

    for (const item of resourcesToUpdate) {
      if (!item.resourceId) {
        continue;
      }

      let tempFilePath: string | null = null;
      const itemSpinner = ora(`正在处理 ${item.name}...`).start();
      
      try {
        // 更新配置
        const itemUpdates: Partial<BatchResourceItemConfig> = {};
        if (updates.version) {
          itemUpdates.version = updates.version;
        }
        if (updates.description !== undefined) {
          itemUpdates.description = updates.description;
        }
        if (updates.filePath) {
          itemUpdates.filePath = updates.filePath;
        }
        
        const updatedItem = { ...item, ...itemUpdates };
        batchConfig = updateBatchResourceItem(batchConfig, item.name, itemUpdates);

        // 获取资源信息
        const resourceInfo = await getResourceInfo(item.resourceId, {
          isLoadLatestVersionInfo: 0,
        });
        
        if (!resourceInfo.userId) {
          throw new Error('无法获取用户ID');
        }

        // 构建版本配置
        const versionConfig = batchItemToVersionConfig(
          updatedItem,
          batchConfig.defaults,
          item.resourceId,
          resourceInfo.userId
        );

        // 处理文件
        const resourceNameForFile = updatedItem.resourceName || updatedItem.name;
        const fileResult = await processFileForPublish(versionConfig, resourceNameForFile);
        tempFilePath = fileResult.isTempFile ? fileResult.filePath : null;

        // 检查并上传文件
        await checkAndUploadFile(fileResult.filePath, fileResult.fileSha1);

        // 创建版本
        const versionBody = batchItemToVersionBody(
          updatedItem,
          batchConfig.defaults,
          item.resourceId,
          fileResult.fileSha1,
          fileResult.filename
        );

        const versionResult = await createResourceVersion(item.resourceId, versionBody);

        if (!versionResult.versionId) {
          throw new Error('创建版本失败：未返回版本ID');
        }

        // 更新批量配置
        batchConfig = updateBatchResourceItem(batchConfig, item.name, {
          versionId: versionResult.versionId,
          fileSha1: fileResult.fileSha1,
        });

        itemSpinner.succeed(`${item.name} 更新并发布成功`);
        results.success.push({
          name: item.name,
          versionId: versionResult.versionId,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        itemSpinner.fail(`${item.name} 失败: ${errorMessage}`);
        results.failed.push({
          name: item.name,
          error: errorMessage,
        });
      } finally {
        // 清理临时文件
        await cleanupTempFile(tempFilePath);
      }
    }

    // 8. 保存配置
    if (results.success.length > 0) {
      const saveSpinner = ora('正在保存批量配置...').start();
      try {
        await saveBatchResourceConfig(batchConfig, options.config);
        saveSpinner.succeed('批量配置已保存');
      } catch (err: unknown) {
        saveSpinner.fail('保存批量配置失败');
      }
    }

    // 9. 显示结果
    console.log(chalk.blue('\n📊 操作结果:'));
    console.log(chalk.green(`  成功: ${results.success.length}`));
    if (results.failed.length > 0) {
      console.log(chalk.red(`  失败: ${results.failed.length}`));
      results.failed.forEach((item) => {
        console.log(`    - ${chalk.red(item.name)}: ${item.error}`);
      });
    }

    if (results.success.length > 0) {
      console.log(chalk.blue('\n💡 下一步:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch add-to-collection ${chalk.gray('# 添加到合集')}\n`);
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '更新并发布失败', options.debug);
  }
}

