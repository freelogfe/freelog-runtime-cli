/**
 * batch init 命令
 * 初始化批量资源配置文件
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import { listResourceTypesByGroup, type ResourceTypeInfo } from '../../api/resource';
import {
  scanDirectoryForBatchConfig,
  saveBatchResourceConfig,
} from '../../services/batchResourceService';
import type {
  BatchResourceConfig,
  BatchResourceItemConfig,
} from '../../../public/freelog.batch-resources';
import { handleErrorAndExit } from '../../utils/errorHandler';
import { getTemplatePath } from '../../utils/templatePath';

/**
 * 扁平化资源类型树，用于搜索
 */
function flattenResourceTypes(types: ResourceTypeInfo[], result: ResourceTypeInfo[] = []): ResourceTypeInfo[] {
  for (const type of types) {
    result.push(type);
    if (type.children && type.children.length > 0) {
      flattenResourceTypes(type.children, result);
    }
  }
  return result;
}

/**
 * 搜索资源类型
 */
async function searchResourceType(allTypes: ResourceTypeInfo[]): Promise<ResourceTypeInfo | null> {
  const flattenedTypes = flattenResourceTypes(allTypes);
  
  const { searchKeyword } = await inquirer.prompt([
    {
      type: 'input',
      name: 'searchKeyword',
      message: '请输入搜索关键词（资源类型名称或编号）',
      validate: (input: string) => {
        if (!input.trim()) {
          return '搜索关键词不能为空';
        }
        return true;
      },
    },
  ]);

  const keyword = searchKeyword.trim().toLowerCase();
  const matchedTypes = flattenedTypes.filter(
    (type) =>
      type.name.toLowerCase().includes(keyword) ||
      type.code.toLowerCase().includes(keyword)
  );

  if (matchedTypes.length === 0) {
    console.log(chalk.yellow(`\n⚠️  未找到匹配的资源类型`));
    const { retry } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'retry',
        message: '是否重新搜索？',
        default: true,
      },
    ]);
    if (retry) {
      return await searchResourceType(allTypes);
    }
    return null;
  }

  // 如果只有一个匹配项，直接返回
  if (matchedTypes.length === 1) {
    return matchedTypes[0];
  }

  // 多个匹配项，让用户选择
  const choices = matchedTypes.map((type) => ({
    name: `${type.name} ${chalk.gray(`(${type.code})`)}`,
    value: type,
  }));

  const { selectedType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedType',
      message: `找到 ${matchedTypes.length} 个匹配的资源类型，请选择：`,
      choices,
      pageSize: 15,
    },
  ]);

  return selectedType;
}

/**
 * 执行 batch init 命令
 */
export async function executeBatchInit(
  directory?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 初始化批量资源配置 ===\n'));

    // 1. 验证登录
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 询问是否扫描文件夹
    let scanDirectory = directory;
    let resources: BatchResourceItemConfig[] = [];

    if (!scanDirectory) {
      const { shouldScan } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldScan',
          message: '是否扫描文件夹自动生成资源列表？',
          default: true,
        },
      ]);

      if (shouldScan) {
        const { dirPath } = await inquirer.prompt([
          {
            type: 'input',
            name: 'dirPath',
            message: '请输入要扫描的文件夹路径（相对于当前目录）:',
            default: './chapters',
            validate: (input: string) => {
              if (!input.trim()) {
                return '文件夹路径不能为空';
              }
              return true;
            },
          },
        ]);
        scanDirectory = dirPath.trim();
      }
    }

    // 3. 扫描文件夹（如果指定）
    if (scanDirectory) {
      // 询问是否扫描单个文件
      const { includeFiles, fileExtensions } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'includeFiles',
          message: '是否扫描单个文件（不仅仅是目录）？',
          default: false,
        },
        {
          type: 'input',
          name: 'fileExtensions',
          message: '请输入要扫描的文件扩展名（多个用逗号分隔，留空则扫描所有文件）:',
          default: '',
          when: (answers) => answers.includeFiles,
        },
      ]);

      const spinner = ora('正在扫描文件夹...').start();
      try {
        const extensions = fileExtensions
          ? fileExtensions.split(',').map((ext: string) => ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`)
          : undefined;
        
        resources = await scanDirectoryForBatchConfig(scanDirectory, {}, {
          includeFiles,
          fileExtensions: extensions,
        });
        spinner.succeed(`扫描完成，找到 ${resources.length} 个资源`);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        spinner.fail(`扫描失败: ${errorMessage}`);
        throw err;
      }
    }

    // 如果没有扫描到资源，提示手动添加
    if (resources.length === 0) {
      console.log(chalk.yellow('\n⚠️  未扫描到资源，将创建空的批量配置'));
      console.log(chalk.blue('💡 提示: 可以在配置文件中手动添加资源项\n'));
    }

    // 4. 获取资源类型
    const spinner = ora('正在获取资源类型列表...').start();
    let resourceType: ResourceTypeInfo | null = null;
    try {
      const allTypes = await listResourceTypesByGroup({ subjectType: [1] }); // 1 表示资源类型
      spinner.succeed('资源类型列表获取成功');
      
      resourceType = await searchResourceType(allTypes);
      if (!resourceType) {
        console.log(chalk.yellow('⚠️  未选择资源类型，将使用空值'));
      }
    } catch (err: unknown) {
      spinner.fail('获取资源类型列表失败');
      console.log(chalk.yellow('⚠️  将使用空值，稍后可以手动填写'));
    }

    // 5. 询问其他默认配置
    const { defaultVersion, defaultDescription } = await inquirer.prompt([
      {
        type: 'input',
        name: 'defaultVersion',
        message: '请输入默认版本号:',
        default: '1.0.0',
      },
      {
        type: 'input',
        name: 'defaultDescription',
        message: '请输入默认版本描述（可选）:',
        default: '',
      },
    ]);

    // 6. 创建批量配置
    const batchConfig: BatchResourceConfig = {
      defaults: {
        resourceType: resourceType ? [resourceType.name] : [],
        resourceTypeCode: resourceType?.code || '',
        version: defaultVersion,
        description: defaultDescription,
        filePath: './dist',
      },
      resources,
    };

    // 7. 保存配置文件
    const configPath = path.join(process.cwd(), 'freelog.batch-resources.config.js');
    
    // 检查文件是否已存在
    if (fs.existsSync(configPath)) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `配置文件已存在: ${configPath}，是否覆盖？`,
          default: false,
        },
      ]);
      
      if (!overwrite) {
        console.log(chalk.blue('ℹ️  操作已取消'));
        return;
      }
    }

    // 读取模板
    const templatePath = getTemplatePath('freelog.batch-resources.config', 'js');
    let template = await fs.readFile(templatePath, 'utf-8');
    
    // 替换配置数据（保留注释）
    const configJson = JSON.stringify(batchConfig, (key, value) => {
      // 跳过 undefined 值
      if (value === undefined) {
        return undefined;
      }
      return value;
    }, 2);
    template = template.replace(/const config = \{[\s\S]*?\};/, `const config = ${configJson};`);

    await fs.writeFile(configPath, template, 'utf-8');

    console.log(chalk.green('\n✔ ') + '批量配置文件创建成功');
    console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan(configPath)}`);
    
    if (resources.length > 0) {
      console.log(chalk.blue('ℹ️ ') + `已扫描到 ${chalk.cyan(resources.length)} 个资源`);
    }
    
    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli batch create ${chalk.gray('# 批量创建资源')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish ${chalk.gray('# 批量发布版本')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch add-to-collection ${chalk.gray('# 批量添加到合集')}\n`);

  } catch (err: unknown) {
    handleErrorAndExit(err, '初始化批量配置失败', options.debug);
  }
}

