/**
 * 版本配置文件服务
 * 负责读取、验证和更新 freelog.version.config
 */

import fs from 'fs-extra';
import path from 'path';
import type { VersionConfig } from '../../public/freelog.version';
import type { CreateResourceVersionBody } from '../api/dataType';
import type { ResourceVersionDetailResponse } from '../api/responseTypes';
import { ConfigError, ValidationError } from '../core/errors';

/**
 * 获取版本配置文件路径
 */
export function getVersionConfigPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  
  // 在当前目录查找配置文件（按优先级排序）
  const configFiles = [
    'freelog.version.config.ts',
    'freelog.version.config.js',
  ];
  
  for (const file of configFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  throw new ConfigError('找不到版本配置文件 (freelog.version.config.*)');
}

/**
 * 加载版本配置文件
 */
export async function loadVersionConfig(customPath?: string): Promise<VersionConfig> {
  const configPath = getVersionConfigPath(customPath);
  
  try {
    // 对于 TypeScript/JavaScript 文件，使用动态 import
    if (configPath.endsWith('.ts') || configPath.endsWith('.js')) {
      const module = await import(configPath);
      const config = module.default || module;
      
      // 验证配置
      validateVersionConfig(config);
      return config;
    }
    
    throw new ConfigError(`不支持的配置文件格式: ${configPath} (仅支持 .ts 或 .js)`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`加载版本配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 验证版本配置文件
 */
export function validateVersionConfig(config: any): asserts config is VersionConfig {
  const errors: string[] = [];
  
  // 验证必填字段
  if (!config.version) {
    errors.push('缺少必填字段: version');
  } else if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
    errors.push('version 格式不正确，应为语义化版本号（如: 1.0.0）');
  }
  
  if (!config.fileSha1) {
    errors.push('缺少必填字段: fileSha1');
  } else if (!/^[a-f0-9]{40}$/.test(config.fileSha1)) {
    errors.push('fileSha1 格式不正确，应为40位十六进制字符串');
  }
  
  if (!config.filename) {
    errors.push('缺少必填字段: filename');
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`版本配置文件验证失败:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/**
 * 保存版本配置文件
 */
export async function saveVersionConfig(config: VersionConfig, customPath?: string): Promise<void> {
  const configPath = customPath ? path.resolve(process.cwd(), customPath) : getVersionConfigPath();
  
  try {
    if (configPath.endsWith('.ts')) {
      const content = generateTsVersionConfigContent(config);
      await fs.writeFile(configPath, content, 'utf-8');
    } else if (configPath.endsWith('.js')) {
      const content = generateJsVersionConfigContent(config);
      await fs.writeFile(configPath, content, 'utf-8');
    } else {
      throw new ConfigError(`不支持保存到此文件格式: ${configPath} (仅支持 .ts 或 .js)`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`保存版本配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 将 VersionConfig 转换为 CreateResourceVersionBody
 * 移除所有 resourceName（仅用于可读性）
 */
export function versionConfigToVersionBody(config: VersionConfig): CreateResourceVersionBody {
  // 辅助函数：从对象中移除 resourceName 字段
  const omitResourceName = <T extends { resourceName?: string }>(obj: T): Omit<T, 'resourceName'> => {
    const { resourceName, ...rest } = obj;
    return rest as Omit<T, 'resourceName'>;
  };
  
  return {
    version: config.version,
    fileSha1: config.fileSha1,
    filename: config.filename,
    description: config.description,
    
    // 过滤 dependencies 中的 resourceName
    dependencies: config.dependencies?.map(dep => omitResourceName(dep)),
    
    customPropertyDescriptors: config.customPropertyDescriptors,
    
    // 过滤 baseUpcastResources 中的 resourceName
    baseUpcastResources: config.baseUpcastResources?.map(resource => omitResourceName(resource)),
    
    batchSignContracts: config.batchSignContracts,
    inputAttrs: config.inputAttrs,
    authExcludedItems: config.authExcludedItems,
  };
}

/**
 * 从 API 响应转换为 VersionConfig
 */
export function responseToVersionConfig(response: ResourceVersionDetailResponse): VersionConfig {
  return {
    version: response.version,
    fileSha1: response.fileSha1,
    filename: response.filename,
    description: response.description,
    
    dependencies: response.dependencies?.map(dep => ({
      resourceId: dep.resourceId,
      resourceName: dep.resourceName,
      versionRange: dep.versionRange,
    })),
    
    customPropertyDescriptors: response.customPropertyDescriptors,
    
    baseUpcastResources: (response.baseUpcastResources || response.upcastResources)?.map(resource => ({
      resourceId: resource.resourceId,
      resourceName: resource.resourceName,
    })),
  };
}

/**
 * 生成 TypeScript 版本配置文件内容
 */
function generateTsVersionConfigContent(config: VersionConfig): string {
  return `import type { VersionConfig } from './public/freelog.version';

const config: VersionConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
}

/**
 * 生成 JavaScript 版本配置文件内容
 */
function generateJsVersionConfigContent(config: VersionConfig): string {
  return `/**
 * @type {import('./public/freelog.version').VersionConfig}
 */
const config = ${JSON.stringify(config, null, 2)};

export default config;
`;
}

