/**
 * 资源配置文件服务
 * 负责读取、验证和更新 freelog.resource.config
 */

import fs from 'fs-extra';
import path from 'path';
import { pathToFileURL } from 'url';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { CreateResourceBody, UpdateResourceBody } from '../api/resource';
import type { ResourceDetailResponse } from '../api/types';
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
      // Windows 上需要将绝对路径转换为 file:// URL
      const importPath = path.isAbsolute(configPath) 
        ? pathToFileURL(configPath).href 
        : configPath;
      const module = await import(importPath);
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
 * 基于模板更新配置文件，保留注释和格式
 */
async function updateConfigFromTemplate(
  configPath: string,
  data: ResourceConfig
): Promise<void> {
  const format = configPath.endsWith('.ts') ? 'ts' : 'js';
  const { getTemplatePath } = require('../utils/templatePath');
  const templatePath = getTemplatePath('freelog.resource.config', format);
  
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
 * 保存资源配置文件
 * 基于模板更新，保留注释和格式
 */
export async function saveResourceConfig(config: ResourceConfig, customPath?: string): Promise<void> {
  let configPath: string;
  
  try {
    // 如果提供了 customPath，使用它；否则尝试获取现有配置文件路径
    if (customPath) {
      configPath = path.resolve(process.cwd(), customPath);
    } else {
      try {
        configPath = getResourceConfigPath();
      } catch {
        // 配置文件不存在，使用默认路径（优先 .js）
        configPath = path.join(process.cwd(), 'freelog.resource.config.js');
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
      throw new Error(`保存资源配置文件失败: ${error.message}`);
    }
    throw error;
  }
}

/**
 * 将 ResourceConfig 转换为 CreateResourceBody
 * API 使用 name（不是 resourceName）和 resourceTypeCode（不是 resourceType 数组）
 */
export function resourceConfigToCreateBody(config: ResourceConfig): CreateResourceBody {
  if (!config.resourceName) {
    throw new ValidationError('创建资源时 resourceName 是必填的');
  }
  
  // 从 resourceName 中提取 name（去掉用户名前缀，如果有的话）
  // 例如：username/resource-name -> resource-name
  let name = config.resourceName;
  if (name.includes('/')) {
    name = name.split('/').slice(-1)[0];
  }
  
  // resourceTypeCode 优先使用配置中的，否则使用 resourceType 数组的第一个元素
  let resourceTypeCode = config.resourceTypeCode;
  if (!resourceTypeCode && config.resourceType && config.resourceType.length > 0) {
    resourceTypeCode = config.resourceType[0];
  }
  
  if (!resourceTypeCode) {
    throw new ValidationError('创建资源时 resourceTypeCode 是必填的（可通过 resourceTypeCode 或 resourceType 数组提供）');
  }
  
  // 转换 policies
  const policies = config.policies?.map(policy => ({
    policyName: policy.policyName,
    policyText: policy.policyText || '',
    status: policy.status,
  })).filter(policy => policy.policyText); // 创建时必须有 policyText
  
  return {
    name: name,
    resourceTypeCode: resourceTypeCode,
    // resourceTypeName: config.resourceType.length  ? config.resourceType[0] : undefined,
    resourceTitle: config.resourceTitle,
    intro: config.intro,
    coverImages: config.coverImages,
    tags: config.tags,
    policies: policies && policies.length > 0 ? policies : undefined,
  };
}

/**
 * 计算策略差异，返回需要新增和更新的策略
 * @param localPolicies 本地配置中的策略
 * @param remotePolicies 服务器上的策略
 */
export function calculatePolicyChanges(
  localPolicies: ResourceConfig['policies'],
  remotePolicies: Array<{ policyId: string; policyName: string; status: number }>
): {
  addPolicies: Array<{ policyName: string; policyText: string; status?: number }>;
  updatePolicies: Array<{ policyId: string; status: number }>;
} {
  const addPolicies: Array<{ policyName: string; policyText: string; status?: number }> = [];
  const updatePolicies: Array<{ policyId: string; status: number }> = [];
  
  if (!localPolicies || localPolicies.length === 0) {
    return { addPolicies, updatePolicies };
  }
  
  // 创建远程策略的映射：policyName -> policyInfo
  const remotePolicyMap = new Map(
    remotePolicies.map(p => [p.policyName, p])
  );
  
  // 遍历本地策略
  for (const localPolicy of localPolicies) {
    const remotePolicy = remotePolicyMap.get(localPolicy.policyName);
    
    if (!remotePolicy) {
      // 远程没有这个策略，需要新增（必须有 policyText）
      if (localPolicy.policyText) {
        addPolicies.push({
          policyName: localPolicy.policyName,
          policyText: localPolicy.policyText,
          status: localPolicy.status,
        });
      }
    } else {
      // 远程有这个策略，检查状态是否需要更新
      if (localPolicy.status !== undefined && localPolicy.status !== remotePolicy.status) {
        updatePolicies.push({
          policyId: remotePolicy.policyId,
          status: localPolicy.status,
        });
      }
    }
  }
  
  return { addPolicies, updatePolicies };
}

/**
 * 将 ResourceConfig 转换为 UpdateResourceBody
 * 注意：此函数不计算 policies 差异，需要先调用 calculatePolicyChanges
 * API 不支持 resourceTitle，只支持 status, intro, tags, coverImages, addPolicies, updatePolicies
 */
export function resourceConfigToUpdateBody(
  config: ResourceConfig,
  policyChanges?: { addPolicies?: any[]; updatePolicies?: any[] }
): UpdateResourceBody {
  const body: UpdateResourceBody = {};
  
  if (config.status !== undefined) {
    body.status = config.status;
  }
  if (config.intro !== undefined) {
    body.intro = config.intro;
  }
  if (config.coverImages !== undefined) {
    // 封面图实际只能有一张，只取第一个元素
    body.coverImages = config.coverImages.length > 0 ? [config.coverImages[0]] : [];
  }
  if (config.tags !== undefined) {
    body.tags = config.tags;
  }
  if (policyChanges?.addPolicies && policyChanges.addPolicies.length > 0) {
    body.addPolicies = policyChanges.addPolicies;
  }
  if (policyChanges?.updatePolicies && policyChanges.updatePolicies.length > 0) {
    body.updatePolicies = policyChanges.updatePolicies;
  }
  
  return body;
}

/**
 * 从 API 响应转换为 ResourceConfig
 */
export function responseToResourceConfig(response: ResourceDetailResponse): ResourceConfig {
  return {
    resourceId: response.resourceId,
    resourceName: response.resourceName,
    resourceType: response.resourceType,
    resourceTitle: response.resourceTitle,
    intro: response.intro,
    coverImages: response.coverImages,
    tags: response.tags,
    resourceTypeCode: response.resourceTypeCode,
    status: response.status,
    // 转换 policies，保存 policyId 以便后续更新
    policies: response.policies?.map(policy => ({
      policyName: policy.policyName,
      policyText: policy.policyText,
      status: policy.status,
      policyId: policy.policyId,
    })),
  };
}

