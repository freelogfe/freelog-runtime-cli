/**
 * batch update 命令
 * 批量更新资源信息（intro、coverImages、tags、status等）
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
  updateBatchResourceItem,
} from '../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { updateResource, getResourceInfo } from '../../api/resource';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch update 命令
 */
export async function executeBatchUpdate(
  resourceNames?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量更新资源信息 ===\n'));

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
          message: '选择要更新的资源（可多选）:',
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
        message: '选择要更新的字段:',
        choices: [
          { name: '资源介绍 (intro)', value: 'intro' },
          { name: '封面图 (coverImages)', value: 'coverImages' },
          { name: '标签 (tags)', value: 'tags' },
          { name: '资源状态 (status)', value: 'status' },
        ],
      },
    ]);

    if (fields.length === 0) {
      console.log(chalk.blue('ℹ️  未选择任何字段'));
      return;
    }

    // 5. 获取更新值
    const updates: {
      intro?: string;
      coverImages?: string[];
      tags?: string[];
      status?: number;
    } = {};

    if (fields.includes('intro')) {
      const { intro } = await inquirer.prompt([
        {
          type: 'input',
          name: 'intro',
          message: '请输入资源介绍:',
          default: '',
        },
      ]);
      updates.intro = intro.trim() || undefined;
    }

    if (fields.includes('coverImages')) {
      const { coverImages } = await inquirer.prompt([
        {
          type: 'input',
          name: 'coverImages',
          message: '请输入封面图URL（多个用逗号分隔）:',
          default: '',
        },
      ]);
      updates.coverImages = coverImages
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0);
    }

    if (fields.includes('tags')) {
      const { tags } = await inquirer.prompt([
        {
          type: 'input',
          name: 'tags',
          message: '请输入标签（多个用逗号分隔）:',
          default: '',
        },
      ]);
      updates.tags = tags
        .split(',')
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0);
    }

    if (fields.includes('status')) {
      const { status } = await inquirer.prompt([
        {
          type: 'list',
          name: 'status',
          message: '选择资源状态:',
          choices: [
            { name: '待发行 (0)', value: 0 },
            { name: '上架 (1)', value: 1 },
            { name: '冻结 (2)', value: 2 },
            { name: '下架 (4)', value: 4 },
          ],
        },
      ]);
      updates.status = status;
    }

    // 6. 确认更新
    console.log(chalk.blue('\n📋 将要更新的资源:'));
    resourcesToUpdate.forEach((item) => {
      console.log(`  - ${chalk.cyan(item.name)} (${item.resourceId})`);
    });

    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: `确认更新 ${resourcesToUpdate.length} 个资源？`,
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 7. 批量更新
    const results = {
      success: [] as Array<{ name: string; resourceId: string }>,
      failed: [] as Array<{ name: string; error: string }>,
    };

    for (const item of resourcesToUpdate) {
      if (!item.resourceId) {
        continue;
      }

      const itemSpinner = ora(`正在更新 ${item.name}...`).start();
      try {
        // 构建资源配置（用于更新）
        const resourceConfig = batchItemToResourceConfig(item, batchConfig.defaults);
        resourceConfig.resourceId = item.resourceId!;

        // 使用统一的服务更新资源信息
        const updatedResource = await updateResourceInfo(
          item.resourceId!,
          resourceConfig,
          {
            intro: updates.intro,
            coverImages: updates.coverImages,
            tags: updates.tags,
            status: updates.status,
          }
        );

        // 更新本地配置
        batchConfig = updateBatchResourceItem(batchConfig, item.name, {
          intro: updatedResource.intro,
          coverImages: updatedResource.coverImages,
          tags: updatedResource.tags,
          status: updatedResource.status,
        });

        itemSpinner.succeed(`${item.name} 更新成功`);
        results.success.push({
          name: item.name,
          resourceId: item.resourceId,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        itemSpinner.fail(`${item.name} 更新失败: ${errorMessage}`);
        results.failed.push({
          name: item.name,
          error: errorMessage,
        });
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
    console.log(chalk.blue('\n📊 更新结果:'));
    console.log(chalk.green(`  成功: ${results.success.length}`));
    if (results.failed.length > 0) {
      console.log(chalk.red(`  失败: ${results.failed.length}`));
      results.failed.forEach((item) => {
        console.log(`    - ${chalk.red(item.name)}: ${item.error}`);
      });
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量更新资源失败', options.debug);
  }
}

