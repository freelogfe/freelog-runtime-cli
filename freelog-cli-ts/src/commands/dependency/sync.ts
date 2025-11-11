/**
 * 同步依赖命令
 * 
 * 功能：
 * 1. 读取配置文件中的依赖列表
 * 2. 检查每个依赖的最新版本
 * 3. 可选：自动更新到最新版本或指定版本
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { requireAuth } from '../../core/auth';
import { loadConfig, saveConfig } from '../../services/configService';
import { getResourceInfo } from '../../api/get';
import { checkResourceAuth } from '../../api/auth';
import { CommandOptions } from '../../types';
import type { Dependency } from '../../../public/freelog';

/**
 * 同步模式
 */
type SyncMode = 'check' | 'latest' | 'specific';

/**
 * 依赖同步信息
 */
interface DependencySyncInfo {
  dependency: Dependency;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  isAuthorized: boolean;
}

/**
 * 执行依赖同步命令
 * @param targetVersion 目标版本（'latest' 表示最新版本，具体版本号表示指定版本，不传则检查更新）
 * @param options 命令选项
 */
export async function executeDependencySync(targetVersion?: string, options: CommandOptions = {}): Promise<void> {
  try {
    // 1. 检查登录
    try {
      requireAuth();
    } catch (err: any) {
      console.log(chalk.red('✖ ') + err.toString());
      process.exit(1);
    }

    console.log(chalk.cyan('\n=== 同步依赖 ===\n'));

    // 2. 加载配置文件
    const spinner = ora('正在加载配置文件...').start();
    let config;

    try {
      config = await loadConfig(options.config);
      spinner.succeed('配置文件加载成功');
    } catch (err: any) {
      spinner.fail('配置文件加载失败');
      console.log(chalk.red('✖ ') + err.message);
      process.exit(1);
    }

    // 3. 检查是否有依赖
    if (!config.dependencies || config.dependencies.length === 0) {
      console.log(chalk.yellow('⚠️  配置文件中没有依赖项'));
      return;
    }

    console.log(chalk.blue('ℹ ') + `找到 ${config.dependencies.length} 个依赖\n`);

    // 4. 确定同步模式
    let syncMode: SyncMode;
    
    if (targetVersion === 'latest') {
      // 直接同步到最新版本
      syncMode = 'latest';
      console.log(chalk.blue('ℹ ') + '同步模式: 更新到最新版本\n');
    } else if (targetVersion) {
      // 同步到指定版本（这里暂不支持，提示错误）
      console.log(chalk.red('✖ dep-sync 命令暂不支持指定具体版本号'));
      console.log(chalk.yellow('💡 提示: 请使用 "latest" 更新到最新版本，或不传参数进行交互式选择\n'));
      console.log(chalk.gray('示例:'));
      console.log(chalk.gray('  freelog-cli dep-sync          # 交互式选择'));
      console.log(chalk.gray('  freelog-cli dep-sync latest   # 更新到最新版本'));
      process.exit(1);
    } else {
      // 交互式选择模式
      const { mode } = await inquirer.prompt([
        {
          type: 'list',
          name: 'mode',
          message: '请选择同步模式:',
          choices: [
            {
              name: '检查更新（仅查看，不修改）',
              value: 'check',
              short: '检查更新'
            },
            {
              name: '同步到最新版本',
              value: 'latest',
              short: '同步最新'
            },
            {
              name: '交互式选择版本',
              value: 'specific',
              short: '选择版本'
            }
          ],
          default: 'check'
        }
      ]);
      syncMode = mode;
    }

    // 5. 获取所有依赖的同步信息
    const syncInfoList: DependencySyncInfo[] = [];
    
    for (const dep of config.dependencies) {
      const depSpinner = ora(`正在检查: ${dep.resourceName || dep.resourceId}`).start();
      
      try {
        // 获取资源信息（加载最新版本详情）
        const resourceInfo = await getResourceInfo(dep.resourceId, {
          isLoadLatestVersionInfo: 1
        });
        
        // 检查授权状态
        let isAuthorized = false;
        try {
          const authResult = await checkResourceAuth(dep.resourceId, resourceInfo.latestVersion);
          isAuthorized = authResult.isAuth;
        } catch (err) {
          // 忽略授权检查错误
        }
        
        const currentVersion = dep.versionRange;
        const latestVersion = resourceInfo.latestVersion;
        
        // 判断是否有更新：
        // 1. 如果当前是 * 或 ^latest，则认为是最新
        // 2. 否则比较版本号（简单字符串比较，实际应使用 semver）
        const isLatestPattern = currentVersion === '*' || currentVersion.includes(latestVersion);
        const hasUpdate = !isLatestPattern && currentVersion !== latestVersion;
        
        syncInfoList.push({
          dependency: dep,
          currentVersion,
          latestVersion,
          hasUpdate,
          isAuthorized
        });
        
        const authStatus = isAuthorized ? chalk.green('[已授权]') : chalk.gray('[未授权]');
        const updateStatus = hasUpdate ? chalk.yellow('[有更新]') : chalk.gray('[最新]');
        
        depSpinner.succeed(`${dep.resourceName || dep.resourceId} ${authStatus} ${updateStatus}`);
        
      } catch (err: any) {
        depSpinner.fail(`获取失败: ${dep.resourceName || dep.resourceId}`);
        console.log(chalk.gray(`  ${err.message}`));
      }
    }

    // 6. 显示同步信息
    console.log(chalk.bold.cyan('\n=== 同步信息 ===\n'));
    
    const hasUpdates = syncInfoList.some(info => info.hasUpdate);
    const unauthorizedCount = syncInfoList.filter(info => !info.isAuthorized).length;
    
    if (syncInfoList.length > 0) {
      console.log(chalk.bold('依赖列表:\n'));
      syncInfoList.forEach((info, index) => {
        const name = info.dependency.resourceName || info.dependency.resourceId;
        const authIcon = info.isAuthorized ? chalk.green('✔') : chalk.gray('○');
        const updateIcon = info.hasUpdate ? chalk.yellow('↑') : chalk.gray('=');
        
        console.log(`${index + 1}. ${authIcon} ${updateIcon} ${chalk.bold(name)}`);
        console.log(`   当前: ${chalk.cyan(info.currentVersion)} → 最新: ${chalk.green(info.latestVersion)}`);
        
        if (info.hasUpdate) {
          console.log(chalk.yellow('   有新版本可用'));
        }
        if (!info.isAuthorized) {
          console.log(chalk.gray('   未授权'));
        }
        console.log();
      });
    }

    if (unauthorizedCount > 0) {
      console.log(chalk.yellow(`⚠️  ${unauthorizedCount} 个依赖未授权，请使用 freelog-cli add 命令重新添加并授权\n`));
    }

    // 7. 根据模式执行操作
    if (syncMode === 'check') {
      // 仅检查模式，不做修改
      if (hasUpdates) {
        console.log(chalk.blue('ℹ️  提示: 使用 "同步到最新版本" 模式可自动更新依赖版本'));
      } else {
        console.log(chalk.green('✔ 所有依赖都是最新版本'));
      }
      return;
    }

    if (syncMode === 'latest') {
      // 自动更新到最新版本
      if (!hasUpdates) {
        console.log(chalk.green('✔ 所有依赖都是最新版本，无需更新'));
        return;
      }

      const { confirmUpdate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmUpdate',
          message: `确认更新 ${syncInfoList.filter(i => i.hasUpdate).length} 个依赖到最新版本?`,
          default: true
        }
      ]);

      if (!confirmUpdate) {
        console.log(chalk.blue('ℹ️  已取消更新'));
        return;
      }

      // 同步依赖列表到最新版本
      const updatedDependencies: Dependency[] = syncInfoList.map(info => ({
        resourceId: info.dependency.resourceId,
        resourceName: info.dependency.resourceName,
        versionRange: `^${info.latestVersion}`,
      }));

      // 更新配置
      config.dependencies = updatedDependencies;

      // 保存配置
      const saveSpinner = ora('正在保存配置...').start();
      try {
        await saveConfig(config, options.config);
        saveSpinner.succeed('配置保存成功');
        console.log(chalk.green(`\n✔️  已同步 ${updatedDependencies.length} 个依赖到最新版本`));
      } catch (err: any) {
        saveSpinner.fail('保存配置失败');
        console.log(chalk.red('✖️ ') + err.message);
        process.exit(1);
      }
    }

    if (syncMode === 'specific') {
      // 交互式选择版本
      const updatableDeps = syncInfoList.filter(info => info.hasUpdate);
      
      if (updatableDeps.length === 0) {
        console.log(chalk.green('✔ 所有依赖都是最新版本'));
        return;
      }

      console.log(chalk.cyan('\n请选择要更新的依赖:\n'));

      const { selectedDeps } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedDeps',
          message: '选择依赖（空格选择，回车确认）:',
          choices: updatableDeps.map(info => ({
            name: `${info.dependency.resourceName || info.dependency.resourceId} (${info.currentVersion} → ${info.latestVersion})`,
            value: info.dependency.resourceId,
            checked: false
          }))
        }
      ]);

      if (selectedDeps.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何依赖'));
        return;
      }

      // 同步选中的依赖到最新版本
      const updatedDependencies: Dependency[] = syncInfoList.map(info => {
        const isSelected = selectedDeps.includes(info.dependency.resourceId);
        return {
          resourceId: info.dependency.resourceId,
          resourceName: info.dependency.resourceName,
          versionRange: isSelected ? `^${info.latestVersion}` : info.currentVersion,
        };
      });

      // 更新配置
      config.dependencies = updatedDependencies;

      // 保存配置
      const saveSpinner = ora('正在保存配置...').start();
      try {
        await saveConfig(config, options.config);
        saveSpinner.succeed('配置保存成功');
        console.log(chalk.green(`\n✔️  已同步 ${selectedDeps.length} 个依赖到最新版本`));
      } catch (err: any) {
        saveSpinner.fail('保存配置失败');
        console.log(chalk.red('✖️ ') + err.message);
        process.exit(1);
      }
    }

  } catch (err: any) {
    console.log(chalk.red('✖ ') + `执行同步依赖命令失败: ${err.message}`);
    process.exit(1);
  }
}

