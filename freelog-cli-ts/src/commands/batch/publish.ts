/**
 * batch publish 命令
 * 批量发布资源版本
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import os from 'os';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
  batchItemToVersionConfig,
  batchItemToVersionBody,
  updateBatchResourceItem,
  type BatchResourceOperationResult,
} from '../../services/batchResourceService';
import { createResourceVersion } from '../../api/version';
import { getResourceInfo } from '../../api/resource';
import { uploadFile, checkFileExists } from '../../api/storage';
import { calculateFileSha1 } from '../../utils/crypto';
import { responseToVersionConfig } from '../../services/versionConfigService';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 压缩目录为 ZIP 文件
 */
async function compressDirectory(buildPath: string, outputPath: string, filename: string): Promise<string> {
  const zip = new AdmZip();
  
  const files = await fs.readdir(buildPath);
  
  for (const file of files) {
    const filePath = path.join(buildPath, file);
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      zip.addLocalFolder(filePath, file);
    } else {
      zip.addLocalFile(filePath);
    }
  }
  
  const zipPath = path.join(outputPath, filename);
  await fs.ensureDir(outputPath);
  zip.writeZip(zipPath);
  
  return zipPath;
}

/**
 * 判断是否需要压缩（主题、插件、软件库）
 */
function shouldCompress(resourceType?: string): boolean {
  if (!resourceType) return false;
  const compressTypes = ['主题', '插件', '软件库'];
  return compressTypes.includes(resourceType);
}

/**
 * 发布单个资源版本
 */
async function publishSingleResource(
  item: any,
  defaults: any,
  userId: number
): Promise<{ versionId: string; fileSha1: string; filename: string }> {
  let tempFilePath: string | null = null;
  
  try {
    // 1. 获取资源信息
    const resourceInfo = await getResourceInfo(item.resourceId!, {
      isLoadLatestVersionInfo: 0,
    });
    
    if (!resourceInfo.userId) {
      throw new Error('无法获取用户ID');
    }
    
    // 2. 构建版本配置
    const versionConfig = batchItemToVersionConfig(
      item,
      defaults,
      item.resourceId!,
      resourceInfo.userId
    );
    
    // 3. 处理文件
    const needCompress = shouldCompress(versionConfig.resourceType);
    let filePath: string;
    let filename: string;
    
    const absoluteFilePath = path.resolve(process.cwd(), versionConfig.filePath);
    
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`文件路径不存在: ${versionConfig.filePath}`);
    }
    
    if (needCompress) {
      // 需要压缩
      const stats = await fs.stat(absoluteFilePath);
      if (!stats.isDirectory()) {
        throw new Error(`filePath 应该是目录路径: ${versionConfig.filePath}`);
      }
      
      filename = `${item.resourceName || item.name}-${versionConfig.version}.zip`;
      const tempDir = path.join(os.tmpdir(), 'freelog-batch-publish');
      await fs.ensureDir(tempDir);
      
      filePath = await compressDirectory(absoluteFilePath, tempDir, filename);
      tempFilePath = filePath;
    } else {
      // 直接上传文件
      const stats = await fs.stat(absoluteFilePath);
      if (!stats.isFile()) {
        throw new Error(`filePath 应该是文件路径: ${versionConfig.filePath}`);
      }
      
      filename = path.basename(absoluteFilePath);
      filePath = absoluteFilePath;
    }
    
    // 4. 计算文件 SHA1
    const fileSha1 = await calculateFileSha1(filePath);
    
    // 5. 检查文件是否已存在
    let fileExists = false;
    try {
      const existInfoList = await checkFileExists(fileSha1);
      fileExists = existInfoList[0]?.isExisting || false;
    } catch {
      // 忽略检查错误
    }
    
    // 6. 上传文件（如果需要）
    if (!fileExists) {
      await uploadFile(filePath);
    }
    
    // 7. 创建版本
    const versionBody = batchItemToVersionBody(
      item,
      defaults,
      item.resourceId!,
      fileSha1,
      filename
    );
    
    const versionResult = await createResourceVersion(versionConfig.resourceId, versionBody);
    
    return {
      versionId: versionResult.versionId,
      fileSha1,
      filename,
    };
  } finally {
    // 清理临时文件
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.remove(tempFilePath);
    }
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
    let batchConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      spinner.succeed('批量配置加载成功');
    } catch (err: any) {
      spinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 过滤需要发布的资源（有 resourceId 但没有 versionId 的，跳过标记为 skip 的）
    const resourcesToPublish = batchConfig.resources.filter(
      (item) => !item.skip && item.resourceId && !item.versionId
    );

    if (resourcesToPublish.length === 0) {
      console.log(chalk.blue('\nℹ️  所有资源都已发布，或缺少 resourceId'));
      return;
    }

    // 4. 显示将要发布的资源列表
    console.log(chalk.blue('\n📋 将要发布的资源列表:'));
    resourcesToPublish.forEach((item, index) => {
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

    for (const item of resourcesToPublish) {
      const itemSpinner = ora(`正在发布 ${item.name}...`).start();
      try {
        // 获取用户ID（从资源信息获取）
        const resourceInfo = await getResourceInfo(item.resourceId!, {
          isLoadLatestVersionInfo: 0,
        });
        
        const publishResult = await publishSingleResource(
          item,
          batchConfig.defaults,
          resourceInfo.userId || 0
        );
        
        // 更新批量配置
        batchConfig = updateBatchResourceItem(batchConfig, item.name, {
          versionId: publishResult.versionId,
          fileSha1: publishResult.fileSha1,
        });
        
        itemSpinner.succeed(`${item.name} 发布成功`);
        results.success.push({
          name: item.name,
          resourceId: item.resourceId!,
          resourceName: item.resourceName,
          versionId: publishResult.versionId,
        });
      } catch (err: any) {
        itemSpinner.fail(`${item.name} 发布失败: ${err.message}`);
        results.failed.push({
          name: item.name,
          error: err.message,
        });
      }
    }

    // 7. 保存批量配置
    if (results.success.length > 0) {
      const saveSpinner = ora('正在保存批量配置...').start();
      try {
        await saveBatchResourceConfig(batchConfig, options.config);
        saveSpinner.succeed('批量配置已保存');
      } catch (err: any) {
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

  } catch (err: any) {
    handleErrorAndExit(err, '批量发布失败', options.debug);
  }
}

