/**
 * 发布命令（新版本 - 支持双配置文件）
 * 1. 从两个配置文件读取信息
 * 2. 根据 resourceType 判断文件处理方式
 * 3. 压缩或上传文件
 * 4. 创建资源版本
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import os from 'os';
import { requireAuth } from '../core/auth';
import { CommandOptions } from '../types';
import {
  loadResourceConfig,
  saveResourceConfig,
  responseToResourceConfig,
} from '../services/resourceConfigService';
import {
  loadVersionConfig,
  saveVersionConfig,
  versionConfigToVersionBody,
} from '../services/versionConfigService';
import { createResourceVersion } from '../api/update';
import { getResourceInfo } from '../api/resourceGet';
import { createResource } from '../api/create';
import { resourceConfigToCreateBody } from '../services/resourceConfigService';
import { uploadFile, checkFileExists, getResourcesByFileSha1 } from '../api/storage';
import { calculateFileSha1 } from '../utils/crypto';
import { responseToVersionConfig } from '../services/versionConfigService';

/**
 * 压缩目录为 ZIP 文件
 */
async function compressDirectory(buildPath: string, outputPath: string, filename: string): Promise<string> {
  const zip = new AdmZip();
  
  // 读取目录内容
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
  
  // 生成 ZIP 文件
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

export async function executePublish(options: CommandOptions): Promise<void> {
  let tempFilePath: string | null = null;
  
  try {
    // 1. 检查登录
    const auth = requireAuth();
    console.log(chalk.cyan('\n=== 发布作品 ===\n'));
    console.log(chalk.blue('ℹ ') + `登录用户: ${auth.username}`);
    
    // 2. 加载配置文件
    const spinner = ora('正在加载配置文件...').start();
    let resourceConfig, versionConfig;
    try {
      resourceConfig = await loadResourceConfig(options.config);
      versionConfig = await loadVersionConfig(options.config);
      spinner.succeed('配置文件加载成功');
    } catch (error: any) {
      spinner.fail('配置文件加载失败');
      throw error;
    }
    
    // 3. 验证并确保资源存在
    let resourceId: string;
    
    if (resourceConfig.resourceId) {
      // 检查资源是否存在
      const checkSpinner = ora('正在验证资源是否存在...').start();
      try {
        await getResourceInfo(resourceConfig.resourceId, {
          isLoadLatestVersionInfo: 0,
        });
        checkSpinner.succeed('资源验证成功');
        resourceId = resourceConfig.resourceId;
      } catch (err: any) {
        checkSpinner.fail('资源不存在');
        console.log(chalk.yellow('\n⚠️  资源不存在，需要先创建资源'));
        
        // 检查是否有创建资源所需的必要字段
        if (!resourceConfig.resourceName || !resourceConfig.resourceTypeCode) {
          if (!resourceConfig.resourceName && !resourceConfig.resourceType) {
            throw new Error('资源配置中缺少 resourceName 和 resourceType，无法创建资源');
          }
          if (!resourceConfig.resourceTypeCode && (!resourceConfig.resourceType || resourceConfig.resourceType.length === 0)) {
            throw new Error('资源配置中缺少 resourceTypeCode 和 resourceType，无法创建资源');
          }
        }
        
        // 提示用户是否创建资源
        const { confirmCreate } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmCreate',
            message: '是否现在创建资源？',
            default: true,
          },
        ]);
        
        if (!confirmCreate) {
          console.log(chalk.blue('ℹ️  发布已取消，请先执行 freelog-cli create 创建资源'));
          return;
        }
        
        // 创建资源
        const createSpinner = ora('正在创建资源...').start();
        try {
          const createBody = resourceConfigToCreateBody(resourceConfig);
          const createResult = await createResource(createBody);
          createSpinner.succeed(`资源创建成功: ${createResult.resourceId}`);
          
          // 更新本地配置（使用统一的转换函数）
          const createdConfig = responseToResourceConfig(createResult);
          resourceConfig.resourceId = createdConfig.resourceId;
          resourceConfig.resourceName = createdConfig.resourceName;
          resourceConfig.resourceType = createdConfig.resourceType;
          resourceConfig.resourceTitle = createdConfig.resourceTitle;
          resourceConfig.intro = createdConfig.intro;
          resourceConfig.coverImages = createdConfig.coverImages;
          resourceConfig.tags = createdConfig.tags;
          resourceConfig.resourceTypeCode = createdConfig.resourceTypeCode;
          resourceConfig.status = createdConfig.status;
          resourceConfig.policies = createdConfig.policies;
          
          // 保存更新的资源配置
          await saveResourceConfig(resourceConfig, options.config);
          
          resourceId = createResult.resourceId;
          console.log(chalk.green('✔ ') + '资源配置已更新');
        } catch (err: any) {
          createSpinner.fail('创建资源失败');
          throw err;
        }
      }
    } else {
      // 没有 resourceId，需要创建资源
      console.log(chalk.yellow('\n⚠️  资源配置中缺少 resourceId'));
      
      // 检查是否有创建资源所需的必要字段
      if (!resourceConfig.resourceName || !resourceConfig.resourceTypeCode) {
        if (!resourceConfig.resourceName && !resourceConfig.resourceType) {
          throw new Error('资源配置中缺少 resourceName 和 resourceType，无法创建资源');
        }
        if (!resourceConfig.resourceTypeCode && (!resourceConfig.resourceType || resourceConfig.resourceType.length === 0)) {
          throw new Error('资源配置中缺少 resourceTypeCode 和 resourceType，无法创建资源');
        }
      }
      
      // 提示用户是否创建资源
      const { confirmCreate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmCreate',
          message: '是否现在创建资源？',
          default: true,
        },
      ]);
      
      if (!confirmCreate) {
        console.log(chalk.blue('ℹ️  发布已取消，请先执行 freelog-cli create 创建资源'));
        return;
      }
      
      // 创建资源
      const createSpinner = ora('正在创建资源...').start();
      try {
        const createBody = resourceConfigToCreateBody(resourceConfig);
        const createResult = await createResource(createBody);
        createSpinner.succeed(`资源创建成功: ${createResult.resourceId}`);
        
        // 更新本地配置
        resourceConfig.resourceId = createResult.resourceId;
        resourceConfig.resourceName = createResult.resourceName;
        resourceConfig.resourceType = createResult.resourceType;
        resourceConfig.resourceTitle = createResult.resourceTitle;
        resourceConfig.intro = createResult.intro;
        resourceConfig.coverImages = createResult.coverImages;
        resourceConfig.tags = createResult.tags;
        resourceConfig.resourceTypeCode = createResult.resourceTypeCode;
        resourceConfig.status = createResult.status;
        resourceConfig.policies = createResult.policies?.map(p => ({
          policyName: p.policyName,
          policyText: p.policyText,
          status: p.status,
          policyId: p.policyId,
        }));
        
        // 保存更新的资源配置
        const { saveResourceConfig } = await import('../services/resourceConfigService');
        await saveResourceConfig(resourceConfig, options.config);
        
        resourceId = createResult.resourceId;
        console.log(chalk.green('✔ ') + '资源配置已更新');
      } catch (err: any) {
        createSpinner.fail('创建资源失败');
        throw err;
      }
    }
    
    // 4. 显示配置信息
    console.log(chalk.blue('ℹ ') + `资源 ID: ${resourceId}`);
    console.log(chalk.blue('ℹ ') + `资源名称: ${resourceConfig.resourceName || '(未设置)'}`);
    console.log(chalk.blue('ℹ ') + `版本号: ${versionConfig.version}`);
    if (versionConfig.resourceType) {
      console.log(chalk.blue('ℹ ') + `资源类型: ${versionConfig.resourceType}`);
    }
    if (versionConfig.description) {
      console.log(chalk.blue('ℹ ') + `描述: ${versionConfig.description}`);
    }
    
    // 5. 显示发布模式
    const isDraft = options.draft || false;
    console.log(chalk.blue('ℹ ') + `发布模式: ${isDraft ? chalk.yellow('草稿') : chalk.green('正式版本')}`);
    
    // 6. 处理文件上传
    let filePath: string;
    let filename: string;
    let fileSha1: string;
    
    const needCompress = shouldCompress(versionConfig.resourceType);
    
    if (needCompress) {
      // 需要压缩（主题、插件、软件库）
      console.log(chalk.blue('\n📦 文件处理: ') + '压缩目录');
      
      const buildPath = versionConfig.buildPath || 'dist';
      const absoluteBuildPath = path.resolve(process.cwd(), buildPath);
      
      if (!fs.existsSync(absoluteBuildPath)) {
        throw new Error(`构建目录不存在: ${buildPath}`);
      }
      
      // 生成文件名
      filename = `${resourceConfig.resourceName || 'resource'}-${versionConfig.version}.zip`;
      
      // 压缩到临时目录
      const tempDir = path.join(os.tmpdir(), 'freelog-publish');
      await fs.ensureDir(tempDir);
      
      const compressSpinner = ora('正在压缩文件...').start();
      filePath = await compressDirectory(absoluteBuildPath, tempDir, filename);
      tempFilePath = filePath;
      compressSpinner.succeed(`文件压缩成功: ${filename}`);
      
    } else {
      // 直接上传文件
      console.log(chalk.blue('\n📦 文件处理: ') + '直接上传文件');
      
      if (!versionConfig.fileTarget) {
        throw new Error('配置中未指定 fileTarget（文件路径）');
      }
      
      filePath = path.resolve(process.cwd(), versionConfig.fileTarget);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${versionConfig.fileTarget}`);
      }
      
      filename = path.basename(filePath);
    }
    
    // 7. 计算文件 SHA1
    const sha1Spinner = ora('正在计算文件 SHA1...').start();
    fileSha1 = await calculateFileSha1(filePath);
    sha1Spinner.succeed(`SHA1: ${fileSha1}`);
    
    // 8. 检查文件是否已存在
    let fileExists = false;
    try {
      const existInfoList = await checkFileExists(fileSha1);
      const existInfo = existInfoList[0];
      fileExists = existInfo?.isExisting || false;
      
      if (fileExists) {
        console.log(chalk.yellow('\n⚠️  该文件已存在于服务器'));
        
        // 查询使用该文件的资源
        try {
          const resources = await getResourcesByFileSha1(fileSha1, 'resourceId,resourceName,resourceType');
          
          if (resources && resources.length > 0) {
            console.log(chalk.blue('\nℹ️  以下资源正在使用此文件:'));
            resources.forEach((res, index) => {
              console.log(`  ${index + 1}. ${chalk.cyan(res.resourceName)} (${res.resourceType}) - ${res.resourceId}`);
            });
          }
        } catch (err) {
          // 忽略查询错误
        }
        
        const { confirmContinue } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmContinue',
            message: '文件已存在，是否继续发布？',
            default: true,
          },
        ]);
        
        if (!confirmContinue) {
          console.log(chalk.blue('ℹ️  发布已取消'));
          return;
        }
      }
    } catch (err) {
      // 检查失败不影响发布
      console.log(chalk.gray('⚠️  无法检查文件是否存在，继续发布'));
    }
    
    // 9. 上传文件（如果需要）
    if (!fileExists) {
      const uploadSpinner = ora('正在上传文件...').start();
      try {
        await uploadFile(filePath);
        uploadSpinner.succeed('文件上传成功');
      } catch (err: any) {
        uploadSpinner.fail('文件上传失败');
        throw err;
      }
    } else {
      console.log(chalk.gray('✓ 文件已存在，跳过上传'));
    }
    
    // 10. 更新版本配置中的文件信息
    versionConfig.filename = filename;
    versionConfig.fileSha1 = fileSha1;
    
    // 11. 确认发布
    console.log(chalk.blue('\n📝 版本信息:'));
    console.log(`  版本号: ${chalk.cyan(versionConfig.version)}`);
    console.log(`  文件名: ${chalk.cyan(filename)}`);
    console.log(`  SHA1: ${chalk.gray(fileSha1)}`);
    if (versionConfig.dependencies && versionConfig.dependencies.length > 0) {
      console.log(`  依赖数量: ${chalk.cyan(versionConfig.dependencies.length)}`);
    }
    
    const { confirmPublish } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmPublish',
        message: '确认发布？',
        default: true,
      },
    ]);
    
    if (!confirmPublish) {
      console.log(chalk.blue('ℹ️  发布已取消'));
      return;
    }
    
    // 12. 创建资源版本
    const publishSpinner = ora('正在创建资源版本...').start();
    try {
      const versionBody = versionConfigToVersionBody(versionConfig);
      const result = await createResourceVersion(resourceId, versionBody);
      
      publishSpinner.succeed('资源版本创建成功');
      
      // 13. 同步版本信息到配置文件（和 syncv 保持一致）
      const updatedVersionConfig = responseToVersionConfig(result);
      await saveVersionConfig(updatedVersionConfig, options.config);
      
      // 14. 显示结果
      console.log(chalk.green('\n✔ ') + '发布完成');
      console.log(chalk.blue('ℹ️  版本信息:'));
      console.log(`  资源 ID: ${chalk.cyan(result.resourceId)}`);
      console.log(`  版本号: ${chalk.cyan(result.version)}`);
      console.log(`  版本 ID: ${chalk.gray(result.versionId)}`);
      console.log(`  状态: ${chalk.green(result.status === 1 ? '已发布' : '草稿')}`);
      
    } catch (err: any) {
      publishSpinner.fail('创建资源版本失败');
      throw err;
    }
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `发布失败: ${err.message}`);
    if (options.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    // 15. 清理临时文件
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        await fs.remove(tempFilePath);
        console.log(chalk.gray('\n✓ 临时文件已清理'));
      } catch (err) {
        console.log(chalk.yellow('\n⚠️  临时文件清理失败'));
      }
    }
  }
}

