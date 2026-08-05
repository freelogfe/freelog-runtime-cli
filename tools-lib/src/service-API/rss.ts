import FUtil from '../utils';

// 预览 RSS 订阅源（校验并解析 feed 信息）
// RSS基础信息预览
export interface BindingsPreviewParamsType {
  feedUrl: string;
  isLoadItemData?: 0 | 1;
  pubStartDate?: string;
  pubEndDate?: string;
}

export function bindingsPreview(params: BindingsPreviewParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/rss/bindings/preview`,
    data: params,
  });
}

// RSS新旧FEED对比
export interface BindingsCompareParamsType {
  resourceId: string;
  feedUrl: string;
}

export function bindingsCompare(params: BindingsCompareParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/rss/bindings/compare`,
    data: params,
  });
}

// 发送 RSS 邮箱验证码
export interface SendVerificationCodeParamsType {
  feedUrl: string;
  resourceId: string;
}

export function sendVerificationCode(params: SendVerificationCodeParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/rss/bindings/sendVerificationCode`,
    data: params,
  });
}

// 绑定 RSS feed 到资源
export interface BindFeedParamsType {
  resourceId: string;
  feedUrl: string;
  verificationCode: string;
  pubStartDate?: string;
  pubEndDate?: string;
}

export function bindFeed({ resourceId, ...params }: BindFeedParamsType) {
  return FUtil.Request({
    method: 'POST',
    url: `/v2/resources/rss/${resourceId}/bindFeed`,
    data: params,
  });
}

// 获取 RSS 同步进度
export interface GetSyncProgressParamsType {
  resourceId: string;
}

export function getSyncProgress({ resourceId }: GetSyncProgressParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/rss/bindings/${resourceId}/progress`,
  });
}

// 手动同步合集资源（只有已绑定 RSS 地址的合集资源才能同步）
export interface SyncBindingParamsType {
  resourceId: string;
}

export function syncBinding({ resourceId }: SyncBindingParamsType) {
  return FUtil.Request({
    method: 'PUT',
    url: `/v2/rss/bindings/${resourceId}/sync`,
  });
}

// 分页查看 RSS 导入失败项列表
export interface FailedItemsParamsType {
  resourceId: string;
  skip?: number;
  limit?: number;
}

export function failedItems({ resourceId, ...params }: FailedItemsParamsType) {
  return FUtil.Request({
    method: 'GET',
    url: `/v2/rss/bindings/${resourceId}/failedItems`,
    params,
  });
}
