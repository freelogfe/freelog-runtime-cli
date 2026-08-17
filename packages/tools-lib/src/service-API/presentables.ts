import FUtil from '../utils';

// 创建展品
export interface CreatePresentableParamsType {
  nodeId: number;
  resourceId: string;
  version: string;
  // resolveResources: {
  //   resourceId: string;
  //   contracts: {
  //     policyId: string;
  //   }[];
  // }[];
  batchSignContracts?: {
    resourceId: string;
    subjectType: number;
    policyIds: string[];
  }[];
  presentableName: string;
  presentableTitle?: string;
  tags?: string[];
  policies?: {
    policyName: string;
    policyText: string;
    status?: 0 | 1;
  }[];
  autoUpdateStatus?: 0 | 1; // 自动更新状态 0:关闭 1:开启
}

export function createPresentable(params: CreatePresentableParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/presentables`,
    data: params,
  });
}

// 更新展品
interface UpdatePresentableParamsType {
  presentableId: string;
  presentableTitle?: string;
  presentableIntro?: string;
  tags?: string[];
  coverImages?: string[];
  addPolicies?: {
    policyName: string;
    policyText: string;
    status?: 0 | 1;
  }[];
  updatePolicies?: {
    policyId: string;
    status: 0 | 1;
  }[];
  resolveResources?: {
    resourceId: string;
    contracts: {
      policyId: string;
    }[];
  }[];
  autoUpdateStatus?: 0 | 1;
}

export function updatePresentable({
  presentableId,
  ...params
}: UpdatePresentableParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/${presentableId}`,
    data: params,
  });
}

// 上下线presentable
interface PresentablesOnlineParamsType {
  presentableId: string;
  onlineStatus: 0 | 1;
  updatePolicies?: {
    policyId: string;
    status: 0 | 1;
  };
}

export function presentablesOnlineStatus({
  presentableId,
  ...params
}: PresentablesOnlineParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/${presentableId}/onlineStatus`,
    data: params,
  });
}

// 查看展品详情
interface PresentableDetailsParamsType1 {
  presentableId: string;
  projection?: string;
  isLoadVersionProperty?: 0 | 1;
  isLoadPolicyInfo?: 0 | 1;
  isTranslate?: 0 | 1;
  isLoadCustomPropertyDescriptors?: 0 | 1;
  isLoadResourceDetailInfo?: 0 | 1;
  isLoadResourceVersionInfo?: 0 | 1;
  isLoadAuthContract?: 0 | 1;
  isLoadDependencyTree?: 0 | 1;
}

interface PresentableDetailsParamsType2 {
  nodeId: number;
  resourceId?: string;
  resourceName?: string;
  presentableName?: string;
  projection?: string;
  isLoadVersionProperty?: 0 | 1;
  isLoadPolicyInfo?: 0 | 1;
  isTranslate?: 0 | 1;
  isLoadCustomPropertyDescriptors?: 0 | 1;
  isLoadResourceDetailInfo?: 0 | 1;
  isLoadResourceVersionInfo?: 0 | 1;
  isLoadAuthContract?: 0 | 1;
  isLoadDependencyTree?: 0 | 1;
}

export function presentableDetails(
  params: PresentableDetailsParamsType1 | PresentableDetailsParamsType2
) {
  if ((params as PresentableDetailsParamsType2).nodeId) {
    return FUtil.Request({
      method: 'GET',
      url: `/v2/presentables/detail`,
      params: params,
    });
  }
  const { presentableId, ...p } = params as PresentableDetailsParamsType1;
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/${presentableId}`,
    params: p,
  });
}

// 查询展品分页列表
interface PresentablesParamsType {
  nodeId: number;
  skip?: number;
  limit?: number;
  resourceType?: string;
  resourceTypeCode?: string;
  omitResourceType?: string;
  onlineStatus?: number;
  tags?: string;
  projection?: string;
  keywords?: string;
  isLoadVersionProperty?: 0 | 1;
  isLoadPolicyInfo?: 0 | 1;
  isLoadResourceDetailInfo?: 0 | 1;
  isLoadVersionUpdateTip?: 0 | 1;
  subjectType?: 1 | 4 | 5;
}

export function presentables(params: PresentablesParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables`,
    params: params,
  });
}

// 批量查询展品列表
interface PresentableListParamsType {
  nodeId?: number;
  userId?: number;
  presentableIds?: string;
  resourceIds?: string;
  resourceNames?: string;
  isLoadVersionProperty?: 0 | 1;
  isLoadPolicyInfo?: 0 | 1;
  isTranslate?: 0 | 1;
  projection?: string;
  resolveResourceIds?: string;
}

export function presentableList(params: PresentableListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/list`,
    params: params,
  });
}

// 查看展品依赖树
interface DependencyTreeParamsType {
  presentableId: string;
  maxDeep?: number;
  nid?: string;
  isContainRootNode?: boolean;
  version?: string;
}

export function dependencyTree({
  presentableId,
  ...params
}: DependencyTreeParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/${presentableId}/dependencyTree`,
    params: params,
  });
}

// 查看展品关系树
interface RelationTreeParamsType {
  presentableId: string;
  version?: string;
}

export function relationTree({
  presentableId,
  ...params
}: RelationTreeParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/${presentableId}/relationTree`,
    params: params,
  });
}

// 查看展品授权树
interface AuthTreeParamsType {
  presentableId: string;
  maxDeep?: number;
  nid?: string;
  isContainRootNode?: boolean;
  version?: string;
}

export function authTree({ presentableId, ...params }: AuthTreeParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/${presentableId}/authTree`,
    params: params,
  });
}

// 切换展品版本
interface PresentablesVersionParamsType {
  presentableId: string;
  version: string;
}

export function presentablesVersion({
  presentableId,
  ...params
}: PresentablesVersionParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/${presentableId}/version`,
    data: params,
  });
}

// 设置展品自定义属性
interface UpdateRewritePropertyParamsType {
  presentableId: string;
  rewriteProperty: {
    key: string;
    value: string;
    remark: string;
  }[];
}

export function updateRewriteProperty({
  presentableId,
  ...params
}: UpdateRewritePropertyParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/${presentableId}/rewriteProperty`,
    data: params,
  });
}

// 设置主题展品依赖的插件属性（依赖项 nid 维度）
export interface UpdatePresentableDependencyRewritePropertyParamsType {
  presentableId: string;
  nid: string;
  rewriteProperty: {
    key: string;
    value: string;
    remark: string;
    name: string;
  }[];
}

export function updatePresentableDependencyRewriteProperty({
  presentableId,
  nid,
  ...params
}: UpdatePresentableDependencyRewritePropertyParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/${presentableId}/${nid}/dependencyRewriteProperty`,
    data: params,
  });
}

// 批量获取展品授权结果
interface BatchAuthParamsType {
  nodeId: number;
  authType: 1 | 2 | 3; // 1:节点侧授权 2:资源侧授权 3:节点+资源侧授权
  presentableIds: string;
}

export function batchAuth({ nodeId, ...params }: BatchAuthParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/auths/presentables/nodes/${nodeId}/batchAuth/result`,
    params: params,
  });
}

// 查看合约应用的展品列表
interface ContractAppliedPresentableParamsType {
  nodeId: number;
  contractIds: string;
}

export function contractAppliedPresentable({
  nodeId,
  ...params
}: ContractAppliedPresentableParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/${nodeId}/contractAppliedPresentable`,
    params: params,
  });
}

// 一键批量创建展品
export interface BatchCreatePresentableParamsType {
  nodeId: number;
  resources: {
    resourceId: string;
    policyId?: string;
  }[];
}

export function batchCreatePresentable(
  params: BatchCreatePresentableParamsType
) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/presentables/createPresentableBatchEasy`,
    data: params,
  });
}

// 批量更新展品
interface BatchUpdatePresentableParamsType {
  presentableIds: string[];
  addPolicies: {
    policyName: string;
    policyText: string;
    status?: 0 | 1;
  }[];
}

export function batchUpdatePresentable({
  ...params
}: BatchUpdatePresentableParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/updatePresentableBatch`,
    data: params,
  });
}

// 批量切换展品上下线状态
interface BatchUpdatePresentableStatusParamsType {
  presentableIds: string[];
  onlineStatus: 0 | 1;
}

export function batchUpdatePresentableStatus({
  ...params
}: BatchUpdatePresentableStatusParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/updatePresentableOnlineStatusBatch`,
    data: params,
  });
}

// 忽略展品更新提醒
interface IgnorePresentableVersionUpdateTipParamsType {
  presentableId: string;
  ignoreVersion: string;
}

export function ignorePresentableVersionUpdateTip({
  presentableId,
  ...params
}: IgnorePresentableVersionUpdateTipParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/presentables/${presentableId}/ignorePresentableVersionUpdateTip`,
    data: params,
  });
}

// 创建展品合集
interface CreatePresentableCollectionParamsType {
  nodeId: number;
  presentableName: string;
  presentableTitle?: string;
  policies?: {
    policyName: string;
    policyText: string;
    status: 0 | 1;
  }[];
  tags?: string[];
  coverImages?: string[];
  resourceTypeCode?: string;
}

export function createPresentableCollection({
  ...params
}: CreatePresentableCollectionParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/presentables/catalogues`,
    data: params,
  });
}

// 更新展品合集
interface UpdatePresentableCollectionParamsType {
  presentableId: string;
  catalogueProperty?: {
    collection_sort_list:
      | 'collection_sort_ascending'
      | 'collection_sort_descending';
  };
}

export function updatePresentableCollection({
  presentableId,
  ...params
}: UpdatePresentableCollectionParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/catalogues/${presentableId}`,
    data: params,
  });
}

// 批量为展品合集添加单品
interface AddItemsToPresentableCollectionParamsType {
  presentableId: string;
  addCollectionItems: {
    presentableId: string;
  }[];
}

export function addItemsToPresentableCollection({
  presentableId,
  ...params
}: AddItemsToPresentableCollectionParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/presentables/catalogues/${presentableId}/items`,
    data: params,
  });
}

// 批量从展品合集中移除单品
interface RemoveItemsFromPresentableCollectionParamsType {
  presentableId: string;
  removeIds: string;
  idType?: 'resourceId' | 'presentableId' | 'itemId';
}

export function removeItemsFromPresentableCollection({
  presentableId,
  ...params
}: RemoveItemsFromPresentableCollectionParamsType) {
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/presentables/catalogues/${presentableId}/items`,
    params: params,
  });
}

// 查询展品合集中的单品分页列表
interface GetItemsFromPresentableCollectionParamsType {
  presentableId: string;
  isLoadLatestVersionInfo?: 0 | 1;
  skip?: number;
  limit?: number;
  keywords?: string;
  sortField?: 'createDate' | 'sortId';
  sortType?: -1 | 1;
}

export function getItemsFromPresentableCollection({
  presentableId,
  ...params
}: GetItemsFromPresentableCollectionParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/catalogues/${presentableId}/items`,
    params: params,
  });
}

// 查询展品合集中的是否存在指定单品
interface GetItemsFromPresentableCollectionIsExistParamsType {
  presentableId: string;
  mountIds: string;
  idType?: 'resourceId' | 'presentableId';
}

export function getItemsFromPresentableCollectionIsExist({
  presentableId,
  ...params
}: GetItemsFromPresentableCollectionIsExistParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/catalogues/${presentableId}/items/checkExists`,
    params: params,
  });
}

// 设置展品合集中的单品排序-手动排序
interface SetItemsSortFromPresentableCollectionManualParamsType {
  presentableId: string;
  itemIds: string[];
  targetSortId: number;
}

export function setItemsSortFromPresentableCollectionManual({
  presentableId,
  ...params
}: SetItemsSortFromPresentableCollectionManualParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/catalogues/${presentableId}/manualSort`,
    data: params,
  });
}

// 设置展品合集中的单品排序-快速排序
interface SetItemsSortFromPresentableCollectionQuickParamsType {
  presentableId: string;
  sortField:
    | 'createDate'
    | 'itemTitle'
    | 'sortId'
    | 'resourceFirstVersionReleaseDate';
  sortType: 1 | -1;
}

export function setItemsSortFromPresentableCollectionQuick({
  presentableId,
  ...params
}: SetItemsSortFromPresentableCollectionQuickParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/presentables/catalogues/${presentableId}/reorder`,
    data: params,
  });
}

// 获取合集单品自动收录规则
interface GetItemsAutoCollectRuleParamsType {
  presentableId: string;
}

export function getItemsAutoCollectRule({
  presentableId,
}: // ...params
GetItemsAutoCollectRuleParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/presentables/catalogues/${presentableId}/items/collectRules`,
    // params: params,
  });
}

// 创建或更新合集单品自动收录规则
interface SetItemsAutoCollectRuleParamsType {
  presentableId: string;
  status: 0 | 1;
  conditionType: 1 | 2;
  filterConditions: {
    key: 'presentableTitle' | 'resourceTypeCode' | 'authIdentity';
    limitOperatorType:
      | 'INCLUDES'
      | 'NOT_INCLUDES'
      | 'STARTS_WITH'
      | 'ENDS_WITH'
      | 'EQUAL'
      | 'NOT_EQUAL';
    value: string;
  }[];
}

export function setItemsAutoCollectRule({
  presentableId,
  ...params
}: SetItemsAutoCollectRuleParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/presentables/catalogues/${presentableId}/items/collectRules`,
    data: params,
  });
}

// 批量查询展品合集下的单品
interface GetItemsFromPresentableCollectionsParamsType {
  presentableIds: string;
  sortType?: 1 | -1;
  sortField?: 'createDate';
  limit?: number;
}

export function getItemsFromPresentableCollections({
  ...params
}: GetItemsFromPresentableCollectionsParamsType) {
  return FUtil.Request({
    method: 'GET',
    // url: `/v2/presentables/catalogues/items/batch/list?presentableIds=685cf423e1502e002fe3053b&limit=1&sortType=-1&sortField=createDate`,
    url: `/v2/presentables/catalogues/items/batch/list`,
    params: params,
  });
}
