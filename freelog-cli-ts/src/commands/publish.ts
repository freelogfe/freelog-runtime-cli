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
import { confirmAuth } from '../utils/authConfirm';
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
import { createResourceVersion } from '../api/version';
import { getResourceInfo, createResource } from '../api/resource';
import { resourceConfigToCreateBody } from '../services/resourceConfigService';
import { uploadFile, checkFileExists, getResourcesByFileSha1 } from '../api/storage';
import { calculateFileSha1 } from '../utils/crypto';
import { responseToVersionConfig } from '../services/versionConfigService';
import { handleErrorAndExit } from '../utils/errorHandler';

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
 * 根据 resourceType 判断，如果是需要压缩的类型，filePath 应该是目录路径
 */
function shouldCompress(resourceType?: string): boolean {
  if (!resourceType) return false;
  const compressTypes = ['主题', '插件', '软件库'];
  return compressTypes.includes(resourceType);
}

export async function executePublish(options: CommandOptions): Promise<void> {
  let tempFilePath: string | null = null;
  
  try {
    // 1. 检查登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);
    console.log(chalk.cyan('\n=== 发布作品 ===\n'));
    
    // 2. 加载配置文件
    const spinner = ora('正在加载配置文件...').start();
    let resourceConfig: any = null;
    let versionConfig: any = null;
    
    // 2.1. 尝试加载 version.config
    try {
      versionConfig = await loadVersionConfig(options.config, false);
    } catch (error: any) {
      // version.config 不存在或加载失败，继续尝试其他方式
      console.log(chalk.yellow('⚠️  未找到版本配置文件，将创建新的配置'));
    }
    
    // 2.2. 尝试加载 resource.config（如果存在）
    try {
      resourceConfig = await loadResourceConfig(options.config);
    } catch (error: any) {
      // resource.config 不存在，这是允许的
      console.log(chalk.yellow('⚠️  未找到资源配置文件'));
    }
    
    // 2.3. 如果 version.config 不存在，创建一个空对象
    if (!versionConfig) {
      versionConfig = {
        resourceId: '',
        resourceType: '',
        resourceName: '',
        userId: 0,
        description: '',
        version: '1.0.0',
        versionId: '',
        fileSha1: '',
        dependencies: [],
        upcastResources: [],
        resolveResources: [],
        systemProperty: {},
        customProperty: {},
        customPropertyDescriptors: [],
        catalogueProperty: {},
        createDate: '',
        filename: '',
        baseUpcastResources: [],
        batchSignContracts: [],
        inputAttrs: [],
        authExcludedItems: [],
        filePath: 'dist',
      };
    }
    
    // 2.4. 检查并补充资源信息：优先使用 version.config，如果没有则从 resource.config 获取
    let needInputResourceInfo = false;
    const missingFields: string[] = [];
    
    if (!versionConfig.resourceId) {
      if (resourceConfig?.resourceId) {
        versionConfig.resourceId = resourceConfig.resourceId;
      } else {
        needInputResourceInfo = true;
        missingFields.push('resourceId');
      }
    }
    
    if (!versionConfig.resourceName) {
      if (resourceConfig?.resourceName) {
        versionConfig.resourceName = resourceConfig.resourceName;
      } else {
        needInputResourceInfo = true;
        missingFields.push('resourceName');
      }
    }
    
    if (!versionConfig.resourceType) {
      if (resourceConfig?.resourceType && resourceConfig.resourceType.length > 0) {
        versionConfig.resourceType = resourceConfig.resourceType[0];
      } else {
        needInputResourceInfo = true;
        missingFields.push('resourceType');
      }
    }
    
    // 2.5. 如果缺少必填的资源信息，提示用户输入
    if (needInputResourceInfo) {
      spinner.stop();
      console.log(chalk.yellow('\n⚠️  缺少必填的资源信息，需要输入以下字段：'));
      missingFields.forEach(field => {
        console.log(chalk.gray(`  - ${field}`));
      });
      
      const prompts: any[] = [];
      
      if (missingFields.includes('resourceId')) {
        prompts.push({
          type: 'input',
          name: 'resourceId',
          message: '请输入资源 ID（24位十六进制字符串，如果还没有创建资源可以留空）:',
          validate: (input: string) => {
            if (input && !/^[a-f0-9]{24}$/.test(input)) {
              return 'resourceId 格式不正确（应为24位十六进制字符）';
            }
            return true;
          },
        });
      }
      
      if (missingFields.includes('resourceName')) {
        prompts.push({
          type: 'input',
          name: 'resourceName',
          message: '请输入资源名称（必填）:',
          validate: (input: string) => {
            if (!input || !input.trim()) {
              return '资源名称不能为空';
            }
            return true;
          },
        });
      }
      
      if (missingFields.includes('resourceType')) {
        prompts.push({
          type: 'list',
          name: 'resourceType',
          message: '请选择资源类型（必填）:',
          choices: ['主题', '插件', '前端库', '图片', '文本', '其他'],
          validate: (input: string) => {
            if (!input || !input.trim()) {
              return '资源类型不能为空';
            }
            return true;
          },
        });
      }
      
      const answers = await inquirer.prompt(prompts);
      
      if (answers.resourceId) {
        versionConfig.resourceId = answers.resourceId;
      }
      if (answers.resourceName) {
        versionConfig.resourceName = answers.resourceName;
      }
      if (answers.resourceType) {
        versionConfig.resourceType = answers.resourceType;
      }
      
      spinner.start();
    }
    
    spinner.succeed('配置文件加载成功');
    
    // 2.6. 检查必填字段，如果缺失则提示用户
    if (!versionConfig.description) {
      const { description } = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: '请输入版本描述（必填）:',
          validate: (input: string) => {
            if (!input || !input.trim()) {
              return '版本描述不能为空';
            }
            return true;
          },
        },
      ]);
      versionConfig.description = description.trim();
    }
    
    // 3. 验证并确保资源存在
    let resourceId: string;
    
    // 使用 versionConfig 中的 resourceId（已经通过前面的逻辑补充）
    if (versionConfig.resourceId) {
      // 检查资源是否存在
      const checkSpinner = ora('正在验证资源是否存在...').start();
      try {
        await getResourceInfo(versionConfig.resourceId, {
          isLoadLatestVersionInfo: 0,
        });
        checkSpinner.succeed('资源验证成功');
        resourceId = versionConfig.resourceId;
      } catch (err: any) {
        checkSpinner.fail('资源不存在');
        console.log(chalk.yellow('\n⚠️  资源不存在，需要先创建资源'));
        
        // 检查是否有创建资源所需的必要字段（从 versionConfig 获取）
        if (!versionConfig.resourceName || !versionConfig.resourceType) {
          throw new Error('缺少创建资源所需的必要字段：resourceName 和 resourceType');
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
        
        // 创建资源（使用 versionConfig 中的信息）
        const createSpinner = ora('正在创建资源...').start();
        try {
          // 构建创建资源的请求体
          const createBody: any = {
            name: versionConfig.resourceName.includes('/') 
              ? versionConfig.resourceName.split('/').slice(-1)[0]
              : versionConfig.resourceName,
            resourceTypeCode: resourceConfig?.resourceTypeCode || versionConfig.resourceType,
            resourceTypeName: versionConfig.resourceType,
          };
          
          const createResult = await createResource(createBody);
          createSpinner.succeed(`资源创建成功: ${createResult.resourceId}`);
          
          // 更新 versionConfig
          versionConfig.resourceId = createResult.resourceId;
          versionConfig.resourceName = createResult.resourceName;
          versionConfig.resourceType = createResult.resourceType[0] || versionConfig.resourceType;
          
          // 如果 resource.config 存在，也更新它
          if (resourceConfig) {
            const createdConfig = responseToResourceConfig(createResult);
            Object.assign(resourceConfig, createdConfig);
            await saveResourceConfig(resourceConfig, options.config);
            console.log(chalk.green('✔ ') + '资源配置已更新');
          }
          
          resourceId = createResult.resourceId;
        } catch (err: any) {
          createSpinner.fail('创建资源失败');
          throw err;
        }
      }
    } else {
      // 没有 resourceId，需要创建资源
      console.log(chalk.yellow('\n⚠️  版本配置中缺少 resourceId'));
      
      // 检查是否有创建资源所需的必要字段
      if (!versionConfig.resourceName || !versionConfig.resourceType) {
        throw new Error('缺少创建资源所需的必要字段：resourceName 和 resourceType');
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
        // 构建创建资源的请求体
        const createBody: any = {
          name: versionConfig.resourceName.includes('/') 
            ? versionConfig.resourceName.split('/').slice(-1)[0]
            : versionConfig.resourceName,
          resourceTypeCode: resourceConfig?.resourceTypeCode || versionConfig.resourceType,
          resourceTypeName: versionConfig.resourceType,
        };
        
        const createResult = await createResource(createBody);
        createSpinner.succeed(`资源创建成功: ${createResult.resourceId}`);
        
        // 更新 versionConfig
        versionConfig.resourceId = createResult.resourceId;
        versionConfig.resourceName = createResult.resourceName;
        versionConfig.resourceType = createResult.resourceType[0] || versionConfig.resourceType;
        
        // 如果 resource.config 存在，也更新它
        if (resourceConfig) {
          const createdConfig = responseToResourceConfig(createResult);
          Object.assign(resourceConfig, createdConfig);
          await saveResourceConfig(resourceConfig, options.config);
          console.log(chalk.green('✔ ') + '资源配置已更新');
        }
        
        resourceId = createResult.resourceId;
      } catch (err: any) {
        createSpinner.fail('创建资源失败');
        throw err;
      }
    }
    
    // 4. 显示配置信息
    console.log(chalk.blue('ℹ ') + `资源 ID: ${resourceId}`);
    console.log(chalk.blue('ℹ ') + `资源名称: ${versionConfig.resourceName || '(未设置)'}`);
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
      
      if (!versionConfig.filePath) {
        throw new Error('配置中未指定 filePath（文件路径）');
      }
      
      const absoluteFilePath = path.resolve(process.cwd(), versionConfig.filePath);
      
      if (!fs.existsSync(absoluteFilePath)) {
        throw new Error(`文件路径不存在: ${versionConfig.filePath}`);
      }
      
      // 检查是目录还是文件
      const stats = await fs.stat(absoluteFilePath);
      if (!stats.isDirectory()) {
        throw new Error(`filePath 应该是目录路径（需要压缩的资源类型）: ${versionConfig.filePath}`);
      }
      
      // 生成文件名
      filename = `${resourceConfig.resourceName || 'resource'}-${versionConfig.version}.zip`;
      
      // 压缩到临时目录
      const tempDir = path.join(os.tmpdir(), 'freelog-publish');
      await fs.ensureDir(tempDir);
      
      const compressSpinner = ora('正在压缩文件...').start();
      filePath = await compressDirectory(absoluteFilePath, tempDir, filename);
      tempFilePath = filePath;
      compressSpinner.succeed(`文件压缩成功: ${filename}`);
      
    } else {
      // 直接上传文件
      console.log(chalk.blue('\n📦 文件处理: ') + '直接上传文件');
      
      if (!versionConfig.filePath) {
        throw new Error('配置中未指定 filePath（文件路径）');
      }
      
      filePath = path.resolve(process.cwd(), versionConfig.filePath);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`文件不存在: ${versionConfig.filePath}`);
      }
      
      // 检查是文件还是目录
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        throw new Error(`filePath 应该是文件路径（不需要压缩的资源类型）: ${versionConfig.filePath}`);
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
      
      // 验证 API 返回的数据
      if (!result) {
        publishSpinner.fail('创建资源版本失败');
        throw new Error('API 返回数据为空，请检查 API 响应');
      }
      
      // 验证关键字段
      if (!result.resourceId) {
        publishSpinner.fail('创建资源版本失败');
        throw new Error('API 返回数据格式错误：缺少 resourceId');
      }
      
      publishSpinner.succeed('资源版本创建成功');
      
      // 13. 同步版本信息到配置文件（和 syncv 保持一致）
      try {
        // 发布成功后，清空发布相关字段（baseUpcastResources, batchSignContracts, inputAttrs, authExcludedItems）
        // 资源信息优先从 versionConfig 获取（已经通过前面的逻辑补充），如果 resource.config 存在也使用它
        const updatedVersionConfig = responseToVersionConfig(result, versionConfig, resourceConfig ? {
          resourceId: resourceConfig.resourceId || versionConfig.resourceId,
          resourceName: resourceConfig.resourceName || versionConfig.resourceName,
          resourceType: resourceConfig.resourceType || [versionConfig.resourceType],
        } : {
          resourceId: versionConfig.resourceId,
          resourceName: versionConfig.resourceName,
          resourceType: [versionConfig.resourceType],
        });
        // 确保发布相关字段被清空（空数组，类型正确）
        updatedVersionConfig.baseUpcastResources = [];
        updatedVersionConfig.batchSignContracts = [];
        updatedVersionConfig.inputAttrs = [];
        updatedVersionConfig.authExcludedItems = [];
        // 保留用户输入的 description（如果用户输入了新的）
        if (versionConfig.description && versionConfig.description !== result.description) {
          updatedVersionConfig.description = versionConfig.description;
        }
        await saveVersionConfig(updatedVersionConfig, options.config);
      } catch (saveErr: any) {
        // 保存配置失败不影响发布成功，但需要提示用户
        console.log(chalk.yellow('\n⚠️  版本创建成功，但保存配置失败: ' + saveErr.message));
        if (options.debug) {
          console.error(saveErr.stack);
        }
      }
      
      // 14. 显示结果
      console.log(chalk.green('\n✔ ') + '发布完成');
      console.log(chalk.blue('ℹ️  版本信息:'));
      console.log(`  资源 ID: ${chalk.cyan(result.resourceId)}`);
      console.log(`  版本号: ${chalk.cyan(result.version)}`);
      console.log(`  版本 ID: ${chalk.gray(result.versionId)}`);
      console.log(`  文件名: ${chalk.cyan(versionConfig.filename)}`);
      console.log(`  SHA1: ${chalk.gray(result.fileSha1)}`);
      
    } catch (err: any) {
      publishSpinner.fail('创建资源版本失败');
      // 确保错误信息被正确展示（包括 API 返回的错误信息）
      throw err;
    }
    
  } catch (err: any) {
    handleErrorAndExit(err, '发布失败', options.debug);
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

