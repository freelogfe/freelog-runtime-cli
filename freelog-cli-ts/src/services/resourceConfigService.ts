/**
 * 资源配置文件服务
 * 负责读取、验证和更新 freelog.resource.config
 */

import fs from 'fs-extra';
import path from 'path';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { CreateResourceBody, UpdateResourceBody } from '../api/create';
import type { ResourceDetailResponse } from '../api/responseTypes';
import { ConfigError, ValidationError } from '../core/errors';

/**
 * 获取资源配置文件路径
 */
export function getResourceConfigPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  
  // 在当前目录查找配置文件（按优先级排序）
  const configFiles = [
    'freelog.resource.config.ts',
    'freelog.resource.config.js',
  ];
  
  for (const file of configFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  throw new ConfigError('找不到资源配置文件 (freelog.resource.config.*)');
}

/**
 * 加载资源配置文件
 */
export async function loadResourceConfig(customPath?: string): Promise<ResourceConfig> {
  const configPath = getResourceConfigPath(customPath);
  
  try {
    // 对于 TypeScript/JavaScript 文件，使用动态 import
    if (configPath.endsWith('.ts') || configPath.endsWith('.js')) {
      const module = await import(configPath);
      const config = module.default || module;
      
      // 验证配置
      validateResourceConfig(config);
      return config;
    }
    
    throw new ConfigError(`不支持的配置文件格式: ${configPath} (仅支持 .ts 或 .js)`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`加载资源配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 验证资源配置文件
 */
export function validateResourceConfig(config: any): asserts config is ResourceConfig {
  const errors: string[] = [];
  
  // resourceId 对于某些操作是可选的（如 create 命令）
  // 但如果存在，必须是有效格式
  if (config.resourceId && !/^[a-f0-9]{24}$/.test(config.resourceId)) {
    errors.push('resourceId 格式不正确（应为24位十六进制字符）');
  }
  
  // resourceType 是必填的
  if (!config.resourceType || !Array.isArray(config.resourceType)) {
    errors.push('缺少必填字段: resourceType（应为数组）');
  } else if (config.resourceType.length === 0) {
    errors.push('resourceType 不能为空数组');
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`资源配置文件验证失败:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/**
 * 保存资源配置文件
 */
export async function saveResourceConfig(config: ResourceConfig, customPath?: string): Promise<void> {
  const configPath = customPath ? path.resolve(process.cwd(), customPath) : getResourceConfigPath();
  
  try {
    if (configPath.endsWith('.ts')) {
      const content = generateTsResourceConfigContent(config);
      await fs.writeFile(configPath, content, 'utf-8');
    } else if (configPath.endsWith('.js')) {
      const content = generateJsResourceConfigContent(config);
      await fs.writeFile(configPath, content, 'utf-8');
    } else {
      throw new ConfigError(`不支持保存到此文件格式: ${configPath} (仅支持 .ts 或 .js)`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`保存资源配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 将 ResourceConfig 转换为 CreateResourceBody
 */
export function resourceConfigToCreateBody(config: ResourceConfig): CreateResourceBody {
  if (!config.resourceName) {
    throw new ValidationError('创建资源时 resourceName 是必填的');
  }
  
  return {
    resourceName: config.resourceName,
    resourceType: config.resourceType,
    intro: config.intro,
    coverImages: config.coverImages,
  };
}

/**
 * 将 ResourceConfig 转换为 UpdateResourceBody
 */
export function resourceConfigToUpdateBody(config: ResourceConfig): UpdateResourceBody {
  return {
    intro: config.intro,
    coverImages: config.coverImages,
  };
}

/**
 * 从 API 响应转换为 ResourceConfig
 */
export function responseToResourceConfig(response: ResourceDetailResponse): ResourceConfig {
  return {
    resourceId: response.resourceId,
    resourceName: response.resourceName,
    resourceType: response.resourceType,
    intro: response.intro,
    coverImages: response.coverImages,
  };
}

/**
 * 生成 TypeScript 资源配置文件内容
 */
function generateTsResourceConfigContent(config: ResourceConfig): string {
  return `import type { ResourceConfig } from './public/freelog.resource';

const config: ResourceConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
}

/**
 * 生成 JavaScript 资源配置文件内容
 */
function generateJsResourceConfigContent(config: ResourceConfig): string {
  return `/**
 * @type {import('./public/freelog.resource').ResourceConfig}
 */
const config = ${JSON.stringify(config, null, 2)};

export default config;
`;
}

