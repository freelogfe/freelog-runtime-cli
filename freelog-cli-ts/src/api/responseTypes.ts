import type { CustomPropertyDescriptor, Dependency } from "./dataType";

// ==================== 公共类型 ====================

// 资源版本信息
export interface ResourceVersion {
  version: string;
  versionId: string;
  createDate: string;
}

// 策略信息
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

// 基础上抛资源
export interface BaseUpcastResource {
  resourceId: string;
  resourceName: string;
}

// 依赖信息（返回值）
export interface DependencyResponse {
  resourceId: string;
  resourceName: string;
  versionRange: string;
}

// 系统属性
export interface SystemProperty {
  fileSize?: number;
  [key: string]: any;
}

// ==================== 资源详情相关 ====================

// 查看单个资源详情返回值
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

// 批量查询资源列表返回值
export type ResourceListResponse = ResourceDetailResponse[];

// ==================== 资源版本相关 ====================

// 目录属性（集合标的物才有此属性）
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

// 解决的资源信息
export interface ResolveResource {
  /** 解决的资源ID */
  resourceId: string;
  /** 解决的资源名称 */
  resourceName: string;
}

// 查看资源版本信息返回值
export interface ResourceVersionDetailResponse {
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
  versionId: string;
  /** 资源sha1值 */
  fileSha1: string;
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

// 查看资源版本列表返回值
export type ResourceVersionListResponse = ResourceVersionDetailResponse[];

// 批量查询资源版本列表返回值
export type BatchResourceVersionListResponse = ResourceVersionDetailResponse[];

// ==================== 依赖树和授权树 ====================

// 依赖树节点
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

// 查看资源的依赖树返回值
export type ResourceDependencyTreeResponse = DependencyTreeNode[];

// 授权树节点
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

// 查看资源的授权树返回值
export type ResourceAuthTreeResponse = AuthTreeNode[];

// ==================== 资源版本草稿 ====================

// 查看资源版本草稿返回值
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

