/**
 * 发布服务
 * 抽取发布相关的公共逻辑，供单个发布和批量发布使用
 */

import path from 'path';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import os from 'os';
import { uploadFile, checkFileExists } from '../api/storage';
import { calculateFileSha1 } from '../utils/crypto';
import type { VersionConfig } from '../../public/freelog.version';

/**
 * 判断是否需要压缩（主题、插件、软件库）
 */
export function shouldCompress(resourceType?: string): boolean {
  if (!resourceType) return false;
  const compressTypes = ['主题', '插件', '软件库'];
  return compressTypes.includes(resourceType);
}

/**
 * 压缩目录为 ZIP 文件
 */
export async function compressDirectory(
  buildPath: string,
  outputPath: string,
  filename: string
): Promise<string> {
  const zip = new AdmZip();
  
  // 读取目录内容
  const files = await fs.readdir(buildPath);
  
  for (const file of files) {
    const filePath = path.join(buildPath, file);
    const stats = await fs.stat(filePath);
    
    if (stats.isDirectory()) {
      zip.addLocalFolder(filePath, file);
    } else {
      zip.addLocalFile(filePath);
    }
  }
  
  // 生成 ZIP 文件
  const zipPath = path.join(outputPath, filename);
  await fs.ensureDir(outputPath);
  zip.writeZip(zipPath);
  
  return zipPath;
}

/**
 * 文件处理结果
 */
export interface ProcessFileResult {
  /** 最终的文件路径（可能是压缩后的临时文件） */
  filePath: string;
  /** 文件名 */
  filename: string;
  /** 文件 SHA1 值 */
  fileSha1: string;
  /** 是否为临时文件（需要清理） */
  isTempFile: boolean;
}

/**
 * 处理文件（压缩或直接使用）
 * @param versionConfig 版本配置
 * @param resourceName 资源名称（用于生成压缩文件名）
 * @returns 文件处理结果
 */
export async function processFileForPublish(
  versionConfig: VersionConfig,
  resourceName: string
): Promise<ProcessFileResult> {
  const needCompress = shouldCompress(versionConfig.resourceType);
  let filePath: string;
  let filename: string;
  let isTempFile = false;
  
  if (needCompress) {
    // 需要压缩（主题、插件、软件库）
    if (!versionConfig.filePath) {
      throw new Error('配置中未指定 filePath（文件路径）');
    }
    
    const absoluteFilePath = path.resolve(process.cwd(), versionConfig.filePath);
    
    if (!fs.existsSync(absoluteFilePath)) {
      throw new Error(`文件路径不存在: ${versionConfig.filePath}`);
    }
    
    // 检查是目录还是文件
    const stats = await fs.stat(absoluteFilePath);
    if (!stats.isDirectory()) {
      throw new Error(`filePath 应该是目录路径（需要压缩的资源类型）: ${versionConfig.filePath}`);
    }
    
    // 生成文件名
    filename = `${resourceName}-${versionConfig.version}.zip`;
    
    // 压缩到临时目录
    const tempDir = path.join(os.tmpdir(), 'freelog-publish');
    await fs.ensureDir(tempDir);
    
    filePath = await compressDirectory(absoluteFilePath, tempDir, filename);
    isTempFile = true;
  } else {
    // 直接上传文件
    if (!versionConfig.filename) {
      throw new Error('配置中未指定 filename（文件名）');
    }
    
    filename = versionConfig.filename;
    
    // 如果 filePath 为空，使用当前目录
    if (!versionConfig.filePath || versionConfig.filePath.trim() === '') {
      filePath = path.resolve(process.cwd(), filename);
    } else {
      // filePath + filename
      filePath = path.resolve(process.cwd(), versionConfig.filePath, filename);
    }
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }
    
    // 检查是文件还是目录
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`filePath 应该是文件路径（不需要压缩的资源类型）: ${filePath}`);
    }
  }
  
  // 计算文件 SHA1
  const fileSha1 = await calculateFileSha1(filePath);
  
  return {
    filePath,
    filename,
    fileSha1,
    isTempFile,
  };
}

/**
 * 检查文件是否已存在并上传（如果需要）
 * @param filePath 文件路径
 * @param fileSha1 文件 SHA1 值
 * @returns 文件是否已存在
 */
export async function checkAndUploadFile(
  filePath: string,
  fileSha1: string
): Promise<boolean> {
  // 检查文件是否已存在
  let fileExists = false;
  try {
    const existInfoList = await checkFileExists(fileSha1);
    fileExists = existInfoList[0]?.isExisting || false;
  } catch {
    // 忽略检查错误
  }
  
  // 上传文件（如果需要）
  if (!fileExists) {
    await uploadFile(filePath);
  }
  
  return fileExists;
}

/**
 * 清理临时文件
 */
export async function cleanupTempFile(filePath: string | null): Promise<void> {
  if (filePath && fs.existsSync(filePath)) {
    try {
      await fs.remove(filePath);
    } catch {
      // 忽略清理错误
    }
  }
}

