/**
 * batch publish-one 命令
 * 单独发布某个资源的版本
 */

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
 * 执行 batch publish-one 命令
 */
export async function executeBatchPublishOne(
  resourceName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 单独发布资源版本 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch publish-one <resourceName>\n`);
      return;
    }

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

    // 3. 查找资源项
    const item = batchConfig.resources.find((r) => r.name === resourceName);
    
    if (!item) {
      console.log(chalk.red(`❌ 未找到资源: ${resourceName}`));
      console.log(chalk.blue('\n💡 可用资源列表:'));
      batchConfig.resources.forEach((r) => {
        console.log(`  - ${chalk.cyan(r.name)}`);
      });
      return;
    }

    if (item.skip) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 已标记为跳过`));
      return;
    }

    if (!item.resourceId) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 尚未创建，请先执行 batch create`));
      return;
    }

    // 4. 发布资源
    let tempFilePath: string | null = null;
    const publishSpinner = ora(`正在发布 ${resourceName}...`).start();
    
    try {
      // 获取资源信息
      const resourceInfo = await getResourceInfo(item.resourceId, {
        isLoadLatestVersionInfo: 0,
      });
      
      if (!resourceInfo.userId) {
        throw new Error('无法获取用户ID');
      }

      // 构建版本配置
      const versionConfig = batchItemToVersionConfig(
        item,
        batchConfig.defaults,
        item.resourceId,
        resourceInfo.userId
      );

      // 处理文件
      const resourceNameForFile = item.resourceName || item.name;
      const fileResult = await processFileForPublish(versionConfig, resourceNameForFile);
      tempFilePath = fileResult.isTempFile ? fileResult.filePath : null;

      // 检查并上传文件
      await checkAndUploadFile(fileResult.filePath, fileResult.fileSha1);

      // 创建版本
      const versionBody = batchItemToVersionBody(
        item,
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

      await saveBatchResourceConfig(batchConfig, options.config);

      publishSpinner.succeed(`${resourceName} 发布成功`);
      
      console.log(chalk.green('\n✔ ') + '发布成功');
      console.log(chalk.blue(`  资源名称: ${chalk.cyan(resourceName)}`));
      console.log(chalk.blue(`  资源ID: ${chalk.cyan(item.resourceId)}`));
      console.log(chalk.blue(`  版本ID: ${chalk.cyan(versionResult.versionId)}`));
      console.log(chalk.blue(`  文件SHA1: ${chalk.cyan(fileResult.fileSha1)}`));

    } catch (err: unknown) {
      publishSpinner.fail(`发布失败: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    } finally {
      // 清理临时文件
      await cleanupTempFile(tempFilePath);
    }

    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch add-to-collection ${chalk.gray('# 添加到合集')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '发布资源失败', options.debug);
  }
}

