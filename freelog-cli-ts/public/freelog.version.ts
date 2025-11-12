/**
 * Freelog 版本配置类型定义
 * 对应 CreateResourceVersionBody 的字段
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
 * 版本配置接口
 */
export interface VersionConfig {
  /** 版本号 */
  version: string;
  
  /** 文件 SHA1 */
  fileSha1: string;
  
  /** 文件名 */
  filename: string;
  
  /** 版本描述 */
  description?: string;
  
  /** 资源类型（用于判断上传方式） */
  resourceType?: string;
  
  /** 构建路径（主题/插件/软件库需要压缩） */
  buildPath?: string;
  
  /** 文件目标路径（其他资源直接上传） */
  fileTarget?: string;
  
  /** 依赖列表 */
  dependencies?: Dependency[];
  
  /** 自定义属性描述器 */
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  
  /** 基础上抛资源 */
  baseUpcastResources?: BaseUpcastResource[];
  
  /** 批量签约合同 */
  batchSignContracts?: BatchSignContract[];
  
  /** 输入属性 */
  inputAttrs?: InputAttr[];
  
  /** 授权排除项 */
  authExcludedItems?: AuthExcludedItem[];
}

