/**
 * batch sync-version 命令
 * 从服务器同步版本信息到批量配置
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
import { syncVersionInfo } from '../../services/resourceOperationService';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch sync-version 命令
 */
export async function executeBatchSyncVersion(
  resourceNames?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 同步版本信息 ===\n'));

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

    // 3. 选择要同步的资源
    let resourcesToSync: BatchResourceItemConfig[] = [];
    
    if (resourceNames) {
      // 如果指定了资源名称（多个用逗号分隔）
      const names = resourceNames.split(',').map((n) => n.trim());
      resourcesToSync = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId && names.includes(item.name)
      );
      
      if (resourcesToSync.length === 0) {
        console.log(chalk.yellow('⚠️  未找到匹配的资源'));
        return;
      }
    } else {
      // 交互式选择资源
      const availableResources = batchConfig.resources.filter(
        (item) => !item.skip && item.resourceId
      );
      
      if (availableResources.length === 0) {
        console.log(chalk.blue('ℹ️  没有已创建的资源可同步'));
        return;
      }
      
      const { selectedResources } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedResources',
          message: '选择要同步版本信息的资源（可多选）:',
          instructions: '使用空格键选择/取消，按 a 全选/取消全选，按 i 反选，回车确认',
          choices: availableResources.map((item) => ({
            name: `${item.name} (${item.resourceId})`,
            value: item.name,
          })),
        },
      ]);
      
      if (selectedResources.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何资源'));
        return;
      }
      
      resourcesToSync = availableResources.filter((item) =>
        selectedResources.includes(item.name)
      );
    }

    // 4. 选择同步模式（覆盖/追加）
    const mode = (options.mode as string) || 'cover';
    let syncMode: 'cover' | 'append' = mode === 'append' ? 'append' : 'cover';
    
    if (!options.mode && resourcesToSync.length > 1) {
      const { mode: selectedMode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'mode',
          message: '选择同步模式:',
          choices: [
            { name: '覆盖模式（完全替换现有版本配置）', value: 'cover' },
            { name: '追加模式（只更新服务器有值的字段）', value: 'append' },
          ],
          default: 'cover',
        },
      ]);
      syncMode = selectedMode;
    }

    // 5. 选择版本（latest 或指定版本）
    const { version } = await inquirer.prompt([
      {
        type: 'input',
        name: 'version',
        message: '请输入版本号（留空使用 latest）:',
        default: 'latest',
      },
    ]);

    const targetVersion = version.trim() === '' || version.trim().toLowerCase() === 'latest' 
      ? 'latest' 
      : version.trim();

    // 5. 批量同步
    const results = {
      success: [] as Array<{ name: string; versionId: string; version: string }>,
      failed: [] as Array<{ name: string; error: string }>,
    };

    for (const item of resourcesToSync) {
      if (!item.resourceId) {
        continue;
      }

      const itemSpinner = ora(`正在同步 ${item.name} 的版本信息...`).start();
      try {
        // 使用统一的服务同步版本信息
        const syncedVersion = await syncVersionInfo(
          item.resourceId,
          targetVersion,
          syncMode
        );

        // 更新批量配置
        const updates: Partial<BatchResourceItemConfig> = {};
        
        if (syncMode === 'cover') {
          // 覆盖模式：完全替换
          updates.version = syncedVersion.version;
          updates.description = syncedVersion.description;
          updates.versionId = syncedVersion.versionId;
          updates.fileSha1 = syncedVersion.fileSha1;
        } else {
          // 追加模式：只更新服务器有值的字段
          if (syncedVersion.version) {
            updates.version = syncedVersion.version;
          }
          if (syncedVersion.description) {
            updates.description = syncedVersion.description;
          }
          if (syncedVersion.versionId) {
            updates.versionId = syncedVersion.versionId;
          }
          if (syncedVersion.fileSha1) {
            updates.fileSha1 = syncedVersion.fileSha1;
          }
        }

        batchConfig = updateBatchResourceItem(batchConfig, item.name, updates);

        itemSpinner.succeed(`${item.name} 版本信息同步成功`);
        results.success.push({
          name: item.name,
          versionId: syncedVersion.versionId || '',
          version: syncedVersion.version,
        });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        itemSpinner.fail(`${item.name} 同步失败: ${errorMessage}`);
        results.failed.push({
          name: item.name,
          error: errorMessage,
        });
      }
    }

    // 6. 保存配置
    if (results.success.length > 0) {
      const saveSpinner = ora('正在保存批量配置...').start();
      try {
        await saveBatchResourceConfig(batchConfig, options.config);
        saveSpinner.succeed('批量配置已保存');
      } catch (err: unknown) {
        saveSpinner.fail('保存批量配置失败');
      }
    }

    // 7. 显示结果
    console.log(chalk.blue('\n📊 同步结果:'));
    console.log(chalk.green(`  成功: ${results.success.length}`));
    results.success.forEach((item) => {
      console.log(`    - ${chalk.cyan(item.name)}: ${chalk.cyan(item.version)} (${item.versionId})`);
    });
    if (results.failed.length > 0) {
      console.log(chalk.red(`  失败: ${results.failed.length}`));
      results.failed.forEach((item) => {
        console.log(`    - ${chalk.red(item.name)}: ${item.error}`);
      });
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '同步版本信息失败', options.debug);
  }
}

