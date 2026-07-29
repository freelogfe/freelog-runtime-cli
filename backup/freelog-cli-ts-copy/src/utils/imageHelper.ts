/**
 * 图片处理工具函数
 */

import path from 'path';
import fs from 'fs-extra';
import { uploadImage } from '../api/storage';

/**
 * 已上传图片URL的前缀
 */
const UPLOADED_IMAGE_URL_PREFIX = 'https://image.freelog.com/preview-image';

/**
 * 判断是否为已上传的图片URL
 * @param url 图片URL
 * @returns 是否为已上传的图片URL
 */
export function isUploadedImageUrl(url: string): boolean {
  return url.startsWith(UPLOADED_IMAGE_URL_PREFIX);
}

/**
 * 判断是否为本地文件路径
 * @param input 输入字符串
 * @returns 是否为本地文件路径
 */
export function isLocalFilePath(input: string): boolean {
  // 如果以 http:// 或 https:// 开头，不是本地路径
  if (input.startsWith('http://') || input.startsWith('https://')) {
    return false;
  }
  
  // 检查文件是否存在
  const absolutePath = path.isAbsolute(input) 
    ? input 
    : path.resolve(process.cwd(), input);
  
  try {
    const stats = fs.statSync(absolutePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * 处理封面图输入
 * - 如果是本地文件路径，则上传并返回URL
 * - 如果是已上传的图片URL，直接返回
 * - 如果是其他URL，抛出错误（不支持外部图片）
 * 
 * @param input 封面图输入（本地路径或已上传的图片URL）
 * @returns 处理后的图片URL
 */
export async function processCoverImage(input: string): Promise<string> {
  const trimmedInput = input.trim();
  
  if (!trimmedInput) {
    throw new Error('封面图输入不能为空');
  }
  
  // 1. 检查是否为已上传的图片URL
  if (isUploadedImageUrl(trimmedInput)) {
    return trimmedInput;
  }
  
  // 2. 检查是否为本地文件路径
  if (isLocalFilePath(trimmedInput)) {
    const absolutePath = path.isAbsolute(trimmedInput)
      ? trimmedInput
      : path.resolve(process.cwd(), trimmedInput);
    
    // 上传图片
    const result = await uploadImage(absolutePath);
    return result.url;
  }
  
  // 3. 如果是其他URL（外部图片），不支持
  if (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')) {
    throw new Error(
      `不支持外部图片URL。请使用已上传的图片URL（${UPLOADED_IMAGE_URL_PREFIX} 开头）或本地文件路径`
    );
  }
  
  // 4. 其他情况（可能是无效的路径或URL）
  throw new Error(
    `无效的封面图输入。请输入已上传的图片URL（${UPLOADED_IMAGE_URL_PREFIX} 开头）或本地文件路径`
  );
}

/**
 * 验证封面图URL是否有效（仅用于交互式输入验证）
 * @param url 图片URL
 * @returns 验证结果和错误信息
 */
export function validateCoverImageUrl(url: string): { valid: boolean; error?: string } {
  const trimmedUrl = url.trim();
  
  if (!trimmedUrl) {
    return { valid: true }; // 允许为空（清空封面图）
  }
  
  if (!isUploadedImageUrl(trimmedUrl)) {
    return {
      valid: false,
      error: `只支持已上传的图片URL（${UPLOADED_IMAGE_URL_PREFIX} 开头）。如需上传本地图片，请使用命令行参数 --cover <本地文件路径>`
    };
  }
  
  return { valid: true };
}

