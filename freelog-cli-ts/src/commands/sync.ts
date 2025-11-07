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
import { getResourceVersionInfo } from '../api/get';
import type { FreelogConfig } from '../../public/freelog';

export async function executeSync(options: CommandOptions): Promise<void> {
  try {
    // 1. 检查登录
    const auth = requireAuth();
    console.log(chalk.cyan('\n=== 同步资源信息 ===\n'));
    console.log(chalk.blue('ℹ ') + `登录用户: ${auth.username}`);
    
    // 2. 加载本地配置文件
    const spinner = ora('正在加载本地配置...').start();
    let config: FreelogConfig;
    
    try {
      config = await loadConfig(options.config);
      spinner.succeed('本地配置加载成功');
    } catch (error) {
      spinner.fail('本地配置加载失败');
      throw error;
    }
    
    console.log(chalk.blue('ℹ ') + `本地资源 ID: ${config.resourceId}`);
    console.log(chalk.blue('ℹ ') + `本地版本号: ${config.version}`);
    
    // 3. 从服务器获取资源版本信息
    const fetchSpinner = ora('正在从服务器获取资源信息...').start();
    
    try {
      const remoteVersion = await getResourceVersionInfo(
        config.resourceId,
        config.version
      );
      
      fetchSpinner.succeed('服务器信息获取成功');
      
      // 4. 显示服务器上的信息
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
        remoteVersion.dependencies.forEach((dep) => {
          console.log(chalk.gray(`  - ${dep.resourceName} (${dep.versionRange})`));
        });
      }
      
      // 5. 询问是否同步
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
      
      // 6. 更新本地配置
      const updatedConfig: FreelogConfig = {
        ...config,
        version: remoteVersion.version,
        fileSha1: remoteVersion.fileSha1,
        filename: remoteVersion.filename,
        description: remoteVersion.description,
        dependencies: remoteVersion.dependencies?.map((dep) => ({
          resourceId: dep.resourceId,
          resourceName: dep.resourceName,
          versionRange: dep.versionRange,
        })),
        customPropertyDescriptors: remoteVersion.customPropertyDescriptors,
        baseUpcastResources: remoteVersion.baseUpcastResources,
      };
      
      // 7. 保存配置文件
      const saveSpinner = ora('正在保存配置文件...').start();
      
      try {
        await saveConfig(updatedConfig, options.config);
        saveSpinner.succeed('配置文件保存成功');
        
        console.log(chalk.green('\n✔ 同步完成！\n'));
        console.log(chalk.blue('ℹ ') + '本地配置已更新为服务器上的最新信息');
        
      } catch (error) {
        saveSpinner.fail('配置文件保存失败');
        throw error;
      }
      
    } catch (error: any) {
      fetchSpinner.fail('获取服务器信息失败');
      
      if (error.response) {
        const errorData = error.response.data;
        console.log(chalk.red('\n❌ 服务器错误:'));
        console.log(chalk.red(`状态码: ${error.response.status}`));
        console.log(chalk.red(`错误信息: ${errorData.msg || errorData.message || '未知错误'}`));
        
        if (error.response.status === 404) {
          console.log(chalk.yellow('\n💡 提示:'));
          console.log(chalk.yellow('  资源版本不存在，请检查配置文件中的 resourceId 和 version'));
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
