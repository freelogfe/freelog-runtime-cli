/**
 * batch add 命令
 * 添加单个资源项到批量配置
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
} from '../../services/batchResourceService';
import type { BatchResourceConfig } from '../../../public/freelog.batch-resources';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 执行 batch add 命令
 */
export async function executeBatchAdd(
  filePath?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 添加资源到批量配置 ===\n'));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载批量配置
    const spinner = ora('正在加载批量配置...').start();
    let batchConfig: BatchResourceConfig;
    try {
      batchConfig = await loadBatchResourceConfig(options.config);
      spinner.succeed('批量配置加载成功');
    } catch (err: unknown) {
      spinner.fail('加载批量配置失败');
      throw err;
    }

    // 3. 获取文件路径
    let targetFilePath = filePath;
    if (!targetFilePath) {
      const { inputPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'inputPath',
          message: '请输入文件或目录路径（相对于当前目录）:',
          validate: (input: string) => {
            if (!input.trim()) {
              return '路径不能为空';
            }
            const fullPath = path.resolve(process.cwd(), input.trim());
            if (!fs.existsSync(fullPath)) {
              return '文件或目录不存在';
            }
            return true;
          },
        },
      ]);
      targetFilePath = inputPath.trim();
    }

    if (!targetFilePath) {
      throw new Error('文件路径不能为空');
    }

    const fullPath = path.resolve(process.cwd(), targetFilePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`文件或目录不存在: ${targetFilePath}`);
    }

    // 4. 检查是否已存在
    const relativePath = path.relative(process.cwd(), fullPath);
    const existingItem = batchConfig.resources.find(
      (item) => item.filePath === relativePath || item.name === path.basename(fullPath, path.extname(fullPath))
    );

    if (existingItem) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `资源项已存在: ${existingItem.name}，是否覆盖？`,
          default: false,
        },
      ]);

      if (!overwrite) {
        console.log(chalk.blue('ℹ️  操作已取消'));
        return;
      }

      // 移除现有项
      batchConfig.resources = batchConfig.resources.filter(
        (item) => item.name !== existingItem.name
      );
    }

    // 5. 获取资源信息
    const stats = await fs.stat(fullPath);
    const isDirectory = stats.isDirectory();
    const baseName = path.basename(fullPath, path.extname(fullPath));

    // 6. 确定文件路径
    let finalFilePath: string;
    if (isDirectory) {
      // 如果是目录，检查是否有 dist 子目录
      const distPath = path.join(fullPath, 'dist');
      if (fs.existsSync(distPath)) {
        finalFilePath = path.relative(process.cwd(), distPath);
      } else {
        finalFilePath = relativePath;
      }
    } else {
      // 如果是文件，直接使用文件路径
      finalFilePath = relativePath;
    }

    // 7. 询问资源名称和标题
    const { resourceName, resourceTitle, intro } = await inquirer.prompt([
      {
        type: 'input',
        name: 'resourceName',
        message: '请输入资源名称:',
        default: baseName,
        validate: (input: string) => {
          if (!input.trim()) {
            return '资源名称不能为空';
          }
          // 检查是否与其他资源项重名
          const nameExists = batchConfig.resources.some(
            (item) => item.name === input.trim() && item.name !== existingItem?.name
          );
          if (nameExists) {
            return '资源名称已存在，请使用不同的名称';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'resourceTitle',
        message: '请输入资源标题（可选）:',
        default: '',
      },
      {
        type: 'input',
        name: 'intro',
        message: '请输入资源介绍（可选）:',
        default: '',
      },
    ]);

    // 8. 添加到配置
    const newItem = {
      name: resourceName.trim(),
      resourceName: resourceName.trim(),
      resourceTitle: resourceTitle.trim() || undefined,
      intro: intro.trim() || undefined,
      filePath: finalFilePath,
      resourceId: '',
      versionId: '',
      fileSha1: '',
      skip: false,
    };

    batchConfig.resources.push(newItem);

    // 9. 保存配置
    const saveSpinner = ora('正在保存配置...').start();
    try {
      await saveBatchResourceConfig(batchConfig, options.config);
      saveSpinner.succeed('配置已保存');
    } catch (err: unknown) {
      saveSpinner.fail('保存配置失败');
      throw err;
    }

    // 10. 显示结果
    console.log(chalk.green('\n✔ ') + '资源已添加到批量配置');
    console.log(chalk.blue('ℹ️ ') + `资源名称: ${chalk.cyan(resourceName)}`);
    console.log(chalk.blue('ℹ️ ') + `文件路径: ${chalk.cyan(finalFilePath)}`);
    
    if (resourceTitle) {
      console.log(chalk.blue('ℹ️ ') + `资源标题: ${chalk.cyan(resourceTitle)}`);
    }

    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch create                  ${chalk.gray('# 批量创建资源')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish                 ${chalk.gray('# 批量发布版本')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '添加资源失败', options.debug);
  }
}

