/**
 * 资源版本更新相关 API
 */

import { freelogRequest } from "../core/http";
import type {
  CreateResourceVersionBody,
  SaveResourceVersionDraftBody,
} from "./dataType";
import type {
  ResourceVersionDetailResponse,
  ResourceVersionDraftResponse,
} from "./responseTypes";

/**
 * 创建资源版本
 * 为资源创建一个新的版本
 * @param resourceId 资源ID
 * @param body 版本创建请求体
 * @see https://doc.freelog.com/resourceV2/%E5%88%9B%E5%BB%BA%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC.html
 */
export async function createResourceVersion(
  resourceId: string,
  body: CreateResourceVersionBody
): Promise<ResourceVersionDetailResponse> {
  return freelogRequest.post<ResourceVersionDetailResponse>(
    `/v2/resources/${resourceId}/versions`,
    body
  );
}

/**
 * 保存资源版本草稿
 * 保存或更新资源版本的草稿信息
 * @param resourceId 资源ID
 * @param body 草稿保存请求体
 * @see https://doc.freelog.com/resourceV2/%E4%BF%9D%E5%AD%98%E8%B5%84%E6%BA%90%E7%89%88%E6%9C%AC%E8%8D%89%E7%A8%BF.html
 */
export async function saveResourceVersionDraft(
  resourceId: string,
  body: SaveResourceVersionDraftBody
): Promise<ResourceVersionDraftResponse> {
  return freelogRequest.put<ResourceVersionDraftResponse>(
    `/v2/resources/${resourceId}/versions/drafts`,
    body
  );
}
