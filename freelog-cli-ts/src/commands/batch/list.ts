/**
 * batch list 命令
 * 列出批量配置中的所有资源及其状态
 */

import ora from 'ora';
import chalk from 'chalk';
import Table from 'cli-table3';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import {
  loadBatchResourceConfig,
} from '../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch list 命令
 */
export async function executeBatchList(
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量资源列表 ===\n'));

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

    // 3. 显示资源列表
    if (batchConfig.resources.length === 0) {
      console.log(chalk.blue('ℹ️  批量配置中没有资源'));
      return;
    }

    // 创建表格
    const table = new Table({
      head: [
        '序号',
        '名称',
        '资源名称',
        '资源ID',
        '版本ID',
        '文件路径',
        '状态',
      ],
      colWidths: [6, 20, 20, 28, 28, 30, 12],
    });

    batchConfig.resources.forEach((item: BatchResourceItemConfig, index: number) => {
      const status = [];
      if (item.skip) {
        status.push(chalk.gray('跳过'));
      } else if (!item.resourceId) {
        status.push(chalk.yellow('未创建'));
      } else if (!item.versionId) {
        status.push(chalk.blue('未发布'));
      } else {
        status.push(chalk.green('已发布'));
      }

      table.push([
        index + 1,
        item.name,
        item.resourceName || item.name,
        item.resourceId || chalk.gray('-'),
        item.versionId || chalk.gray('-'),
        item.filePath,
        status.join(' '),
      ]);
    });

    console.log(table.toString());

    // 4. 显示统计信息
    const stats = {
      total: batchConfig.resources.length,
      skipped: batchConfig.resources.filter((item) => item.skip).length,
      notCreated: batchConfig.resources.filter((item) => !item.skip && !item.resourceId).length,
      notPublished: batchConfig.resources.filter((item) => !item.skip && item.resourceId && !item.versionId).length,
      published: batchConfig.resources.filter((item) => !item.skip && item.resourceId && item.versionId).length,
    };

    console.log(chalk.blue('\n📊 统计信息:'));
    console.log(`  总计: ${stats.total}`);
    console.log(`  ${chalk.green('已发布')}: ${stats.published}`);
    console.log(`  ${chalk.blue('未发布')}: ${stats.notPublished}`);
    console.log(`  ${chalk.yellow('未创建')}: ${stats.notCreated}`);
    if (stats.skipped > 0) {
      console.log(`  ${chalk.gray('跳过')}: ${stats.skipped}`);
    }

    // 5. 显示默认配置
    console.log(chalk.blue('\n⚙️  默认配置:'));
    console.log(`  资源类型: ${batchConfig.defaults.resourceType.join(', ')}`);
    console.log(`  资源类型代码: ${batchConfig.defaults.resourceTypeCode}`);
    if (batchConfig.defaults.version) {
      console.log(`  默认版本号: ${batchConfig.defaults.version}`);
    }
    if (batchConfig.defaults.description) {
      console.log(`  默认版本描述: ${batchConfig.defaults.description}`);
    }

    console.log(chalk.blue('\n💡 可用命令:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch create                  ${chalk.gray('# 批量创建资源')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish                ${chalk.gray('# 批量发布版本')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch update                 ${chalk.gray('# 批量更新资源信息')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch update-version         ${chalk.gray('# 批量更新版本信息')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '列出资源失败', options.debug);
  }
}

