/**
 * batch dep sync 命令
 * 为批量配置中的某个资源同步依赖（检查更新、更新到最新版本等）
 */

import path from 'path';
import fs from 'fs-extra';
import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
  batchItemToVersionConfig,
  getBatchResourceConfigPath,
} from '../../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../../public/freelog.batch-resources';
import { getResourceInfo } from '../../../api/resource';
import { getAllDependencies, updateDependencyVersion } from '../../../services/dependencyService';
import { checkResourceAuth } from '../../../api/auth';
import { handleErrorAndExit } from '../../../utils/errorHandler';

/**
 * 同步模式
 */
type SyncMode = 'check' | 'latest' | 'specific';

/**
 * 依赖同步信息
 */
interface DependencySyncInfo {
  dependency: { resourceId: string; resourceName?: string; versionRange: string };
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  isAuthorized: boolean;
}

/**
 * 执行 batch dep sync 命令
 */
export async function executeBatchDepSync(
  resourceName: string,
  targetVersion?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 为批量资源同步依赖 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch dep sync <resourceName> [targetVersion]\n`);
      return;
    }

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载批量配置
    const spinner = ora('正在加载批量配置...').start();
    let batchConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      spinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      spinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 查找指定的资源
    const item = batchConfig.resources.find((r) => r.name === resourceName);
    
    if (!item) {
      console.log(chalk.red(`❌ 未找到资源: ${resourceName}`));
      console.log(chalk.blue('\n💡 可用资源列表:'));
      batchConfig.resources.forEach((r) => {
        console.log(`  - ${chalk.cyan(r.name)}`);
      });
      return;
    }

    if (item.skip) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 已标记为跳过`));
      return;
    }

    if (!item.resourceId) {
      console.log(chalk.yellow(`⚠️  资源 ${resourceName} 尚未创建，请先执行 batch create`));
      return;
    }

    // 4. 获取资源信息
    const resourceSpinner = ora(`正在获取 ${resourceName} 的资源信息...`).start();
    let resourceInfo;
    try {
      resourceInfo = await getResourceInfo(item.resourceId, {
        isLoadLatestVersionInfo: 1,
      });
      resourceSpinner.succeed('资源信息获取成功');
    } catch (err: unknown) {
      resourceSpinner.fail('获取资源信息失败');
      throw err;
    }

    if (!resourceInfo.userId) {
      throw new Error('无法获取用户ID');
    }

    // 5. 构建版本配置
    const versionConfig = batchItemToVersionConfig(
      item,
      batchConfig.defaults,
      item.resourceId,
      resourceInfo.userId
    );

    // 如果有最新版本，同步版本信息
    if (resourceInfo.latestVersionInfo) {
      versionConfig.version = resourceInfo.latestVersionInfo.version;
      versionConfig.versionId = resourceInfo.latestVersionInfo.versionId || undefined;
      if (resourceInfo.latestVersionInfo.fileSha1) {
        versionConfig.fileSha1 = resourceInfo.latestVersionInfo.fileSha1;
      }
      versionConfig.description = resourceInfo.latestVersionInfo.description || '';
      versionConfig.dependencies = resourceInfo.latestVersionInfo.dependencies || [];
    }

    // 6. 创建临时版本配置文件
    const batchConfigPath = getBatchResourceConfigPath(options.config);
    const batchConfigDir = path.dirname(batchConfigPath);
    const tempVersionConfigPath = path.join(batchConfigDir, `.temp.version.config.${item.name}.js`);

    // 保存临时版本配置
    const versionConfigContent = `const config = ${JSON.stringify(versionConfig, null, 2)};\nmodule.exports = config;`;
    await fs.writeFile(tempVersionConfigPath, versionConfigContent, 'utf-8');

    let tempVersionConfigPathCreated = true;

    try {
      // 7. 加载依赖列表
      const dependencies = await getAllDependencies(tempVersionConfigPath);

      if (!dependencies || dependencies.length === 0) {
        console.log(chalk.yellow('⚠️  该资源当前没有依赖'));
        return;
      }

      console.log(chalk.blue(`ℹ  找到 ${dependencies.length} 个依赖\n`));

      // 8. 确定同步模式
      let syncMode: SyncMode;
      
      if (targetVersion === 'latest') {
        syncMode = 'latest';
        console.log(chalk.blue('ℹ  同步模式: 更新到最新版本\n'));
      } else if (targetVersion) {
        console.log(chalk.red('✖ dep sync 命令暂不支持指定具体版本号'));
        console.log(chalk.yellow('💡 提示: 请使用 "latest" 更新到最新版本，或不传参数进行交互式选择\n'));
        return;
      } else {
        const { mode } = await inquirer.prompt([
          {
            type: 'list',
            name: 'mode',
            message: '请选择同步模式:',
            choices: [
              { name: '检查更新（仅查看，不修改）', value: 'check' },
              { name: '同步到最新版本', value: 'latest' },
              { name: '交互式选择版本', value: 'specific' },
            ],
            default: 'check',
          },
        ]);
        syncMode = mode;
      }

      // 9. 获取所有依赖的同步信息
      const syncInfoList: DependencySyncInfo[] = [];
      
      for (const dep of dependencies) {
        const depSpinner = ora(`正在检查: ${dep.resourceName || dep.resourceId}`).start();
        
        try {
          // 获取资源信息（加载最新版本详情）
          const depResourceInfo = await getResourceInfo(dep.resourceId, {
            isLoadLatestVersionInfo: 1,
          });
          
          // 检查授权状态
          let isAuthorized = false;
          try {
            if (depResourceInfo.latestVersionInfo) {
              const authResult = await checkResourceAuth(dep.resourceId, depResourceInfo.latestVersionInfo);
              isAuthorized = authResult.isAuth;
            }
          } catch (err) {
            // 忽略授权检查错误
          }
          
          const currentVersion = dep.versionRange;
          const latestVersion = depResourceInfo.latestVersion || '';
          
          // 判断是否有更新
          const isLatestPattern = currentVersion === '*' || currentVersion.includes(latestVersion);
          const hasUpdate = !isLatestPattern && currentVersion !== latestVersion;
          
          syncInfoList.push({
            dependency: dep,
            currentVersion,
            latestVersion,
            hasUpdate,
            isAuthorized,
          });
          
          const authStatus = isAuthorized ? chalk.green('[已授权]') : chalk.gray('[未授权]');
          const updateStatus = hasUpdate ? chalk.yellow('[有更新]') : chalk.gray('[最新]');
          
          depSpinner.succeed(`${dep.resourceName || dep.resourceId} ${authStatus} ${updateStatus}`);
          
        } catch (err: any) {
          depSpinner.fail(`获取失败: ${dep.resourceName || dep.resourceId}`);
          console.log(chalk.gray(`  ${err.message}`));
        }
      }

      // 10. 显示同步信息
      console.log(chalk.bold.cyan('\n=== 同步信息 ===\n'));
      
      const hasUpdates = syncInfoList.some((info) => info.hasUpdate);
      const unauthorizedCount = syncInfoList.filter((info) => !info.isAuthorized).length;
      
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
            console.log(chalk.gray('   未授权，可能需要签约'));
          }
          console.log();
        });
      }

      // 11. 根据模式执行操作
      if (syncMode === 'check') {
        // 仅检查，不更新
        console.log(chalk.blue('\n📊 统计信息:'));
        console.log(`  总依赖数: ${syncInfoList.length}`);
        console.log(`  有更新: ${hasUpdates ? chalk.yellow(String(syncInfoList.filter((info) => info.hasUpdate).length)) : chalk.gray('0')}`);
        console.log(`  未授权: ${unauthorizedCount > 0 ? chalk.yellow(String(unauthorizedCount)) : chalk.gray('0')}`);
        console.log(chalk.yellow('\n💡 提示: 使用 "latest" 模式可自动更新到最新版本'));
        return;
      }

      // 12. 根据模式执行操作
      if (syncMode === 'latest') {
        // 自动更新到最新版本
        const dependenciesToUpdate = syncInfoList.filter((info) => info.hasUpdate);

        if (dependenciesToUpdate.length === 0) {
          console.log(chalk.green('\n✔ 所有依赖都是最新版本，无需更新'));
          return;
        }

        const { confirmUpdate } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmUpdate',
            message: `确认更新 ${dependenciesToUpdate.length} 个依赖到最新版本？`,
            default: true,
          },
        ]);

        if (!confirmUpdate) {
          console.log(chalk.blue('ℹ️  操作已取消'));
          return;
        }

        // 批量更新
        const updateSpinner = ora('正在更新依赖...').start();
        let successCount = 0;
        let failCount = 0;

        for (const syncInfo of dependenciesToUpdate) {
          try {
            await updateDependencyVersion(
              syncInfo.dependency.resourceId,
              `^${syncInfo.latestVersion}`,
              tempVersionConfigPath
            );
            successCount++;
          } catch (err: any) {
            failCount++;
            console.log(chalk.red(`  ✖ ${syncInfo.dependency.resourceId}: ${err.message}`));
          }
        }

        updateSpinner.succeed(`更新完成（成功: ${successCount}, 失败: ${failCount}）`);

        console.log(chalk.green('\n✔ ') + '依赖同步完成');
        console.log(chalk.blue(`  资源: ${chalk.cyan(resourceName)}`));
        console.log(chalk.blue(`  更新数量: ${chalk.cyan(successCount)}`));

        console.log(chalk.blue('\n💡 注意: 依赖信息存储在版本配置中，批量配置主要用于管理资源列表'));
        console.log(chalk.blue('💡 提示: 使用 `freelog-cli batch publish-one <resourceName>` 发布新版本以生效更改'));
      } else if (syncMode === 'specific') {
        // 交互式选择版本
        const updatableDeps = syncInfoList.filter((info) => info.hasUpdate);

        if (updatableDeps.length === 0) {
          console.log(chalk.green('\n✔ 所有依赖都是最新版本'));
          return;
        }

        console.log(chalk.cyan('\n请选择要更新的依赖:\n'));

        const { selectedDeps } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selectedDeps',
            message: '选择依赖（使用空格键进行选择，回车确认）:',
            choices: updatableDeps.map((info) => ({
              name: `${info.dependency.resourceName || info.dependency.resourceId} (${info.currentVersion} → ${info.latestVersion})`,
              value: info.dependency.resourceId,
              checked: false,
            })),
          },
        ]);

        if (selectedDeps.length === 0) {
          console.log(chalk.blue('ℹ️  未选择任何依赖'));
          return;
        }

        // 更新选中的依赖
        const updateSpinner = ora('正在更新依赖...').start();
        let successCount = 0;
        let failCount = 0;

        for (const syncInfo of syncInfoList) {
          if (selectedDeps.includes(syncInfo.dependency.resourceId)) {
            try {
              await updateDependencyVersion(
                syncInfo.dependency.resourceId,
                `^${syncInfo.latestVersion}`,
                tempVersionConfigPath
              );
              successCount++;
            } catch (err: any) {
              failCount++;
              console.log(chalk.red(`  ✖ ${syncInfo.dependency.resourceId}: ${err.message}`));
            }
          }
        }

        updateSpinner.succeed(`更新完成（成功: ${successCount}, 失败: ${failCount}）`);

        console.log(chalk.green('\n✔ ') + '依赖同步完成');
        console.log(chalk.blue(`  资源: ${chalk.cyan(resourceName)}`));
        console.log(chalk.blue(`  更新数量: ${chalk.cyan(successCount)}`));

        console.log(chalk.blue('\n💡 注意: 依赖信息存储在版本配置中，批量配置主要用于管理资源列表'));
        console.log(chalk.blue('💡 提示: 使用 `freelog-cli batch publish-one <resourceName>` 发布新版本以生效更改'));
      }

    } finally {
      // 清理临时配置文件
      if (tempVersionConfigPathCreated && fs.existsSync(tempVersionConfigPath)) {
        await fs.remove(tempVersionConfigPath);
      }
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '同步依赖失败', options.debug);
  }
}

