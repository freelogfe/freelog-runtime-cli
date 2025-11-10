/**
 * 配置文件服务
 * 负责读取、验证和更新 freelog.config.ts
 */

import fs from 'fs-extra';
import path from 'path';
import type { FreelogConfig } from '../../public/freelog';
import type { CreateResourceVersionBody } from '../api/dataType';
import { ConfigError, ValidationError } from '../core/errors';

/**
 * 获取配置文件路径
 */
export function getConfigPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  
  // 在当前目录查找配置文件
  const configFiles = [
    'freelog.config.ts',
    'freelog.config.js',
    'freelog.json5',
    'freelog.json',
  ];
  
  for (const file of configFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  throw new ConfigError('找不到配置文件，请确保在项目根目录执行命令，或使用 -c 参数指定配置文件路径');
}

/**
 * 加载配置文件
 */
export async function loadConfig(customPath?: string): Promise<FreelogConfig> {
  const configPath = getConfigPath(customPath);
  
  try {
    // 对于 TypeScript/JavaScript 文件，使用动态 import
    if (configPath.endsWith('.ts') || configPath.endsWith('.js')) {
      const module = await import(configPath);
      const config = module.default || module;
      
      // 验证配置
      validateConfig(config);
      return config;
    }
    
    // 对于 JSON 文件，直接读取
    if (configPath.endsWith('.json') || configPath.endsWith('.json5')) {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      
      validateConfig(config);
      return config;
    }
    
    throw new ConfigError(`不支持的配置文件格式: ${configPath}`);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`加载配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 验证配置文件
 */
function validateConfig(config: any): asserts config is FreelogConfig {
  const errors: string[] = [];
  
  // 验证必填字段
  if (!config.resourceId) {
    errors.push('缺少必填字段: resourceId');
  }
  
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
    throw new ValidationError(`配置文件验证失败:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/**
 * 将 FreelogConfig 转换为 CreateResourceVersionBody
 * 移除 resourceId，因为它是路径参数
 */
export function configToVersionBody(config: FreelogConfig): CreateResourceVersionBody {
  return {
    version: config.version,
    fileSha1: config.fileSha1,
    filename: config.filename,
    description: config.description,
    dependencies: config.dependencies,
    customPropertyDescriptors: config.customPropertyDescriptors,
    baseUpcastResources: config.baseUpcastResources,
    batchSignContracts: config.batchSignContracts,
    inputAttrs: config.inputAttrs,
    authExcludedItems: config.authExcludedItems,
  };
}

/**
 * 保存配置文件
 */
export async function saveConfig(config: FreelogConfig, customPath?: string): Promise<void> {
  const configPath = customPath ? path.resolve(process.cwd(), customPath) : getConfigPath();
  
  try {
    if (configPath.endsWith('.json') || configPath.endsWith('.json5')) {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    } else if (configPath.endsWith('.ts')) {
      // 对于 TypeScript 文件，生成格式化的代码
      const content = generateConfigFileContent(config);
      await fs.writeFile(configPath, content, 'utf-8');
    } else {
      throw new ConfigError(`不支持保存到此文件格式: ${configPath}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`保存配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 生成 TypeScript 配置文件内容
 */
function generateConfigFileContent(config: FreelogConfig): string {
  return `import type { FreelogConfig } from './freelog';

const config: FreelogConfig = ${JSON.stringify(config, null, 2)};

export default config;
`;
}

