/**
 * Freelog 版本配置类型定义
 * 同时包含：
 * 1. CreateResourceVersionBody 的字段（用于 publish 发布版本）
 * 2. ResourceVersionDetailResponse 的字段（用于 syncv 同步版本信息）
 * 3. 本地字段（用于构建和发布）
 */

/**
 * 自定义属性描述器
 */
export interface CustomPropertyDescriptor {
  key: string;
  defaultValue: string;
  type: "editableText" | "readonlyText" | "radio" | "checkbox" | "select";
  candidateItems?: string[];
  remark?: string;
}

/**
 * 依赖信息
 */
export interface Dependency {
  resourceId: string;
  resourceName?: string; // 可选，用于可读性
  versionRange: string;
}

/**
 * 基础上抛资源
 */
export interface BaseUpcastResource {
  resourceId: string;
  resourceName?: string; // 可选，用于可读性
}

/**
 * 批量签约合同
 */
export interface BatchSignContract {
  resourceId: string;
  subjectType: number;
  policyIds: string[];
}

/**
 * 输入属性
 */
export interface InputAttr {
  key: string;
  value: any;
}

/**
 * 授权排除项
 */
export interface AuthExcludedItem {
  resourceId: string;
  excludedType: "contractId" | "policyId";
  excludedValue: string;
}

/**
 * 系统属性
 */
export interface SystemProperty {
  [key: string]: any;
}

/**
 * 版本配置接口
 * 以 ResourceVersionDetailResponse 为基础，添加 publish 需要的字段
 */
export interface VersionConfig {
  // ========== ResourceVersionDetailResponse 字段（基础字段） ==========
  /** 资源ID */
  resourceId: string;
  
  /** 资源类型 */
  resourceType: string;
  
  /** 资源名称 */
  resourceName: string;
  
  /** 用户ID */
  userId: number;
  
  /** 资源描述信息 */
  description: string;
  
  /** 版本号 */
  version: string;
  
  /** 版本ID */
  versionId?: string;
  
  /** 资源sha1值 */
  fileSha1: string;
  
  /** 资源依赖信息（包含 resourceName，publish 时需要去掉） */
  dependencies?: Dependency[];
  
  /** 真实上抛资源列表,资源的基础上抛子集 */
  upcastResources?: BaseUpcastResource[];
  
  /** 版本解决的依赖以及上抛 */
  resolveResources?: Array<{
    resourceId: string;
    resourceName: string;
  }>;
  
  /** 系统属性 */
  systemProperty?: SystemProperty;
  
  /** 自定义系统属性(根据描述器自动生成的) */
  customProperty?: Record<string, any>;
  
  /** 自定义属性描述器 */
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  
  /** 目录属性,集合标的物才有此属性 */
  catalogueProperty?: {
    collection_item_count?: number;
    collection_item_no_display?: string;
    collection_item_image_display?: string;
    collection_item_descr_display?: string;
    collection_view?: string;
    collection_item_title?: string;
    collection_sorting?: string;
  };
  
  /** 创建日期 */
  createDate?: string;
  
  // ========== publish 需要的额外字段 ==========
  /** 当前版本对应的文件名or对象名（必选，用于 publish） */
  filename?: string;
  
  /** 版本上抛信息（可选，用于 publish，第一个版本需要传递此参数） */
  baseUpcastResources?: BaseUpcastResource[];
  
  /** 批量签约合同（可选，用于 publish） */
  batchSignContracts?: BatchSignContract[];
  
  /** 输入属性数组（可选，用于 publish） */
  inputAttrs?: InputAttr[];
  
  /** 当前版本的授权排除项（可选，用于 publish） */
  authExcludedItems?: AuthExcludedItem[];
  
  // ========== 本地字段（用于构建和发布） ==========
  /** 文件路径（用于构建和发布，可以是目录路径或文件路径） */
  filePath?: string;
}

