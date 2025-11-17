/**
 * 配置文件服务 - 统一入口
 * 提供同时操作资源配置和版本配置的便捷方法
 */

import path from 'path';
import fs from 'fs-extra';
import type { ResourceConfig } from '../../public/freelog.resource';
import type { VersionConfig } from '../../public/freelog.version';
import {
  loadResourceConfig,
  saveResourceConfig,
  getResourceConfigPath,
  validateResourceConfig,
  resourceConfigToCreateBody,
  resourceConfigToUpdateBody,
  responseToResourceConfig,
} from './resourceConfigService';
import {
  loadVersionConfig,
  saveVersionConfig,
  getVersionConfigPath,
  validateVersionConfig,
  versionConfigToVersionBody,
  responseToVersionConfig,
} from './versionConfigService';
import { ConfigError } from '../core/errors';

// 重新导出各个 service 的函数
export {
  // Resource config
  loadResourceConfig,
  saveResourceConfig,
  getResourceConfigPath,
  validateResourceConfig,
  resourceConfigToCreateBody,
  resourceConfigToUpdateBody,
  responseToResourceConfig,
  
  // Version config
  loadVersionConfig,
  saveVersionConfig,
  getVersionConfigPath,
  validateVersionConfig,
  versionConfigToVersionBody,
  responseToVersionConfig,
};

/**
 * 同时加载资源配置和版本配置
 */
export async function loadBothConfigs(basePath?: string): Promise<{
  resource: ResourceConfig;
  version: VersionConfig;
}> {
  const resourceConfigPath = basePath 
    ? path.join(basePath, getConfigFileName('resource'))
    : undefined;
  const versionConfigPath = basePath 
    ? path.join(basePath, getConfigFileName('version'))
    : undefined;
  
  const resource = await loadResourceConfig(resourceConfigPath);
  const version = await loadVersionConfig(versionConfigPath);
  
  // 验证两个配置文件格式一致
  validateConfigFormats(resourceConfigPath || getResourceConfigPath(), versionConfigPath || getVersionConfigPath());
  
  return { resource, version };
}

/**
 * 同时保存资源配置和版本配置
 */
export async function saveBothConfigs(
  resource: ResourceConfig,
  version: VersionConfig,
  basePath?: string
): Promise<void> {
  const resourceConfigPath = basePath 
    ? path.join(basePath, getConfigFileName('resource'))
    : undefined;
  const versionConfigPath = basePath 
    ? path.join(basePath, getConfigFileName('version'))
    : undefined;
  
  await saveResourceConfig(resource, resourceConfigPath);
  await saveVersionConfig(version, versionConfigPath);
}

/**
 * 获取配置文件格式
 */
export function getConfigFormat(): 'ts' | 'js' {
  try {
    const resourceConfigPath = getResourceConfigPath();
    if (resourceConfigPath.endsWith('.ts')) return 'ts';
    if (resourceConfigPath.endsWith('.js')) return 'js';
  } catch {
    // 如果没有找到配置文件，默认返回 'ts'
    return 'ts';
  }
  
  return 'ts';
}

/**
 * 根据类型和格式获取配置文件名
 */
function getConfigFileName(type: 'resource' | 'version', format?: 'ts' | 'js'): string {
  const ext = format || getConfigFormat();
  return `freelog.${type}.config.${ext}`;
}

/**
 * 验证两个配置文件格式是否一致
 */
function validateConfigFormats(resourcePath: string, versionPath: string): void {
  const resourceExt = path.extname(resourcePath);
  const versionExt = path.extname(versionPath);
  
  if (resourceExt !== versionExt) {
    throw new ConfigError(
      `配置文件格式不一致:\n` +
      `  资源配置: ${resourcePath} (${resourceExt})\n` +
      `  版本配置: ${versionPath} (${versionExt})\n` +
      `两个配置文件必须使用相同的格式 (.ts 或 .js)`
    );
  }
}

/**
 * 检查配置文件是否存在
 */
export function checkConfigsExist(): {
  resource: boolean;
  version: boolean;
  both: boolean;
} {
  let resourceExists = false;
  let versionExists = false;
  
  try {
    getResourceConfigPath();
    resourceExists = true;
  } catch {
    // 配置文件不存在
  }
  
  try {
    getVersionConfigPath();
    versionExists = true;
  } catch {
    // 配置文件不存在
  }
  
  return {
    resource: resourceExists,
    version: versionExists,
    both: resourceExists && versionExists,
  };
}

/**
 * 创建新的配置文件（从模板）
 */
export async function createConfigsFromTemplate(
  basePath: string,
  format: 'ts' | 'js',
  resourceData?: Partial<ResourceConfig>,
  versionData?: Partial<VersionConfig>
): Promise<void> {
  const templateDir = path.join(__dirname, '../../public/template');
  
  // 读取模板
  const resourceTemplatePath = path.join(templateDir, `freelog.resource.config.template.${format}`);
  const versionTemplatePath = path.join(templateDir, `freelog.version.config.template.${format}`);
  
  let resourceTemplate = await fs.readFile(resourceTemplatePath, 'utf-8');
  let versionTemplate = await fs.readFile(versionTemplatePath, 'utf-8');
  
  // 如果提供了数据，替换模板中的默认值
  if (resourceData) {
    resourceTemplate = replaceTemplateData(resourceTemplate, resourceData, format);
  }
  
  if (versionData) {
    versionTemplate = replaceTemplateData(versionTemplate, versionData, format);
  }
  
  // 写入文件
  const resourceConfigPath = path.join(basePath, `freelog.resource.config.${format}`);
  const versionConfigPath = path.join(basePath, `freelog.version.config.${format}`);
  
  await fs.writeFile(resourceConfigPath, resourceTemplate, 'utf-8');
  await fs.writeFile(versionConfigPath, versionTemplate, 'utf-8');
}

/**
 * 替换模板中的数据
 */
function replaceTemplateData(template: string, data: Record<string, any>, format: 'ts' | 'js'): string {
  let result = template;
  
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    
    // TS/JS 格式
    const pattern = new RegExp(`${key}:\\s*[^,\\n]+`, 'g');
    let replacement: string;
    
    if (typeof value === 'string') {
      replacement = `${key}: '${value}'`;
    } else if (Array.isArray(value)) {
      replacement = `${key}: ${JSON.stringify(value)}`;
    } else {
      replacement = `${key}: ${JSON.stringify(value)}`;
    }
    
    result = result.replace(pattern, replacement);
  }
  
  return result;
}

