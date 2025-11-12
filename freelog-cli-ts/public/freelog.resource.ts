/**
 * Freelog 资源配置类型定义
 * 对应 ResourceDetailResponse 的部分字段
 */

/**
 * 资源配置接口
 */
export interface ResourceConfig {
  /** 资源ID */
  resourceId: string;
  
  /** 资源名称（可选，用于可读性） */
  resourceName?: string;
  
  /** 资源类型 */
  resourceType: string[];
  
  /** 资源介绍 */
  intro?: string;
  
  /** 封面图 */
  coverImages?: string[];
}

