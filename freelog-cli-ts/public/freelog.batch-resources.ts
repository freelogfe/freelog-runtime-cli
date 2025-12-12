/**
 * Freelog 批量资源配置类型定义
 * 用于批量管理多个资源（如小说章节、图片集等）
 */

import type { ResourceConfig } from './freelog.resource';
import type { VersionConfig } from './freelog.version';

/**
 * 批量资源项配置
 * 每个资源项的配置，可以覆盖默认配置
 */
export interface BatchResourceItemConfig {
  /** 资源唯一标识（用于匹配文件夹或标识资源） */
  name: string;
  
  /** 资源名称（必填，如果未设置则使用 name） */
  resourceName?: string;
  
  /** 资源标题（可选） */
  resourceTitle?: string;
  
  /** 资源介绍（可选） */
  intro?: string;
  
  /** 封面图列表（可选） */
  coverImages?: string[];
  
  /** 标签列表（可选） */
  tags?: string[];
  
  /** 文件路径（相对于批量配置文件，必填） */
  filePath: string;
  
  /** 资源ID（可选，如果资源已创建，填写此字段） */
  resourceId?: string;
  
  /** 版本号（可选，覆盖默认版本号） */
  version?: string;
  
  /** 版本描述（可选，覆盖默认版本描述） */
  description?: string;
  
  /** 资源类型（可选，覆盖默认资源类型） */
  resourceType?: string[];
  
  /** 资源类型代码（可选，覆盖默认资源类型代码） */
  resourceTypeCode?: string;
  
  /** 版本ID（可选，从服务器获取后保存） */
  versionId?: string;
  
  /** 文件SHA1值（可选，发布后自动填充） */
  fileSha1?: string;
  
  /** 是否跳过此资源（可选，用于临时禁用某个资源） */
  skip?: boolean;
}

/**
 * 批量资源配置的默认值
 * 所有资源项共享的公共配置
 */
export interface BatchResourceDefaults {
  /** 资源类型（必填） */
  resourceType: string[];
  
  /** 资源类型代码（必填） */
  resourceTypeCode: string;
  
  /** 默认版本号（可选，默认: '1.0.0'） */
  version?: string;
  
  /** 默认版本描述（可选） */
  description?: string;
  
  /** 默认资源介绍（可选） */
  intro?: string;
  
  /** 默认封面图列表（可选） */
  coverImages?: string[];
  
  /** 默认标签列表（可选） */
  tags?: string[];
  
  /** 默认文件路径（可选，如果资源项未指定 filePath，使用此路径） */
  filePath?: string;
}

/**
 * 批量资源配置接口
 */
export interface BatchResourceConfig {
  /** 批量资源的公共配置（默认值） */
  defaults: BatchResourceDefaults;
  
  /** 批量资源列表 */
  resources: BatchResourceItemConfig[];
}

/**
 * 批量资源操作结果
 */
export interface BatchResourceOperationResult {
  /** 成功的资源列表 */
  success: Array<{
    name: string;
    resourceId: string;
    resourceName?: string;
    versionId?: string;
  }>;
  
  /** 失败的资源列表 */
  failed: Array<{
    name: string;
    error: string;
  }>;
  
  /** 跳过的资源列表 */
  skipped: Array<{
    name: string;
    reason: string;
  }>;
}

