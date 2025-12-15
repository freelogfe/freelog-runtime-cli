/**
 * batch edit 命令
 * 编辑单个资源的所有信息（资源信息和版本信息）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import {
  loadBatchResourceConfig,
  saveBatchResourceConfig,
  updateBatchResourceItem,
} from '../../services/batchResourceService';
import type { BatchResourceItemConfig } from '../../../public/freelog.batch-resources';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch edit 命令
 */
export async function executeBatchEdit(
  resourceName: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 编辑资源信息 ===\n'));

    if (!resourceName) {
      console.log(chalk.red('❌ 请指定资源名称'));
      console.log(chalk.yellow('\n💡 使用方法:'));
      console.log(`  ${chalk.gray('$')} freelog-cli batch edit <resourceName>\n`);
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

    // 3. 查找资源项
    const itemIndex = batchConfig.resources.findIndex((r) => r.name === resourceName);
    
    if (itemIndex === -1) {
      console.log(chalk.red(`❌ 未找到资源: ${resourceName}`));
      console.log(chalk.blue('\n💡 可用资源列表:'));
      batchConfig.resources.forEach((r) => {
        console.log(`  - ${chalk.cyan(r.name)}`);
      });
      return;
    }

    const item = batchConfig.resources[itemIndex];

    // 4. 选择要编辑的类别
    const { category } = await inquirer.prompt([
      {
        type: 'list',
        name: 'category',
        message: '选择要编辑的类别:',
        choices: [
          { name: '资源基本信息（名称、标题、介绍、封面图、标签）', value: 'resource' },
          { name: '版本信息（版本号、描述、文件路径）', value: 'version' },
          { name: '全部信息', value: 'all' },
        ],
      },
    ]);

    const updates: Partial<BatchResourceItemConfig> = {};

    // 5. 编辑资源基本信息
    if (category === 'resource' || category === 'all') {
      const { resourceName: newResourceName, resourceTitle, intro, coverImages, tags } = await inquirer.prompt([
        {
          type: 'input',
          name: 'resourceName',
          message: '资源名称:',
          default: item.resourceName || item.name,
        },
        {
          type: 'input',
          name: 'resourceTitle',
          message: '资源标题（可选）:',
          default: item.resourceTitle || '',
        },
        {
          type: 'input',
          name: 'intro',
          message: '资源介绍（可选）:',
          default: item.intro || '',
        },
        {
          type: 'input',
          name: 'coverImages',
          message: '封面图URL（多个用逗号分隔，可选）:',
          default: item.coverImages ? item.coverImages.join(',') : '',
        },
        {
          type: 'input',
          name: 'tags',
          message: '标签（多个用逗号分隔，可选）:',
          default: item.tags ? item.tags.join(',') : '',
        },
      ]);

      updates.resourceName = newResourceName.trim() || undefined;
      updates.resourceTitle = resourceTitle.trim() || undefined;
      updates.intro = intro.trim() || undefined;
      updates.coverImages = coverImages
        .split(',')
        .map((url: string) => url.trim())
        .filter((url: string) => url.length > 0);
      updates.tags = tags
        .split(',')
        .map((tag: string) => tag.trim())
        .filter((tag: string) => tag.length > 0);
    }

    // 6. 编辑版本信息
    if (category === 'version' || category === 'all') {
      const { version, description, filePath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'version',
          message: '版本号（格式: x.y.z）:',
          default: item.version || batchConfig.defaults.version || '1.0.0',
          validate: (input: string) => {
            if (!input.trim()) {
              return '版本号不能为空';
            }
            const versionPattern = /^\d+\.\d+\.\d+$/;
            if (!versionPattern.test(input.trim())) {
              return '版本号格式不正确，应为 x.y.z（如: 1.0.0）';
            }
            return true;
          },
        },
        {
          type: 'input',
          name: 'description',
          message: '版本描述（可选）:',
          default: item.description || batchConfig.defaults.description || '',
        },
        {
          type: 'input',
          name: 'filePath',
          message: '文件路径（相对于当前目录）:',
          default: item.filePath,
          validate: (input: string) => {
            if (!input.trim()) {
              return '文件路径不能为空';
            }
            const fullPath = path.resolve(process.cwd(), input.trim());
            if (!fs.existsSync(fullPath)) {
              return '文件或目录不存在';
            }
            return true;
          },
        },
      ]);

      updates.version = version.trim();
      updates.description = description.trim() || undefined;
      updates.filePath = path.relative(process.cwd(), path.resolve(process.cwd(), filePath.trim()));
    }

    // 7. 确认更新
    console.log(chalk.blue('\n📋 将要更新的字段:'));
    Object.keys(updates).forEach((key) => {
      const value = updates[key as keyof BatchResourceItemConfig];
      if (Array.isArray(value)) {
        console.log(`  ${key}: [${value.join(', ')}]`);
      } else {
        console.log(`  ${key}: ${value}`);
      }
    });

    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: `确认更新资源 ${resourceName} 的信息？`,
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 8. 更新配置
    const updateSpinner = ora('正在更新批量配置...').start();
    try {
      batchConfig = updateBatchResourceItem(batchConfig, resourceName, updates);
      await saveBatchResourceConfig(batchConfig, options.config);
      updateSpinner.succeed('批量配置已更新');
    } catch (err: unknown) {
      updateSpinner.fail('更新批量配置失败');
      throw err;
    }

    // 9. 显示结果
    console.log(chalk.green('\n✔ ') + `资源 ${resourceName} 的信息已更新`);

    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch create                ${chalk.gray('# 创建资源（如果未创建）')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish-one ${resourceName} ${chalk.gray('# 发布版本')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '编辑资源信息失败', options.debug);
  }
}

