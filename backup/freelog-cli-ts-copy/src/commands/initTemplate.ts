/**
 * 初始化模板项目（主题、插件、前端库）
 */

import inquirer from 'inquirer';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { VersionConfig } from '../../public/freelog.version';
import { createConfigsFromTemplate } from '../services/configService';
import { getProjectTemplate, downloadTemplate, installTemplate, type TemplateInfo } from '../utils/template';

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
 * 获取包管理工具
 */
async function getPackageManager(): Promise<'pnpm' | 'npm' | 'yarn'> {
  const { packageManager } = await inquirer.prompt([
    {
      type: 'list',
      name: 'packageManager',
      message: '请选择包管理工具',
      choices: [
        { name: 'pnpm', value: 'pnpm' },
        { name: 'npm', value: 'npm' },
        { name: 'yarn', value: 'yarn' },
      ],
      default: 'pnpm',
    },
  ]);
  return packageManager;
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

${resourceId ? `- 资源 ID: \`${resourceId}\`` : '- 资源 ID: 未创建（使用 `freelog-cli2 create` 创建）'}
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
 * @param initType 初始化类型（theme/widget/package）
 * @param projectName 项目名称（已验证，只包含英文、数字、下划线、横杠）
 */
export async function executeInitTemplate(initType: string, projectName: string): Promise<void> {
  console.log(chalk.blue(`\nℹ 初始化类型: ${initType}\n`));
  console.log(chalk.blue(`ℹ 项目名称: ${projectName}\n`));

  // init 命令不需要登录，只创建本地配置文件
  // 如果需要创建 Freelog 资源，可以使用 create 命令

  // 格式化项目名称（确保小写，移除特殊字符）
  const formattedName = formatName(projectName);
  const className = formatClassName(formattedName);

  const version = await getProjectVersion();

  // 前端库需要命名空间
  let nameSpace: string | undefined;
  if (initType === TYPE_PACKAGE) {
    nameSpace = await getPackageNameSpace();
  }

  // init 命令只创建本地配置文件，不调用 API 创建资源
  // 用户可以使用 create 命令创建 Freelog 资源
  const resourceTypeArray = RESOURCE_TYPE_MAP[initType];
  const resourceId = ''; // 留空，稍后使用 create 命令创建资源

  // 1. 获取模板列表
  const templateList = getProjectTemplate();
  const filteredTemplates = templateList.filter(t => t.tag.includes(initType));
  
  if (filteredTemplates.length === 0) {
    throw new Error(`未找到 ${initType} 类型的模板`);
  }

  // 2. 让用户选择模板
  const { selectedTemplateName } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedTemplateName',
      message: '请选择模板',
      choices: filteredTemplates.map(t => ({
        name: t.name,
        value: t.npmName,
      })),
    },
  ]);

  const selectedTemplate = filteredTemplates.find(t => t.npmName === selectedTemplateName);
  if (!selectedTemplate) {
    throw new Error('选择的模板不存在');
  }

  // 3. 让用户选择包管理工具
  const packageManager = await getPackageManager();

  // 4. 下载模板
  const downloadSpinner = ora('正在下载模板...').start();
  let templatePath: string;
  try {
    templatePath = await downloadTemplate(selectedTemplate, (msg) => {
      downloadSpinner.text = msg;
    });
    downloadSpinner.succeed('模板下载成功');
  } catch (err: any) {
    downloadSpinner.fail('模板下载失败');
    throw err;
  }

  const targetPath = process.cwd();
  
  // 5. 准备 EJS 数据
  const ejsData = {
    name: formattedName,
    projectName: formattedName,
    className,
    initType,
    version,
    nameSpace,
  };

  // 6. 安装模板
  const installSpinner = ora('正在安装模板...').start();
  let startCommand: string | undefined;
  try {
    startCommand = await installTemplate(selectedTemplate, templatePath, targetPath, ejsData, packageManager, (msg) => {
      installSpinner.text = msg;
    });
    installSpinner.succeed('模板安装成功');
  } catch (err: any) {
    installSpinner.fail('模板安装失败');
    throw err;
  }

  // 7. 判断配置文件格式（根据模板或项目名称）
  // 检查项目中是否有 TypeScript 文件
  const hasTsFiles = fs.existsSync(path.join(targetPath, 'tsconfig.json')) ||
                     fs.existsSync(path.join(targetPath, 'src', 'index.ts')) ||
                     formattedName.includes('ts');
  const configFormat = hasTsFiles ? 'ts' : 'js';

  // 8. 准备资源配置数据
  const resourceData: Partial<ResourceConfig> = {
    resourceId,
    resourceName: formattedName,
    resourceType: resourceTypeArray,
    intro: '',
    coverImages: [],
  };

  // 9. 准备版本配置数据
  const versionData: Partial<VersionConfig> = {
    // ========== ResourceVersionDetailResponse 字段（基础字段） ==========
    resourceId: resourceId || '',
    resourceType: resourceTypeArray[0] || '',
    resourceName: formattedName || '',
    userId: 0, // 初始化时设为 0，后续通过 syncv 或 publish 更新
    description: '',
    version,
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
    filePath: selectedTemplate.filePath || 'dist',
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
  await generateReadme(formattedName, resourceId, version, initType, configFormat, nameSpace);

  console.log(chalk.green('\n✔ ') + `项目初始化成功`);
  console.log(chalk.blue('ℹ ') + `资源配置: ${chalk.cyan(`freelog.resource.config.${configFormat}`)}`);
  console.log(chalk.blue('ℹ ') + `版本配置: ${chalk.cyan(`freelog.version.config.${configFormat}`)}`);
  console.log(chalk.yellow('\n⚠️  注意: 资源 ID 为空，需要先创建 Freelog 资源'));
  console.log(chalk.blue('\nℹ ') + '下一步:');
  
  // 如果有启动命令，显示启动命令提示
  if (startCommand) {
    console.log(
      `  ${chalk.gray('$')} ${startCommand}                 ${chalk.gray('# 启动开发服务器')}`
    );
  }
  
  console.log(
    `  ${chalk.gray('$')} freelog-cli2 login              ${chalk.gray('# 登录（如未登录）')}`
  );
  console.log(
    `  ${chalk.gray('$')} freelog-cli2 create             ${chalk.gray('# 创建 Freelog 资源')}`
  );
  console.log(
    `  ${chalk.gray('$')} freelog-cli2 dep add <resourceId>  ${chalk.gray('# 添加依赖')}`
  );
  console.log(
    `  ${chalk.gray('$')} freelog-cli2 publish              ${chalk.gray('# 发布')}\n`
  );
}
