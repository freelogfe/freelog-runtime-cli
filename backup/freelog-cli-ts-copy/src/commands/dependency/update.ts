/**
 * 更新依赖命令
 * 更新指定依赖的版本范围
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import { CommandOptions } from '../../types';
import { getDependency, updateDependencyVersion } from '../../services/dependencyService';
import { getResourceVersionInfoList } from '../../api/version';
import { handleErrorAndExit } from '../../utils/errorHandler';
import type { Dependency } from '../../../public/freelog.version';

export async function executeUpdate(resourceIdentifier: string, options: CommandOptions): Promise<void> {
  try {
    // 1. 检查登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);
    console.log(chalk.cyan('\n=== 更新依赖 ===\n'));
    console.log(chalk.blue('ℹ ') + `要更新的依赖: ${resourceIdentifier}`);
    
    // 2. 加载并查找依赖
    const spinner = ora('正在加载配置...').start();
    
    let targetDependency: Dependency | undefined;
    try {
      targetDependency = await getDependency(resourceIdentifier, options.config);
      spinner.succeed('配置加载成功');
    } catch (error: any) {
      spinner.fail('配置加载失败');
      if (error.message.includes('未找到')) {
        console.log(chalk.red('\n❌ 未找到该依赖'));
        console.log(chalk.yellow('\n💡 提示: 使用 freelog-cli dep list 查看所有依赖'));
        process.exit(1);
      }
      throw error;
    }
    
    if (!targetDependency) {
      console.log(chalk.red('\n❌ 未找到该依赖'));
      process.exit(1);
    }
    
    // 4. 显示当前依赖信息
    console.log(chalk.cyan('\n=== 当前依赖信息 ===\n'));
    console.log(chalk.blue('资源 ID: ') + targetDependency.resourceId);
    console.log(chalk.blue('当前版本范围: ') + chalk.yellow(targetDependency.versionRange));
    
    // 5. 获取可用版本列表
    const versionSpinner = ora('正在获取可用版本...').start();
    
    try {
      const versions = await getResourceVersionInfoList(
        targetDependency.resourceId,
        {
          projection: 'version,versionId,createDate',
        }
      );
      
      versionSpinner.succeed('版本列表获取成功');
      
      if (!versions || versions.length === 0) {
        console.log(chalk.yellow('\n⚠ 该资源没有可用版本'));
        return;
      }
      
      // 6. 让用户选择新的版本或版本范围
      let newVersionRange: string;
      
      if (options.version) {
        // 命令行指定了版本
        newVersionRange = options.version;
      } else {
        // 交互式选择
        console.log(chalk.cyan('\n=== 可用版本 ===\n'));
        versions.slice(0, 10).forEach((v: any, index: number) => {
          const date = new Date(v.createDate).toLocaleDateString('zh-CN');
          console.log(chalk.gray(`${index + 1}. ${v.version} (${date})`));
        });
        
        if (versions.length > 10) {
          console.log(chalk.gray(`... 还有 ${versions.length - 10} 个版本`));
        }
        
        const { versionChoice } = await inquirer.prompt([
          {
            type: 'list',
            name: 'versionChoice',
            message: '请选择更新方式:',
            choices: [
              { name: '指定具体版本', value: 'specific' },
              { name: '使用版本范围（如 ^1.0.0, ~2.3.0）', value: 'range' },
              { name: '使用最新版本', value: 'latest' },
            ]
          }
        ]);
        
        if (versionChoice === 'latest') {
          newVersionRange = versions[0].version;
        } else if (versionChoice === 'specific') {
          const { selectedVersion } = await inquirer.prompt([
            {
              type: 'list',
              name: 'selectedVersion',
              message: '请选择版本:',
              choices: versions.slice(0, 20).map((v: any) => ({
                name: `${v.version} (${new Date(v.createDate).toLocaleDateString('zh-CN')})`,
                value: v.version
              }))
            }
          ]);
          newVersionRange = selectedVersion;
        } else {
          const { customRange } = await inquirer.prompt([
            {
              type: 'input',
              name: 'customRange',
              message: '请输入版本范围:',
              default: `^${versions[0].version}`,
              validate: (input: string) => {
                if (!input.trim()) return '版本范围不能为空';
                return true;
              }
            }
          ]);
          newVersionRange = customRange;
        }
      }
      
      // 7. 显示更新信息
      console.log(chalk.cyan('\n=== 更新信息 ===\n'));
      console.log(chalk.blue('原版本范围: ') + chalk.yellow(targetDependency.versionRange));
      console.log(chalk.blue('新版本范围: ') + chalk.green(newVersionRange));
      
      // 8. 确认更新
      if (!options.yes) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: '确认更新？',
            default: true
          }
        ]);
        
        if (!confirm) {
          console.log(chalk.yellow('\n⚠ 操作已取消'));
          return;
        }
      }
      
      // 9. 更新配置
      const updateSpinner = ora('正在更新配置...').start();
      
      try {
        await updateDependencyVersion(resourceIdentifier, newVersionRange, options.config);
        
        updateSpinner.succeed('依赖更新成功');
        
        console.log(chalk.green('\n✔ 依赖已更新'));
        console.log(chalk.yellow('\n💡 提示: 使用 freelog-cli publish 发布新版本以生效更改\n'));
        
      } catch (error) {
        updateSpinner.fail('更新配置失败');
        throw error;
      }
      
    } catch (error: any) {
      versionSpinner.fail('获取版本列表失败');
      throw error;
    }
    
  } catch (error: any) {
    handleErrorAndExit(error, '更新依赖失败', options.debug);
  }
}
