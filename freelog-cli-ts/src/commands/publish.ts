/**
 * 发布命令
 * 1. 根据 resourceType 判断文件处理方式
 * 2. 压缩或上传文件
 * 3. 创建资源版本
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
import { loadConfig, configToVersionBody } from '../services/configService';
import { createResourceVersion } from '../api/update';
import { uploadFile, checkFileExists, getResourcesByFileSha1 } from '../api/storage';
import { calculateFileSha1 } from '../utils/crypto';

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
    let config;
    try {
      config = await loadConfig(options.config);
      spinner.succeed('配置文件加载成功');
    } catch (error) {
      spinner.fail('配置文件加载失败');
      throw error;
    }
    
    // 3. 显示配置信息
    console.log(chalk.blue('ℹ ') + `资源 ID: ${config.resourceId}`);
    console.log(chalk.blue('ℹ ') + `版本号: ${config.version}`);
    if (config.resourceType) {
      console.log(chalk.blue('ℹ ') + `资源类型: ${config.resourceType}`);
    }
    if (config.description) {
      console.log(chalk.blue('ℹ ') + `描述: ${config.description}`);
    }
    
    // 4. 显示发布模式
    const isDraft = options.draft || false;
    console.log(chalk.blue('ℹ ') + `发布模式: ${isDraft ? chalk.yellow('草稿') : chalk.green('正式版本')}`);
    
    // 5. 处理文件上传
    let filePath: string;
    let filename: string;
    let fileSha1: string;
    
    const needCompress = shouldCompress(config.resourceType);
    
    if (needCompress) {
      // 需要压缩的资源类型（主题、插件、软件库）
      if (!config.buildPath) {
        throw new Error('resourceType 为 "主题"、"插件"或"软件库" 时，必须指定 buildPath');
      }
      
      const buildPath = path.resolve(process.cwd(), config.buildPath);
      if (!await fs.pathExists(buildPath)) {
        throw new Error(`构建目录不存在: ${buildPath}`);
      }
      
      console.log(chalk.blue('\nℹ ') + `构建目录: ${config.buildPath}`);
      
      // 压缩目录
      const compressSpinner = ora('正在压缩目录...').start();
      const tempDir = path.join(os.tmpdir(), 'freelog-cli-temp');
      filename = `${path.basename(buildPath)}.zip`;
      filePath = await compressDirectory(buildPath, tempDir, filename);
      tempFilePath = filePath;
      compressSpinner.succeed(`压缩完成: ${filename}`);
      
    } else {
      // 直接上传文件
      if (!config.fileTarget) {
        throw new Error('resourceType 不是 "主题"、"插件"或"软件库" 时，必须指定 fileTarget');
      }
      
      filePath = path.resolve(process.cwd(), config.fileTarget);
      if (!await fs.pathExists(filePath)) {
        throw new Error(`目标文件不存在: ${filePath}`);
      }
      
      filename = path.basename(filePath);
      console.log(chalk.blue('\nℹ ') + `目标文件: ${config.fileTarget}`);
    }
    
    // 6. 计算文件 SHA1
    const sha1Spinner = ora('正在计算文件 SHA1...').start();
    fileSha1 = await calculateFileSha1(filePath);
    sha1Spinner.succeed(`SHA1: ${fileSha1}`);
    
    // 7. 检查文件是否已存在
    const checkSpinner = ora('正在检查文件是否已上传...').start();
    let fileExists = false;
    try {
      const existInfoList = await checkFileExists(fileSha1);
      const existInfo = existInfoList[0];
      fileExists = existInfo?.isExisting || false;
      
      if (fileExists) {
        checkSpinner.succeed('文件已存在');
        
        // 查询该文件挂载的资源列表
        const resourceSpinner = ora('正在查询已使用该文件的资源...').start();
        try {
          const resources = await getResourcesByFileSha1(fileSha1, 'resourceName,resourceType');
          
          if (resources && resources.length > 0) {
            resourceSpinner.succeed(`找到 ${resources.length} 个资源正在使用此文件`);
            
            console.log(chalk.yellow('\n⚠️  以下资源正在使用相同的文件:'));
            resources.forEach((resource, index) => {
              console.log(chalk.gray(`  ${index + 1}. ${resource.resourceName} (${resource.resourceType})`));
            });
            
            // 询问是否继续
            const { continuePublish } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'continuePublish',
                message: '\n文件已被其他资源使用，确认继续发布？',
                default: false
              }
            ]);
            
            if (!continuePublish) {
              console.log(chalk.yellow('\n⚠ 操作已取消'));
              return;
            }
          } else {
            resourceSpinner.info('该文件尚未被其他资源使用');
          }
        } catch (err) {
          resourceSpinner.warn('无法查询资源列表，继续发布');
        }
      } else {
        checkSpinner.info('文件不存在，需要上传');
      }
    } catch (err) {
      checkSpinner.info('无法确认文件状态，将尝试上传');
    }
    
    // 8. 上传文件（如果需要）
    if (!fileExists) {
      const uploadSpinner = ora('正在上传文件...').start();
      try {
        const uploadResult = await uploadFile(filePath, config.resourceType);
        uploadSpinner.succeed(`上传成功 (${(uploadResult.fileSize / 1024 / 1024).toFixed(2)} MB)`);
        
        // 验证上传的 SHA1
        if (uploadResult.sha1 !== fileSha1) {
          throw new Error(`上传后的 SHA1 不匹配: 预期 ${fileSha1}，实际 ${uploadResult.sha1}`);
        }
      } catch (err: any) {
        uploadSpinner.fail('上传失败');
        throw err;
      }
    }
    
    // 9. 更新配置中的文件信息
    config.filename = filename;
    config.fileSha1 = fileSha1;
    
    // 10. 确认发布（正式版本需要确认）
    if (!isDraft) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '\n确认发布为正式版本？',
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('\n⚠ 操作已取消'));
        return;
      }
    }
    
    // 11. 转换配置为 API 请求体
    const versionBody = configToVersionBody(config);
    
    // 12. 调用创建资源版本接口
    const publishSpinner = ora('正在发布版本...').start();
    try {
      const result = await createResourceVersion(config.resourceId, versionBody);
      
      publishSpinner.succeed(chalk.green('✔ 发布成功！'));
      
      // 13. 显示发布结果
      console.log(chalk.green('\n=== 发布完成 ===\n'));
      console.log(chalk.blue('资源 ID: ') + result.resourceId);
      console.log(chalk.blue('资源名称: ') + result.resourceName);
      console.log(chalk.blue('版本号: ') + result.version);
      console.log(chalk.blue('版本 ID: ') + result.versionId);
      console.log(chalk.blue('文件名: ') + result.filename);
      console.log(chalk.blue('文件 SHA1: ') + result.fileSha1);
      console.log(chalk.blue('创建时间: ') + new Date(result.createDate).toLocaleString('zh-CN'));
      
      if (result.dependencies && result.dependencies.length > 0) {
        console.log(chalk.blue('\n依赖列表:'));
        result.dependencies.forEach((dep) => {
          console.log(chalk.gray(`  - ${dep.resourceId} (${dep.versionRange})`));
        });
      }
      
      if (result.customPropertyDescriptors && result.customPropertyDescriptors.length > 0) {
        console.log(chalk.blue('\n自定义属性:'));
        result.customPropertyDescriptors.forEach((prop) => {
          console.log(chalk.gray(`  - ${prop.key}: ${prop.defaultValue} (${prop.type})`));
        });
      }
      
      console.log(chalk.green('\n🎉 恭喜！资源版本发布成功！\n'));
      
    } catch (error: any) {
      publishSpinner.fail('发布失败');
      
      if (error.response) {
        const errorData = error.response.data;
        console.log(chalk.red('\n❌ 服务器错误:'));
        console.log(chalk.red(`状态码: ${error.response.status}`));
        console.log(chalk.red(`错误信息: ${errorData.msg || errorData.message || '未知错误'}`));
        
        if (errorData.data) {
          console.log(chalk.red('详细信息:'));
          console.log(chalk.gray(JSON.stringify(errorData.data, null, 2)));
        }
      } else {
        console.log(chalk.red('\n❌ 错误:'));
        console.log(chalk.red(error.message));
      }
      
      process.exit(1);
    }
    
    // 14. 清理临时文件
    if (tempFilePath) {
      try {
        await fs.remove(tempFilePath);
      } catch (err) {
        // 忽略清理错误
      }
    }
    
  } catch (error: any) {
    console.log(chalk.red('\n❌ 错误: ') + error.message);
    
    if (error.message.includes('找不到配置文件')) {
      console.log(chalk.yellow('\n💡 提示:'));
      console.log(chalk.yellow('  1. 确保在项目根目录执行命令'));
      console.log(chalk.yellow('  2. 或使用 -c 参数指定配置文件路径'));
      console.log(chalk.yellow('  3. 支持的配置文件: freelog.config.ts, freelog.config.js, freelog.json5, freelog.json'));
    }
    
    if (error.message.includes('未登录')) {
      console.log(chalk.yellow('\n💡 提示: 请先登录'));
      console.log(chalk.yellow('  freelog-cli login        # 工作空间登录'));
      console.log(chalk.yellow('  freelog-cli login -g     # 全局登录'));
    }
    
    process.exit(1);
  }
}
