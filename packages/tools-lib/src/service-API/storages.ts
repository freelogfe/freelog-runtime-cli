import FUtil from '../utils';
import {AxiosRequestConfig, Canceler} from 'axios';
import { getPlatform } from '../platform/runtime';

type UploadBody = Blob | ArrayBuffer | ArrayBufferView;

function createFormData(params: Record<string, unknown>): FormData {
  const createPlatformFormData = getPlatform().createFormData;
  if (createPlatformFormData) return createPlatformFormData(params);
  const formData = new FormData();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, value as string | Blob);
    }
  }
  return formData;
}

// 创建bucket(系统级的bucket不允许创建)
export interface CreateBucketParamsType {
  bucketName: string;
}

export function createBucket(params: CreateBucketParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/storages/buckets`,
    data: params,
  });
}

// 查看用户的bucket列表
interface BucketListParamsType {
  bucketType: 0 | 1 | 2;
}

export function bucketList(params: BucketListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/buckets`,
    params: params,
  });
}

// 查询bucket使用情况
interface SpaceStatisticsParamsType {
}

export function spaceStatistics(params: SpaceStatisticsParamsType = {}) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/buckets/spaceStatistics`,
    params: params,
  });
}

// 删除bucket
interface DeleteBucketParamsType {
  bucketName: string;
}

export function deleteBucket(params: DeleteBucketParamsType) {
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/storages/buckets/${params.bucketName}`,
    // params: params,
  });
}

// 查询bucket详情
interface BucketDetailsParamsType {
  bucketName: string;
}

export function bucketDetails({bucketName}: BucketDetailsParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/buckets/${bucketName}`,
    // params: params,
  });
}

// 分页查看存储对象列表
interface ObjectListParamsType {
  limit?: number;
  skip?: number;
  bucketName: string;
  resourceType?: string;
  resourceTypeCode?: string;
  isLoadingTypeless?: 0 | 1;
  keywords?: string;
  projection?: string;
  sort?: string;
  omitResourceType?: string;
  mime?: string;
  extNames?: string;
}

export function objectList({bucketName, ...params}: ObjectListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/buckets/${bucketName}/objects`,
    params: params,
  });
}

// 分页查看用户节点数据列表
interface UserNodeDataListParamsType {
  skip?: number;
  limit?: number;
}

export function userNodeDataList(params: UserNodeDataListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/buckets/.UserNodeData/objects`,
    params: params,
  });
}

// 创建存储对象
interface CreateObjectParamsType {
  bucketName: string;
  objectName: string;
  sha1: string;
  resourceType?: string;
}

export function createObject({bucketName, ...params}: CreateObjectParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/storages/buckets/${bucketName}/objects`,
    data: params,
  });
}

// 查看存储对象详情
interface ObjectDetailsParamsType1 {
  bucketName: string;
  objectId: string;
}

interface ObjectDetailsParamsType2 {
  objectIdOrName: string;
}

export function objectDetails(params: ObjectDetailsParamsType1 | ObjectDetailsParamsType2) {
  if ((params as ObjectDetailsParamsType2).objectIdOrName) {
    return FUtil.Request({
      method: 'GET',
      url: `/v2/storages/objects/${encodeURIComponent((params as ObjectDetailsParamsType2).objectIdOrName)}`,
      params: params,
    });
  }
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/buckets/${(params as ObjectDetailsParamsType1).bucketName}/objects/${(params as ObjectDetailsParamsType1).objectId}`,
    params: params,
  });
}

// 删除存储对象
interface DeleteObjectsParamsType {
  bucketName: string;
  objectIds: string;
}

export function deleteObjects(params: DeleteObjectsParamsType) {
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/storages/buckets/${params.bucketName}/objects/${params.objectIds}`,
    // data: params,
  });
}

// 查询bucket是否存在
interface BucketIsExistParamsType {
  bucketName: string;
}

export function bucketIsExist({bucketName}: BucketIsExistParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/buckets/${bucketName}/isExist`,
    // params: params,
  });
}

// 下载存储对象文件
interface DownloadObjectParamsType {
  objectIdOrName: string;
}

export function downloadObject(params: DownloadObjectParamsType) {
  const url = FUtil.Format.completeUrlByDomain('api') + `/v2/storages/objects/${params.objectIdOrName}/file`;
  const openUrl = getPlatform().openUrl;
  if (openUrl) {
    openUrl(url);
    return;
  }
  return url;
}

// 根据sha1查询文件是否存在
interface FileIsExistParamsType {
  sha1: string;
}

export function fileIsExist(params: FileIsExistParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/files/fileIsExist`,
    params: params,
  });
}

// 上传资源文件
interface UploadFileParamsType {
  file: UploadBody;
  resourceType?: string;
}

export function uploadFile(params: UploadFileParamsType, config?: AxiosRequestConfig, returnCancel: boolean = false): Promise<any> | [Promise<any>, Canceler] {
  const formData = createFormData(params as unknown as Record<string, unknown>);

  if (!returnCancel) {
    // return FUtil.Axios.post('/v2/storages/files/upload', formData, config);
    return FUtil.Request({
      method: 'POST',
      url: `/v2/storages/files/upload`,
      data: formData,
      ...config,
    });
  }

  let cancel: any = null;
  // const promise = FUtil.Axios.post('/v2/storages/files/upload', formData, {
  //   cancelToken: new FUtil.Axios.CancelToken((c) => {
  //     cancel = c;
  //   }),
  // });

  const promise = FUtil.Request({
    method: 'POST',
    url: `/v2/storages/files/upload`,
    data: formData,
    cancelToken: new (FUtil.Axios as any).CancelToken((c: Canceler) => {
      cancel = c;
    }),
    ...config,
  });
  return [
    promise,
    cancel,
  ];

}

// 上传图片文件
interface UploadImageParamsType {
  file: UploadBody;
}

export function uploadImage(params: UploadImageParamsType, config?: AxiosRequestConfig) {
  const formData = createFormData(params as unknown as Record<string, unknown>);
  return FUtil.Request({
    method: 'POST',
    url: `/v2/storages/files/uploadImage`,
    data: formData,
    ...config,
  });
}

// 处理图片文件
interface HandleImageParamsType {
  sha1: string;
}

export function handleImage(params: HandleImageParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/storages/files/imageHandle`,
    data: params,
  });
}

// 生成封面
interface GenerateCoverImageParamsType {
  sha1: string;
}

export function generateCoverImage(params: GenerateCoverImageParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/storages/files/generateCoverImage`,
    data: params,
  });
}

// 更新存储对象属性
interface UpdateObjectParamsType {
  objectIdOrName: string;
  customPropertyDescriptors?: {
    key: string;
    defaultValue: string;
    type: 'editableText' | 'readonlyText' | 'radio' | 'checkbox' | 'select';
    candidateItems?: string[];
    remark?: string;
  }[];
  dependencies?: {
    name: string;
    type: string;
    versionRange?: string;
  }[];
  // resourceType?: string[];
  resourceTypeCode?: string;
  resourceTypeName?: string;
}

export function updateObject({objectIdOrName, ...params}: UpdateObjectParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/storages/objects/${objectIdOrName}`,
    data: params,
  });
}

// 批量更新存储对象
interface BatchUpdateObjectParamsType {
  objectIds: string[];
  resourceTypeCode: string;
  resourceTypeName?: string;
}

export function batchUpdateObject({...params}: BatchUpdateObjectParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/storages/objects/updateBatch`,
    data: params,
  });
}

// 批量查询存储对象列表
interface BatchObjectListParamsType {
  fullObjectNames?: string;
  objectIds?: string;
  projection?: string;
}

export function batchObjectList(params: BatchObjectListParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/objects/list`,
    params: params,
  });
}

// 根据sha1和类型获取文件属性
interface FilePropertyParamsType {
  sha1: string;
  // resourceType: string;
}

export function fileProperty({sha1, ...params}: FilePropertyParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/files/${sha1}/property`,
    params: params,
  });
}

// 对象依赖循环性检查
interface CycleDependencyCheckParamsType {
  objectIdOrName: string;
  dependencies: {
    name: string;
    type: 'resource' | 'object';
    versionRange?: string;
  }[];
}

export function cycleDependencyCheck({objectIdOrName, ...params}: CycleDependencyCheckParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/storages/objects/${objectIdOrName}/cycleDependencyCheck`,
    data: params,
  });
}

// 删除用户节点数据对象(清理节点数据)
interface ClearUserNodeDataParamsType {
  nodeIds?: number[];
  nodeDomains?: string[];
}

export function clearUserNodeData({...params}: ClearUserNodeDataParamsType) {
  return FUtil.Request({
    method: 'DELETE',
    url: `/v2/storages/buckets/.UserNodeData/objects/clear`,
    data: params,
  });
}

// 批量查询文件信息通过sha1
interface FilesListInfoParamsType {
  sha1: string;
  resourceTypeCode: string;
}

export function filesListInfo({...params}: FilesListInfoParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/files/list/info`,
    params: params,
  });
}

// 批量查询文件信息
interface FilesInfoParamsType {
  resourceTypeCode: string;
}

export function filesInfo({...params}: FilesInfoParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/storages/files/info`,
    params: params,
  });
}
