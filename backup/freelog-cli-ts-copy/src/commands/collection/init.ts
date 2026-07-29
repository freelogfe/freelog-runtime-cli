/**
 * collection init 命令
 * 初始化合集配置文件
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { CommandOptions } from '../../types';
import { requireAuth } from '../../core/auth';
import { confirmAuth } from '../../utils/authConfirm';
import { listResourceTypesByGroup, type ResourceTypeInfo } from '../../api/resource';
import { getTemplatePath } from '../../utils/templatePath';
import { handleErrorAndExit } from '../../utils/errorHandler';

/**
 * 递归选择资源类型
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
    return null; // 返回上一级
  }

  if (selectedCode === '__root__') {
    return selectResourceTypeRecursive(rootTypes, allTypes, 1, '', rootTypes);
  }

  const selectedType = allTypes.find(t => t.code === selectedCode);
  if (!selectedType) {
    throw new Error('选择的资源类型不存在');
  }

  const currentPath = parentPath ? `${parentPath} > ${selectedType.name}` : selectedType.name;

  // 如果有子类型，继续选择
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
    // 如果返回了 null（用户选择返回），重新选择当前级别
    return selectResourceTypeRecursive(types, allTypes, level, parentPath, rootTypes);
  }

  // 没有子类型，返回选中的类型
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
 * 执行 collection init 命令
 */
export async function executeCollectionInit(
  name?: string,
  options: CommandOptions = {}
): Promise<void> {
  try {
    console.log(chalk.cyan('\n=== 初始化合集配置 ===\n'));

    // 1. 验证登录（需要获取资源类型列表）
    requireAuth();
    await confirmAuth(options.skipConfirm);

    // 2. 获取合集资源类型列表（subjectType 为 2）
    const spinner = ora('正在获取合集资源类型列表...').start();
    let resourceTypes: ResourceTypeInfo[];
    try {
      resourceTypes = await listResourceTypesByGroup({
        subjectType: [2], // 集合标的物
        status: 1, // 只查询启用的资源类型
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
    const resourceTypeName = selectedType.name;
    
    // 显示选择的资源类型路径
    const pathDisplay = typePath.map((t: ResourceTypeInfo) => t.name).join(' > ');
    console.log(chalk.green(`\n✔ 已选择资源类型: ${chalk.cyan(pathDisplay)}`));
    console.log(chalk.gray(`   类型代码: ${resourceTypeCode}`));

    // 4. 构建 resourceType 数组
    const resourceTypeArray: string[] = typePath.map((t: ResourceTypeInfo) => t.name);

    // 5. 获取项目名称
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

    // 6. 确定配置文件格式
    const hasTsFiles = fs.existsSync(path.join(process.cwd(), 'tsconfig.json'));
    const configFormat = hasTsFiles ? 'ts' : 'js';

    // 7. 创建配置文件
    const configSpinner = ora('正在创建配置文件...').start();
    try {
      const templatePath = getTemplatePath('freelog.collection.config', configFormat);
      const template = await fs.readFile(templatePath, 'utf-8');
      
      // 替换模板中的默认值
      let configContent = template
        .replace(/resourceName: ""/g, `resourceName: "${projectName}"`)
        .replace(/resourceType: \[\]/g, `resourceType: ${JSON.stringify(resourceTypeArray)}`)
        .replace(/resourceTypeCode: ""/g, `resourceTypeCode: "${resourceTypeCode}"`);

      const configPath = path.join(process.cwd(), `freelog.collection.config.${configFormat}`);
      await fs.writeFile(configPath, configContent, 'utf-8');
      
      configSpinner.succeed('配置文件创建成功');
    } catch (err: any) {
      configSpinner.fail('创建配置文件失败');
      throw err;
    }

    // 8. 显示结果
    console.log(chalk.green('\n✔ ') + '合集配置初始化完成');
    console.log(chalk.blue('ℹ️ ') + `配置文件: ${chalk.cyan(`freelog.collection.config.${configFormat}`)}`);
    console.log(chalk.blue('ℹ️ ') + `合集名称: ${chalk.cyan(projectName)}`);
    console.log(chalk.blue('ℹ️ ') + `资源类型: ${chalk.cyan(pathDisplay)}`);
    
    console.log(chalk.blue('\n💡 下一步:'));
    console.log(`  ${chalk.gray('$')} freelog-cli2 collection create              ${chalk.gray('# 创建合集资源')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli2 collection item add <resourceId>  ${chalk.gray('# 添加单品')}`);
    console.log(`  ${chalk.gray('$')} freelog-cli2 collection policy add            ${chalk.gray('# 添加策略')}\n`);

  } catch (err: any) {
    handleErrorAndExit(err, '初始化合集配置失败', options.debug);
  }
}

