/**
 * 初始化其余资源（非模板类型）
 * 仅创建本地配置文件，不调用 API
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { VersionConfig } from '../../public/freelog.version';
import { createConfigsFromTemplate } from '../services/configService';

/**
 * 格式化项目名称（移除特殊字符，转为小写）
 */
function formatName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
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
export async function executeInitResource(projectName: string): Promise<void> {
  console.log(chalk.blue('ℹ️  其他资源类型，创建本地配置文件\n'));

  // 格式化项目名称
  projectName = formatName(projectName);

  // 获取资源名称（可选）
  const { resourceName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'resourceName',
      message: '请输入资源名称（可选，稍后可在配置文件中修改）',
      default: '',
    },
  ]);

  // 获取资源类型
  const { resourceType } = await inquirer.prompt([
    {
      type: 'input',
      name: 'resourceType',
      message: '请输入资源类型（多个用逗号分隔，可选）',
      default: '',
    },
  ]);

  const resourceTypes = resourceType
    ? resourceType.split(',').map((type: string) => type.trim()).filter((type: string) => type)
    : [];

  // 准备资源配置数据
  const resourceData: Partial<ResourceConfig> = {
    resourceId: '',
    resourceName: resourceName || '',
    resourceType: resourceTypes.length > 0 ? resourceTypes : [],
    intro: '',
    coverImages: [],
  };

  // 准备版本配置数据
  const versionData: Partial<VersionConfig> = {
    // ========== ResourceVersionDetailResponse 字段（基础字段） ==========
    resourceId: '',
    resourceType: resourceTypes.length > 0 ? resourceTypes[0] : '',
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
  await generateReadme(projectName, resourceName || undefined);

  console.log(chalk.green('\n✔ ') + `配置文件创建成功`);
  console.log(
    chalk.blue('ℹ ') + `资源配置: ${chalk.cyan('freelog.resource.config.js')}`
  );
  console.log(
    chalk.blue('ℹ ') + `版本配置: ${chalk.cyan('freelog.version.config.js')}`
  );
  
  if (!resourceName || resourceTypes.length === 0) {
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
