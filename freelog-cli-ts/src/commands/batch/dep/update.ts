/**
 * batch dep update 命令
 * 为批量配置中的某个资源更新依赖的版本范围
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
import { getDependency, updateDependencyVersion } from '../../../services/dependencyService';
import { getResourceVersionInfoList } from '../../../api/version';
import { handleErrorAndExit } from '../../../utils/errorHandler';

/**
 * 执行 batch dep update 命令
 */
export async function executeBatchDepUpdate(
  resourceName: string,
  dependencyId: string,
  versionRange?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 为批量资源更新依赖 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch dep update <resourceName> <dependencyId> [versionRange]\n`);
      return;
    }

    if (!dependencyId) {
      console.log(chalk.red('❌ 请指定依赖资源ID'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch dep update <resourceName> <dependencyId> [versionRange]\n`);
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
      // 7. 查找依赖
      const targetDependency = await getDependency(dependencyId, tempVersionConfigPath);

      if (!targetDependency) {
        console.log(chalk.red(`❌ 未找到依赖: ${dependencyId}`));
        const dependencies = versionConfig.dependencies || [];
        if (dependencies.length > 0) {
          console.log(chalk.blue('\n💡 当前依赖列表:'));
          dependencies.forEach((dep) => {
            console.log(`  - ${chalk.cyan(dep.resourceId)} (${dep.versionRange})`);
          });
        } else {
          console.log(chalk.blue('💡 该资源当前没有依赖'));
        }
        return;
      }

      // 8. 显示当前依赖信息
      console.log(chalk.blue('\n📋 当前依赖信息:'));
      console.log(`  资源名称: ${chalk.cyan(item.name)}`);
      console.log(`  资源ID: ${chalk.cyan(item.resourceId)}`);
      console.log(`  依赖资源ID: ${chalk.cyan(targetDependency.resourceId)}`);
      console.log(`  当前版本范围: ${chalk.yellow(targetDependency.versionRange)}`);

      // 9. 获取新版本范围
      let newVersionRange: string;

      if (versionRange) {
        // 命令行指定了版本范围
        newVersionRange = versionRange;
      } else {
        // 获取可用版本列表
        const versionSpinner = ora('正在获取可用版本...').start();
        try {
          const versions = await getResourceVersionInfoList(dependencyId, {
            projection: 'version,versionId,createDate',
          });
          versionSpinner.succeed('版本列表获取成功');

          if (!versions || versions.length === 0) {
            console.log(chalk.yellow('\n⚠ 该资源没有可用版本'));
            return;
          }

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
              ],
            },
          ]);

          if (versionChoice === 'latest') {
            newVersionRange = versions[0].version;
          } else if (versionChoice === 'specific') {
            const { selectedVersion } = await inquirer.prompt([
              {
                type: 'list',
                name: 'selectedVersion',
                message: '请选择版本（使用空格键进行选择）:',
                choices: versions.slice(0, 20).map((v: any) => ({
                  name: `${v.version} (${new Date(v.createDate).toLocaleDateString('zh-CN')})`,
                  value: v.version,
                })),
              },
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
                },
              },
            ]);
            newVersionRange = customRange;
          }
        } catch (err: unknown) {
          versionSpinner.fail('获取版本列表失败');
          throw err;
        }
      }

      // 10. 显示更新信息
      console.log(chalk.cyan('\n=== 更新信息 ===\n'));
      console.log(chalk.blue('原版本范围: ') + chalk.yellow(targetDependency.versionRange));
      console.log(chalk.blue('新版本范围: ') + chalk.green(newVersionRange));

      // 11. 确认更新
      const { confirmUpdate } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmUpdate',
          message: '确认更新？',
          default: true,
        },
      ]);

      if (!confirmUpdate) {
        console.log(chalk.blue('ℹ️  操作已取消'));
        return;
      }

      // 12. 更新依赖版本
      const updateSpinner = ora('正在更新依赖版本...').start();
      try {
        await updateDependencyVersion(dependencyId, newVersionRange, tempVersionConfigPath);
        updateSpinner.succeed('依赖更新成功');

        console.log(chalk.green('\n✔ ') + '依赖更新成功');
        console.log(chalk.blue(`  资源: ${chalk.cyan(resourceName)}`));
        console.log(chalk.blue(`  依赖: ${chalk.cyan(dependencyId)}`));
        console.log(chalk.blue(`  新版本范围: ${chalk.cyan(newVersionRange)}`));

        console.log(chalk.blue('\n💡 注意: 依赖信息存储在版本配置中，批量配置主要用于管理资源列表'));
        console.log(chalk.blue('💡 提示: 使用 `freelog-cli batch publish-one <resourceName>` 发布新版本以生效更改'));

      } catch (err: unknown) {
        updateSpinner.fail('更新依赖版本失败');
        throw err;
      }
    } finally {
      // 清理临时配置文件
      if (tempVersionConfigPathCreated && fs.existsSync(tempVersionConfigPath)) {
        await fs.remove(tempVersionConfigPath);
      }
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '更新依赖失败', options.debug);
  }
}

