/**
 * Freelog 资源版本配置类型定义
 */

/**
 * 自定义属性类型
 */
export type CustomPropertyType = 
  | "editableText"   // 可编辑文本
  | "readonlyText"   // 只读文本
  | "radio"          // 单选
  | "checkbox"       // 多选
  | "select";        // 下拉选项

/**
 * 排除类型
 */
export type ExcludedType = "contractId" | "policyId";

/**
 * 自定义属性描述器
 */
export interface CustomPropertyDescriptor {
  /** 属性键名 */
  key: string;
  
  /** 默认值 */
  defaultValue: string;
  
  /** 属性类型 */
  type: CustomPropertyType;
  
  /** 选项列表（select/radio/checkbox 类型需要） */
  candidateItems?: string[];
  
  /** 字段说明 */
  remark?: string;
}

/**
 * 依赖信息
 */
export interface Dependency {
  /** 依赖的资源 ID */
  resourceId: string;
  
  /** 依赖的资源版本范围 */
  versionRange: string;
}

/**
 * 基础上抛资源
 */
export interface BaseUpcastResource {
  /** 上抛的资源 ID */
  resourceId: string;
}

/**
 * 批量签约合同
 */
export interface BatchSignContract {
  /** 解决的资源 ID */
  resourceId: string;
  
  /** 标的物类型 */
  subjectType: number;
  
  /** 策略 ID 列表 */
  policyIds: string[];
}

/**
 * 输入属性
 */
export interface InputAttr {
  /** 属性键 */
  key: string;
  
  /** 属性值（任意类型） */
  value: any;
}

/**
 * 授权排除项
 */
export interface AuthExcludedItem {
  /** 受影响的资源 ID */
  resourceId: string;
  
  /** 排除类型 */
  excludedType: ExcludedType;
  
  /** 排除值（合约 ID 或策略 ID） */
  excludedValue: string;
}

/**
 * Freelog 资源版本配置
 */
export interface FreelogConfig {
  /**
   * 版本号（必填）
   * 遵循语义化版本规范
   * @example "1.0.0"
   */
  version: string;
  
  /**
   * 文件 SHA1 值（必填）
   * 40位十六进制字符串
   * @example "4a10ed3b6e45f8014b8240ad37f44cfc9c75e754"
   */
  fileSha1: string;
  
  /**
   * 文件名或对象名（必填）
   * @example "resource.zip"
   */
  filename: string;
  
  /**
   * 版本描述信息（可选）
   * @example "修复了若干 bug，新增主题功能"
   */
  description?: string;
  
  /**
   * 版本依赖信息（可选）
   * 定义当前资源版本依赖的其他资源
   */
  dependencies?: Dependency[];
  
  /**
   * 自定义属性定义（可选）
   * 为资源版本定义可配置的自定义属性
   */
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  
  /**
   * 版本上抛信息（可选）
   * 第一个版本需要传递此参数，指定资源上抛到哪些资源
   */
  baseUpcastResources?: BaseUpcastResource[];
  
  /**
   * 批量签约配置（可选）
   * 如果需要在创建版本时自动签约，则配置此参数
   */
  batchSignContracts?: BatchSignContract[];
  
  /**
   * 输入属性数组（可选）
   * 传递给资源的额外属性
   */
  inputAttrs?: InputAttr[];
  
  /**
   * 授权排除项（可选）
   * 配置当前版本的授权排除规则
   */
  authExcludedItems?: AuthExcludedItem[];
}

