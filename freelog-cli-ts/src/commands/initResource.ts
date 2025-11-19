/**
 * 初始化其余资源（非模板类型）
 * 仅创建本地配置文件，不调用 API
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import ora from 'ora';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { VersionConfig } from '../../public/freelog.version';
import { createConfigsFromTemplate } from '../services/configService';
import { listResourceTypesByGroup, type ResourceTypeInfo } from '../api/resource';
import { requireAuth } from '../core/auth';
import { confirmAuth } from '../utils/authConfirm';

/**
 * 格式化项目名称（移除特殊字符，转为小写）
 */
function formatName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

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
 * 在类型树中查找指定类型的完整路径（包括所有父祖类型）
 */
function findTypePath(
  targetType: ResourceTypeInfo,
  types: ResourceTypeInfo[],
  currentPath: ResourceTypeInfo[] = []
): ResourceTypeInfo[] | null {
  for (const type of types) {
    const newPath = [...currentPath, type];
    
    // 如果找到目标类型，返回路径
    if (type.code === targetType.code) {
      return newPath;
    }
    
    // 如果有子类型，递归查找
    if (type.children && type.children.length > 0) {
      const foundPath = findTypePath(targetType, type.children, newPath);
      if (foundPath) {
        return foundPath;
      }
    }
  }
  
  return null;
}

/**
 * 递归选择资源类型
 * 从一级开始选择，如果有子类型就继续选择，直到没有 children
 * @returns 返回选中的类型和完整路径（包括所有父祖类型）
 */
async function selectResourceTypeRecursive(
  types: ResourceTypeInfo[],
  allTypes: ResourceTypeInfo[], // 所有资源类型，用于搜索
  level: number = 1,
  parentPath: string = '',
  rootTypes: ResourceTypeInfo[] = types // 根类型列表，用于查找完整路径
): Promise<{ selectedType: ResourceTypeInfo; typePath: ResourceTypeInfo[] } | null> {
  if (!types || types.length === 0) {
    return null;
  }

  // 构建选择列表
  const choices: Array<{ name: string; value: ResourceTypeInfo | 'search' | 'back' }> = types.map((type) => ({
    name: `${type.name} ${chalk.gray(`(${type.code})`)}${type.children && type.children.length > 0 ? chalk.gray(' →') : ''}`,
    value: type,
  }));

  // 如果有父级路径，添加返回选项
  if (parentPath) {
    choices.unshift({
      name: chalk.gray(`← 返回上一级`),
      value: 'back' as const,
    });
  }

  // 添加搜索选项
  choices.push({
    name: chalk.blue('🔍 搜索资源类型'),
    value: 'search' as const,
  });

  const { selectedType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedType',
      message: parentPath 
        ? `选择资源类型 (${parentPath})` 
        : level === 1 
          ? '请选择资源类型（一级）' 
          : `请选择资源类型（第${level}级）`,
      choices,
      pageSize: 15,
    },
  ]);

  // 如果选择了返回，返回 null
  if (selectedType === 'back') {
    return null;
  }

  // 如果选择了搜索
  if (selectedType === 'search') {
    const searchedType = await searchResourceType(allTypes);
    if (searchedType) {
      // 查找搜索到的类型的完整路径
      const typePath = findTypePath(searchedType, rootTypes);
      if (typePath) {
        return { selectedType: searchedType, typePath };
      }
      // 如果找不到路径，只返回类型本身
      return { selectedType: searchedType, typePath: [searchedType] };
    }
    // 如果搜索取消，重新选择
    return await selectResourceTypeRecursive(types, allTypes, level, parentPath, rootTypes);
  }

  // 如果选中的类型有子类型，继续递归选择
  if (selectedType.children && selectedType.children.length > 0) {
    const currentPath = parentPath 
      ? `${parentPath} > ${selectedType.name}` 
      : selectedType.name;
    
    const childResult = await selectResourceTypeRecursive(
      selectedType.children,
      allTypes,
      level + 1,
      currentPath,
      rootTypes
    );

    // 如果子级选择了返回，重新选择当前级
    if (childResult === null && level > 1) {
      return await selectResourceTypeRecursive(types, allTypes, level, parentPath, rootTypes);
    }

    // 返回子级选择的结果（如果子级有选择）
    if (childResult) {
      return childResult;
    }
    
    // 如果子级没有选择，返回当前类型及其路径
    const typePath = findTypePath(selectedType, rootTypes);
    return { 
      selectedType, 
      typePath: typePath || [selectedType] 
    };
  }

  // 没有子类型，返回当前选中的类型及其完整路径
  const typePath = findTypePath(selectedType, rootTypes);
  return { 
    selectedType, 
    typePath: typePath || [selectedType] 
  };
}

/**
 * 生成 README.md
 */
async function generateReadme(projectName: string, resourceName?: string): Promise<void> {
  const readme = `# ${projectName}

一个 Freelog 资源项目

## 项目信息

- 资源名称: ${resourceName ? `\`${resourceName}\`` : '待填写'}
- 版本号: \`1.0.0\`

## 配置文件

项目使用两个配置文件：

- \`freelog.resource.config.js\` - 资源信息（资源 ID、类型、介绍等）
- \`freelog.version.config.js\` - 版本信息（版本号、依赖、文件等）

### 配置文件说明

#### freelog.resource.config.js
- \`resourceId\` - 资源 ID（创建资源后获得）
- \`resourceName\` - 资源名称
- \`resourceType\` - 资源类型（数组）
- \`intro\` - 资源介绍
- \`coverImages\` - 封面图 URL 列表

#### freelog.version.config.js
- \`version\` - 版本号
- \`fileSha1\` - 文件 SHA1 值
- \`filename\` - 文件名
- \`description\` - 版本描述
- \`dependencies\` - 依赖列表
- \`baseUpcastResources\` - 上抛资源列表

## Freelog CLI 命令

### 创建资源
\`\`\`bash
# 在 Freelog 平台创建资源
freelog-cli create
\`\`\`

### 发布版本
\`\`\`bash
# 发布正式版本
freelog-cli publish
\`\`\`

### 同步信息
\`\`\`bash
# 同步资源和版本信息
freelog-cli sync
\`\`\`

### 更新资源
\`\`\`bash
# 更新资源介绍
freelog-cli update --intro "新的介绍"
\`\`\`
`;

  await fs.writeFile('README.md', readme);
}

/**
 * 执行其余资源初始化
 */
export async function executeInitResource(): Promise<void> {
  console.log(chalk.blue('ℹ️  其他资源类型，创建本地配置文件\n'));

  // 获取资源名称（必填）
  const { resourceName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'resourceName',
      message: '请输入资源名称',
      validate: (input: string) => {
        if (!input.trim()) {
          return '资源名称不能为空';
        }
        return true;
      },
    },
  ]);

  // 格式化资源名称作为项目名称（用于 README 等）
  const projectName = formatName(resourceName);

  // 获取资源类型（通过 API 选择）
  let selectedResourceType: ResourceTypeInfo | null = null;
  let resourceTypeCode = '';
  let resourceTypeName = '';
  let resourceTypeArray: string[] = [];

  try {
    // 需要登录才能获取资源类型列表
    requireAuth();
    await confirmAuth();

    // 获取资源类型列表
    const spinner = ora('正在获取资源类型列表...').start();
    let resourceTypes: ResourceTypeInfo[];
    try {
      resourceTypes = await listResourceTypesByGroup({
        status: 1, // 只查询启用的资源类型
      });
      spinner.succeed('资源类型列表获取成功');
    } catch (err: any) {
      spinner.fail('获取资源类型列表失败');
      throw err;
    }

    if (!resourceTypes || resourceTypes.length === 0) {
      throw new Error('未找到可用的资源类型');
    }

    // 递归选择资源类型（必须选择，不支持手动输入）
    // 扁平化所有资源类型用于搜索
    const allResourceTypes = flattenResourceTypes(resourceTypes);
    const selectionResult = await selectResourceTypeRecursive(resourceTypes, allResourceTypes, 1, '', resourceTypes);
    
    if (!selectionResult) {
      throw new Error('未选择资源类型，初始化已取消');
    }

    const { selectedType, typePath } = selectionResult;
    selectedResourceType = selectedType;
    resourceTypeCode = selectedResourceType.code;
    resourceTypeName = selectedResourceType.name;
    
    // 显示选择的资源类型路径
    const pathDisplay = typePath.map((t: ResourceTypeInfo) => t.name).join(' > ');
    console.log(chalk.green(`\n✔ 已选择资源类型: ${chalk.cyan(pathDisplay)}`));
    console.log(chalk.gray(`   类型代码: ${resourceTypeCode}`));
    
    // 构建 resourceType 数组：
    // 1. 最后选择的类型放在第一位
    // 2. 前面的父祖类型也放到数组里面
    // 例如：如果选择路径是 A > B > C，则 resourceType = ['C', 'A', 'B']
    if (typePath && typePath.length > 0) {
      // 最后选择的类型（最后一项）放在第一位
      const lastType = typePath[typePath.length - 1];
      resourceTypeArray = [lastType.name];
      
      // 前面的父祖类型也添加到数组中
      for (let i = 0; i < typePath.length - 1; i++) {
        resourceTypeArray.push(typePath[i].name);
      }
    } else {
      // 如果没有路径信息，只使用选中的类型
      resourceTypeArray = [selectedResourceType.name];
    }
  } catch (err: any) {
    // 如果获取资源类型失败，抛出错误（不再支持手动输入）
    console.log(chalk.red('\n✖ 无法获取资源类型列表'));
    console.log(chalk.yellow('   提示: 请先登录 (freelog-cli login) 后再重试\n'));
    throw err;
  }

  // 确保已选择资源类型
  if (!selectedResourceType || resourceTypeArray.length === 0) {
    throw new Error('未选择资源类型，初始化已取消');
  }

  // 准备资源配置数据
  const resourceData: Partial<ResourceConfig> = {
    resourceId: '',
    resourceName: resourceName || '',
    resourceType: resourceTypeArray,
    resourceTypeCode: resourceTypeCode || '',
    intro: '',
    coverImages: [],
  };

  // 准备版本配置数据
  const versionData: Partial<VersionConfig> = {
    // ========== ResourceVersionDetailResponse 字段（基础字段） ==========
    resourceId: '',
    resourceType: resourceTypeArray.length > 0 ? resourceTypeArray[0] : '',
    resourceName: resourceName || '',
    userId: 0, // 初始化时设为 0，后续通过 syncv 或 publish 更新
    description: '',
    version: '1.0.0',
    versionId: '',
    fileSha1: '',
    dependencies: [],
    upcastResources: [],
    resolveResources: [],
    systemProperty: {},
    customProperty: {},
    customPropertyDescriptors: [],
    catalogueProperty: {},
    createDate: '',
    
    // ========== publish 需要的额外字段 ==========
    filename: '',
    baseUpcastResources: [],
    batchSignContracts: [],
    inputAttrs: [],
    authExcludedItems: [],
    
    // ========== 本地字段 ==========
    filePath: 'dist',
  };

  // 创建两个 JS 配置文件
  const targetPath = process.cwd();
  try {
    await createConfigsFromTemplate(targetPath, 'js', resourceData, versionData);
  } catch (err: any) {
    throw new Error(`创建配置文件失败: ${err.message}`);
  }

  // 创建 README.md
  await generateReadme(projectName, resourceName);

  console.log(chalk.green('\n✔ ') + `配置文件创建成功`);
  console.log(
    chalk.blue('ℹ ') + `资源配置: ${chalk.cyan('freelog.resource.config.js')}`
  );
  console.log(
    chalk.blue('ℹ ') + `版本配置: ${chalk.cyan('freelog.version.config.js')}`
  );
  
  if (!resourceName || resourceTypeArray.length === 0) {
    console.log(
      chalk.yellow('\n💡 提示: 请在配置文件中填写完整的资源信息（resourceName、resourceType 等）')
    );
  }
  
  console.log(chalk.blue('\nℹ ') + '下一步:');
  console.log(
    `  ${chalk.gray('1.')} 在配置文件中填写资源信息`
  );
  console.log(
    `  ${chalk.gray('2.')} 执行 freelog-cli create 创建资源`
  );
  console.log(
    `  ${chalk.gray('3.')} 执行 freelog-cli publish 发布版本\n`
  );
}
