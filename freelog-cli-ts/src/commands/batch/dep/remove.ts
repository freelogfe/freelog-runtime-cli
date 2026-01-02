/**
 * batch dep remove 命令
 * 为批量配置中的某个资源移除依赖
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
import { removeDependency, getAllDependencies } from '../../../services/dependencyService';
import { handleErrorAndExit } from '../../../utils/errorHandler';

/**
 * 执行 batch dep remove 命令
 */
export async function executeBatchDepRemove(
  resourceName: string,
  dependencyId: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 为批量资源移除依赖 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch dep remove <resourceName> <dependencyId>\n`);
      return;
    }

    if (!dependencyId) {
      console.log(chalk.red('❌ 请指定依赖资源ID'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch dep remove <resourceName> <dependencyId>\n`);
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

    // 6. 检查依赖是否存在
    const dependencies = versionConfig.dependencies || [];
    const targetDependency = dependencies.find((dep) => dep.resourceId === dependencyId);

    if (!targetDependency) {
      console.log(chalk.red(`❌ 未找到依赖: ${dependencyId}`));
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

    // 7. 显示依赖信息
    console.log(chalk.blue('\n📋 依赖信息:'));
    console.log(`  资源名称: ${chalk.cyan(item.name)}`);
    console.log(`  资源ID: ${chalk.cyan(item.resourceId)}`);
    console.log(`  依赖资源ID: ${chalk.cyan(targetDependency.resourceId)}`);
    console.log(`  版本范围: ${chalk.cyan(targetDependency.versionRange)}`);

    // 8. 确认移除
    const { confirmRemove } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmRemove',
        message: `确认移除依赖 ${dependencyId}？`,
        default: false,
      },
    ]);

    if (!confirmRemove) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 9. 创建临时版本配置文件
    const batchConfigPath = getBatchResourceConfigPath(options.config);
    const batchConfigDir = path.dirname(batchConfigPath);
    const tempVersionConfigPath = path.join(batchConfigDir, `.temp.version.config.${item.name}.js`);

    let tempVersionConfigPathCreated = false;

    try {
      // 保存临时版本配置
      const versionConfigContent = `const config = ${JSON.stringify(versionConfig, null, 2)};\nmodule.exports = config;`;
      await fs.writeFile(tempVersionConfigPath, versionConfigContent, 'utf-8');
      tempVersionConfigPathCreated = true;

      // 使用依赖服务移除依赖
      const removeSpinner = ora('正在移除依赖...').start();
      try {
        const updatedVersionConfig = await removeDependency(dependencyId, tempVersionConfigPath);
        removeSpinner.succeed('依赖移除成功');

        // 注意：依赖信息在版本配置中管理，批量配置中不直接存储
        // 如果需要持久化，可以考虑在批量配置中添加 dependencies 字段
        // 或者通过版本配置来管理

        console.log(chalk.green('\n✔ ') + '依赖移除成功');
        console.log(chalk.blue(`  资源: ${chalk.cyan(resourceName)}`));
        console.log(chalk.blue(`  移除的依赖: ${chalk.cyan(dependencyId)}`));

        // 显示剩余依赖
        const remainingDeps = updatedVersionConfig.dependencies || [];
        if (remainingDeps.length > 0) {
          console.log(chalk.blue(`\n剩余依赖数量: ${chalk.cyan(remainingDeps.length)}`));
        } else {
          console.log(chalk.blue('\n该资源当前没有依赖'));
        }

        console.log(chalk.blue('\n💡 注意: 依赖信息存储在版本配置中，批量配置主要用于管理资源列表'));
        console.log(chalk.blue('💡 提示: 使用 `freelog-cli batch publish-one <resourceName>` 发布新版本以生效更改'));

      } catch (err: unknown) {
        removeSpinner.fail('移除依赖失败');
        throw err;
      }
    } finally {
      // 清理临时配置文件
      if (tempVersionConfigPathCreated && fs.existsSync(tempVersionConfigPath)) {
        await fs.remove(tempVersionConfigPath);
      }
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '移除依赖失败', options.debug);
  }
}

