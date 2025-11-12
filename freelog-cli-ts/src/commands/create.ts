/**
 * create 命令
 * 创建 Freelog 资源
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import {
  loadResourceConfig,
  saveResourceConfig,
  resourceConfigToCreateBody,
} from '../services/resourceConfigService';
import { createResource } from '../api/create';

/**
 * 执行 create 命令
 */
export async function executeCreate(
  name?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 创建 Freelog 资源 ===\n'));

    // 1. 验证登录
    requireAuth();

    // 2. 加载资源配置
    const spinner = ora('正在加载资源配置...').start();
    let resourceConfig;
    try {
      resourceConfig = await loadResourceConfig(options.config);
      spinner.succeed('资源配置加载成功');
    } catch (err: any) {
      spinner.fail('加载资源配置失败');
      throw err;
    }

    // 3. 检查 resourceId 是否已存在
    if (resourceConfig.resourceId) {
      const { confirmOverwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmOverwrite',
          message: `资源配置中已有 resourceId: ${resourceConfig.resourceId}，是否继续创建新资源？`,
          default: false,
        },
      ]);

      if (!confirmOverwrite) {
        console.log(chalk.blue('ℹ️  操作已取消'));
        return;
      }
    }

    // 4. 如果提供了 name 参数，更新 resourceName
    if (name) {
      resourceConfig.resourceName = name;
    }

    // 5. 交互式输入缺失的必填字段
    if (!resourceConfig.resourceName) {
      const { resourceName } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceName',
          message: '请输入资源名称:',
          validate: (input: string) => (input.trim() ? true : '资源名称不能为空'),
        },
      ]);
      resourceConfig.resourceName = resourceName;
    }

    if (!resourceConfig.resourceType || resourceConfig.resourceType.length === 0) {
      const { resourceType } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceType',
          message: '请输入资源类型（多个用逗号分隔）:',
          validate: (input: string) => (input.trim() ? true : '资源类型不能为空'),
        },
      ]);
      resourceConfig.resourceType = resourceType
        .split(',')
        .map((type: string) => type.trim())
        .filter((type: string) => type);
    }

    // 6. 显示要创建的资源信息
    console.log(chalk.blue('\nℹ️  资源信息:'));
    console.log(`  资源名称: ${chalk.cyan(resourceConfig.resourceName)}`);
    console.log(`  资源类型: ${chalk.cyan(resourceConfig.resourceType.join(', '))}`);
    if (resourceConfig.intro) {
      console.log(`  资源介绍: ${chalk.cyan(resourceConfig.intro)}`);
    }
    if (resourceConfig.coverImages && resourceConfig.coverImages.length > 0) {
      console.log(`  封面图: ${chalk.cyan(resourceConfig.coverImages.length)} 张`);
    }

    // 7. 确认创建
    const { confirmCreate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmCreate',
        message: '确认创建资源？',
        default: true,
      },
    ]);

    if (!confirmCreate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 8. 调用 API 创建资源
    const createSpinner = ora('正在创建资源...').start();
    try {
      const body = resourceConfigToCreateBody(resourceConfig);
      const result = await createResource(body);

      createSpinner.succeed(`资源创建成功: ${result.resourceId}`);

      // 9. 更新本地配置
      resourceConfig.resourceId = result.resourceId;
      resourceConfig.resourceName = result.resourceName;
      resourceConfig.resourceType = result.resourceType;
      resourceConfig.intro = result.intro;
      resourceConfig.coverImages = result.coverImages;

      await saveResourceConfig(resourceConfig, options.config);

      // 10. 显示结果
      console.log(chalk.green('\n✔ ') + '资源创建完成');
      console.log(chalk.blue('ℹ️  资源 ID: ') + chalk.cyan(result.resourceId));
      console.log(chalk.blue('ℹ️  资源名称: ') + chalk.cyan(result.resourceName));
      console.log(chalk.blue('ℹ️  资源类型: ') + chalk.cyan(result.resourceType.join(', ')));
      
      console.log(chalk.blue('\nℹ️  下一步:'));
      console.log(`  ${chalk.gray('$')} freelog-cli publish             ${chalk.gray('# 发布资源版本')}`);
      console.log(`  ${chalk.gray('$')} freelog-cli dep add <resourceId> ${chalk.gray('# 添加依赖')}\n`);

    } catch (err: any) {
      createSpinner.fail('创建资源失败');
      throw err;
    }

  } catch (err: any) {
    console.log(chalk.red('✖ ') + `创建资源失败: ${err.message}`);
    if (options.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

