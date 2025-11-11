/**
 * 同步命令
 * 从服务器获取资源信息，并同步到本地配置文件
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../core/auth';
import { CommandOptions } from '../types';
import { loadConfig, saveConfig } from '../services/configService';
import { getResourceInfo, getResourceVersionInfo } from '../api/get';
import type { FreelogConfig } from '../../public/freelog';

/**
 * 执行同步命令
 * @param resourceIdOrName 资源ID或名称（可选，不传则使用配置文件中的资源ID）
 * @param options 命令选项（包含 version 选项）
 */
export async function executeSync(
  resourceIdOrName?: string,
  options: CommandOptions = {}
): Promise<void> {
  // 从 options 中获取 version
  const version = options.version as string | undefined;
  try {
    // 1. 检查登录
    const auth = requireAuth();
    console.log(chalk.cyan('\n=== 同步资源信息 ===\n'));
    console.log(chalk.blue('ℹ ') + `登录用户: ${auth.username}`);
    
    // 2. 确定资源 ID
    let targetResourceId: string | undefined;
    let config: FreelogConfig | null = null;
    
    if (resourceIdOrName) {
      // 使用命令行传入的资源 ID 或名称
      targetResourceId = resourceIdOrName;
      console.log(chalk.blue('ℹ ') + `目标资源: ${targetResourceId}`);
      
      // 尝试加载配置文件（如果存在）
      try {
        config = await loadConfig(options.config);
        console.log(chalk.gray('✔ 已加载本地配置文件'));
      } catch (error) {
        console.log(chalk.gray('ℹ 本地配置文件不存在，将创建新配置'));
      }
    } else {
      // 从配置文件中读取资源 ID
      const spinner = ora('正在加载本地配置...').start();
      
      try {
        config = await loadConfig(options.config);
        spinner.succeed('本地配置加载成功');
        
        if (!config.resourceId) {
          spinner.fail('配置文件中缺少 resourceId');
          console.log(chalk.red('\n❌ 配置文件中没有 resourceId'));
          console.log(chalk.yellow('\n💡 请使用以下命令格式指定资源:'));
          console.log(chalk.cyan('  freelog-cli sync <resourceIdOrName> [version]'));
          console.log(chalk.gray('\n示例:'));
          console.log(chalk.gray('  freelog-cli sync 5ef081b8fb172026e434e2fa              # 同步指定资源的最新版本'));
          console.log(chalk.gray('  freelog-cli sync 5ef081b8fb172026e434e2fa -v 1.2.0    # 同步指定资源的指定版本'));
          console.log(chalk.gray('  freelog-cli sync yuliang/my-resource -v latest        # 使用资源名称同步最新版本'));
          process.exit(1);
        }
        
        targetResourceId = config.resourceId;
        console.log(chalk.blue('ℹ ') + `本地资源 ID: ${config.resourceId}`);
        if (config.version) {
          console.log(chalk.blue('ℹ ') + `本地版本号: ${config.version}`);
        }
      } catch (error) {
        spinner.fail('本地配置加载失败');
        console.log(chalk.red('\n❌ 找不到配置文件'));
        console.log(chalk.yellow('\n💡 请使用以下命令格式指定资源:'));
        console.log(chalk.cyan('  freelog-cli sync <resourceIdOrName> [-v version]'));
        console.log(chalk.gray('\n示例:'));
        console.log(chalk.gray('  freelog-cli sync 5ef081b8fb172026e434e2fa              # 同步指定资源的最新版本'));
        console.log(chalk.gray('  freelog-cli sync 5ef081b8fb172026e434e2fa -v 1.2.0    # 同步指定资源的指定版本'));
        console.log(chalk.gray('  freelog-cli sync yuliang/my-resource -v latest        # 使用资源名称同步最新版本'));
        process.exit(1);
      }
    }
    
    // 3. 验证 resourceId
    if (!targetResourceId) {
      console.log(chalk.red('\n❌ 未指定资源ID'));
      console.log(chalk.yellow('\n💡 请使用以下命令格式:'));
      console.log(chalk.cyan('  freelog-cli sync <resourceIdOrName> [-v version]'));
      process.exit(1);
    }
    
    // 4. 尝试获取资源基本信息（验证资源是否存在）
    console.log(chalk.blue('\nℹ ') + '正在验证资源...');
    const validateSpinner = ora('正在获取资源信息...').start();
    
    let resourceInfo: any;
    let targetVersion: string;
    let remoteVersion: any;
    
    try {
      resourceInfo = await getResourceInfo(targetResourceId);
      validateSpinner.succeed(`资源验证成功: ${resourceInfo.resourceName}`);
    } catch (err: any) {
      validateSpinner.fail('资源不存在或无法访问');
      
      if (err.response?.status === 404) {
        console.log(chalk.red('\n❌ 未找到该资源'));
        console.log(chalk.yellow('\n💡 请检查并输入正确的资源ID或资源名称:'));
        console.log(chalk.cyan('  freelog-cli sync <resourceIdOrName> [-v version]'));
        console.log(chalk.gray('\n提示:'));
        console.log(chalk.gray('  • 资源ID格式: 5ef081b8fb172026e434e2fa'));
        console.log(chalk.gray('  • 资源名称格式: username/resource-name'));
      } else {
        console.log(chalk.red('\n❌ 获取资源信息失败'));
        console.log(chalk.gray(`错误: ${err.message}`));
      }
      
      process.exit(1);
    }
    
    // 5. 确定要同步的版本
    if (version === 'latest') {
      // 同步最新版本：使用 isLoadLatestVersionInfo: 1 一次性获取
      console.log(chalk.blue('ℹ ') + '同步目标: 最新版本');
      
      const fetchSpinner = ora('正在获取最新版本信息...').start();
      try {
        resourceInfo = await getResourceInfo(targetResourceId, {
          isLoadLatestVersionInfo: 1
        });
        targetVersion = resourceInfo.latestVersion;
        remoteVersion = resourceInfo.latestVersionInfo;
        
        if (!remoteVersion) {
          fetchSpinner.fail('未找到版本信息');
          console.log(chalk.red('\n❌ 资源没有可用的版本'));
          process.exit(1);
        }
        
        fetchSpinner.succeed(`最新版本: ${targetVersion}`);
      } catch (err: any) {
        fetchSpinner.fail('获取最新版本失败');
        throw err;
      }
    } else if (version) {
      // 同步指定版本：获取指定版本信息，然后合并
      targetVersion = version;
      console.log(chalk.blue('ℹ ') + `同步目标: 指定版本 (${targetVersion})`);
      
      const fetchSpinner = ora('正在获取版本信息...').start();
      try {
        // 获取指定版本详细信息
        remoteVersion = await getResourceVersionInfo(resourceInfo.resourceId, targetVersion);
        
        // 将指定版本信息合并到资源信息的 latestVersionInfo 字段
        resourceInfo.latestVersionInfo = remoteVersion;
        
        fetchSpinner.succeed('版本信息获取成功');
      } catch (err: any) {
        fetchSpinner.fail('获取版本信息失败');
        
        if (err.response?.status === 404) {
          console.log(chalk.red('\n❌ 未找到该版本'));
          console.log(chalk.yellow('\n💡 请检查版本号是否正确，或使用 -v latest 获取最新版本'));
          console.log(chalk.gray(`  freelog-cli sync ${targetResourceId} -v latest`));
        } else {
          console.log(chalk.red('\n❌ 获取版本信息失败'));
          console.log(chalk.gray(`错误: ${err.message}`));
        }
        
        process.exit(1);
      }
    } else {
      // 没有指定版本参数，使用配置文件版本或最新版本
      const hasConfigVersion = config && config.version;
      
      if (hasConfigVersion && config) {
        // 有配置文件且有版本号，使用配置文件版本
        targetVersion = config.version;
        console.log(chalk.blue('ℹ ') + `同步目标: 配置文件版本 (${targetVersion})`);
        
        const fetchSpinner = ora('正在获取版本信息...').start();
        try {
          // 获取配置文件中的版本信息
          remoteVersion = await getResourceVersionInfo(resourceInfo.resourceId, targetVersion);
          
          // 将版本信息合并到资源信息的 latestVersionInfo 字段
          resourceInfo.latestVersionInfo = remoteVersion;
          
          fetchSpinner.succeed('版本信息获取成功');
        } catch (err: any) {
          fetchSpinner.fail('获取版本信息失败');
          
          if (err.response?.status === 404) {
            console.log(chalk.red('\n❌ 配置文件中的版本不存在'));
            console.log(chalk.yellow('\n💡 建议同步到最新版本:'));
            console.log(chalk.gray(`  freelog-cli sync ${targetResourceId} -v latest`));
          } else {
            console.log(chalk.red('\n❌ 获取版本信息失败'));
            console.log(chalk.gray(`错误: ${err.message}`));
          }
          
          process.exit(1);
        }
      } else {
        // 无配置文件或配置文件无版本号，获取最新版本
        console.log(chalk.blue('ℹ ') + '同步目标: 最新版本（未指定版本）');
        
        const fetchSpinner = ora('正在获取最新版本信息...').start();
        try {
          // 重新获取资源信息，带上最新版本详情
          resourceInfo = await getResourceInfo(targetResourceId, {
            isLoadLatestVersionInfo: 1
          });
          
          targetVersion = resourceInfo.latestVersion;
          remoteVersion = resourceInfo.latestVersionInfo;
          
          if (!remoteVersion) {
            fetchSpinner.fail('未找到版本信息');
            console.log(chalk.red('\n❌ 资源没有可用的版本'));
            console.log(chalk.yellow('\n💡 请先发布该资源的版本'));
            process.exit(1);
          }
          
          fetchSpinner.succeed(`最新版本: ${targetVersion}`);
        } catch (err: any) {
          fetchSpinner.fail('获取信息失败');
          console.log(chalk.red('\n❌ 获取最新版本失败'));
          console.log(chalk.gray(`错误: ${err.message}`));
          process.exit(1);
        }
      }
    }
    
    // 4. 显示服务器上的信息
    if (!remoteVersion) {
      console.log(chalk.red('\n❌ 未能获取版本信息'));
      process.exit(1);
    }
    
    try {
      // 5. 显示服务器上的信息
      console.log(chalk.cyan('\n=== 服务器资源信息 ===\n'));
      console.log(chalk.blue('资源名称: ') + remoteVersion.resourceName);
      console.log(chalk.blue('版本号: ') + remoteVersion.version);
      console.log(chalk.blue('文件名: ') + remoteVersion.filename);
      console.log(chalk.blue('文件 SHA1: ') + remoteVersion.fileSha1);
      console.log(chalk.blue('创建时间: ') + new Date(remoteVersion.createDate).toLocaleString('zh-CN'));
      
      if (remoteVersion.description) {
        console.log(chalk.blue('描述: ') + remoteVersion.description);
      }
      
      if (remoteVersion.dependencies && remoteVersion.dependencies.length > 0) {
        console.log(chalk.blue('\n依赖列表:'));
        remoteVersion.dependencies.forEach((dep: any) => {
          console.log(chalk.gray(`  - ${dep.resourceId} (${dep.versionRange})`));
        });
      }
      
      // 6. 询问是否同步
      const { confirmSync } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmSync',
          message: '是否将服务器信息同步到本地配置？',
          default: true
        }
      ]);
      
      if (!confirmSync) {
        console.log(chalk.yellow('\n⚠ 操作已取消'));
        return;
      }
      
      // 7. 更新本地配置（使用合并后的数据）
      const updatedConfig: FreelogConfig = {
        ...(config || {}),
        resourceId: resourceInfo.resourceId,
        resourceName: resourceInfo.resourceName,
        version: remoteVersion.version,
        fileSha1: remoteVersion.fileSha1,
        filename: remoteVersion.filename,
        description: remoteVersion.description || '',
        dependencies: remoteVersion.dependencies?.map((dep: any) => ({
          resourceId: dep.resourceId,
          resourceName: dep.resourceName,
          versionRange: dep.versionRange,
        })) || [],
        customPropertyDescriptors: remoteVersion.customPropertyDescriptors || [],
        baseUpcastResources: remoteVersion.baseUpcastResources || remoteVersion.upcastResources || [],
      };
      
      // 8. 保存配置文件
      const saveSpinner = ora('正在保存配置文件...').start();
      
      try {
        await saveConfig(updatedConfig, options.config);
        saveSpinner.succeed('配置文件保存成功');
        
        console.log(chalk.green('\n✔ 同步完成！\n'));
        console.log(chalk.blue('ℹ ') + '本地配置已更新为服务器信息');
        
      } catch (error) {
        saveSpinner.fail('配置文件保存失败');
        throw error;
      }
      
    } catch (error: any) {
      if (error.response) {
        const errorData = error.response.data;
        console.log(chalk.red('\n❌ 服务器错误:'));
        console.log(chalk.red(`状态码: ${error.response.status}`));
        console.log(chalk.red(`错误信息: ${errorData.msg || errorData.message || '未知错误'}`));
        
        if (error.response.status === 404) {
          console.log(chalk.yellow('\n💡 提示:'));
          console.log(chalk.yellow('  资源或版本不存在，请检查 resourceId 和 version'));
        }
      } else {
        console.log(chalk.red('\n❌ 错误:'));
        console.log(chalk.red(error.message));
      }
      
      process.exit(1);
    }
    
  } catch (error: any) {
    console.log(chalk.red('\n❌ 错误: ') + error.message);
    
    if (error.message.includes('找不到配置文件')) {
      console.log(chalk.yellow('\n💡 提示:'));
      console.log(chalk.yellow('  1. 确保在项目根目录执行命令'));
      console.log(chalk.yellow('  2. 或使用 -c 参数指定配置文件路径'));
    }
    
    if (error.message.includes('未登录')) {
      console.log(chalk.yellow('\n💡 提示: 请先登录'));
      console.log(chalk.yellow('  freelog-cli login'));
    }
    
    process.exit(1);
  }
}
