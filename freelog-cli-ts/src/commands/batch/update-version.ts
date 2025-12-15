/**
 * batch update-version 命令
 * 批量更新版本信息（version、description、filePath等）
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
 * 执行 batch update-version 命令
 */
export async function executeBatchUpdateVersion(
  resourceNames?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 批量更新版本信息 ===\n'));

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

    // 3. 选择要更新的资源
    let resourcesToUpdate: BatchResourceItemConfig[] = [];
    
    if (resourceNames) {
      // 如果指定了资源名称（多个用逗号分隔）
      const names = resourceNames.split(',').map((n) => n.trim());
      resourcesToUpdate = batchConfig.resources.filter(
        (item) => !item.skip && names.includes(item.name)
      );
      
      if (resourcesToUpdate.length === 0) {
        console.log(chalk.yellow('⚠️  未找到匹配的资源'));
        return;
      }
    } else {
      // 交互式选择资源
      const availableResources = batchConfig.resources.filter((item) => !item.skip);
      
      if (availableResources.length === 0) {
        console.log(chalk.blue('ℹ️  没有可更新的资源'));
        return;
      }
      
      const { selectedResources } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selectedResources',
          message: '选择要更新版本信息的资源（可多选）:',
          choices: availableResources.map((item) => ({
            name: `${item.name} (${item.resourceName || item.name})`,
            value: item.name,
          })),
        },
      ]);
      
      if (selectedResources.length === 0) {
        console.log(chalk.blue('ℹ️  未选择任何资源'));
        return;
      }
      
      resourcesToUpdate = availableResources.filter((item) =>
        selectedResources.includes(item.name)
      );
    }

    // 4. 选择要更新的字段
    const { fields } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'fields',
        message: '选择要更新的字段:',
        choices: [
          { name: '版本号 (version)', value: 'version' },
          { name: '版本描述 (description)', value: 'description' },
          { name: '文件路径 (filePath)', value: 'filePath' },
        ],
      },
    ]);

    if (fields.length === 0) {
      console.log(chalk.blue('ℹ️  未选择任何字段'));
      return;
    }

    // 5. 获取更新值（如果是批量更新，询问是否统一设置）
    const { applyToAll } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'applyToAll',
        message: `是否对所有选中的资源应用相同的更新值？`,
        default: true,
      },
    ]);

    const updates: {
      version?: string;
      description?: string;
      filePath?: string;
    } = {};

    if (fields.includes('version')) {
      const { version } = await inquirer.prompt([
        {
          type: 'input',
          name: 'version',
          message: '请输入版本号（格式: x.y.z）:',
          default: batchConfig.defaults.version || '1.0.0',
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
      ]);
      updates.version = version.trim();
    }

    if (fields.includes('description')) {
      const { description } = await inquirer.prompt([
        {
          type: 'input',
          name: 'description',
          message: '请输入版本描述:',
          default: batchConfig.defaults.description || '',
        },
      ]);
      updates.description = description.trim() || undefined;
    }

    if (fields.includes('filePath')) {
      const { filePath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'filePath',
          message: '请输入文件路径（相对于当前目录）:',
          default: '',
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
      updates.filePath = path.relative(process.cwd(), path.resolve(process.cwd(), filePath.trim()));
    }

    // 6. 如果是逐个更新，为每个资源询问
    if (!applyToAll && resourcesToUpdate.length > 1) {
      for (const item of resourcesToUpdate) {
        console.log(chalk.blue(`\n📝 更新资源: ${item.name}`));
        
        if (fields.includes('version')) {
          const { version } = await inquirer.prompt([
            {
              type: 'input',
              name: 'version',
              message: '请输入版本号:',
              default: item.version || batchConfig.defaults.version || '1.0.0',
              validate: (input: string) => {
                if (!input.trim()) {
                  return '版本号不能为空';
                }
                const versionPattern = /^\d+\.\d+\.\d+$/;
                if (!versionPattern.test(input.trim())) {
                  return '版本号格式不正确';
                }
                return true;
              },
            },
          ]);
          item.version = version.trim();
        }

        if (fields.includes('description')) {
          const { description } = await inquirer.prompt([
            {
              type: 'input',
              name: 'description',
              message: '请输入版本描述:',
              default: item.description || batchConfig.defaults.description || '',
            },
          ]);
          item.description = description.trim() || undefined;
        }

        if (fields.includes('filePath')) {
          const { filePath } = await inquirer.prompt([
            {
              type: 'input',
              name: 'filePath',
              message: '请输入文件路径:',
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
          item.filePath = path.relative(process.cwd(), path.resolve(process.cwd(), filePath.trim()));
        }
      }
    }

    // 7. 确认更新
    console.log(chalk.blue('\n📋 将要更新的资源:'));
    resourcesToUpdate.forEach((item) => {
      console.log(`  - ${chalk.cyan(item.name)}`);
      if (updates.version) {
        console.log(`    版本号: ${updates.version}`);
      }
      if (updates.description !== undefined) {
        console.log(`    版本描述: ${updates.description || '(空)'}`);
      }
      if (updates.filePath) {
        console.log(`    文件路径: ${updates.filePath}`);
      }
    });

    const { confirmUpdate } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmUpdate',
        message: `确认更新 ${resourcesToUpdate.length} 个资源的版本信息？`,
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
      for (const item of resourcesToUpdate) {
        const itemUpdates: Partial<BatchResourceItemConfig> = {};
        
        if (applyToAll) {
          if (updates.version) {
            itemUpdates.version = updates.version;
          }
          if (updates.description !== undefined) {
            itemUpdates.description = updates.description;
          }
          if (updates.filePath) {
            itemUpdates.filePath = updates.filePath;
          }
        } else {
          // 逐个更新时，item 已经被修改了
          if (item.version) {
            itemUpdates.version = item.version;
          }
          if (item.description !== undefined) {
            itemUpdates.description = item.description;
          }
          if (item.filePath) {
            itemUpdates.filePath = item.filePath;
          }
        }
        
        if (Object.keys(itemUpdates).length > 0) {
          batchConfig = updateBatchResourceItem(batchConfig, item.name, itemUpdates);
        }
      }
      
      await saveBatchResourceConfig(batchConfig, options.config);
      updateSpinner.succeed('批量配置已更新');
    } catch (err: unknown) {
      updateSpinner.fail('更新批量配置失败');
      throw err;
    }

    // 9. 显示结果
    console.log(chalk.green('\n✔ ') + `成功更新 ${resourcesToUpdate.length} 个资源的版本信息`);
    
    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish                ${chalk.gray('# 批量发布版本')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish-one <name>     ${chalk.gray('# 单独发布某个资源')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '批量更新版本信息失败', options.debug);
  }
}

