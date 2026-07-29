/**
 * 合集资源相关 API
 * 包括合集资源的更新、单品管理、授权查询等功能
 */

import { freelogRequest } from "../core/http";
import type { Dependency, CustomPropertyDescriptor } from "./types";

/**
 * 合同信息
 */
export interface ContractInfo {
  /** 策略ID（必选） */
  policyId: string;
}

/**
 * 解决资源信息
 */
export interface ResolveResource {
  /** 解决的资源ID（必选） */
  resourceId: string;
  /** 解决所用的合同信息（必选） */
  contracts: ContractInfo[];
}

/**
 * 合集属性
 */
export interface CollectionProperty {
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
 * 更新合集资源信息请求体
 * @see https://doc.freelog.com/resourceV2/%E6%9B%B4%E6%96%B0%E5%90%88%E9%9B%86%E8%B5%84%E6%BA%90%E4%BF%A1%E6%81%AF.html
 */
export interface UpdateCollectionResourceBody {
  /** 版本描述信息（可选） */
  description?: string;
  /** 版本依赖信息（可选，如果需要变更依赖，则需要传递全量数据） */
  dependencies?: Dependency[];
  /** 版本自定义属性定义（可选） */
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  /** 依赖以及依赖的上抛授权解决方式（可选） */
  resolveResources?: ResolveResource[];
  /** 资源合集特有的属性（可选） */
  catalogueProperty?: CollectionProperty;
  /** 是否合并目录草稿（可选，0:不合并 1:合并） */
  isMergeCatalogueDraft?: number;
}

/**
 * 合同信息（响应）
 */
export interface ContractResponse {
  /** 策略ID */
  policyId: string;
  /** 合同ID */
  contractId?: string;
  /** 授权状态 */
  authStatus?: number;
}

/**
 * 解决资源信息（响应）
 */
export interface ResolveResourceResponse {
  /** 解决的资源ID */
  resourceId: string;
  /** 资源名称 */
  resourceName?: string;
  /** 解决所用的合同信息 */
  contracts: ContractResponse[];
}

/**
 * 上抛资源信息
 */
export interface UpcastResource {
  /** 上抛资源ID */
  resourceId: string;
  /** 上抛资源名称 */
  resourceName: string;
}

/**
 * 可选依赖信息
 */
export interface OptionalDependency {
  /** 依赖的资源ID */
  resourceId: string;
  /** 依赖的资源名称 */
  resourceName: string;
  /** 依赖的资源版本范围 */
  versionRange: string;
}

/**
 * 更新合集资源信息响应
 */
export interface UpdateCollectionResourceResponse {
  /** 资源ID */
  resourceId: string;
  /** 资源类型 */
  resourceType: string | string[];
  /** 资源名称 */
  resourceName: string;
  /** 用户ID */
  userId: number;
  /** 资源描述信息 */
  description?: string;
  /** 版本号 */
  version: string;
  /** 版本ID */
  versionId: string;
  /** 资源sha1值 */
  fileSha1?: string;
  /** 资源依赖信息 */
  dependencies?: Dependency[];
  /** 真实上抛资源列表 */
  upcastResources?: UpcastResource[];
  /** 版本解决的依赖以及上抛 */
  resolveResources?: ResolveResourceResponse[];
  /** 系统属性 */
  systemProperty?: Record<string, any>;
  /** 自定义系统属性 */
  customProperty?: Record<string, any>;
  /** 自定义属性描述器 */
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  /** 创建日期 */
  createDate?: string;
  /** 资源合集相关的特有属性 */
  catalogueProperty?: CollectionProperty;
  /** 资源合集中单品以及其上抛的授权解决方式 */
  optionalResolveResources?: ResolveResourceResponse[];
  /** 资源依赖信息（可选依赖） */
  optionalDependencies?: OptionalDependency[];
  /** 解决资源授权状态 */
  resolveResourceAuthStatus?: number;
}

/**
 * 更新合集资源信息
 * @param resourceId 资源ID（合集目前固定版本，所以无需传递版本号，只需要资源ID）
 * @param body 更新合集资源信息请求体
 * @see https://doc.freelog.com/resourceV2/%E6%9B%B4%E6%96%B0%E5%90%88%E9%9B%86%E8%B5%84%E6%BA%90%E4%BF%A1%E6%81%AF.html
 */
export async function updateCollectionResource(
  resourceId: string,
  body: UpdateCollectionResourceBody
): Promise<UpdateCollectionResourceResponse> {
  return freelogRequest.put<UpdateCollectionResourceResponse>(
    `/v2/resources/catalogue/${resourceId}`,
    body
  );
}

/**
 * 获取合集资源的单品列表请求参数
 */
export interface GetCollectionItemsParams {
  /** 页码（可选，默认1） */
  page?: number;
  /** 每页数量（可选，默认20） */
  pageSize?: number;
  /** 排序字段（可选） */
  sortField?: string;
  /** 排序方式（可选，asc/desc） */
  sortOrder?: "asc" | "desc";
  /** 搜索关键字（可选） */
  keyword?: string;
}

/**
 * 单品信息
 */
export interface CollectionItem {
  /** 资源ID */
  resourceId: string;
  /** 资源名称 */
  resourceName: string;
  /** 版本号 */
  version?: string;
  /** 版本ID */
  versionId?: string;
  /** 资源类型 */
  resourceType?: string | string[];
  /** 资源描述 */
  description?: string;
  /** 封面图 */
  coverImages?: string[];
  /** 创建日期 */
  createDate?: string;
  /** 更新时间 */
  updateDate?: string;
}

/**
 * 获取合集资源的单品列表响应
 */
export interface GetCollectionItemsResponse {
  /** 单品列表 */
  items: CollectionItem[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页数量 */
  pageSize: number;
}

/**
 * 获取合集资源的单品列表
 * @param resourceId 资源ID
 * @param params 查询参数
 * @see https://doc.freelog.com/resourceV2/%E8%8E%B7%E5%8F%96%E5%90%88%E9%9B%86%E8%B5%84%E6%BA%90%E7%9A%84%E5%8D%95%E5%93%81%E5%88%97%E8%A1%A8.html
 */
export async function getCollectionItems(
  resourceId: string,
  params?: GetCollectionItemsParams
): Promise<GetCollectionItemsResponse> {
  return freelogRequest.get<GetCollectionItemsResponse>(
    `/v2/resources/catalogue/${resourceId}/items`,
    { params }
  );
}

/**
 * 批量查询单品在资源侧的授权请求体
 */
export interface BatchQueryItemAuthBody {
  /** 资源ID列表 */
  resourceIds: string[];
  /** 版本号列表（可选，需要与资源ID的下标对应） */
  versions?: string[];
}

/**
 * 单品授权信息
 */
export interface ItemAuthInfo {
  /** 资源ID */
  resourceId: string;
  /** 资源名称 */
  resourceName?: string;
  /** 版本号 */
  version?: string;
  /** 是否授权 */
  isAuth: boolean;
  /** 授权状态 */
  authStatus?: number;
  /** 合同信息列表 */
  contracts?: ContractResponse[];
}

/**
 * 批量查询单品在资源侧的授权响应
 */
export interface BatchQueryItemAuthResponse {
  /** 授权信息列表 */
  items: ItemAuthInfo[];
}

/**
 * 批量查询单品在资源侧的授权
 * @param resourceId 合集资源ID
 * @param body 批量查询请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E5%8D%95%E5%93%81%E5%9C%A8%E8%B5%84%E6%BA%90%E4%BE%A7%E7%9A%84%E6%8E%88%E6%9D%83.html
 */
export async function batchQueryItemAuth(
  resourceId: string,
  body: BatchQueryItemAuthBody
): Promise<BatchQueryItemAuthResponse> {
  return freelogRequest.post<BatchQueryItemAuthResponse>(
    `/v2/resources/catalogue/${resourceId}/items/auth/batch`,
    body
  );
}

/**
 * 自动收录规则条件
 */
export interface AutoIncludeRuleCondition {
  /** 条件类型 */
  conditionType: string;
  /** 条件值 */
  conditionValue: any;
}

/**
 * 自动收录规则
 */
export interface AutoIncludeRule {
  /** 规则ID */
  ruleId?: string;
  /** 规则名称 */
  ruleName: string;
  /** 规则描述 */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 规则条件列表 */
  conditions: AutoIncludeRuleCondition[];
  /** 创建日期 */
  createDate?: string;
  /** 更新日期 */
  updateDate?: string;
}

/**
 * 获取合集单品自动收录规则响应
 */
export interface GetAutoIncludeRulesResponse {
  /** 规则列表 */
  rules: AutoIncludeRule[];
}

/**
 * 获取合集单品自动收录规则
 * @param resourceId 资源ID
 * @see https://doc.freelog.com/resourceV2/%E8%8E%B7%E5%8F%96%E5%90%88%E9%9B%86%E5%8D%95%E5%93%81%E8%87%AA%E5%8A%A8%E6%94%B6%E5%BD%95%E8%A7%84%E5%88%99%20.html
 */
export async function getAutoIncludeRules(
  resourceId: string
): Promise<GetAutoIncludeRulesResponse> {
  return freelogRequest.get<GetAutoIncludeRulesResponse>(
    `/v2/resources/catalogue/${resourceId}/auto-include-rules`
  );
}

/**
 * 创建或更新合集单品自动收录规则请求体
 */
export interface CreateOrUpdateAutoIncludeRuleBody {
  /** 规则名称 */
  ruleName: string;
  /** 规则描述（可选） */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 规则条件列表 */
  conditions: AutoIncludeRuleCondition[];
}

/**
 * 创建或更新合集单品自动收录规则响应
 */
export interface CreateOrUpdateAutoIncludeRuleResponse {
  /** 规则ID */
  ruleId: string;
  /** 规则名称 */
  ruleName: string;
  /** 规则描述 */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 规则条件列表 */
  conditions: AutoIncludeRuleCondition[];
  /** 创建日期 */
  createDate: string;
  /** 更新日期 */
  updateDate: string;
}

/**
 * 创建或更新合集单品自动收录规则
 * @param resourceId 资源ID
 * @param body 创建或更新规则请求体
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E6%88%96%E6%9B%B4%E6%96%B0%E5%90%88%E9%9B%86%E5%8D%95%E5%93%81%E8%87%AA%E5%8A%A8%E6%94%B6%E5%BD%95%E8%A7%84%E5%88%99.html
 */
export async function createOrUpdateAutoIncludeRule(
  resourceId: string,
  body: CreateOrUpdateAutoIncludeRuleBody
): Promise<CreateOrUpdateAutoIncludeRuleResponse> {
  return freelogRequest.post<CreateOrUpdateAutoIncludeRuleResponse>(
    `/v2/resources/catalogue/${resourceId}/auto-include-rules`,
    body
  );
}

/**
 * 更新合集单品自动收录规则
 * @param resourceId 资源ID
 * @param ruleId 规则ID
 * @param body 更新规则请求体
 */
export async function updateAutoIncludeRule(
  resourceId: string,
  ruleId: string,
  body: CreateOrUpdateAutoIncludeRuleBody
): Promise<CreateOrUpdateAutoIncludeRuleResponse> {
  return freelogRequest.put<CreateOrUpdateAutoIncludeRuleResponse>(
    `/v2/resources/catalogue/${resourceId}/auto-include-rules/${ruleId}`,
    body
  );
}

/**
 * 单品详情响应
 */
export interface CollectionItemDetail {
  /** 资源ID */
  resourceId: string;
  /** 资源名称 */
  resourceName: string;
  /** 版本号 */
  version?: string;
  /** 版本ID */
  versionId?: string;
  /** 资源类型 */
  resourceType?: string | string[];
  /** 资源描述 */
  description?: string;
  /** 封面图 */
  coverImages?: string[];
  /** 创建日期 */
  createDate?: string;
  /** 更新时间 */
  updateDate?: string;
  /** 是否授权 */
  isAuth?: boolean;
  /** 授权状态 */
  authStatus?: number;
  /** 合同信息列表 */
  contracts?: ContractResponse[];
  /** 上抛资源列表 */
  upcastResources?: UpcastResource[];
}

/**
 * 查看单品详情
 * @param resourceId 合集资源ID
 * @param itemResourceId 单品资源ID
 * @param version 版本号（可选）
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E5%8D%95%E5%93%81%E8%AF%A6%E6%83%85.html
 */
export async function getCollectionItemDetail(
  resourceId: string,
  itemResourceId: string,
  version?: string
): Promise<CollectionItemDetail> {
  const params: any = {};
  if (version) {
    params.version = version;
  }
  return freelogRequest.get<CollectionItemDetail>(
    `/v2/resources/catalogue/${resourceId}/items/${itemResourceId}`,
    { params }
  );
}

// ==================== 草稿相关接口 ====================

/**
 * 批量删除合集资源单品（草稿）
 * @param resourceId 资源ID
 * @param removeCollectionItemIds 单品ID列表，多个用逗号分隔
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E5%88%A0%E9%99%A4%E5%90%88%E9%9B%86%E8%B5%84%E6%BA%90%E5%8D%95%E5%93%81_%E8%8D%89%E7%A8%BF.html
 */
export async function batchDeleteCollectionItemsDraft(
  resourceId: string,
  removeCollectionItemIds: string
): Promise<boolean> {
  return freelogRequest.delete<boolean>(
    `/v2/resources/catalogues/drafts/${resourceId}/items`,
    {
      params: { removeCollectionItemIds },
    }
  );
}

/**
 * 设置合集资源的单品排序（草稿）请求体
 */
export interface SetCollectionItemsSortBody {
  /** 需要移动位置的单品ID列表 */
  itemIds: string[];
  /** 排序ID（最小为1） */
  targetSortId: number;
}

/**
 * 设置合集资源的单品排序（草稿）
 * @param resourceId 资源ID
 * @param body 设置排序请求体
 * @see https://doc.freelog.com/resourceV2/%E8%AE%BE%E7%BD%AE%E5%90%88%E9%9B%86%E8%B5%84%E6%BA%90%E7%9A%84%E5%8D%95%E5%93%81%E6%8E%92%E5%BA%8F_%E8%8D%89%E7%A8%BF.html
 */
export async function setCollectionItemsSortDraft(
  resourceId: string,
  body: SetCollectionItemsSortBody
): Promise<boolean> {
  return freelogRequest.put<boolean>(
    `/v2/resources/catalogues/drafts/${resourceId}/manualSort`,
    body
  );
}

/**
 * 重置合集资源的单品排序（草稿）请求体
 */
export interface ResetCollectionItemsSortBody {
  /** 排序字段：createDate(创建时间), itemTitle(单品标题), sortId(现有序号排序) */
  sortField: "createDate" | "itemTitle" | "sortId";
  /** 排序方式：1(升序), -1(降序) */
  orderType: 1 | -1;
}

/**
 * 重置合集资源的单品排序（草稿）
 * @param resourceId 资源ID
 * @param body 重置排序请求体
 * @see https://doc.freelog.com/resourceV2/%E9%87%8D%E7%BD%AE%E5%90%88%E9%9B%86%E8%B5%84%E6%BA%90%E7%9A%84%E5%8D%95%E5%93%81%E6%8E%92%E5%BA%8F_%E8%8D%89%E7%A8%BF.html
 */
export async function resetCollectionItemsSortDraft(
  resourceId: string,
  body: ResetCollectionItemsSortBody
): Promise<boolean> {
  return freelogRequest.put<boolean>(
    `/v2/resources/catalogues/drafts/${resourceId}/reorder`,
    body
  );
}

/**
 * 查看资源是否在单品目录中存在（草稿）响应
 */
export interface CheckResourceInCollectionResponse {
  /** 是否存在 */
  exists: boolean;
  /** 如果存在，返回单品信息 */
  item?: CollectionItem;
}

/**
 * 查看资源是否在单品目录中存在（草稿）
 * @param resourceId 合集资源ID
 * @param itemResourceId 单品资源ID
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E7%9C%8B%E8%B5%84%E6%BA%90%E6%98%AF%E5%90%A6%E5%9C%A8%E5%8D%95%E5%93%81%E7%9B%AE%E5%BD%95%E4%B8%AD%E5%AD%98%E5%9C%A8_%E8%8D%89%E7%A8%BF.html
 */
export async function checkResourceInCollectionDraft(
  resourceId: string,
  itemResourceId: string
): Promise<CheckResourceInCollectionResponse> {
  return freelogRequest.get<CheckResourceInCollectionResponse>(
    `/v2/resources/catalogues/drafts/${resourceId}/items/${itemResourceId}/exists`
  );
}

/**
 * 批量更新单品信息（草稿）请求体
 */
export interface BatchUpdateCollectionItemsDraftBody {
  /** 单品信息列表 */
  items: Array<{
    /** 单品ID */
    itemId: string;
    /** 单品标题（可选） */
    itemTitle?: string;
    /** 单品描述（可选） */
    itemDescription?: string;
    /** 封面图（可选） */
    coverImage?: string;
  }>;
}

/**
 * 批量更新单品信息（草稿）
 * @param resourceId 资源ID
 * @param body 批量更新请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9B%B4%E6%96%B0%E5%8D%95%E5%93%81%E4%BF%A1%E6%81%AF_%E8%8D%89%E7%A8%BF.html
 */
export async function batchUpdateCollectionItemsDraft(
  resourceId: string,
  body: BatchUpdateCollectionItemsDraftBody
): Promise<boolean> {
  return freelogRequest.put<boolean>(
    `/v2/resources/catalogues/drafts/${resourceId}/items/batch`,
    body
  );
}

/**
 * 更新单品授权方案（草稿）请求体
 */
export interface UpdateCollectionItemAuthSchemeBody {
  /** 单品ID */
  itemId: string;
  /** 授权解决方式 */
  resolveResources?: ResolveResource[];
}

/**
 * 更新单品授权方案（草稿）
 * @param resourceId 资源ID
 * @param body 更新授权方案请求体
 * @see https://doc.freelog.com/resourceV2/%E6%9B%B4%E6%96%B0%E5%8D%95%E5%93%81%E6%8E%88%E6%9D%83%E6%96%B9%E6%A1%88_%E8%8D%89%E7%A8%BF.html
 */
export async function updateCollectionItemAuthSchemeDraft(
  resourceId: string,
  body: UpdateCollectionItemAuthSchemeBody
): Promise<boolean> {
  return freelogRequest.put<boolean>(
    `/v2/resources/catalogues/drafts/${resourceId}/items/auth`,
    body
  );
}

/**
 * 批量新增合集资源单品（草稿）请求体
 */
export interface BatchAddCollectionItemsDraftBody {
  /** 单品列表 */
  items: Array<{
    /** 资源ID */
    resourceId: string;
    /** 版本号（可选） */
    version?: string;
    /** 单品标题（可选） */
    itemTitle?: string;
    /** 单品描述（可选） */
    itemDescription?: string;
    /** 封面图（可选） */
    coverImage?: string;
    /** 授权解决方式（可选） */
    resolveResources?: ResolveResource[];
  }>;
}

/**
 * 批量新增合集资源单品（草稿）
 * @param resourceId 资源ID
 * @param body 批量新增请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%96%B0%E5%A2%9E%E5%90%88%E9%9B%86%E8%B5%84%E6%BA%90%E5%8D%95%E5%93%81_%E8%8D%89%E7%A8%BF.html
 */
export async function batchAddCollectionItemsDraft(
  resourceId: string,
  body: BatchAddCollectionItemsDraftBody
): Promise<boolean> {
  return freelogRequest.post<boolean>(
    `/v2/resources/catalogues/drafts/${resourceId}/items/batch`,
    body
  );
}

/**
 * 批量查询单品在资源侧的授权（草稿）请求体
 */
export interface BatchQueryItemAuthDraftBody {
  /** 资源ID列表 */
  resourceIds: string[];
  /** 版本号列表（可选，需要与资源ID的下标对应） */
  versions?: string[];
}

/**
 * 批量查询单品在资源侧的授权（草稿）
 * @param resourceId 合集资源ID
 * @param body 批量查询请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E6%9F%A5%E8%AF%A2%E5%8D%95%E5%93%81%E5%9C%A8%E8%B5%84%E6%BA%90%E4%BE%A7%E7%9A%84%E6%8E%88%E6%9D%83_%E8%8D%89%E7%A8%BF.html
 */
export async function batchQueryItemAuthDraft(
  resourceId: string,
  body: BatchQueryItemAuthDraftBody
): Promise<BatchQueryItemAuthResponse> {
  return freelogRequest.post<BatchQueryItemAuthResponse>(
    `/v2/resources/catalogues/drafts/${resourceId}/items/auth/batch`,
    body
  );
}

/**
 * 查询资源所在的单品列表（草稿）请求参数
 */
export interface GetResourceCollectionsDraftParams {
  /** 页码（可选，默认1） */
  page?: number;
  /** 每页数量（可选，默认20） */
  pageSize?: number;
}

/**
 * 资源所在的合集信息
 */
export interface ResourceCollectionInfo {
  /** 合集资源ID */
  resourceId: string;
  /** 合集资源名称 */
  resourceName: string;
  /** 单品ID */
  itemId?: string;
  /** 创建日期 */
  createDate?: string;
}

/**
 * 查询资源所在的单品列表（草稿）响应
 */
export interface GetResourceCollectionsDraftResponse {
  /** 合集列表 */
  collections: ResourceCollectionInfo[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页数量 */
  pageSize: number;
}

/**
 * 查询资源所在的单品列表（草稿）
 * @param itemResourceId 单品资源ID
 * @param params 查询参数
 * @see https://doc.freelog.com/resourceV2/%E6%9F%A5%E8%AF%A2%E8%B5%84%E6%BA%90%E6%89%80%E5%9C%A8%E7%9A%84%E5%8D%95%E5%93%81%E5%88%97%E8%A1%A8_%E8%8D%89%E7%A8%BF.html
 */
export async function getResourceCollectionsDraft(
  itemResourceId: string,
  params?: GetResourceCollectionsDraftParams
): Promise<GetResourceCollectionsDraftResponse> {
  return freelogRequest.get<GetResourceCollectionsDraftResponse>(
    `/v2/resources/catalogues/drafts/items/${itemResourceId}/collections`,
    { params }
  );
}

/**
 * 授权排除项（草稿）
 */
export interface AuthExcludedItemDraft {
  /** 受影响的资源ID（必选） */
  resourceId: string;
  /** 排除类型：contractId(以合约ID作为排除属性), policyId(以策略ID作为排除属性) */
  excludedType: "contractId" | "policyId";
  /** 具体的排除值（必选），例如合约ID或者策略ID */
  excludedValue: string;
}

/**
 * 批量修改单品授权排除项（草稿）请求体
 */
export interface BatchUpdateItemAuthExcludedItemsBody {
  /** 单品ID */
  itemId: string;
  /** 授权排除项列表 */
  excludedItems: AuthExcludedItemDraft[];
}

/**
 * 批量修改单品授权排除项（草稿）
 * @param resourceId 合集资源ID
 * @param body 批量修改请求体
 * @see https://doc.freelog.com/resourceV2/%E6%89%B9%E9%87%8F%E4%BF%AE%E6%94%B9%E5%8D%95%E5%93%81%E6%8E%88%E6%9D%83%E6%8E%92%E9%99%A4%E9%A1%B9_%E8%8D%89%E7%A8%BF.html
 */
export async function batchUpdateItemAuthExcludedItemsDraft(
  resourceId: string,
  body: BatchUpdateItemAuthExcludedItemsBody
): Promise<boolean> {
  return freelogRequest.put<boolean>(
    `/v2/resources/catalogues/drafts/${resourceId}/items/auth/excluded-items`,
    body
  );
}

