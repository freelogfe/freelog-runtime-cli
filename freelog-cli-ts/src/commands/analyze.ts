/**
 * 分析命令
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { CommandOptions } from '../types';

function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function analyzeDirectory(dirPath: string, depth: number = 0, maxDepth: number = 3): any {
  const stats = fs.statSync(dirPath);
  const result: any = {
    name: path.basename(dirPath),
    path: dirPath,
    size: 0,
    files: 0,
    dirs: 0
  };
  
  if (!stats.isDirectory() || depth >= maxDepth) {
    return result;
  }
  
  try {
    const items = fs.readdirSync(dirPath);
    
    items.forEach(item => {
      const itemPath = path.join(dirPath, item);
      const itemStats = fs.statSync(itemPath);
      
      if (itemStats.isDirectory()) {
        result.dirs++;
        const subResult = analyzeDirectory(itemPath, depth + 1, maxDepth);
        result.size += subResult.size;
        result.files += subResult.files;
        result.dirs += subResult.dirs;
      } else {
        result.files++;
        result.size += itemStats.size;
      }
    });
  } catch (err) {
    // 忽略权限错误
  }
  
  return result;
}

export async function executeAnalyze(targetPath?: string, options: CommandOptions = {}): Promise<void> {
  try {
    const analyzePath = targetPath || process.cwd();
    
    console.log(chalk.cyan('\n=== 项目分析 ===\n'));
    console.log(chalk.blue('ℹ ') + `分析路径: ${analyzePath}`);
    
    if (!fs.existsSync(analyzePath)) {
      console.log(chalk.red('✖ ') + '路径不存在');
      return;
    }
    
    console.log(chalk.blue('ℹ ') + '正在分析...\n');
    
    const result = analyzeDirectory(analyzePath);
    
    console.log(chalk.green('✔ ') + '分析完成!\n');
    console.log(`总大小: ${chalk.yellow(formatFileSize(result.size))}`);
    console.log(`文件数: ${chalk.yellow(result.files)}`);
    console.log(`目录数: ${chalk.yellow(result.dirs)}\n`);
    
    // 分析各个目录
    const commonDirs = ['src', 'dist', 'node_modules', 'public', 'assets'];
    
    console.log(chalk.cyan('目录详情:\n'));
    
    for (const dir of commonDirs) {
      const dirPath = path.join(analyzePath, dir);
      if (fs.existsSync(dirPath)) {
        const dirResult = analyzeDirectory(dirPath, 0, 1);
        console.log(`${dir.padEnd(15)} ${formatFileSize(dirResult.size).padStart(12)} (${dirResult.files} 文件)`);
      }
    }
    
    console.log();
    
  } catch (err: any) {
    console.log(chalk.red('✖ ') + `分析失败: ${err.message}`);
    process.exit(1);
  }
}

