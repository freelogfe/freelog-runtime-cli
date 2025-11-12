/**
 * update 命令
 * 更新 Freelog 资源信息（intro, coverImages）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import {
  loadResourceConfig,
  saveResourceConfig,
  resourceConfigToUpdateBody,
} from '../services/resourceConfigService';
import { updateResource } from '../api/create';

/**
 * 执行 update 命令
 */
export async function executeUpdateResource(
  resource?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 更新 Freelog 资源信息 ===\n'));

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

    // 3. 确定要更新的资源
    const resourceId = resource || resourceConfig.resourceId;
    if (!resourceId) {
      throw new Error('未指定资源 ID，请在命令中提供或在配置文件中设置 resourceId');
    }

    // 4. 获取要更新的字段
    let introToUpdate = options.intro as string | undefined;
    let coverImagesToUpdate = options.cover 
      ? (options.cover as string).split(',').map(url => url.trim())
      : undefined;

    // 如果命令行没有提供，交互式输入
    if (!introToUpdate && !coverImagesToUpdate) {
      const { fields } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'fields',
          message: '选择要更新的字段:',
          choices: [
            { name: '资源介绍 (intro)', value: 'intro' },
            { name: '封面图 (coverImages)', value: 'coverImages' },
          ],
        },
      ]);

      if (fields.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何字段，操作取消'));
        return;
      }

      if (fields.includes('intro')) {
        const { intro } = await inquirer.prompt([
          {
            type: 'input',
            name: 'intro',
            message: '请输入资源介绍:',
            default: resourceConfig.intro || '',
          },
        ]);
        introToUpdate = intro;
      }

      if (fields.includes('coverImages')) {
        const { coverImages } = await inquirer.prompt([
          {
            type: 'input',
            name: 'coverImages',
            message: '请输入封面图 URL（多个用逗号分隔）:',
            default: resourceConfig.coverImages?.join(', ') || '',
          },
        ]);
        coverImagesToUpdate = coverImages
          .split(',')
          .map((url: string) => url.trim())
          .filter((url: string) => url);
      }
    }

    // 5. 更新本地配置
    if (introToUpdate !== undefined) {
      resourceConfig.intro = introToUpdate;
    }
    if (coverImagesToUpdate !== undefined) {
      resourceConfig.coverImages = coverImagesToUpdate;
    }

    // 6. 显示要更新的信息
    console.log(chalk.blue('\nℹ️  更新信息:'));
    console.log(`  资源 ID: ${chalk.cyan(resourceId)}`);
    if (introToUpdate !== undefined) {
      console.log(`  新的介绍: ${chalk.cyan(introToUpdate || '(清空)')}`);
    }
    if (coverImagesToUpdate !== undefined) {
      console.log(`  新的封面图: ${chalk.cyan(coverImagesToUpdate.length)} 张`);
    }

    // 7. 确认更新
    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: '确认更新资源信息？',
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 8. 调用 API 更新资源
    const updateSpinner = ora('正在更新资源...').start();
    try {
      const body = resourceConfigToUpdateBody(resourceConfig);
      const result = await updateResource(resourceId, body);

      updateSpinner.succeed('资源更新成功');

      // 9. 更新本地配置
      resourceConfig.intro = result.intro;
      resourceConfig.coverImages = result.coverImages;
      await saveResourceConfig(resourceConfig, options.config);

      // 10. 显示结果
      console.log(chalk.green('\n✔ ') + '资源信息更新完成');
      console.log(chalk.blue('ℹ️  资源 ID: ') + chalk.cyan(result.resourceId));
      if (introToUpdate !== undefined) {
        console.log(chalk.blue('ℹ️  资源介绍: ') + chalk.cyan(result.intro || '(空)'));
      }
      if (coverImagesToUpdate !== undefined) {
        console.log(chalk.blue('ℹ️  封面图数量: ') + chalk.cyan(result.coverImages.length.toString()));
      }

    } catch (err: any) {
      updateSpinner.fail('更新资源失败');
      throw err;
    }

  } catch (err: any) {
    console.log(chalk.red('✖ ') + `更新资源失败: ${err.message}`);
    if (options.debug) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

