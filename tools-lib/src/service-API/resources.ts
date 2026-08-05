import FUtil from '../utils';
import { CommonReturn } from './tools';
import { getPlatform } from '../platform/runtime';

// interface IResourceInfo {
//   baseUpcastResources: {
//     resourceId: string;
//     resourceName: string;
//   }[],
//   coverImages: string[],
//   createDate: string;
//   intro: string;
//   latestVersion: string;
//   policies: {
//     policyId: string;
//     policyName: string;
//     status: 0 | 1;
//   }[];
//   resourceId: string;
//   resourceName: string;
//   resourceTitle: string;
//   resourceType: string[];
//   resourceVersions: {
//     createDate: string;
//     version: string;
//     versionId: string;
//   }[];
//   status: 0 | 1 | 2 | 4; // 0:待发行(初始状态) 1:上架 2:冻结 4:下架(也叫待上架)
//   tags: string[];
//   updateDate: string;
//   userId: number;
//   username: string;
//   operationType: number;
// }

// 创建资源
export interface CreateParamsType {
  name: string;
  subjectType?: 1 | 4; // 标的物类型(1:普通资源 4:合集资源) 默认是1
  resourceTitle?: string;
  // resourceType: string[]
  resourceTypeCode: string;
  resourceTypeName?: string;
  policies?: {
    policyName: string;
    policyText: string;
    status?: 0 | 1;
  }[];
  coverImages?: string[];
  intro?: string;
  tags?: string[];
}

export function create(params: CreateParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources`,
    data: params,
  });
}

// 批量创建资源
export interface CreateBatchParamsType {
  resourceTypeCode: string;
  resourceTypeName?: string;
  createResourceObjects: {
    name: string;
    resourceTitle?: string;
    policies?: {
      policyName: string;
      policyText: string;
      status?: 1 | 0;
    }[];
    coverImages?: string[];
    intro?: string;
    tags?: string[];

    version: string;
    fileSha1: string;
    filename: string;
    description?: string;
    dependencies?: {
      resourceId: string;
      versionRange: string;
    }[];
    customPropertyDescriptors?: {
      key: string;
      name: string;
      defaultValue: string;
      type: 'editableText' | 'readonlyText' | 'radio' | 'checkbox' | 'select';
      candidateItems?: string[];
      remark?: string;
    }[];
    baseUpcastResources?: {
      resourceId: string;
    }[];
    batchSignContracts?: {
      resourceId: string;
      // resourceName: string;
      policyIds: string[];
      // subjectType: 'resource' | '';
      subjectType: string;
    }[];
    // resolveResources: {
    //   resourceId: string;
    //   contracts: {
    //     policyId: string;
    //   }[];
    // }[];
    inputAttrs?: {
      key: string;
      value: string;
    }[];
  }[];
}

export function createBatch(params: CreateBatchParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/createBatch`,
    data: params,
  });
}

// 更新资源信息
interface UpdateParamsType {
  resourceId: string;
  status?: 0 | 1 | 4;
  resourceTitle?: string;
  intro?: string;
  tags?: string[];
  coverImages?: string[];
  addPolicies?: {
    policyName: string;
    policyText: string;
    status?: 0 | 1; // 1:上线 0:下线
  }[];
  updatePolicies?: {
    policyId: string;
    status: 0 | 1; // 0:下线策略 1:上线策略
  }[];
}

export function update(params: UpdateParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/${params.resourceId}`,
    data: params,
  });
}

// 批量更新资源信息
interface BatchUpdateParamsType {
  resourceIds: string[];
  status?: 1 | 4;
  // resourceTitle?: string;
  // intro?: string;
  // tags?: string[];
  // coverImages?: string[];
  addPolicies?: {
    policyName: string;
    policyText: string;
    status?: 0 | 1; // 1:上线 0:下线
  }[];
  // updatePolicies?: {
  //   policyId: string;
  //   status: 0 | 1; // 0:下线策略 1:上线策略
  // }[];
}

export function batchUpdate(params: BatchUpdateParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/updateBatch`,
    data: params,
  });
}

// 查看资源分页列表
interface ListParamsType {
  skip?: number;
  limit?: number;
  keywords?: string;
  resourceType?: string;
  resourceTypeCode?: string;
  resourceTypeCategory?: 1 | 2; // 资源类型分类，1：基础类型，2：自定义类型，其实只有2时生效，生效时，resourceTypeCode为父类类型
  omitResourceType?: string;
  isSelf?: 0 | 1;
  userId?: number;
  status?: 0 | 1 | 2 | 4; // 分别是 0:待发行(初始状态) 1:上架 2:冻结 4:下架(也叫待上架)
  isLoadPolicyInfo?: 0 | 1;
  isLoadLatestVersionInfo?: 0 | 1;
  isLoadFreezeReason?: 0 | 1;
  projection?: string;
  startCreateDate?: string;
  endCreateDate?: string;
  tags?: string;
  sort?: string;
  // startResourceId?: string;
  operationCategoryCode?: string;
  operationTypes?: string;
  subjectType?: 1 | 4;
}

// interface ListReturnType extends CommonReturn {
//   data: IResourceInfo[];
// }

export function list(params: ListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources`,
    params: params,
  });
}

// 查看单个资源详情
interface InfoParamsType {
  resourceIdOrName: string;
  isLoadPolicyInfo?: 0 | 1;
  isTranslate?: 0 | 1;
  isLoadLatestVersionInfo?: 0 | 1;
  projection?: string;
  isLoadFreezeReason?: 0 | 1;
}

// interface InfoReturnType extends CommonReturn {
//   data: IResourceInfo
// }

export function info({ resourceIdOrName, ...params }: InfoParamsType) {
  // : Promise<InfoReturnType>
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${encodeURIComponent(resourceIdOrName)}`,
    params: params,
  });
}

// 批量查询资源列表
interface BatchInfoParamsType {
  resourceIds?: string;
  resourceNames?: string;
  isLoadPolicyInfo?: 0 | 1;
  isTranslate?: 0 | 1;
  isLoadLatestVersionInfo?: 0 | 1;
  projection?: string;
  isLoadFreezeReason?: 0 | 1;
}

// interface BatchInfoReturnType extends CommonReturn {
//   data: IResourceInfo[];
// }

export function batchInfo(params: BatchInfoParamsType) {
  // : Promise<BatchInfoReturnType>
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/list`,
    params: params,
  });
}

// 查看资源的依赖树
interface DependencyTreeParamsType {
  resourceId: string;
  version?: string;
  maxDeep?: string;
  omitFields?: string;
  isContainRootNode?: boolean;
}

export function dependencyTree({
  resourceId,
  ...params
}: DependencyTreeParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${resourceId}/dependencyTree`,
    params: params,
  });
}

// 查看资源的授权树
interface AuthTreeParamsType {
  resourceId: string;
  version?: string;
}

export function authTree({ resourceId, ...params }: AuthTreeParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${resourceId}/authTree`,
    params: params,
  });
}

// 创建资源版本
interface CreateVersionParamsType {
  resourceId: string;
  version: string;
  fileSha1: string;
  filename: string;
  description?: string;
  customPropertyDescriptors?: {
    key: string;
    name: string;
    defaultValue: string;
    type: 'editableText' | 'readonlyText' | 'radio' | 'checkbox' | 'select';
    candidateItems?: string[];
    remark?: string;
  }[];
  // resolveResources: {
  //   resourceId: string;
  //   contracts: {
  //     policyId: string;
  //   }[];
  // }[];
  inputAttrs?: {
    key: string;
    value: string;
  }[];

  dependencies?: {
    resourceId: string;
    versionRange: string;
  }[];
  baseUpcastResources?: {
    resourceId: string;
  }[];
  batchSignContracts?: {
    resourceId: string;
    policyIds: string[];
  }[];
  authExcludedItems: {
    resourceId: string;
    excludedType: 'contractId' | 'policyId';
    excludedValue: string;
  }[];
}

export function createVersion({
  resourceId,
  ...params
}: CreateVersionParamsType) {
  // return FUtil.Axios.post(`/v2/resources/${resourceId}/versions`, params);
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/${resourceId}/versions`,
    data: params,
  });
}

// 查看资源版本信息
interface ResourceVersionInfo1ParamsType {
  resourceId: string;
  version: string;
  projection?: string;
}

interface ResourceVersionInfo2ParamsType {
  versionId: string;
  projection?: string;
}

export function resourceVersionInfo1({
  resourceId,
  version,
  ...params
}: ResourceVersionInfo1ParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${resourceId}/versions/${version}`,
    params: params,
  });
}

export function resourceVersionInfo2(params: ResourceVersionInfo2ParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/versions/detail`,
    params: params,
  });
}

// 查看资源版本列表
interface getVersionListByResourceIDParamsType {
  resourceId: string;
  version?: string;
  projection?: string;
  sort?: string;
}

export function getVersionListByResourceID({
  resourceId,
  ...params
}: getVersionListByResourceIDParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${resourceId}/versions`,
    params: params,
  });
}

// 批量查询资源版本列表
interface GetVersionListParamsType {
  versionIds: string;
  projection?: string;
}

export function getVersionList({ ...params }: GetVersionListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/versions/list`,
    params: params,
  });
}

// 根据sha1查询版本列表 (查询文件对象所挂载的资源及版本)
interface GetResourceVersionBySha1ParamsType {
  fileSha1: string;
  projection?: string;
}

export function getResourceVersionBySha1({
  fileSha1,
  ...params
}: GetResourceVersionBySha1ParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/files/${fileSha1}/versions`,
    params: params,
  });
}

// 根据sha1查询资源列表 (查询文件对象所挂载的资源)
interface GetResourceBySha1ParamsType {
  fileSha1: string;
  projection?: string;
}

export function getResourceBySha1({
  fileSha1,
  ...params
}: GetResourceBySha1ParamsType) {
  // return FUtil.Axios.get(`/v2/resources/files/${fileSha1}`, {
  //   params,
  // });
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/files/${fileSha1}`,
    params: params,
  });
}

// 更新资源版本信息
interface UpdateResourceVersionInfoParamsType {
  version: string;
  resourceId: string;
  description?: string;
  customPropertyDescriptors?: {
    key: string;
    name: string;
    defaultValue: string;
    type: 'editableText' | 'readonlyText' | 'radio' | 'checkbox' | 'select';
    candidateItems?: string[];
    remark?: string;
  }[];
  resolveResources?: {
    resourceId: string;
    contracts: {
      policyId: string;
    }[];
  }[];
  inputAttrs: {
    key: string;
    value: string;
  }[];
}

export function updateResourceVersionInfo(
  params: UpdateResourceVersionInfoParamsType
) {
  // return FUtil.Axios.put(`/v2/resources/${params.resourceId}/versions/${params.version}`, params);
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/${params.resourceId}/versions/${params.version}`,
    data: params,
  });
}

// 保存或者更新资源版本草稿
interface SaveVersionsDraftParamsType {
  resourceId: string;
  draftData: any;
}

export function saveVersionsDraft(params: SaveVersionsDraftParamsType) {
  // return FUtil.Axios.post(`/v2/resources/${params.resourceId}/versions/drafts`, params);
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/${params.resourceId}/versions/drafts`,
    data: params,
  });
}

// 查看资源版本草稿
interface LookDraftParamsType {
  resourceId: string;
}

export function lookDraft(params: LookDraftParamsType) {
  // return FUtil.Axios.get(`/v2/resources/${params.resourceId}/versions/drafts`);
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${params.resourceId}/versions/drafts`,
    params: params,
  });
}

// 删除资源版本草稿
interface DeleteResourceDraftParamsType {
  resourceId: string;
}

export function deleteResourceDraft({
  resourceId,
}: DeleteResourceDraftParamsType) {
  // return FUtil.Axios.post(`/v2/resources/${params.resourceId}/versions/drafts`, params);
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/resources/${resourceId}/versions/drafts`,
    // data: params,
  });
}

// 校验文件是否被引入资源
interface ResourceIsUsedByOtherParamsType {
  fileSha1: string;
}

export function resourceIsUsedByOther(params: ResourceIsUsedByOtherParamsType) {
  // return FUtil.Axios.get(`/v2/resources/versions/isCanBeCreate`, {
  //   params,
  // });
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/versions/isCanBeCreate`,
    params: params,
  });
}

// 下载资源文件
interface ResourcesDownloadParamsType {
  resourceId: string;
  version: string;
}

export function resourcesDownload(params: ResourcesDownloadParamsType) {
  const url =
    FUtil.Format.completeUrlByDomain('api') +
    `/v2/resources/${params.resourceId}/versions/${params.version}/download`;
  const openUrl = getPlatform().openUrl;
  if (openUrl) {
    openUrl(url);
    return;
  }
  return url;
  // return request.get(`/v2/resources/${params.resourceId}/versions/${params.$version}/download`, {
  //   responseType: 'arraybuffer',
  // });
}

// 批量查看合同覆盖的版本集
interface BatchGetCoverageVersionsParamsType {
  resourceId: string;
  contractIds: string;
}

export function batchGetCoverageVersions({
  resourceId,
  ...params
}: BatchGetCoverageVersionsParamsType) {
  // return FUtil.Axios.get(`/v2/resources/${resourceId}/contracts/coverageVersions`, {
  //   params,
  // });
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${resourceId}/contracts/coverageVersions`,
    params: params,
  });
}

// 查询资源所解决的依赖集
interface ResolveResourcesParamsType {
  resourceId: string;
}

interface CreateVersionReturnType extends CommonReturn {
  data: {
    resourceId: string;
    resourceName: string;
    versions: {
      version: string;
      versionId: string;
      contracts: {
        policyId: string;
        contractId: string;
      }[];
    }[];
  }[];
}

export function resolveResources(
  params: ResolveResourcesParamsType
): Promise<CreateVersionReturnType> {
  // return FUtil.Axios.get(`/v2/resources/${params.resourceId}/resolveResources`);
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${params.resourceId}/resolveResources`,
    // params: params,
  });
}

// 批量设置策略应用的版本
interface BatchSetContractsParamsType {
  resourceId: string;
  subjects: {
    subjectId: string;
    versions: {
      version: string;
      policyId: string;
      operation: 0 | 1;
    }[];
  }[];
}

export function batchSetContracts({
  resourceId,
  ...params
}: BatchSetContractsParamsType) {
  // return FUtil.Axios.put(`/v2/resources/${resourceId}/versions/batchSetContracts`, params);
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/${resourceId}/versions/batchSetContracts`,
    data: params,
  });
}

// 资源依赖循环性检查
interface CycleDependencyCheckParamsType {
  resourceId: string;
  dependencies: {
    resourceId: string;
    versionRange: string;
  }[];
}

export function cycleDependencyCheck({
  resourceId,
  ...params
}: CycleDependencyCheckParamsType) {
  // return FUtil.Axios.post(`/v2/resources/${resourceId}/versions/cycleDependencyCheck`, params);
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/${resourceId}/versions/cycleDependencyCheck`,
    data: params,
  });
}

// 查看资源关系树
interface RelationTreeParamsType {
  resourceId: string;
  version?: string;
  versionRange?: string;
}

export function relationTree({
  resourceId,
  ...params
}: RelationTreeParamsType) {
  // return FUtil.Axios.get(`/v2/resources/${resourceId}/relationTree`, {
  //   params,
  // });
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/${resourceId}/relationTree`,
    params: params,
  });
}

// 查看含授权的资源关系树
interface RelationTreeAuthParamsType {
  resourceId: string;
  version?: string;
  versionRange?: string;
}

export function relationTreeAuth({
  resourceId,
  ...params
}: RelationTreeAuthParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/auths/resources/${resourceId}/relationTreeAuth`,
    params: params,
  });
}

// 查看资源创建数量
interface ResourcesCountParamsType {
  userIds: string;
  status?: 0 | 1 | 2 | 3; // 0:下架 1:上架 2:冻结(冻结时处于下架状态) 3:冻结(冻结时处于上架状态)
}

export function resourcesCount({ ...params }: ResourcesCountParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/count`,
    params: params,
  });
}

// 批量查询资源授权结果
interface BatchAuthParamsType {
  resourceIds: string;
  versions?: string;
  versionRanges?: string;
}

export function batchAuth({ ...params }: BatchAuthParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/auths/resources/batchAuth/results`,
    params: params,
  });
}

// 批量查询资源授权结果
interface ResourcesRecommendParamsType {
  recommendType: 1 | 2; // 1: 推荐主题  2:占位主题
}

export function resourcesRecommend({
  ...params
}: ResourcesRecommendParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/recommend`,
    params: params,
  });
}

// 根据资源类型查看推荐的标签
interface AvailableTagsParamsType {
  resourceTypeCode: string;
}

export function availableTags({ ...params }: AvailableTagsParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/tags/availableTags`,
    params: params,
  });
}

// 列出资源类型分组排序
interface ResourceTypesParamsType {
  codeOrName?: string;
  category?: 1 | 2; // 种类 1：基础资源类型 2：自定义资源类型
  isMine?: boolean;
  status?: 0 | 1;
  supportCreateBatch?: 1 | 2;
  subjectType?: 1 | 4 | 5;
}

export function resourceTypes({ ...params }: ResourceTypesParamsType = {}) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/types/listSimpleByGroup`,
    params: params,
  });
}

// 简单根据父类型列出资源类型
interface ListSimpleByParentCodeParamsType {
  parentCode?: string;
  name?: string;
  category?: 1 | 2; // 种类 1：基础资源类型 2：自定义资源类型
  excludeParentCode?: boolean;
  isTerminate?: boolean;
  nameChain?: string;
  subjectType?: 1 | 4 | 5;
  supportCreateBatch?: 1 | 2;
  status?: 0 | 1;
}

export function ListSimpleByParentCode({
  ...params
}: ListSimpleByParentCodeParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/types/listSimpleByParentCode`,
    params: params,
  });
}

// 根据编号取资源类型
interface GetResourceTypeInfoByCodeParamsType {
  code: string;
}

export function getResourceTypeInfoByCode({
  ...params
}: GetResourceTypeInfoByCodeParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/types/getInfoByCode`,
    params: params,
  });
}

//
interface GetResourceAttrListSimpleParamsType {}

export function getResourceAttrListSimple({
  ...params
}: GetResourceAttrListSimpleParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/attrs/listSimple`,
    params: params,
  });
}

interface ListSimple4RecentlyParamsType {}

export function listSimple4Recently({
  ...params
}: ListSimple4RecentlyParamsType = {}) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/types/listSimple4Recently`,
    params: params,
  });
}

// 通过key取资源属性
interface GetAttrsInfoByKeyParamsType {
  key: string;
}

export function getAttrsInfoByKey({ ...params }: GetAttrsInfoByKeyParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/attrs/getInfoByKey`,
    params: params,
  });
}

// 取可用的资源名称
interface GenerateResourceNamesParamsType {
  resourceNames: string[];
}

export function generateResourceNames({
  resourceNames,
}: GenerateResourceNamesParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/generateResourceNames`,
    data: {
      resourceNames,
    },
  });
}

// 更新资源合集版本
interface UpdateCollectionParamsType {
  resourceId: string;
  description?: string;
  // serializeStatus?: 0 | 1;
  customPropertyDescriptors?: {
    key: string;
    name?: string;
    defaultValue: string;
    type: 'editableText' | 'readonlyText' | 'radio' | 'checkbox' | 'select';
    candidateItems?: string[];
    remark?: string;
  }[];
  // resolveResources?: {
  //   resourceId: string;
  //   contracts: {
  //     policyId: string;
  //   }[];
  // }[];
  // optionalResolveResources?: {
  //   resourceId: string;
  //   contracts: {
  //     policyId: string;
  //   }[]
  // }[];
  // addCollectionItems?: {
  //   resourceId: string;
  //   itemTitle: string;
  // }[];
  catalogueProperty?: {
    collection_item_no_display?:
      | 'collection_item_no_display_show'
      | 'collection_item_no_display_hide';
    collection_item_image_display?:
      | 'collection_item_image_display_show'
      | 'collection_item_image_display_hide';
    collection_item_descr_display?:
      | 'collection_item_descr_display_show'
      | 'collection_item_descr_display_hide';
    collection_view?: 'collection_view_list' | 'collection_view_card';
  };
  isMergeCatalogueDraft?: 0 | 1;
  inputAttrs?: {
    key: string;
    value: string;
  }[];

  // dependencies?: {
  //   resourceId: string;
  //   versionRange: string;
  // }[];
  dependencies?: {
    resourceId: string;
    versionRange: string;
  }[];
  baseUpcastResources?: {
    resourceId: string;
  }[];
  batchSignContracts?: {
    resourceId: string;
    policyIds: string[];
  }[];
  authExcludedItems: {
    resourceId: string;
    excludedType: 'contractId' | 'policyId';
    excludedValue: string;
  }[];
}

export function updateCollection({
  resourceId,
  ...params
}: UpdateCollectionParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/catalogue/${resourceId}`,
    data: params,
  });
}

// 批量删除合集资源单品
interface deleteCollectionUnitResourcesParamsType {
  resourceId: string;
  removeCollectionItemIds: string[];
}

export function deleteCollectionUnitResource({
  resourceId,
  removeCollectionItemIds,
}: deleteCollectionUnitResourcesParamsType) {
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/resources/catalogue/${resourceId}?removeCollectionItemIds=${removeCollectionItemIds.join(
      ','
    )}`,
    // data: params,
  });
}

// 获取合集资源的单品列表
interface GetCollectionItemsParamsType {
  resourceId: string;
  skip?: number;
  limit?: number;
  sortField?: string;
  sortType?: 1 | -1;
  keywords?: string;
  isLoadLatestVersionInfo?: 0 | 1;
}

export function getCollectionItems({
  resourceId,
  ...params
}: GetCollectionItemsParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogue/${resourceId}/items`,
    params: params,
  });
}

// 获取合集资源的单品列表(草稿)
interface GetCollectionItems_Draft_ParamsType {
  resourceId: string;
  skip?: number;
  limit?: number;
  sortField?: string;
  sortType?: 1 | -1;
  keywords?: string;
  isLoadLatestVersionInfo?: 0 | 1;
}

export function getCollectionItems_Draft({
  resourceId,
  ...params
}: GetCollectionItems_Draft_ParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogues/drafts/${resourceId}/items`,
    params: params,
  });
}

// 设置合集资源的单品排序序号
interface SetCollectionItemSortParamsType {
  resourceId: string;
  itemId: string;
  targetSortId: number;
}

export function setCollectionItemSort({
  resourceId,
  ...params
}: SetCollectionItemSortParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/catalogue/${resourceId}/manualSort`,
    data: params,
  });
}

// 重置合集资源的单品排序序号
interface ReorderCollectionItemsSortParamsType {
  resourceId: string;
  sortField: string;
  sortType: 1 | -1;
}

export function reorderCollectionItemsSort({
  resourceId,
  ...params
}: ReorderCollectionItemsSortParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/catalogue/${resourceId}/reorder`,
    data: params,
  });
}

// 查看资源是否在单品目录中存在
interface CheckExistCollectionItemsParamsType {
  resourceId: string;
  resourceIds: string;
}

export function checkExistCollectionItems({
  resourceId,
  ...params
}: CheckExistCollectionItemsParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogue/${resourceId}/items/checkExists`,
    params: params,
  });
}

// 批量查询单品在资源侧的授权
interface GetCollectionItemsAuthParamsType {
  resourceId: string;
  itemIds: string;
}

export function getCollectionItemsAuth({
  resourceId,
  ...params
}: GetCollectionItemsAuthParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/auths/resources/${resourceId}/items/batchAuth`,
    params: params,
  });
}

// 批量分组获取合集资源的单品列表
interface BatchResourceItemsParamsType {
  resourceIds: string;
  limit?: number;
  sortField?: string;
  sortType?: 1 | -1;
  isLoadItemResourceDetailInfo?: 0 | 1;
  isLoadLatestVersionInfo?: 0 | 1;
}

export function batchResourceItems({
  ...params
}: BatchResourceItemsParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogue/items/batch/list`,
    params: params,
  });
}

// 批量分组获取合集资源的单品列表(草稿)
interface BatchResourceItems_Draft_ParamsType {
  resourceIds: string;
  limit?: number;
  sortField?: string;
  sortType?: 1 | -1;
  isLoadItemResourceDetailInfo?: 0 | 1;
}

export function batchResourceItems_Draft({
  ...params
}: BatchResourceItems_Draft_ParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogues/drafts/items/batch/list`,
    params: params,
  });
}

// 查看合集更新日志分页列表
interface GetCollectionUpdateLogsParamsType {
  resourceId: string;
  skip?: number;
  limit?: number;
  sortType?: 1 | -1;
}

export function getCollectionUpdateLogs({
  resourceId,
  ...params
}: GetCollectionUpdateLogsParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogue/${resourceId}/updateLogs`,
    params: params,
  });
}

// 获取合集单品自动收录规则
interface GetCollectionCollectRulesParamsType {
  resourceId: string;
}

export function getCollectionCollectRules({
  resourceId,
}: GetCollectionCollectRulesParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogue/${resourceId}/items/collectRules`,
    // params: params,
  });
}

// 创建或更新合集单品自动收录规则
interface SetCollectRulesParamsType {
  resourceId: string;
  serializeStatus?: 0 | 1;
  status: 0 | 1;
  conditionType: 1 | 2;
  filterConditions: {
    key: 'resourceTitle' | 'resourceTypeCode' | 'authIdentity';
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

export function setCollectRules({
  resourceId,
  ...params
}: SetCollectRulesParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/catalogue/${resourceId}/items/collectRules`,
    data: params,
  });
}

// 批量更新同合集下的单品信息
interface SetItemsTitleParamsType {
  resourceId: string;
  data: {
    itemId: string;
    itemTitle?: string;
    authExcludedItems?: {
      resourceId: string;
      excludedType: 'contractId' | 'policyId';
      excludedValue: string;
    }[];
  }[];
}

export function setItemsTitle({ resourceId, data }: SetItemsTitleParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/catalogue/${resourceId}/items`,
    data: data,
  });
}

// 批量删除合集资源单品(草稿)
interface deleteCollectionItems_Draft_ParamsType {
  resourceId: string;
  removeCollectionItemIds: string[];
}

export function deleteCollectionItems_Draft({
  resourceId,
  removeCollectionItemIds,
}: deleteCollectionItems_Draft_ParamsType) {
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/resources/catalogues/drafts/${resourceId}/items?removeCollectionItemIds=${removeCollectionItemIds.join(
      ','
    )}`,
    // data: params,
  });
}

// 设置合集资源的单品排序序号(草稿)
interface SetCollectionItemsSortID_Draft_ParamsType {
  resourceId: string;
  data: {
    itemIds: string[];
    targetSortId: number;
  };
}

export function setCollectionItemsSortID_Draft({
  resourceId,
  data,
}: SetCollectionItemsSortID_Draft_ParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/catalogues/drafts/${resourceId}/manualSort`,
    data: data,
  });
}

// 重置合集资源的单品排序序号(草稿)
interface ReorderCollectionItems_Draft_ParamsType {
  resourceId: string;
  sortField: 'createDate' | 'itemTitle' | 'sortId' | 'resourceUpdateDate';
  sortType: -1 | 1;
}

export function reorderCollectionItems_Draft({
  resourceId,
  ...params
}: ReorderCollectionItems_Draft_ParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/resources/catalogues/drafts/${resourceId}/reorder`,
    data: params,
  });
}

// 查看资源是否在单品目录中存在(草稿)
interface ResourceIsExistInItems_Draft_ParamsType {
  resourceId: string;
  resourceIds: string;
}

export function resourceIsExistInItems_Draft({
  resourceId,
  ...params
}: ResourceIsExistInItems_Draft_ParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogues/drafts/${resourceId}/items/checkExists`,
    params: params,
  });
}

// 批量更新同合集下的单品信息(草稿)
interface UpdateCollectionItemsInfo_Draft_ParamsType {
  resourceId: string;
  data: {
    itemId: string;
    itemTitle: string;
  }[];
}

export function updateCollectionItemsInfo_Draft({
  resourceId,
  data,
}: UpdateCollectionItemsInfo_Draft_ParamsType) {
  return FUtil.Request({
    method: 'PUT',
    // url: `/v2/resources/catalogue/${resourceId}/items`,
    url: `/v2/resources/catalogues/drafts/${resourceId}/items`,
    data: data,
  });
}

// 更新单品授权方案(草稿)
interface UpdateCollectionItemAuthorization_Draft_ParamsType {
  resourceId: string;
  itemId: string;
  // resolveResources: {
  //   resourceId: string;
  //   contracts: {
  //     policyId: string;
  //   }[];
  // }[];
}

export function updateCollectionItemAuthorization_Draft({
  resourceId,
  itemId,
  ...data
}: UpdateCollectionItemAuthorization_Draft_ParamsType) {
  return FUtil.Request({
    method: 'PUT',
    // url: `/v2/resources/catalogues/${resourceId}/items/${itemId}`,
    url: `/v2/resources/catalogues/drafts/${resourceId}/items/${itemId}`,
    data: data,
  });
}

// 批量新增合集资源单品(草稿)
interface AddResourceItems_Draft_ParamsType {
  resourceId: string;
  addCollectionItems: {
    resourceId: string;
    itemTitle?: string;
    // resolveResources?: {
    //   resourceId: string;
    //   contracts: {
    //     policyId: string;
    //   }[];
    // }[];
    authExcludedItems?: {
      resourceId: string;
      excludedType: 'contractId' | 'policyId';
      excludedValue: string;
    }[];
    batchSignContracts?: {
      resourceId: string;
      policyIds: string[];
    }[];
  }[];
  isPublish?: 1 | 0;
}

export function addResourceItems_Draft({
  resourceId,
  ...params
}: AddResourceItems_Draft_ParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/catalogues/drafts/${resourceId}/items`,
    data: params,
  });
}

// 批量查询草稿中的单品在资源侧的授权
interface GetCollectionItemsAuth_Draft_ParamsType {
  resourceId: string;
  itemIds: string;
}

export function getCollectionItemsAuth_Draft({
  resourceId,
  ...params
}: GetCollectionItemsAuth_Draft_ParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/resources/catalogues/drafts/${resourceId}/items/batchAuth`,
    params: params,
  });
}

// 为资源绑定 RSS 订阅源（需邮箱验证码）
export interface BindRssFeedParamsType {
  resourceId: string;
  feedUrl: string;
  verificationCode: string;
  pubStartDate?: string;
  pubEndDate?: string;
}

export function bindRssFeed({ resourceId, ...params }: BindRssFeedParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/rss/${resourceId}/bindFeed`,
    data: params,
  });
}
