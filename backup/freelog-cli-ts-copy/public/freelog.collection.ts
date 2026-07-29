/**
 * Freelog 合集配置类型定义
 * 对应合集资源的配置结构
 */

import type { Dependency } from './freelog.version';

/**
 * 合集配置中的策略信息（简化版，用于配置文件）
 */
export interface CollectionPolicyInfo {
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
 * 合集单品信息
 */
export interface CollectionItemConfig {
  /** 资源ID */
  resourceId: string;
  /** 资源名称（可选，用于可读性） */
  resourceName?: string;
  /** 版本号（可选） */
  version?: string;
  /** 单品标题（可选） */
  itemTitle?: string;
  /** 单品描述（可选） */
  itemDescription?: string;
  /** 封面图（可选） */
  coverImage?: string;
  /** 单品ID（可选，从服务器获取后保存） */
  itemId?: string;
}

/**
 * 合集属性配置
 */
export interface CollectionPropertyConfig {
  /** 是否显示单品编号 */
  collection_item_no_display?: "collection_item_no_display_show" | "collection_item_no_display_hide";
  /** 是否显示单品图片 */
  collection_item_image_display?: "collection_item_image_display_show" | "collection_item_image_display_hide";
  /** 是否显示单品描述 */
  collection_item_descr_display?: "collection_item_descr_display_show" | "collection_item_descr_display_hide";
  /** 合集视图类型 */
  collection_view?: "collection_view_list" | "collection_view_card";
}

/**
 * 合集资源配置接口
 */
export interface CollectionConfig {
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
  policies?: CollectionPolicyInfo[];
  
  /** 合集属性（可选） */
  catalogueProperty?: CollectionPropertyConfig;
  
  /** 合集单品列表（可选） */
  items?: CollectionItemConfig[];
  
  /** 合集依赖列表（可选，类似资源的版本依赖） */
  dependencies?: Dependency[];
  
  /** 基础上抛资源列表（可选） */
  baseUpcastResources?: Array<{
    resourceId: string;
    resourceName?: string;
  }>;
}

