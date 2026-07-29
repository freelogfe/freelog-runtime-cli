/**
 * Freelog 资源配置类型定义
 * 对应 ResourceDetailResponse 的部分字段
 */


/**
 * 资源配置中的策略信息（简化版，用于配置文件）
 */
export interface ResourcePolicyInfo {
  /** 策略名称（必填，数组内唯一） */
  policyName: string;
  /** 策略文本（可选，创建时需要） */
  policyText?: string;
  /** 策略启用状态（可选，1:上线 0:下线） */
  status?: number;
  /** 策略ID（可选，从服务器获取后保存） */
  policyId?: string;
}

/**
 * 资源配置接口
 * 对应 ResourceDetailResponse 的部分字段
 */
export interface ResourceConfig {
  /** 资源ID */
  resourceId: string;
  
  /** 资源名称 */
  resourceName?: string;
  
  /** 资源类型 */
  resourceType: string[];
  
  /** 资源标题（可选） */
  resourceTitle?: string;
  
  /** 资源介绍（可选） */
  intro?: string;
  
  /** 封面图（可选） */
  coverImages?: string[];
  
  /** 标签（可选） */
  tags?: string[];
  
  /** 资源类型代码（可选） */
  resourceTypeCode?: string;
  
  /** 资源状态（可选，0:待发行 1:上架 2:冻结 4:下架） */
  status?: number;
  
  /** 资源策略信息（可选） */
  policies?: ResourcePolicyInfo[];
}

