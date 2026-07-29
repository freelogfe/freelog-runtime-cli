/**
 * 批量资源管理服务
 * 负责批量资源配置文件的加载、保存和批量操作
 */

import fs from 'fs-extra';
import path from 'path';
import { pathToFileURL } from 'url';
import type { BatchResourceConfig, BatchResourceItemConfig, BatchResourceOperationResult } from '../../public/freelog.batch-resources';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { VersionConfig } from '../../public/freelog.version';
import { ConfigError, ValidationError } from '../core/errors';
import { resourceConfigToCreateBody, responseToResourceConfig } from './resourceConfigService';
import { versionConfigToVersionBody } from './versionConfigService';
import type { CreateResourceBody } from '../api/resource';
import type { CreateResourceVersionBody } from '../api/types';

/**
 * 获取批量配置文件路径
 */
export function getBatchResourceConfigPath(customPath?: string): string {
  if (customPath) {
    return path.resolve(process.cwd(), customPath);
  }
  
  // 在当前目录查找配置文件（按优先级排序）
  const configFiles = [
    'freelog.batch-resources.config.ts',
    'freelog.batch-resources.config.js',
  ];
  
  for (const file of configFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  
  throw new ConfigError('找不到批量配置文件 (freelog.batch-resources.config.*)');
}

/**
 * 加载批量配置文件
 */
export async function loadBatchResourceConfig(customPath?: string): Promise<BatchResourceConfig> {
  const configPath = getBatchResourceConfigPath(customPath);
  
  try {
    // 对于 TypeScript/JavaScript 文件，使用动态 import
    if (configPath.endsWith('.ts') || configPath.endsWith('.js')) {
      const importPath = path.isAbsolute(configPath) 
        ? pathToFileURL(configPath).href 
        : configPath;
      const module = await import(importPath);
      const config = module.default || module.config || module;
      
      // 验证配置
      validateBatchResourceConfig(config);
      return config;
    }
    
    throw new ConfigError(`不支持的配置文件格式: ${configPath} (仅支持 .ts 或 .js)`);
  } catch (error) {
    if (error instanceof ConfigError || error instanceof ValidationError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new Error(`加载批量配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 验证批量配置文件
 */
export function validateBatchResourceConfig(config: any): asserts config is BatchResourceConfig {
  const errors: string[] = [];
  
  if (!config.defaults) {
    errors.push('缺少必填字段: defaults');
  } else {
    if (!config.defaults.resourceType || !Array.isArray(config.defaults.resourceType) || config.defaults.resourceType.length === 0) {
      errors.push('defaults.resourceType 不能为空数组');
    }
    if (!config.defaults.resourceTypeCode || typeof config.defaults.resourceTypeCode !== 'string' || !config.defaults.resourceTypeCode.trim()) {
      errors.push('defaults.resourceTypeCode 不能为空');
    }
  }
  
  if (!config.resources || !Array.isArray(config.resources)) {
    errors.push('缺少必填字段: resources（应为数组）');
  } else if (config.resources.length === 0) {
    errors.push('resources 不能为空数组');
  } else {
    config.resources.forEach((item: any, index: number) => {
      if (!item.name || typeof item.name !== 'string' || !item.name.trim()) {
        errors.push(`resources[${index}].name 不能为空`);
      }
      if (!item.filePath || typeof item.filePath !== 'string' || !item.filePath.trim()) {
        errors.push(`resources[${index}].filePath 不能为空`);
      }
    });
  }
  
  if (errors.length > 0) {
    throw new ValidationError(`批量配置文件验证失败:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/**
 * 保存批量配置文件
 */
export async function saveBatchResourceConfig(
  config: BatchResourceConfig,
  customPath?: string
): Promise<void> {
  const configPath = customPath 
    ? path.resolve(process.cwd(), customPath)
    : getBatchResourceConfigPath();
  
  // 读取现有文件内容（如果存在）
  let content = '';
  if (fs.existsSync(configPath)) {
    content = await fs.readFile(configPath, 'utf-8');
  } else {
    // 如果文件不存在，从模板读取
    const { getTemplatePath } = require('../utils/templatePath');
    const format = configPath.endsWith('.ts') ? 'ts' : 'js';
    const templatePath = getTemplatePath('freelog.batch-resources.config', format);
    content = await fs.readFile(templatePath, 'utf-8');
  }
  
  // 更新配置数据（简单替换，保留注释）
  const updatedContent = updateConfigContent(content, config, configPath.endsWith('.ts'));
  
  await fs.writeFile(configPath, updatedContent, 'utf-8');
}

/**
 * 更新配置文件内容（保留注释和格式）
 */
function updateConfigContent(content: string, config: BatchResourceConfig, isTypeScript: boolean): string {
  // 使用 JSON.stringify 并格式化，但需要处理函数和 undefined
  const configJson = JSON.stringify(config, (key, value) => {
    // 跳过 undefined 值
    if (value === undefined) {
      return undefined;
    }
    return value;
  }, 2);
  
  // 提取注释部分（匹配文件开头的注释）
  const commentMatch = content.match(/^(\/\*\*[\s\S]*?\*\/\s*)?/);
  const comment = commentMatch ? commentMatch[1] || '' : '';
  
  // 构建新内容
  const exportStatement = isTypeScript 
    ? `\n\nexport default config;`
    : `\n\nmodule.exports = config;`;
  
  return `${comment}const config = ${configJson};${exportStatement}`;
}

/**
 * 将批量资源项配置转换为资源配置
 */
export function batchItemToResourceConfig(
  item: BatchResourceItemConfig,
  defaults: BatchResourceConfig['defaults']
): ResourceConfig {
  return {
    resourceId: item.resourceId || '',
    resourceName: item.resourceName || item.name,
    resourceType: item.resourceType || defaults.resourceType,
    resourceTypeCode: item.resourceTypeCode || defaults.resourceTypeCode,
    resourceTitle: item.resourceTitle,
    intro: item.intro !== undefined ? item.intro : defaults.intro,
    coverImages: item.coverImages || defaults.coverImages,
    tags: item.tags || defaults.tags,
  };
}

/**
 * 将批量资源项配置转换为版本配置
 */
export function batchItemToVersionConfig(
  item: BatchResourceItemConfig,
  defaults: BatchResourceConfig['defaults'],
  resourceId: string,
  userId: number = 0
): VersionConfig {
  const filePath = item.filePath || defaults.filePath || './dist';
  
  return {
    resourceId,
    resourceType: (item.resourceType && item.resourceType[0]) || defaults.resourceType[0],
    resourceName: item.resourceName || item.name,
    userId,
    description: item.description !== undefined ? item.description : (defaults.description || ''),
    version: item.version || defaults.version || '1.0.0',
    versionId: item.versionId || '',
    fileSha1: item.fileSha1 || '',
    dependencies: [],
    upcastResources: [],
    resolveResources: [],
    systemProperty: {},
    customProperty: {},
    customPropertyDescriptors: [],
    catalogueProperty: {},
    createDate: '',
    filename: '',
    baseUpcastResources: [],
    batchSignContracts: [],
    inputAttrs: [],
    authExcludedItems: [],
    filePath,
  };
}

/**
 * 将批量资源项配置转换为创建资源请求体
 */
export function batchItemToCreateBody(
  item: BatchResourceItemConfig,
  defaults: BatchResourceConfig['defaults']
): CreateResourceBody {
  const resourceConfig = batchItemToResourceConfig(item, defaults);
  return resourceConfigToCreateBody(resourceConfig);
}

/**
 * 将批量资源项配置转换为创建版本请求体
 */
export function batchItemToVersionBody(
  item: BatchResourceItemConfig,
  defaults: BatchResourceConfig['defaults'],
  resourceId: string,
  fileSha1: string,
  filename: string
): CreateResourceVersionBody {
  const versionConfig = batchItemToVersionConfig(item, defaults, resourceId);
  versionConfig.fileSha1 = fileSha1;
  versionConfig.filename = filename;
  return versionConfigToVersionBody(versionConfig);
}

/**
 * 更新批量配置中的资源项
 */
export function updateBatchResourceItem(
  config: BatchResourceConfig,
  itemName: string,
  updates: Partial<BatchResourceItemConfig>
): BatchResourceConfig {
  const itemIndex = config.resources.findIndex(item => item.name === itemName);
  if (itemIndex === -1) {
    throw new Error(`找不到资源项: ${itemName}`);
  }
  
  config.resources[itemIndex] = {
    ...config.resources[itemIndex],
    ...updates,
  };
  
  return config;
}

/**
 * 从文件夹扫描并生成批量配置
 * 支持扫描目录和单个文件
 */
export async function scanDirectoryForBatchConfig(
  directoryPath: string,
  defaults: Partial<BatchResourceConfig['defaults']> = {},
  options: {
    /** 是否扫描单个文件（默认 false，只扫描目录） */
    includeFiles?: boolean;
    /** 文件扩展名过滤（如 ['.md', '.txt']，为空则不过滤） */
    fileExtensions?: string[];
  } = {}
): Promise<BatchResourceItemConfig[]> {
  const fullPath = path.resolve(process.cwd(), directoryPath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`目录不存在: ${fullPath}`);
  }
  
  const stats = await fs.stat(fullPath);
  
  // 如果是单个文件，直接返回
  if (stats.isFile()) {
    const baseName = path.basename(fullPath, path.extname(fullPath));
    return [{
      name: baseName,
      resourceName: baseName,
      filePath: path.relative(process.cwd(), fullPath),
    }];
  }
  
  const items: BatchResourceItemConfig[] = [];
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // 处理目录
      const itemPath = path.join(fullPath, entry.name);
      const distPath = path.join(itemPath, 'dist');
      
      // 检查是否有 dist 目录或文件
      let filePath = distPath;
      if (!fs.existsSync(distPath)) {
        // 如果没有 dist 目录，检查是否有其他文件
        const files = await fs.readdir(itemPath);
        if (files.length > 0) {
          filePath = itemPath;
        } else {
          continue; // 跳过空目录
        }
      }
      
      items.push({
        name: entry.name,
        resourceName: entry.name,
        filePath: path.relative(process.cwd(), filePath),
      });
    } else if (entry.isFile() && options.includeFiles) {
      // 处理文件（如果启用）
      const filePath = path.join(fullPath, entry.name);
      const ext = path.extname(entry.name);
      
      // 如果指定了文件扩展名过滤，检查是否符合
      if (options.fileExtensions && options.fileExtensions.length > 0) {
        if (!options.fileExtensions.includes(ext)) {
          continue; // 跳过不符合扩展名的文件
        }
      }
      
      const baseName = path.basename(filePath, ext);
      items.push({
        name: baseName,
        resourceName: baseName,
        filePath: path.relative(process.cwd(), filePath),
      });
    }
  }
  
  return items;
}

