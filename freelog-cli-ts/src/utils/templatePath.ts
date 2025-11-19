/**
 * 模板路径工具
 * 用于在发布后的包中正确找到模板文件
 */

import path from 'path';
import fs from 'fs-extra';

/**
 * 获取模板目录路径
 * 支持开发环境和发布后的环境
 */
export function getTemplateDir(): string {
  // 获取当前文件的目录（编译后会在 dist/utils 或 dist/services 等）
  const currentDir = __dirname;
  
  // 从当前目录向上查找，直到找到包含 public/template 的目录
  let searchDir = currentDir;
  const root = path.parse(searchDir).root;
  
  while (searchDir !== root) {
    const templatePath = path.join(searchDir, 'public', 'template');
    if (fs.existsSync(templatePath)) {
      return templatePath;
    }
    
    // 检查是否到达了包的根目录（包含 package.json）
    const packageJsonPath = path.join(searchDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      // 在包的根目录查找 public/template
      const templatePathInRoot = path.join(searchDir, 'public', 'template');
      if (fs.existsSync(templatePathInRoot)) {
        return templatePathInRoot;
      }
      // 如果包根目录没有，继续向上查找（可能是 monorepo）
    }
    
    const parentDir = path.dirname(searchDir);
    if (parentDir === searchDir) {
      break;
    }
    searchDir = parentDir;
  }
  
  // 如果都找不到，尝试从 node_modules 中查找
  try {
    // 尝试通过 require.resolve 找到包的入口文件
    const packageMain = require.resolve('@freelog-cli/cli');
    const packageDir = path.dirname(packageMain);
    const templatePath = path.join(packageDir, '../public/template');
    if (fs.existsSync(templatePath)) {
      return templatePath;
    }
  } catch (err) {
    // 忽略错误
  }
  
  // 如果都找不到，返回默认路径（开发环境）
  const defaultPath = path.join(currentDir, '../../public/template');
  if (fs.existsSync(defaultPath)) {
    return defaultPath;
  }
  
  // 最后的回退：抛出错误
  throw new Error(`无法找到模板目录。已尝试从 ${currentDir} 向上查找，但未找到 public/template 目录。`);
}

/**
 * 获取模板文件路径
 */
export function getTemplatePath(templateName: string, format: 'ts' | 'js'): string {
  const templateDir = getTemplateDir();
  return path.join(templateDir, `${templateName}.template.${format}`);
}

