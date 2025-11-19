/**
 * API 类型定义
 * 包含所有请求和响应的类型定义
 */

// ==================== 请求类型（Request Types）====================

/**
 * 自定义属性描述器
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface CustomPropertyDescriptor {
  /** 自定义属性名称（必选） */
  key: string;
  /** 自定义属性对应的值（必选） */
  defaultValue: string;
  /** 属性类型（必选）：editableText:可编辑文本, readonlyText:只读文本, radio:单选, checkbox:多选, select:下拉选项 */
  type: "editableText" | "readonlyText" | "radio" | "checkbox" | "select";
  /** 选项列表（可选），单选、多选、下拉选择时需要提供选项 */
  candidateItems?: string[];
  /** 字段说明（可选） */
  remark?: string;
}

/**
 * 依赖信息（请求）
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface Dependency {
  /** 依赖的资源ID（必选） */
  resourceId: string;
  /** 依赖的资源版本范围（必选） */
  versionRange: string;
}

/**
 * 基础上抛资源（请求）
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 * 第一个版本需要传递此参数
 */
export interface BaseUpcastResourceRequest {
  /** 上抛的资源ID（必选） */
  resourceId: string;
}

/**
 * 批量签约合同
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 * 如果需要在创建版本时签约，则需要传递此参数
 */
export interface BatchSignContract {
  /** 解决的资源ID（必选） */
  resourceId: string;
  /** 标的物类型（必选） */
  subjectType: number;
  /** 策略ID（必选） */
  policyIds: string[];
}

/**
 * 输入属性
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface InputAttr {
  /** 属性键 */
  key: string;
  /** 属性值 */
  value: any;
}

/**
 * 授权排除项
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface AuthExcludedItem {
  /** 受影响的资源ID（必选） */
  resourceId: string;
  /** 排除类型（必选）：contractId:以合约ID作为排除属性, policyId:以策略ID作为排除属性 */
  excludedType: "contractId" | "policyId";
  /** 具体的排除值（必选），例如合约ID或者策略ID */
  excludedValue: string;
}

/**
 * 创建资源版本请求体
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export interface CreateResourceVersionBody {
  /** 版本号（必选） */
  version: string;
  /** 当前版本对应的文件sha1值（必选） */
  fileSha1: string;
  /** 当前版本对应的文件名or对象名（必选） */
  filename: string;
  /** 版本描述信息（可选） */
  description?: string;
  /** 版本依赖信息（可选） */
  dependencies?: Dependency[];
  /** 版本自定义属性定义（可选） */
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  /** 版本上抛信息（可选），第一个版本需要传递此参数 */
  baseUpcastResources?: BaseUpcastResourceRequest[];
  /** 如果需要在创建版本时签约，则需要传递此参数（可选） */
  batchSignContracts?: BatchSignContract[];
  /** 输入属性数组（可选） */
  inputAttrs?: InputAttr[];
  /** 当前版本的授权排除项（可选） */
  authExcludedItems?: AuthExcludedItem[];
}

/**
 * 保存资源版本草稿请求体
 */
export interface SaveResourceVersionDraftBody {
  draftData: IResourceCreateVersionDraftType;
}

export interface IResourceCreateVersionDraftType {
  versionInput: string;
  selectedFileInfo: {
    name: string;
    sha1: string;
    from: string;
  } | null;
  additionalProperties: {
    key: string;
    value: string;
  }[];
  customProperties: {
    key: string;
    name: string;
    value: string;
    description: string;
  }[];
  customConfigurations: {
    key: string;
    name: string;
    description: string;
    type: "input" | "select";
    input: string;
    select: string[];
  }[];
  directDependencies: {
    id: string;
    name: string;
    type: "resource" | "object";
    versionRange?: string;
  }[];
  baseUpcastResources: {
    resourceID: string;
    resourceName: string;
  }[];
  descriptionEditorInput: string;
}

// ==================== 响应类型（Response Types）====================

// ==================== 公共类型 ====================

/**
 * 资源版本信息
 */
export interface ResourceVersion {
  version: string;
  versionId: string;
  createDate: string;
}

/**
 * 策略信息（响应）
 */
export interface PolicyInfo {
  policyId: string;
  policyName: string;
  status: number;
  policyText: string;
  fsmDescriptionInfo: Record<string, any>;
  translateInfo?: {
    content: string;
  };
}

/**
 * 基础上抛资源（响应）
 */
export interface BaseUpcastResource {
  resourceId: string;
  resourceName: string;
}

/**
 * 依赖信息（响应）
 */
export interface DependencyResponse {
  resourceId: string;
  resourceName: string;
  versionRange: string;
}

/**
 * 系统属性
 */
export interface SystemProperty {
  fileSize?: number;
  [key: string]: any;
}

// ==================== 资源详情相关 ====================

/**
 * 查看单个资源详情返回值
 */
export interface ResourceDetailResponse {
  resourceId: string;
  resourceTitle?: string;
  resourceType: string[];
  resourceName: string;
  resourceTypeCode?: string;
  userId: number;
  username: string;
  coverImages: string[];
  intro: string;
  tags: string[];
  latestVersion: string;
  latestVersionReleaseDate?: string;
  /** 最新版本详细信息（当 isLoadLatestVersionInfo=1 时返回） */
  latestVersionInfo?: ResourceVersionDetailResponse;
  subjectType?: number;
  resourceVersions: ResourceVersion[];
  policies: PolicyInfo[];
  baseUpcastResources: BaseUpcastResource[];
  freezeReason?: string | null;
  status: number; // 0:待发行 1:上架 2:冻结 4:下架
  operationType?: number; // 0:无 1:编辑精选
  createDate: string;
  updateDate: string;
}

/**
 * 批量查询资源列表返回值
 */
export type ResourceListResponse = ResourceDetailResponse[];

// ==================== 资源版本相关 ====================

/**
 * 目录属性（集合标的物才有此属性）
 */
export interface CatalogueProperty {
  /** 单品数量 */
  collection_item_count?: number;
  /** 设置序号显示 */
  collection_item_no_display?: string;
  /** 设置封面显示 */
  collection_item_image_display?: string;
  /** 设置简介显示 */
  collection_item_descr_display?: string;
  /** 设置默认视图 */
  collection_view?: string;
  /** 单品标题显示设置 */
  collection_item_title?: string;
  /** 展示排序 */
  collection_sorting?: string;
}

/**
 * 解决的资源信息
 */
export interface ResolveResource {
  /** 解决的资源ID */
  resourceId: string;
  /** 解决的资源名称 */
  resourceName: string;
}

/**
 * 查看资源版本信息返回值
 */
export interface ResourceVersionDetailResponse {
  /** 资源ID */
  resourceId: string;
  /** 资源类型 */
  resourceType: string;
  /** 资源名称 */
  resourceName: string;
  /** 用户ID */
  userId: number | null;
  /** 资源描述信息 */
  description: string | null;
  /** 版本号 */
  version: string;
  /** 版本ID */
  versionId: string | null;
  /** 资源sha1值 */
  fileSha1: string | null;
  /** 资源依赖信息 */
  dependencies: DependencyResponse[];
  /** 真实上抛资源列表,资源的基础上抛子集 */
  upcastResources: BaseUpcastResource[];
  /** 版本解决的依赖以及上抛 */
  resolveResources?: ResolveResource[];
  /** 系统属性 */
  systemProperty: SystemProperty;
  /** 自定义系统属性(根据描述器自动生成的) */
  customProperty: Record<string, any>;
  /** 自定义属性描述器 */
  customPropertyDescriptors: CustomPropertyDescriptor[];
  /** 目录属性,集合标的物才有此属性 */
  catalogueProperty?: CatalogueProperty;
  /** 创建日期 */
  createDate: string;
}

/**
 * 查看资源版本列表返回值
 */
export type ResourceVersionListResponse = ResourceVersionDetailResponse[];

/**
 * 批量查询资源版本列表返回值
 */
export type BatchResourceVersionListResponse = ResourceVersionDetailResponse[];

// ==================== 依赖树和授权树 ====================

/**
 * 依赖树节点
 */
export interface DependencyTreeNode {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  version: string;
  versions: string[];
  versionRange: string;
  versionId: string;
  baseUpcastResources: BaseUpcastResource[];
  dependencies: DependencyTreeNode[];
}

/**
 * 查看资源的依赖树返回值
 */
export type ResourceDependencyTreeResponse = DependencyTreeNode[];

/**
 * 授权树节点
 */
export interface AuthTreeNode {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  version: string;
  versions: string[];
  versionRange: string;
  versionId: string;
  baseUpcastResources: BaseUpcastResource[];
  contracts?: any[];
  children?: AuthTreeNode[];
}

/**
 * 查看资源的授权树返回值
 */
export type ResourceAuthTreeResponse = AuthTreeNode[];

// ==================== 资源版本草稿 ====================

/**
 * 查看资源版本草稿返回值
 */
export interface ResourceVersionDraftResponse {
  resourceId: string;
  resourceType?: string;
  draftData: {
    versionInput?: string;
    selectedFileInfo?: {
      name: string;
      sha1: string;
      from: string;
    } | null;
    additionalProperties?: {
      key: string;
      value: string;
    }[];
    customProperties?: {
      key: string;
      name: string;
      value: string;
      description: string;
    }[];
    customConfigurations?: {
      key: string;
      name: string;
      description: string;
      type: "input" | "select";
      input: string;
      select: string[];
    }[];
    directDependencies?: {
      id: string;
      name: string;
      type: "resource" | "object";
      versionRange?: string;
    }[];
    baseUpcastResources?: {
      resourceID: string;
      resourceName: string;
    }[];
    descriptionEditorInput?: string;
  };
  updateDate?: string;
}

