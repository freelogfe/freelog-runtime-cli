/**
 * 发布命令
 * 读取 freelog.config.ts，创建资源版本
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../core/auth';
import { CommandOptions } from '../types';
import { loadConfig, configToVersionBody } from '../services/configService';
import { createResourceVersion } from '../api/update';

export async function executePublish(options: CommandOptions): Promise<void> {
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
    console.log(chalk.blue('ℹ ') + `文件名: ${config.filename}`);
    console.log(chalk.blue('ℹ ') + `文件 SHA1: ${config.fileSha1}`);
    if (config.description) {
      console.log(chalk.blue('ℹ ') + `描述: ${config.description}`);
    }
    
    // 4. 显示发布模式
    const isDraft = options.draft || false;
    console.log(chalk.blue('ℹ ') + `发布模式: ${isDraft ? chalk.yellow('草稿') : chalk.green('正式版本')}`);
    
    // 5. 确认发布（正式版本需要确认）
    if (!isDraft) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '确认发布为正式版本？',
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('\n⚠ 操作已取消'));
        return;
      }
    }
    
    // 6. 转换配置为 API 请求体
    const versionBody = configToVersionBody(config);
    
    // 7. 调用创建资源版本接口
    const publishSpinner = ora('正在发布...').start();
    try {
      const result = await createResourceVersion(config.resourceId, versionBody);
      
      publishSpinner.succeed(chalk.green('✔ 发布成功！'));
      
      // 8. 显示发布结果
      console.log(chalk.green('\n=== 发布完成 ===\n'));
      console.log(chalk.blue('资源 ID: ') + result.resourceId);
      console.log(chalk.blue('资源名称: ') + result.resourceName);
      console.log(chalk.blue('版本号: ') + result.version);
      console.log(chalk.blue('版本 ID: ') + result.versionId);
      console.log(chalk.blue('文件 SHA1: ') + result.fileSha1);
      console.log(chalk.blue('创建时间: ') + new Date(result.createDate).toLocaleString('zh-CN'));
      
      if (result.dependencies && result.dependencies.length > 0) {
        console.log(chalk.blue('\n依赖列表:'));
        result.dependencies.forEach((dep) => {
          console.log(chalk.gray(`  - ${dep.resourceName} (${dep.versionRange})`));
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
