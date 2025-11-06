import apiClient from "../core/http";
import type {
  CreateResourceVersionBody,
  SaveResourceVersionDraftBody,
} from "./dataType";

// 创建资源版本
export function createResourceVersion(
  resourceId: string,
  body: CreateResourceVersionBody
) {
  return apiClient.post(`/v2/resources/${resourceId}/versions`, body);
}



// 保存资源版本草稿
export function saveResourceVersionDraft(
  resourceId: string,
  body: SaveResourceVersionDraftBody
) {
  return apiClient.put(`/v2/resources/${resourceId}/versions/drafts`, body);
}
