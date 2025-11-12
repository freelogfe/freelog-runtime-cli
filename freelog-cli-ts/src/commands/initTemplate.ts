/**
 * 初始化模板项目（主题、插件、前端库）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { createResource } from '../api/create';
import { requireAuth } from '../core/auth';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { VersionConfig } from '../../public/freelog.version';
import { createConfigsFromTemplate } from '../services/configService';

// 资源类型常量
export const TYPE_THEME = 'theme';
export const TYPE_WIDGET = 'widget';
export const TYPE_PACKAGE = 'package';

// 资源类型映射
export const RESOURCE_TYPE_MAP: Record<string, string[]> = {
  [TYPE_THEME]: ['主题'],
  [TYPE_WIDGET]: ['插件'],
  [TYPE_PACKAGE]: ['前端库'],
};

/**
 * 格式化项目名称（移除特殊字符，转为小写）
 */
function formatName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
}

/**
 * 格式化类名（首字母大写，驼峰命名）
 */
function formatClassName(name: string): string {
  return name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * 获取项目名称
 */
async function getProjectName(initType: string): Promise<string> {
  const typeNameMap: Record<string, string> = {
    [TYPE_THEME]: '主题',
    [TYPE_WIDGET]: '插件',
    [TYPE_PACKAGE]: '前端库',
  };

  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: `请输入${typeNameMap[initType]}名称`,
      validate: (input: string) => (input.trim() ? true : '名称不能为空'),
    },
  ]);
  return name.trim();
}

/**
 * 获取项目版本号
 */
async function getProjectVersion(defaultVersion = '1.0.0'): Promise<string> {
  const { version } = await inquirer.prompt([
    {
      type: 'input',
      name: 'version',
      message: '请输入版本号',
      default: defaultVersion,
      validate: (input: string) =>
        /^\d+\.\d+\.\d+$/.test(input) ? true : '版本号格式应为 x.y.z',
    },
  ]);
  return version;
}

/**
 * 获取前端库命名空间
 */
async function getPackageNameSpace(): Promise<string> {
  const { nameSpace } = await inquirer.prompt([
    {
      type: 'input',
      name: 'nameSpace',
      message: '请输入库的 nameSpace',
      validate: (input: string) => (input.trim() ? true : 'nameSpace 不能为空'),
    },
  ]);

  let formattedNameSpace = nameSpace.trim();
  if (!formattedNameSpace.startsWith('freelogLibrary.')) {
    formattedNameSpace = 'freelogLibrary.' + formattedNameSpace;
  }

  return formattedNameSpace;
}

/**
 * 创建 Freelog 资源
 */
async function createFreelogResource(
  resourceName: string,
  resourceTypes: string[]
): Promise<string> {
  const spinner = ora('正在创建 Freelog 资源...').start();

  try {
    const result = await createResource({
      resourceName,
      resourceType: resourceTypes,
    });

    spinner.succeed(`Freelog 资源创建成功: ${result.resourceId}`);
    return result.resourceId;
  } catch (err: any) {
    spinner.fail('Freelog 资源创建失败');
    throw err;
  }
}

/**
 * 生成 README.md
 */
async function generateReadme(
  projectName: string,
  resourceId: string,
  version: string,
  initType: string,
  configFormat: string,
  nameSpace?: string
): Promise<void> {
  const typeDescMap: Record<string, string> = {
    [TYPE_THEME]: '一个 Freelog 主题',
    [TYPE_WIDGET]: '一个 Freelog 插件',
    [TYPE_PACKAGE]: '一个 Freelog 前端库',
  };

  const readme = `# ${projectName}

${typeDescMap[initType]}

## 项目信息

- 资源 ID: \`${resourceId}\`
- 资源名称: \`${projectName}\`
- 版本号: \`${version}\`
${nameSpace ? `- 命名空间: \`${nameSpace}\`` : ''}

## 配置文件

项目使用两个配置文件：

- \`freelog.resource.config.${configFormat}\` - 资源信息（资源 ID、类型、介绍等）
- \`freelog.version.config.${configFormat}\` - 版本信息（版本号、依赖、文件等）

## 开发

\`\`\`bash
# 安装依赖
npm install

# 开发
npm run dev

# 构建
npm run build
\`\`\`

## Freelog CLI 命令

### 依赖管理
\`\`\`bash
# 添加依赖
freelog-cli dep add <resourceId>

# 查看依赖列表
freelog-cli dep list

# 同步依赖版本
freelog-cli dep sync
\`\`\`

### 发布
\`\`\`bash
# 发布正式版本
freelog-cli publish

# 发布草稿
freelog-cli publish --draft
\`\`\`

### 资源管理
\`\`\`bash
# 更新资源信息
freelog-cli update --intro "新的介绍"

# 同步资源和版本信息
freelog-cli sync
\`\`\`
`;

  await fs.writeFile('README.md', readme);
}

/**
 * 执行模板初始化（主题、插件、前端库）
 */
export async function executeInitTemplate(initType: string): Promise<void> {
  console.log(chalk.blue(`\nℹ 初始化类型: ${initType}\n`));

  // 确保已登录（需要调用 API 创建资源）
  requireAuth();

  // 获取项目名称和版本
  let projectName = '';
  while (!projectName) {
    projectName = await getProjectName(initType);
  }
  projectName = formatName(projectName);
  const className = formatClassName(projectName);

  const version = await getProjectVersion();

  // 前端库需要命名空间
  let nameSpace: string | undefined;
  if (initType === TYPE_PACKAGE) {
    nameSpace = await getPackageNameSpace();
  }

  // 创建 Freelog 资源
  const resourceTypeArray = RESOURCE_TYPE_MAP[initType];
  const resourceId = await createFreelogResource(projectName, resourceTypeArray);

  // TODO: 这里应该下载对应的模板（主题/插件/前端库）
  // 类似 index.js 中的 downloadTemplate 和 installTemplate
  // 目前简化处理：创建基本目录结构和配置文件
  console.log(
    chalk.yellow(
      '\n⚠️  注意: 模板下载功能尚未实现，仅创建基本配置文件\n'
    )
  );

  const targetPath = process.cwd();
  await fs.ensureDir(path.join(targetPath, 'src'));
  await fs.ensureDir(path.join(targetPath, 'dist'));

  // 判断配置文件格式
  const configFormat = projectName.toLowerCase().includes('ts') ? 'ts' : 'js';

  // 准备资源配置数据
  const resourceData: Partial<ResourceConfig> = {
    resourceId,
    resourceName: projectName,
    resourceType: resourceTypeArray,
    intro: '',
    coverImages: [],
  };

  // 准备版本配置数据
  const versionData: Partial<VersionConfig> = {
    version,
    fileSha1: '',
    filename: '',
    description: '',
    resourceType: resourceTypeArray[0], // 用于判断上传方式
    buildPath: 'dist',
    dependencies: [],
    customPropertyDescriptors: [],
    baseUpcastResources: [],
  };

  // 创建两个配置文件
  const spinner = ora('正在创建配置文件...').start();
  try {
    await createConfigsFromTemplate(targetPath, configFormat, resourceData, versionData);
    spinner.succeed('配置文件创建成功');
  } catch (err: any) {
    spinner.fail('配置文件创建失败');
    throw err;
  }

  // 创建 README.md
  await generateReadme(projectName, resourceId, version, initType, configFormat, nameSpace);

  console.log(chalk.green('\n✔ ') + `项目初始化成功`);
  console.log(chalk.blue('ℹ ') + `资源配置: ${chalk.cyan(`freelog.resource.config.${configFormat}`)}`);
  console.log(chalk.blue('ℹ ') + `版本配置: ${chalk.cyan(`freelog.version.config.${configFormat}`)}`);
  console.log(chalk.blue('ℹ ') + `资源 ID: ${chalk.cyan(resourceId)}`);
  console.log(chalk.blue('\nℹ ') + '下一步:');
  console.log(
    `  ${chalk.gray('$')} freelog-cli dep add <resourceId>  ${chalk.gray('# 添加依赖')}`
  );
  console.log(
    `  ${chalk.gray('$')} freelog-cli publish              ${chalk.gray('# 发布')}\n`
  );
}
