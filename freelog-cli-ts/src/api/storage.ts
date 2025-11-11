/**
 * 存储相关 API
 */

import { freelogRequest } from "../core/http";
import FormData from 'form-data';
import fs from 'fs-extra';

/**
 * 文件上传响应
 */
export interface FileUploadResponse {
  /** 存储对象的 SHA1 值 */
  sha1: string;
  
  /** 文件大小（字节） */
  fileSize: number;
}

/**
 * 文件存在性检查响应
 */
export interface FileExistResponse {
  /** 文件是否存在 */
  isExists: boolean;
  
  /** 文件 SHA1 */
  sha1?: string;
  
  /** 文件大小 */
  fileSize?: number;
}

/**
 * 上传资源文件
 * 
 * @param filePath 文件路径
 * @param resourceTypeCode 资源类型代码（可选，传入则会进行文件校验检查）
 * @param extParams base64编码的额外扩展参数（可选）
 * @returns 上传结果
 * 
 * @see https://doc.freelog.com/storage/%E4%B8%8A%E4%BC%A0%E8%B5%84%E6%BA%90%E6%96%87%E4%BB%B6.html
 */
export async function uploadFile(
  filePath: string,
  resourceTypeCode?: string,
  extParams?: string
): Promise<FileUploadResponse> {
  // 创建 FormData
  const formData = new FormData();
  
  // 添加文件
  const fileStream = fs.createReadStream(filePath);
  formData.append('file', fileStream);
  
  // 添加可选参数
  if (resourceTypeCode) {
    formData.append('resourceTypeCode', resourceTypeCode);
  }
  if (extParams) {
    formData.append('extParams', extParams);
  }
  
  // 上传文件
  return freelogRequest.post('/v2/storages/files/upload', formData, {
    headers: formData.getHeaders(),
  });
}

/**
 * 根据 SHA1 查询文件是否存在（批量）
 * 
 * @param sha1 文件的 SHA1 值，多个用逗号分隔
 * @returns 文件存在性信息数组
 * 
 * @see https://doc.freelog.com/storage/%E6%A0%B9%E6%8D%AEsha1%E6%9F%A5%E8%AF%A2%E6%96%87%E4%BB%B6%E6%98%AF%E5%90%A6%E5%AD%98%E5%9C%A8.html
 */
export async function checkFileExists(sha1: string): Promise<Array<{
  sha1: string;
  isExisting: boolean;
}>> {
  return freelogRequest.get('/v2/storages/files/fileIsExist', {
    params: { sha1 }
  });
}

/**
 * 根据 SHA1 查询资源列表（查询文件对象所挂载的资源）
 * 
 * @param fileSha1 文件 SHA1 值
 * @param projection 过滤需要返回的字段，多个用逗号分隔，默认全部
 * @returns 资源列表
 * 
 * @see https://doc.freelog.com/resourceV2/%E6%A0%B9%E6%8D%AEsha1%E6%9F%A5%E8%AF%A2%E8%B5%84%E6%BA%90%E5%88%97%E8%A1%A8.html
 */
export interface ResourceByFileResponse {
  resourceId: string;
  resourceName: string;
  resourceType: string;
  userId: number;
  username: string;
  coverImages: string[];
  intro: string;
  tags: string[];
  latestVersion: string;
  resourceVersions: Array<{
    version: string;
    versionId: string;
    createDate: string;
  }>;
  policies: any[];
  baseUpcastResources: Array<{
    resourceId: string;
    resourceName: string;
  }>;
  status: number;
  createDate: string;
  updateDate: string;
}

export async function getResourcesByFileSha1(
  fileSha1: string,
  projection?: string
): Promise<ResourceByFileResponse[]> {
  return freelogRequest.get(`/v2/resources/files/${fileSha1}`, {
    params: projection ? { projection } : undefined
  });
}

