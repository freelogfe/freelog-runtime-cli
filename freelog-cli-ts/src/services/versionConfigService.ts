/**
 * 版本配置文件服务
 * 负责读取、验证和更新 freelog.version.config
 */

import fs from 'fs-extra';
import path from 'path';
import { pathToFileURL } from 'url';
import type { VersionConfig } from '../../public/freelog.version';
import type { CreateResourceVersionBody, ResourceVersionDetailResponse } from '../api/types';
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
 * @param strict 是否严格验证（默认 false，允许发布前某些字段为空）
 */
export async function loadVersionConfig(customPath?: string, strict: boolean = false): Promise<VersionConfig> {
  const configPath = getVersionConfigPath(customPath);
  
  try {
    // 对于 TypeScript/JavaScript 文件，使用动态 import
    if (configPath.endsWith('.ts') || configPath.endsWith('.js')) {
      // Windows 上需要将绝对路径转换为 file:// URL
      const importPath = path.isAbsolute(configPath) 
        ? pathToFileURL(configPath).href 
        : configPath;
      const module = await import(importPath);
      const config = module.default || module;
      
      // 验证配置（发布前允许某些字段为空）
      validateVersionConfig(config, strict);
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
 * 以 ResourceVersionDetailResponse 为基础，必填字段：resourceId, resourceType, resourceName, userId, description, version, fileSha1
 * @param strict 是否严格验证（true: 所有字段必填，false: 允许发布前某些字段为空）
 */
export function validateVersionConfig(config: any, strict: boolean = true): asserts config is VersionConfig {
  const errors: string[] = [];
  
  // 验证 ResourceVersionDetailResponse 的必填字段
  if (!config.resourceId) {
    if (strict) {
      errors.push('缺少必填字段: resourceId');
    }
  }
  
  if (!config.resourceType) {
    errors.push('缺少必填字段: resourceType');
  }
  
  if (!config.resourceName) {
    if (strict) {
      errors.push('缺少必填字段: resourceName');
    }
  }
  
  if (config.userId === undefined || config.userId === null) {
    if (strict) {
      errors.push('缺少必填字段: userId');
    }
  }
  
  if (!config.description) {
    if (strict) {
      errors.push('缺少必填字段: description');
    }
  }
  
  if (!config.version) {
    errors.push('缺少必填字段: version');
  } else if (!/^\d+\.\d+\.\d+$/.test(config.version)) {
    errors.push('version 格式不正确，应为语义化版本号（如: 1.0.0）');
  }
  
  if (!config.fileSha1) {
    if (strict) {
      errors.push('缺少必填字段: fileSha1');
    }
  } else if (!/^[a-f0-9]{40}$/.test(config.fileSha1)) {
    errors.push('fileSha1 格式不正确，应为40位十六进制字符串');
  }
  
  // filename 在 publish 时需要，但 syncv 后可能没有，所以不强制验证
  
  if (errors.length > 0) {
    throw new ValidationError(`版本配置文件验证失败:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/**
 * 基于模板更新配置文件，保留注释和格式
 */
async function updateConfigFromTemplate(
  configPath: string,
  data: VersionConfig
): Promise<void> {
  const format = configPath.endsWith('.ts') ? 'ts' : 'js';
  const { getTemplatePath } = require('../utils/templatePath');
  const templatePath = getTemplatePath('freelog.version.config', format);
  
  // 读取模板文件
  let template = await fs.readFile(templatePath, 'utf-8');
  
  // 使用改进的替换函数更新模板中的数据
  template = replaceConfigData(template, data, format);
  
  // 写入文件
  await fs.writeFile(configPath, template, 'utf-8');
}

/**
 * 替换配置文件中的数据，保留注释和格式
 */
function replaceConfigData(template: string, data: Record<string, any>, format: 'ts' | 'js'): string {
  let result = template;
  
  for (const [key, value] of Object.entries(data)) {
    // 跳过 undefined，但保留 null、空字符串、空数组等
    if (value === undefined) continue;
    
    // 生成替换值
    let replacement: string;
    
    if (typeof value === 'string') {
      // 字符串：转义单引号和反斜杠
      const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      replacement = `'${escapedValue}'`;
    } else if (typeof value === 'number') {
      replacement = String(value);
    } else if (typeof value === 'boolean') {
      replacement = String(value);
    } else if (value === null) {
      replacement = 'null';
    } else if (Array.isArray(value)) {
      // 数组：格式化输出，每行缩进
      const jsonStr = JSON.stringify(value, null, 2);
      // 将每行缩进调整为 4 个空格（匹配模板格式）
      replacement = jsonStr.split('\n').map((line, index) => {
        if (index === 0) return line;
        return '    ' + line;
      }).join('\n');
    } else if (typeof value === 'object') {
      // 对象：格式化输出，每行缩进
      const jsonStr = JSON.stringify(value, null, 2);
      // 将每行缩进调整为 4 个空格（匹配模板格式）
      replacement = jsonStr.split('\n').map((line, index) => {
        if (index === 0) return line;
        return '    ' + line;
      }).join('\n');
    } else {
      replacement = JSON.stringify(value);
    }
    
    // 匹配字段定义，包括前面的注释
    // 匹配模式：/** ... */ 或 // ... 注释（可能跨多行）+ 空白 + key: 值
    // 使用非贪婪匹配，匹配到下一个字段或对象结束
    
    // 首先尝试匹配带注释的字段（/** ... */ 格式）
    const commentBlockPattern = new RegExp(
      `(/\\*\\*[\\s\\S]*?\\*/\\s*\\n\\s*)${key}:\\s*[^,\\n}]+`,
      'g'
    );
    
    // 匹配简单字段（key: value）
    const simpleFieldPattern = new RegExp(
      `(^\\s*)${key}:\\s*([^,\\n}]+)`,
      'gm'
    );
    
    // 对于复杂类型（数组/对象），需要匹配多行
    if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
      // 匹配数组或对象：key: [ ... ] 或 key: { ... }
      // 需要匹配整个数组/对象，包括嵌套内容
      const complexPattern = new RegExp(
        `(/\\*\\*[\\s\\S]*?\\*/\\s*\\n\\s*)?${key}:\\s*([\\[\\{][\\s\\S]*?[\\]\\}])\\s*,?`,
        'g'
      );
      
      result = result.replace(complexPattern, (match, commentBlock, oldValue) => {
        // 保留注释块
        const prefix = commentBlock || '';
        // 检查原匹配是否有逗号
        const hasComma = match.trim().endsWith(',');
        return prefix + `${key}: ${replacement}` + (hasComma ? ',' : '');
      });
    } else {
      // 简单值：先尝试匹配带注释的
      if (commentBlockPattern.test(result)) {
        result = result.replace(commentBlockPattern, (match, commentBlock) => {
          return commentBlock + `${key}: ${replacement}`;
        });
      } else {
        // 匹配简单字段（不带注释或注释在上一行）
        result = result.replace(simpleFieldPattern, (match, indent, oldValue) => {
          return `${indent}${key}: ${replacement}`;
        });
      }
    }
  }
  
  return result;
}

/**
 * 保存版本配置文件
 * 基于模板更新，保留注释和格式
 */
export async function saveVersionConfig(config: VersionConfig, customPath?: string): Promise<void> {
  let configPath: string;
  
  try {
    // 如果提供了 customPath，使用它；否则尝试获取现有配置文件路径
    if (customPath) {
      configPath = path.resolve(process.cwd(), customPath);
    } else {
      try {
        configPath = getVersionConfigPath();
      } catch {
        // 配置文件不存在，使用默认路径（优先 .js）
        configPath = path.join(process.cwd(), 'freelog.version.config.js');
      }
    }
    
    // 确保目录存在
    await fs.ensureDir(path.dirname(configPath));
    
    // 如果配置文件不存在，需要确定格式
    if (!await fs.pathExists(configPath)) {
      // 根据 customPath 确定格式，否则默认使用 .js
      if (customPath && (customPath.endsWith('.ts') || customPath.endsWith('.js'))) {
        // 格式已确定
      } else {
        // 默认使用 .js 格式
        if (!configPath.endsWith('.ts') && !configPath.endsWith('.js')) {
          configPath = configPath.replace(/\.(ts|js)?$/, '.js');
        }
      }
    }
    
    if (configPath.endsWith('.ts') || configPath.endsWith('.js')) {
      // 使用模板更新方式，保留注释
      await updateConfigFromTemplate(configPath, config);
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
 * 可以从 resourceConfig 中获取部分数据（如果需要）
 */
export function versionConfigToVersionBody(
  config: VersionConfig,
  resourceConfig?: { resourceType?: string[] }
): CreateResourceVersionBody {
  // 辅助函数：从对象中移除 resourceName 字段
  const omitResourceName = <T extends { resourceName?: string }>(obj: T): Omit<T, 'resourceName'> => {
    const { resourceName, ...rest } = obj;
    return rest as Omit<T, 'resourceName'>;
  };
  
  return {
    version: config.version,
    fileSha1: config.fileSha1,
    filename: config.filename || '',
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
 * 以 ResourceVersionDetailResponse 为基础，保留原配置中的本地字段
 * 发布相关字段（baseUpcastResources, batchSignContracts, inputAttrs, authExcludedItems）清空
 * @param resourceConfig 可选的资源配置，如果提供，资源信息（resourceId, resourceName, resourceType）将从这里获取
 */
export function responseToVersionConfig(
  response: ResourceVersionDetailResponse,
  existingConfig?: VersionConfig,
  resourceConfig?: { resourceId?: string; resourceName?: string; resourceType?: string[] }
): VersionConfig {
  // 验证响应数据
  if (!response) {
    throw new Error('API 响应数据为空');
  }
  
  // 资源信息优先从 resourceConfig 获取（如果提供），否则从响应中获取
  // 这样可以确保 version.config 中的资源信息与 resource.config 保持一致
  const resourceId = resourceConfig?.resourceId || response.resourceId;
  const resourceName = resourceConfig?.resourceName || response.resourceName;
  const resourceType = resourceConfig?.resourceType && resourceConfig.resourceType.length > 0
    ? resourceConfig.resourceType[0]
    : response.resourceType;
  
  return {
    // ========== ResourceVersionDetailResponse 字段（基础字段） ==========
    resourceId: resourceId,
    resourceType: resourceType,
    resourceName: resourceName,
    userId: response.userId ?? existingConfig?.userId ?? 0,
    description: response.description || '',
    version: response.version,
    versionId: response.versionId || '',
    fileSha1: response.fileSha1 || '',
    
    dependencies: response.dependencies?.map(dep => ({
      resourceId: dep.resourceId,
      resourceName: dep.resourceName,
      versionRange: dep.versionRange,
    })),
    
    upcastResources: response.upcastResources?.map(resource => ({
      resourceId: resource.resourceId,
      resourceName: resource.resourceName,
    })),
    
    resolveResources: response.resolveResources?.map(res => ({
      resourceId: res.resourceId,
      resourceName: res.resourceName,
    })),
    
    systemProperty: response.systemProperty,
    customProperty: response.customProperty,
    customPropertyDescriptors: response.customPropertyDescriptors,
    catalogueProperty: response.catalogueProperty,
    createDate: response.createDate,
    
    // ========== publish 需要的额外字段 ==========
    // filename 不在响应中，保留原配置的
    filename: existingConfig?.filename,
    
    // 发布相关字段清空（空数组，类型正确）
    baseUpcastResources: [],
    batchSignContracts: [],
    inputAttrs: [],
    authExcludedItems: [],
    
    // ========== 本地字段 ==========
    filePath: existingConfig?.filePath,
  };
}

