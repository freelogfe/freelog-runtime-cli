/**
 * 文件操作工具
 */

import fs from 'fs-extra';

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * 检查文件大小
 */
export function validateFileSize(filePath: string, maxSize: number = 100 * 1024 * 1024): boolean {
  const stats = fs.statSync(filePath);
  const fileSize = stats.size;

  if (fileSize > maxSize) {
    throw new Error(`文件大小超过限制: ${formatFileSize(fileSize)} > ${formatFileSize(maxSize)}`);
  }

  return true;
}

/**
 * 验证文件类型
 */
export function validateFileType(filePath: string, allowedTypes: string[]): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (!ext || !allowedTypes.includes(ext)) {
    throw new Error(`不支持的文件类型: ${ext}。允许的类型: ${allowedTypes.join(', ')}`);
  }

  return true;
}

/**
 * 获取文件大小
 */
export function getFileSize(filePath: string): number {
  const stats = fs.statSync(filePath);
  return stats.size;
}

