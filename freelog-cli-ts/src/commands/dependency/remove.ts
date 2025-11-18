/**
 * 移除依赖命令
 * 从配置文件中移除指定的依赖
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../../core/auth';
import { CommandOptions } from '../../types';
import { getAllDependencies, removeDependency } from '../../services/dependencyService';
import { handleErrorAndExit } from '../../utils/errorHandler';

export async function executeRemove(resourceIdentifier: string, options: CommandOptions): Promise<void> {
  try {
    // 1. 检查登录
    const auth = requireAuth();
    console.log(chalk.cyan('\n=== 移除依赖 ===\n'));
    console.log(chalk.blue('ℹ ') + `要移除的依赖: ${resourceIdentifier}`);
    
    // 2. 加载依赖列表
    const spinner = ora('正在加载配置...').start();
    let dependencies;
    
    try {
      dependencies = await getAllDependencies(options.config);
      spinner.succeed('配置加载成功');
    } catch (error) {
      spinner.fail('配置加载失败');
      throw error;
    }
    
    // 3. 检查依赖是否存在
    if (!dependencies || dependencies.length === 0) {
      console.log(chalk.yellow('\n⚠ 当前项目没有依赖'));
      return;
    }
    
    // 查找要移除的依赖（通过资源 ID 查找）
    const targetDependency = dependencies.find(
      (dep) => dep.resourceId === resourceIdentifier
    );
    
    if (!targetDependency) {
      console.log(chalk.red('\n❌ 未找到该依赖'));
      console.log(chalk.yellow('\n💡 提示: 使用 freelog-cli dep list 查看所有依赖'));
      process.exit(1);
    }
    
    // 4. 显示要移除的依赖信息
    console.log(chalk.cyan('\n=== 依赖信息 ===\n'));
    console.log(chalk.blue('资源 ID: ') + targetDependency.resourceId);
    console.log(chalk.blue('版本范围: ') + targetDependency.versionRange);
    
    // 5. 确认移除
    if (!options.yes) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: '确认移除此依赖？',
          default: false
        }
      ]);
      
      if (!confirm) {
        console.log(chalk.yellow('\n⚠ 操作已取消'));
        return;
      }
    }
    
    // 6. 移除依赖
    const removeSpinner = ora('正在移除依赖...').start();
    
    try {
      // 从版本配置中移除依赖
      await removeDependency(resourceIdentifier, options.config);
      
      removeSpinner.succeed('依赖移除成功');
      
      // 重新获取依赖列表
      const remainingDeps = await getAllDependencies(options.config);
      
      console.log(chalk.green('\n✔ 依赖已从配置文件中移除'));
      console.log(chalk.blue('ℹ ') + `剩余依赖数量: ${remainingDeps.length}`);
      
      if (remainingDeps.length > 0) {
        console.log(chalk.cyan('\n=== 剩余依赖 ===\n'));
        remainingDeps.forEach((dep, index) => {
          console.log(chalk.gray(`${index + 1}. ${dep.resourceId} (${dep.versionRange})`));
        });
      }
      
      console.log(chalk.yellow('\n💡 提示: 使用 freelog-cli publish 发布新版本以生效更改\n'));
      
    } catch (error) {
      removeSpinner.fail('移除依赖失败');
      throw error;
    }
    
  } catch (error: any) {
    handleErrorAndExit(error, '移除依赖失败');
  }
}
