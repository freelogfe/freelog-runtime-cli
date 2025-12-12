/**
 * 初始化命令 - 主入口
 * 根据类型选择路由到不同的初始化逻辑
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { CommandOptions } from '../types';
import { executeInitTemplate, TYPE_THEME, TYPE_WIDGET, TYPE_PACKAGE } from './initTemplate';
import { executeInitResource } from './initResource';
import { handleErrorAndExit } from '../utils/errorHandler';
import { requireAuth } from '../core/auth';
import { confirmAuth } from '../utils/authConfirm';
import { listResourceTypesByGroup, type ResourceTypeInfo } from '../api/resource';
import { getTemplatePath } from '../utils/templatePath';
import { scanDirectoryForBatchConfig } from '../services/batchResourceService';

// 资源类型常量
const TYPE_RESOURCE = 'resource';
const TYPE_COLLECTION = 'collection';

/**
 * 获取初始化类型
 */
async function getInitType(): Promise<string> {
  const { type } = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: '请选择初始化类型',
      choices: [
        { name: '主题', value: TYPE_THEME },
        { name: '插件', value: TYPE_WIDGET },
        { name: '前端库', value: TYPE_PACKAGE },
        { name: '其余资源', value: TYPE_RESOURCE },
        { name: '合集（含批量管理单品资源）', value: TYPE_COLLECTION },
      ],
      default: TYPE_THEME,
    },
  ]);
  return type;
}

/**
 * 验证项目名称（只能包含英文、数字、下划线、横杠）
 */
function validateProjectName(name: string): boolean {
  // 只允许：英文字母、数字、下划线、横杠
  const pattern = /^[a-zA-Z0-9_-]+$/;
  return pattern.test(name);
}

/**
 * 获取项目名称（带验证）
 */
async function getProjectNameForTemplate(defaultName?: string): Promise<string> {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '请输入项目名称',
      default: defaultName || 'my-freelog-project',
      validate: (input: string) => {
        const trimmed = input.trim();
        if (!trimmed) {
          return '项目名称不能为空';
        }
        if (!validateProjectName(trimmed)) {
          return '项目名称只能包含英文字母、数字、下划线和横杠';
        }
        return true;
      },
    },
  ]);
  return name.trim();
}

/**
 * 检查并创建项目目录
 */
async function prepareProjectDirectory(projectName: string, options: CommandOptions): Promise<string> {
  const currentDir = process.cwd();
  const targetPath = path.join(currentDir, projectName);

  // 检查目录是否已存在
  if (fs.existsSync(targetPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: `目录 ${projectName} 已存在，是否覆盖?`,
        default: false,
      },
    ]);

    if (!overwrite) {
      throw new Error('操作已取消');
    }

    // 如果指定了 force 选项，直接清空
    if (options.force) {
      fs.removeSync(targetPath);
    } else {
      // 否则询问是否清空
      const { confirmEmpty } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmEmpty',
          message: `是否确认清空目录 ${projectName}?`,
          default: false,
        },
      ]);

      if (confirmEmpty) {
        fs.removeSync(targetPath);
      } else {
        throw new Error('操作已取消');
      }
    }
  }

  // 创建目录
  fs.ensureDirSync(targetPath);
  return targetPath;
}

/**
 * 获取项目名称（用于其他资源类型）
 */
async function getProjectName(defaultName?: string): Promise<string> {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '请输入项目名称',
      default: defaultName || 'my-freelog-project',
      validate: (input: string) => (input.trim() ? true : '项目名称不能为空'),
    },
  ]);
  return name.trim();
}

/**
 * 递归选择资源类型（用于合集）
 */
async function selectResourceTypeRecursive(
  types: ResourceTypeInfo[],
  allTypes: ResourceTypeInfo[],
  level: number,
  parentPath: string,
  rootTypes: ResourceTypeInfo[]
): Promise<{ selectedType: ResourceTypeInfo; typePath: ResourceTypeInfo[] } | null> {
  const choices = types.map(type => ({
    name: type.name,
    value: type.code,
    short: type.name,
  }));

  choices.push({
    name: '← 返回上一级',
    value: '__back__',
    short: '返回',
  });

  if (level > 1) {
    choices.push({
      name: '← 返回根目录',
      value: '__root__',
      short: '根目录',
    });
  }

  const { selectedCode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedCode',
      message: level === 1 ? '请选择合集资源类型:' : `请选择子类型 (${parentPath}):`,
      choices,
    },
  ]);

  if (selectedCode === '__back__') {
    return null;
  }

  if (selectedCode === '__root__') {
    return selectResourceTypeRecursive(rootTypes, allTypes, 1, '', rootTypes);
  }

  const selectedType = allTypes.find(t => t.code === selectedCode);
  if (!selectedType) {
    throw new Error('选择的资源类型不存在');
  }

  const currentPath = parentPath ? `${parentPath} > ${selectedType.name}` : selectedType.name;

  if (selectedType.children && selectedType.children.length > 0) {
    const result = await selectResourceTypeRecursive(
      selectedType.children,
      allTypes,
      level + 1,
      currentPath,
      rootTypes
    );
    if (result) {
      return result;
    }
    return selectResourceTypeRecursive(types, allTypes, level, parentPath, rootTypes);
  }

  const typePath: ResourceTypeInfo[] = [];
  let current: ResourceTypeInfo | undefined = selectedType;
  while (current) {
    typePath.unshift(current);
    if (current.parentCode && current.parentCode !== '') {
      current = allTypes.find(t => t.code === current!.parentCode);
    } else {
      current = undefined;
    }
  }

  return { selectedType, typePath };
}

/**
 * 扁平化资源类型树
 */
function flattenResourceTypes(types: ResourceTypeInfo[]): ResourceTypeInfo[] {
  const result: ResourceTypeInfo[] = [];
  for (const type of types) {
    result.push(type);
    if (type.children && type.children.length > 0) {
      result.push(...flattenResourceTypes(type.children));
    }
  }
  return result;
}

/**
 * 初始化合集（包含批量管理功能）
 */
async function executeInitCollection(
  name?: string,
  options: CommandOptions = {}
): Promise<void> {
  const ora = require('ora');
  
  // 1. 验证登录
  requireAuth();
  await confirmAuth(options.skipConfirm);

  // 2. 获取合集资源类型列表（subjectType 为 2）
  const spinner = ora('正在获取合集资源类型列表...').start();
  let resourceTypes: ResourceTypeInfo[];
  try {
    resourceTypes = await listResourceTypesByGroup({
      subjectType: [2], // 集合标的物
      status: 1,
    });
    spinner.succeed('合集资源类型列表获取成功');
  } catch (err: any) {
    spinner.fail('获取合集资源类型列表失败');
    throw err;
  }

  if (!resourceTypes || resourceTypes.length === 0) {
    throw new Error('未找到可用的合集资源类型');
  }

  // 3. 递归选择资源类型
  const allResourceTypes = flattenResourceTypes(resourceTypes);
  const selectionResult = await selectResourceTypeRecursive(resourceTypes, allResourceTypes, 1, '', resourceTypes);
  
  if (!selectionResult) {
    throw new Error('未选择资源类型，初始化已取消');
  }

  const { selectedType, typePath } = selectionResult;
  const resourceTypeCode = selectedType.code;
  const resourceTypeArray: string[] = typePath.map((t: ResourceTypeInfo) => t.name);
  
  const pathDisplay = typePath.map((t: ResourceTypeInfo) => t.name).join(' > ');
  console.log(chalk.green(`\n✔ 已选择资源类型: ${chalk.cyan(pathDisplay)}`));
  console.log(chalk.gray(`   类型代码: ${resourceTypeCode}`));

  // 4. 获取合集名称
  let projectName = name;
  if (!projectName) {
    const { inputName } = await inquirer.prompt([
      {
        type: 'input',
        name: 'inputName',
        message: '请输入合集名称:',
        default: 'my-collection',
        validate: (input: string) => {
          if (!input.trim()) {
            return '合集名称不能为空';
          }
          return true;
        },
      },
    ]);
    projectName = inputName.trim();
  }

  // 5. 确定配置文件格式
  const hasTsFiles = fs.existsSync(path.join(process.cwd(), 'tsconfig.json'));
  const configFormat = hasTsFiles ? 'ts' : 'js';

  // 6. 创建合集配置文件
  const collectionSpinner = ora('正在创建合集配置文件...').start();
  try {
    const collectionTemplatePath = getTemplatePath('freelog.collection.config', configFormat);
    let collectionTemplate = await fs.readFile(collectionTemplatePath, 'utf-8');
    
    collectionTemplate = collectionTemplate
      .replace(/resourceName: ""/g, `resourceName: "${projectName}"`)
      .replace(/resourceType: \[\]/g, `resourceType: ${JSON.stringify(resourceTypeArray)}`)
      .replace(/resourceTypeCode: ""/g, `resourceTypeCode: "${resourceTypeCode}"`);

    const collectionConfigPath = path.join(process.cwd(), `freelog.collection.config.${configFormat}`);
    await fs.writeFile(collectionConfigPath, collectionTemplate, 'utf-8');
    
    collectionSpinner.succeed('合集配置文件创建成功');
  } catch (err: any) {
    collectionSpinner.fail('创建合集配置文件失败');
    throw err;
  }

  // 7. 询问是否初始化批量资源配置
  const { initBatchConfig } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'initBatchConfig',
      message: '是否初始化批量资源配置（用于管理合集的单品资源）？',
      default: true,
    },
  ]);

  if (initBatchConfig) {
    // 8. 询问是否扫描文件夹
    const { shouldScan } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldScan',
        message: '是否扫描文件夹自动生成资源列表？',
        default: true,
      },
    ]);

    let resources: any[] = [];
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
          default: '.md',
          when: (answers) => answers.includeFiles,
        },
      ]);

      const scanSpinner = ora('正在扫描文件夹...').start();
      try {
        const extensions = fileExtensions
          ? fileExtensions.split(',').map((ext: string) => ext.trim().startsWith('.') ? ext.trim() : `.${ext.trim()}`)
          : undefined;
        
        resources = await scanDirectoryForBatchConfig(dirPath.trim(), {}, {
          includeFiles,
          fileExtensions: extensions,
        });
        scanSpinner.succeed(`扫描完成，找到 ${resources.length} 个资源`);
      } catch (err: any) {
        scanSpinner.fail(`扫描失败: ${err.message}`);
        console.log(chalk.yellow('⚠️  将创建空的批量配置'));
      }
    }

    // 9. 获取单品资源类型（subjectType 为 1）
    const itemTypeSpinner = ora('正在获取单品资源类型列表...').start();
    let itemResourceTypes: ResourceTypeInfo[] = [];
    try {
      itemResourceTypes = await listResourceTypesByGroup({
        subjectType: [1], // 资源标的物
        status: 1,
      });
      itemTypeSpinner.succeed('单品资源类型列表获取成功');
    } catch (err: any) {
      itemTypeSpinner.fail('获取单品资源类型列表失败');
      console.log(chalk.yellow('⚠️  将使用空值，稍后可以手动填写'));
    }

    // 10. 选择单品资源类型
    let selectedItemType: ResourceTypeInfo | null = null;
    if (itemResourceTypes.length > 0) {
      const flattenedItemTypes = flattenResourceTypes(itemResourceTypes);
      const itemSelectionResult = await selectResourceTypeRecursive(
        itemResourceTypes,
        flattenedItemTypes,
        1,
        '',
        itemResourceTypes
      );
      if (itemSelectionResult) {
        selectedItemType = itemSelectionResult.selectedType;
        const itemPathDisplay = itemSelectionResult.typePath.map((t: ResourceTypeInfo) => t.name).join(' > ');
        console.log(chalk.green(`✔ 已选择单品资源类型: ${chalk.cyan(itemPathDisplay)}`));
      }
    }

    // 11. 询问其他默认配置
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

    // 12. 创建批量配置文件
    const batchSpinner = ora('正在创建批量配置文件...').start();
    try {
      const batchConfig = {
        defaults: {
          resourceType: selectedItemType ? [selectedItemType.name] : [],
          resourceTypeCode: selectedItemType?.code || '',
          version: defaultVersion,
          description: defaultDescription,
          filePath: './dist',
        },
        resources,
      };

      const batchTemplatePath = getTemplatePath('freelog.batch-resources.config', configFormat);
      let batchTemplate = await fs.readFile(batchTemplatePath, 'utf-8');
      
      const configJson = JSON.stringify(batchConfig, (key, value) => {
        if (value === undefined) {
          return undefined;
        }
        return value;
      }, 2);
      batchTemplate = batchTemplate.replace(/const config = \{[\s\S]*?\};/, `const config = ${configJson};`);

      const batchConfigPath = path.join(process.cwd(), `freelog.batch-resources.config.${configFormat}`);
      await fs.writeFile(batchConfigPath, batchTemplate, 'utf-8');
      
      batchSpinner.succeed('批量配置文件创建成功');
    } catch (err: any) {
      batchSpinner.fail('创建批量配置文件失败');
      throw err;
    }
  }

  // 13. 显示结果
  console.log(chalk.green('\n✔ ') + '合集初始化完成');
  console.log(chalk.blue('ℹ️ ') + `合集配置文件: ${chalk.cyan(`freelog.collection.config.${configFormat}`)}`);
  if (initBatchConfig) {
    console.log(chalk.blue('ℹ️ ') + `批量配置文件: ${chalk.cyan(`freelog.batch-resources.config.${configFormat}`)}`);
  }
  console.log(chalk.blue('ℹ️ ') + `合集名称: ${chalk.cyan(projectName)}`);
  console.log(chalk.blue('ℹ️ ') + `资源类型: ${chalk.cyan(pathDisplay)}`);
  
  console.log(chalk.blue('\n💡 下一步:'));
  console.log(`  ${chalk.gray('$')} freelog-cli collection create              ${chalk.gray('# 创建合集资源')}`);
  if (initBatchConfig) {
    console.log(`  ${chalk.gray('$')} freelog-cli batch create                  ${chalk.gray('# 批量创建单品资源')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch publish                 ${chalk.gray('# 批量发布单品版本')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli batch add-to-collection         ${chalk.gray('# 批量添加到合集')}`);
  } else {
    console.log(`  ${chalk.gray('$')} freelog-cli collection item add <resourceId>  ${chalk.gray('# 添加单品')}`);
  }
  console.log(`  ${chalk.gray('$')} freelog-cli collection policy add            ${chalk.gray('# 添加策略')}\n`);
}

/**
 * 执行初始化命令
 */
export async function executeInit(
  name?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 初始化 Freelog 项目 ===\n'));

    // 获取初始化类型
    const initType = await getInitType();

    // 根据类型路由到不同的初始化逻辑
    if (initType === TYPE_RESOURCE) {
      // 其余资源类型：简单初始化，创建 JSON 配置
      // 在当前目录创建配置文件，不需要项目名称，直接询问资源名称
      await executeInitResource();
    } else if (initType === TYPE_COLLECTION) {
      // 合集类型：创建合集配置和批量资源配置
      await executeInitCollection(name, options);
    } else {
      // 主题/插件/前端库：模板初始化
      // 1. 获取项目名称（带验证）
      const projectName = name || await getProjectNameForTemplate(name);
      
      // 2. 创建项目目录
      const targetPath = await prepareProjectDirectory(projectName, options);
      
      // 3. 切换到目标目录并初始化模板
      const originalCwd = process.cwd();
      process.chdir(targetPath);
      
      try {
        await executeInitTemplate(initType, projectName);
        console.log(chalk.green(`\n✔ 项目已创建在: ${chalk.cyan(targetPath)}`));
      } finally {
        // 恢复原始工作目录
        process.chdir(originalCwd);
      }
    }

  } catch (err: any) {
    handleErrorAndExit(err, '初始化失败', options.debug);
  }
}
