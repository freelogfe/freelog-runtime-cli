/**
 * 模板相关工具函数
 */

import fs from 'fs-extra';
import path from 'path';
import { execSync, spawn } from 'child_process';
import ejs from 'ejs';
import * as glob from 'glob';
import chalk from 'chalk';

/**
 * 模板信息接口
 */
export interface TemplateInfo {
  name: string;
  npmName: string;
  version: string;
  type: 'normal' | 'custom';
  installCommand?: string;
  startCommand?: string;
  ignore?: string[];
  tag: string[];
  filePath?: string; // 文件路径（目录路径或文件路径，根据资源类型决定）
}

/**
 * 获取模板列表（硬编码，与原来的 getProjectTemplate.js 保持一致）
 */
export function getProjectTemplate(): TemplateInfo[] {
  return [
    {
      name: 'freelog主题-vite-react模板',
      npmName: '@freelog-cli/template-vite-react',
      version: '1.0.0',
      type: 'normal',
      installCommand: 'npm install',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog主题-vite-react-ts模板',
      npmName: '@freelog-cli/template-vite-react-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog主题-vite-vue模板',
      npmName: '@freelog-cli/template-vite-vue',
      version: '1.0.0',
      type: 'normal',
      installCommand: 'npm install',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog主题-vite-vue-ts模板',
      npmName: '@freelog-cli/template-vite-vue-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog主题-webapck-react模板',
      npmName: '@freelog-cli/template-webapck-react',
      version: '1.0.0',
      type: 'normal',
      installCommand: 'npm install',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog主题-webapck-react-ts模板',
      npmName: '@freelog-cli/template-webapck-react-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog主题-webapck-vue模板',
      npmName: '@freelog-cli/template-webapck-vue',
      version: '1.0.0',
      type: 'normal',
      installCommand: 'npm install',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog主题-webapck-vue-ts模板',
      npmName: '@freelog-cli/template-webapck-vue-ts',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['theme'],
      filePath: 'dist',
    },
    {
      name: 'freelog前端库-js-模板',
      npmName: '@freelog-cli/template-package-js',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['package'],
      filePath: 'dist',
    },
    {
      name: 'freelog前端库-react-模板',
      npmName: '@freelog-cli/template-package-react',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['package'],
      filePath: 'dist',
    },
    {
      name: 'freelog前端库-vue-模板',
      npmName: '@freelog-cli/template-package-vue',
      version: '1.0.0',
      type: 'normal',
      startCommand: 'npm run start',
      ignore: ['**/public/**'],
      tag: ['package'],
      filePath: 'dist',
    },
  ];
}

/**
 * 获取用户主目录下的模板缓存路径
 */
function getTemplateCachePath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '';
  return path.join(homeDir, '.freelog-cli', 'template');
}

/**
 * 获取 npm 包的安装路径
 */
function getNpmPackagePath(packageName: string, version: string): string {
  const cachePath = getTemplateCachePath();
  return path.join(cachePath, 'node_modules', packageName);
}

/**
 * 检查模板是否已存在
 */
function templateExists(packageName: string, version: string): boolean {
  const packagePath = getNpmPackagePath(packageName, version);
  return fs.existsSync(packagePath);
}

/**
 * 下载模板（使用 npm/pnpm 安装到缓存目录）
 */
export async function downloadTemplate(
  template: TemplateInfo,
  onProgress?: (message: string) => void
): Promise<string> {
  const cachePath = getTemplateCachePath();
  const packagePath = getNpmPackagePath(template.npmName, template.version);
  
  // 确保缓存目录存在
  await fs.ensureDir(cachePath);
  
  // 如果模板已存在，检查是否需要更新
  if (templateExists(template.npmName, template.version)) {
    onProgress?.(`模板已存在: ${template.npmName}@${template.version}`);
    // 可以选择更新或直接使用
    // 这里先直接使用，不更新
    return packagePath;
  }
  
  // 下载模板
  onProgress?.(`正在下载模板: ${template.npmName}@${template.version}`);
  
  try {
    // 使用 npm 安装到缓存目录
    const installCommand = `npm install ${template.npmName}@${template.version} --prefix "${cachePath}" --registry=https://registry.npmmirror.com`;
    execSync(installCommand, { stdio: 'inherit' });
    onProgress?.(`模板下载成功`);
    return packagePath;
  } catch (error: any) {
    throw new Error(`下载模板失败: ${error.message}`);
  }
}

/**
 * 安装模板（复制文件、EJS 渲染、安装依赖）
 * @returns 替换后的启动命令（如果存在）
 */
export async function installTemplate(
  template: TemplateInfo,
  templatePath: string,
  targetPath: string,
  ejsData: Record<string, any>,
  packageManager: 'pnpm' | 'npm' | 'yarn' = 'pnpm',
  onProgress?: (message: string) => void
): Promise<string | undefined> {
  // 1. 复制模板文件
  onProgress?.('正在安装模板文件...');
  const templateSourcePath = path.join(templatePath, 'template');
  
  if (!fs.existsSync(templateSourcePath)) {
    throw new Error(`模板目录不存在: ${templateSourcePath}`);
  }
  
  await fs.copy(templateSourcePath, targetPath);
  onProgress?.('模板文件安装成功');
  
  // 2. EJS 模板渲染
  onProgress?.('正在渲染模板...');
  const ejsIgnoreFiles = [
    '**/node_modules/**',
    '**/.git/**',
    '**/.vscode/**',
    '**/.DS_Store',
    ...(template.ignore || []),
  ];
  
  // 获取所有需要渲染的文件
  const files = glob.sync('**/*', {
    cwd: targetPath,
    ignore: ejsIgnoreFiles,
    nodir: true,
  });
  
  // 渲染每个文件
  for (const file of files) {
    const filePath = path.join(targetPath, file);
    const content = await fs.readFile(filePath, 'utf-8');
    
    try {
      const rendered = ejs.render(content, ejsData);
      await fs.writeFile(filePath, rendered, 'utf-8');
    } catch (error: any) {
      // 如果渲染失败，跳过该文件（可能不是 EJS 模板）
      console.warn(`跳过文件渲染: ${file} - ${error.message}`);
    }
  }
  
  onProgress?.('模板渲染成功');
  
  // 3. 安装依赖
  // 检查是否存在 package.json
  const packageJsonPath = path.join(targetPath, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    onProgress?.('正在安装依赖...');
    try {
      // 根据选择的包管理工具执行安装命令
      const installCommand = packageManager === 'pnpm' 
        ? 'pnpm install'
        : packageManager === 'yarn'
        ? 'yarn install'
        : 'npm install';
      
      console.log(chalk.blue(`\n执行: ${installCommand}\n`));
      
      execSync(installCommand, {
        cwd: targetPath,
        stdio: 'inherit',
      });
      
      onProgress?.('依赖安装成功');
      console.log(chalk.green('\n✔ 依赖安装完成\n'));
    } catch (error: any) {
      onProgress?.('依赖安装失败');
      console.log(chalk.yellow(`\n⚠️  依赖安装失败: ${error.message}`));
      console.log(chalk.yellow(`请稍后手动执行: ${packageManager} install\n`));
      // 不抛出错误，让用户稍后手动安装
    }
  } else {
    onProgress?.('跳过依赖安装（未找到 package.json）');
    console.log(chalk.yellow('\n⚠️  未找到 package.json，跳过依赖安装\n'));
  }
  
  // 4. 处理启动命令（不自动执行，避免阻塞）
  // 启动命令通常是长期运行的开发服务器，让用户手动执行更合适
  let finalStartCommand: string | undefined;
  if (template.startCommand) {
    // 替换启动命令中的包管理工具
    finalStartCommand = template.startCommand;
    // 如果命令中包含 npm，替换为选择的包管理工具
    if (finalStartCommand.includes('npm')) {
      finalStartCommand = finalStartCommand.replace(/npm/g, packageManager);
    }
  }
  
  return finalStartCommand;
}

