/**
 * updateVersion 命令
 * 更新版本配置信息（version、description、filename、filePath）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { CommandOptions } from '../types';
import { requireAuth } from '../core/auth';
import { confirmAuth } from '../utils/authConfirm';
import {
  loadVersionConfig,
  saveVersionConfig,
} from '../services/versionConfigService';
import { handleErrorAndExit } from '../utils/errorHandler';

/**
 * 执行 updateVersion 命令
 */
export async function executeUpdateVersion(
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 更新版本配置信息 ===\n'));

    // 1. 验证登录并确认用户信息
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 加载版本配置
    const spinner = ora('正在加载版本配置...').start();
    let versionConfig;
    try {
      versionConfig = await loadVersionConfig(options.config, false);
      spinner.succeed('版本配置加载成功');
    } catch (err: any) {
      spinner.fail('加载版本配置失败');
      throw err;
    }

    // 3. 获取要更新的字段
    let versionToUpdate = options.version as string | undefined;
    let descriptionToUpdate = options.description as string | undefined;
    let filenameToUpdate = options.filename as string | undefined;
    let filePathToUpdate = options.filePath as string | undefined;

    // 如果命令行没有提供，交互式输入
    if (!versionToUpdate && !descriptionToUpdate && !filenameToUpdate && !filePathToUpdate) {
      const { fields } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'fields',
          message: '选择要更新的字段:',
          instructions: '使用空格键选择/取消，按 a 全选/取消全选，按 i 反选，回车确认',
          choices: [
            { name: '版本号 (version)', value: 'version' },
            { name: '版本描述 (description)', value: 'description' },
            { name: '文件名 (filename)', value: 'filename' },
            { name: '文件路径 (filePath)', value: 'filePath' },
          ],
        },
      ]);

      if (fields.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何字段，操作取消'));
        return;
      }

      if (fields.includes('version')) {
        const { version } = await inquirer.prompt([
          {
            type: 'input',
            name: 'version',
            message: '请输入版本号（格式: x.y.z）:',
            default: versionConfig.version || '1.0.0',
            validate: (input: string) => {
              if (!input.trim()) {
                return '版本号不能为空';
              }
              // 简单的版本号格式验证（x.y.z）
              const versionPattern = /^\d+\.\d+\.\d+$/;
              if (!versionPattern.test(input.trim())) {
                return '版本号格式不正确，应为 x.y.z（如: 1.0.0）';
              }
              return true;
            },
          },
        ]);
        versionToUpdate = version.trim();
      }

      if (fields.includes('description')) {
        const { description } = await inquirer.prompt([
          {
            type: 'input',
            name: 'description',
            message: '请输入版本描述:',
            default: versionConfig.description || '',
          },
        ]);
        descriptionToUpdate = description.trim();
      }

      if (fields.includes('filename')) {
        const { filename } = await inquirer.prompt([
          {
            type: 'input',
            name: 'filename',
            message: '请输入文件名:',
            default: versionConfig.filename || '',
            validate: (input: string) => {
              if (!input.trim()) {
                return '文件名不能为空';
              }
              return true;
            },
          },
        ]);
        filenameToUpdate = filename.trim();
      }

      if (fields.includes('filePath')) {
        const { filePath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'filePath',
            message: '请输入文件路径（相对于当前目录）:',
            default: versionConfig.filePath || './dist',
            validate: (input: string) => {
              if (!input.trim()) {
                return '文件路径不能为空';
              }
              // 检查路径是否存在（如果是文件）或目录是否存在
              const fullPath = path.resolve(process.cwd(), input.trim());
              if (!fs.existsSync(fullPath)) {
                return '文件或目录不存在';
              }
              return true;
            },
          },
        ]);
        filePathToUpdate = filePath.trim();
      }
    }

    // 4. 更新本地配置
    if (versionToUpdate !== undefined) {
      versionConfig.version = versionToUpdate;
    }
    if (descriptionToUpdate !== undefined) {
      versionConfig.description = descriptionToUpdate;
    }
    if (filenameToUpdate !== undefined) {
      versionConfig.filename = filenameToUpdate;
    }
    if (filePathToUpdate !== undefined) {
      versionConfig.filePath = filePathToUpdate;
    }

    // 5. 显示要更新的信息
    console.log(chalk.blue('\nℹ️  更新信息:'));
    if (versionToUpdate !== undefined) {
      console.log(`  新的版本号: ${chalk.cyan(versionToUpdate)}`);
    }
    if (descriptionToUpdate !== undefined) {
      console.log(`  新的版本描述: ${chalk.cyan(descriptionToUpdate || '(清空)')}`);
    }
    if (filenameToUpdate !== undefined) {
      console.log(`  新的文件名: ${chalk.cyan(filenameToUpdate)}`);
    }
    if (filePathToUpdate !== undefined) {
      console.log(`  新的文件路径: ${chalk.cyan(filePathToUpdate)}`);
    }

    // 6. 确认更新
    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: '确认更新版本配置信息？',
        default: true,
      },
    ]);

    if (!confirmUpdate) {
      console.log(chalk.blue('ℹ️  操作已取消'));
      return;
    }

    // 7. 保存配置
    const saveSpinner = ora('正在保存配置...').start();
    try {
      await saveVersionConfig(versionConfig, options.config);
      saveSpinner.succeed('配置保存成功');
    } catch (err: any) {
      saveSpinner.fail('保存配置失败');
      throw err;
    }

    // 8. 显示结果
    console.log(chalk.green('\n✔ ') + '版本配置信息更新完成');
    if (versionToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  版本号: ') + chalk.cyan(versionConfig.version));
    }
    if (descriptionToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  版本描述: ') + chalk.cyan(versionConfig.description || '(空)'));
    }
    if (filenameToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  文件名: ') + chalk.cyan(versionConfig.filename));
    }
    if (filePathToUpdate !== undefined) {
      console.log(chalk.blue('ℹ️  文件路径: ') + chalk.cyan(versionConfig.filePath));
    }
    
    console.log(chalk.green('✔ ') + '配置文件已更新');
    console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan('freelog.version.config.*')}`);
    
    console.log(chalk.blue('\n💡 提示:'));
    console.log(`  ${chalk.gray('$')} freelog-cli publish ${chalk.gray('# 发布版本')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli syncv ${chalk.gray('# 同步最新版本信息')}`);

  } catch (err: any) {
    handleErrorAndExit(err, '更新版本配置失败', options.debug);
  }
}

