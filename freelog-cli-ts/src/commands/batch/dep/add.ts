/**
 * batch dep add 命令
 * 为批量配置中的资源添加依赖（针对单个资源操作）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../../../types';
import { requireAuth } from '../../../core/auth';
import { confirmAuth } from '../../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
} from '../../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../../public/freelog.batch-resources';
import { getResourceInfo } from '../../../api/resource';
import { addDependency } from '../../../services/dependencyAddService';
import { loadVersionConfig, saveVersionConfig } from '../../../services/versionConfigService';
import { handleErrorAndExit } from '../../../utils/errorHandler';

/**
 * 执行 batch dep add 命令
 */
export async function executeBatchDepAdd(
  resourceName: string,
  dependencyId: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 为批量配置中的资源添加依赖 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch dep add <resourceName> <dependencyId>\n`);
      return;
    }

    if (!dependencyId) {
      console.log(chalk.red('❌ 请指定依赖资源ID'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch dep add <resourceName> <dependencyId>\n`);
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

    // 4. 获取依赖资源信息
    const depSpinner = ora('正在获取依赖资源信息...').start();
    let dependencyInfo;
    try {
      dependencyInfo = await getResourceInfo(dependencyId, {
        isLoadLatestVersionInfo: 1,
      });
      depSpinner.succeed(`依赖资源: ${dependencyInfo.resourceName || dependencyId}`);
    } catch (err: unknown) {
      depSpinner.fail('获取依赖资源信息失败');
      throw err;
    }

    // 5. 选择版本范围
    const { versionRange } = await inquirer.prompt([
      {
        type: 'input',
        name: 'versionRange',
        message: '请输入版本范围（如: ^1.0.0, ~2.3.0, *, 1.2.3）:',
        default: '*',
      },
    ]);

    // 6. 确认添加
    console.log(chalk.blue('\n📋 资源信息:'));
    console.log(`  资源名称: ${chalk.cyan(item.name)}`);
    console.log(`  资源ID: ${chalk.cyan(item.resourceId)}`);
    console.log(chalk.blue(`\n依赖资源: ${chalk.cyan(dependencyInfo.resourceName || dependencyId)}`));
    console.log(chalk.blue(`版本范围: ${chalk.cyan(versionRange)}`));

    const { confirmAdd } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmAdd',
        message: `确认为资源 ${resourceName} 添加依赖？`,
        default: true,
      },
    ]);

    if (!confirmAdd) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 7. 为资源添加依赖
    // 由于批量资源没有独立的版本配置文件，我们需要：
    // 1. 获取资源的版本信息
    // 2. 创建临时版本配置文件
    // 3. 使用依赖添加服务添加依赖
    // 4. 更新批量配置中的依赖信息

    const addSpinner = ora(`正在为 ${resourceName} 添加依赖...`).start();
    let tempVersionConfigPath: string | null = null;

    try {
      // 获取资源信息
      const resourceInfo = await getResourceInfo(item.resourceId, {
        isLoadLatestVersionInfo: 1,
      });

      if (!resourceInfo.userId) {
        throw new Error('无法获取用户ID');
      }

      // 构建版本配置
      const versionConfig = batchItemToVersionConfig(
        item,
        batchConfig.defaults,
        item.resourceId,
        resourceInfo.userId
      );

      // 如果有最新版本，同步版本信息
      if (resourceInfo.latestVersion) {
        versionConfig.version = resourceInfo.latestVersion.version;
        versionConfig.versionId = resourceInfo.latestVersion.versionId;
        versionConfig.fileSha1 = resourceInfo.latestVersion.fileSha1;
        versionConfig.description = resourceInfo.latestVersion.description || '';
        versionConfig.dependencies = resourceInfo.latestVersion.dependencies || [];
      }

      // 创建临时版本配置文件
      const batchConfigPath = getBatchResourceConfigPath(options.config);
      const batchConfigDir = path.dirname(batchConfigPath);
      tempVersionConfigPath = path.join(batchConfigDir, `.temp.version.config.${item.name}.js`);

      // 保存临时版本配置
      const versionConfigContent = `const config = ${JSON.stringify(versionConfig, null, 2)};\nmodule.exports = config;`;
      await fs.writeFile(tempVersionConfigPath, versionConfigContent, 'utf-8');

      // 使用依赖添加服务添加依赖
      const dependencyOps = {
        loadConfig: async () => versionConfig,
        saveConfig: async (config: any) => {
          // 保存到临时版本配置文件
          const configContent = `const config = ${JSON.stringify(config, null, 2)};\nmodule.exports = config;`;
          await fs.writeFile(tempVersionConfigPath!, configContent, 'utf-8');
        },
        getCurrentResourceId: () => item.resourceId!,
        addDependencyToConfig: async (config: any, dependency: any) => {
          const deps = config.dependencies || [];
          // 检查是否已存在
          const existingIndex = deps.findIndex((d: any) => d.resourceId === dependency.resourceId);
          if (existingIndex !== -1) {
            deps[existingIndex] = dependency;
          } else {
            deps.push(dependency);
          }
          return { ...config, dependencies: deps };
        },
        dependencyExists: async (config: any, depResourceId: string) => {
          const deps = config.dependencies || [];
          const existing = deps.find((d: any) => d.resourceId === depResourceId);
          return { exists: !!existing, dependency: existing };
        },
      };

      await addDependency(
        dependencyOps,
        dependencyId,
        versionRange,
        { config: tempVersionConfigPath, skipConfirm: true }
      );

      // 依赖信息已通过依赖添加服务保存到临时版本配置文件
      // 注意：批量配置中不直接存储 dependencies，依赖信息在版本配置中管理
      // 如果需要持久化依赖信息，可以考虑在批量配置中添加 dependencies 字段

      addSpinner.succeed(`${resourceName} 依赖添加成功`);

      console.log(chalk.green('\n✔ ') + '依赖添加成功');
      console.log(chalk.blue(`  资源: ${chalk.cyan(resourceName)}`));
      console.log(chalk.blue(`  依赖: ${chalk.cyan(dependencyInfo.resourceName || dependencyId)}`));
      console.log(chalk.blue(`  版本范围: ${chalk.cyan(versionRange)}`));

      console.log(chalk.blue('\n💡 注意: 依赖信息存储在版本配置中，批量配置主要用于管理资源列表'));

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      addSpinner.fail(`添加依赖失败: ${errorMessage}`);
      throw err;
    } finally {
      // 清理临时配置文件
      if (tempVersionConfigPath && fs.existsSync(tempVersionConfigPath)) {
        await fs.remove(tempVersionConfigPath);
      }
    }

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量添加依赖失败', options.debug);
  }
}

