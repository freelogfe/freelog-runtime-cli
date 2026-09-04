import { cliError } from '../../i18n/cliError.js';

export const RSS_EPISODE_LIMIT = 1000;
export const RSS_IMPORTING_STATUSES = new Set(['', 'pending', 'running']);
export const RSS_FAILURE_STATUSES = new Set(['partial_failed', 'failed', 'error']);

export type RssListingField = 'title' | 'intro' | 'cover' | 'tags';
export const RSS_MANAGED_LISTING_FIELDS: ReadonlySet<RssListingField> = new Set([
  'title',
  'intro',
  'cover',
]);

export interface RssPreviewData {
  errorCode?: string;
  resourceId?: string;
  matchedItemCount?: number;
  audioItemCount?: number;
  itemCount?: number;
  feedData?: {
    channel?: {
      title?: string;
      imageUrl?: string;
      author?: string;
      ownerEmail?: string;
    };
  };
}

export interface RssCompareData {
  oldFeedItemCount?: number;
  newFeedItemCount?: number;
  guidMatchedCount?: number;
}

export function maskRssOwnerEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, Math.min(3, name.length))}***@${domain}`;
}

export function summarizeRssPreview(data: RssPreviewData) {
  const channel = data.feedData?.channel;
  return {
    title: channel?.title || '',
    cover: channel?.imageUrl || '',
    author: channel?.author || '',
    episodeCount: Number(data.audioItemCount ?? data.itemCount ?? 0),
    matchedItemCount:
      data.matchedItemCount === undefined ? undefined : Number(data.matchedItemCount),
    maskedEmail: channel?.ownerEmail ? maskRssOwnerEmail(channel.ownerEmail) : undefined,
    errorCode: data.errorCode,
    existingResourceId: data.resourceId,
  };
}

export function assertRssPreviewCanContinue(data: RssPreviewData): void {
  const channel = data.feedData?.channel;
  if (!channel) throw cliError('RSS 地址无效，请检查后重新输入', { code: 4 });
  if (!channel.ownerEmail) {
    throw cliError('RSS feed 缺少所有者电子邮箱，无法验证播客所有权', { code: 4 });
  }
  if (data.errorCode === 'submitpodcastwrss_error_alreadyexists02') {
    throw cliError('此播客已被其他资源绑定', {
      code: 3,
      details: data.resourceId ? { resourceId: data.resourceId } : undefined,
    });
  }
}

export function assertRssEpisodeRange(
  data: RssPreviewData,
  pubStartDate?: string,
  pubEndDate?: string,
): void {
  const count = Number(data.matchedItemCount);
  if (Number.isFinite(count) && count > RSS_EPISODE_LIMIT && (!pubStartDate || !pubEndDate)) {
    throw cliError(`RSS 可导入单集超过 ${RSS_EPISODE_LIMIT} 条，必须同时提供发布时间范围`, {
      code: 4,
      hint: '使用 --pub-start <YYYY-MM-DD> --pub-end <YYYY-MM-DD>，CLI 会按 Console 规则转换为当天 00:00:00 / 23:59:59',
      details: { matchedItemCount: count },
    });
  }
}

export function assertRssDateRange(pubStartDate?: string, pubEndDate?: string): void {
  if ((pubStartDate && !pubEndDate) || (!pubStartDate && pubEndDate)) {
    throw cliError('发布时间范围必须同时提供开始和结束日期', { code: 4 });
  }
  if (!pubStartDate || !pubEndDate) return;
  const start = Date.parse(pubStartDate);
  const end = Date.parse(pubEndDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw cliError('发布时间范围不是有效日期', { code: 4 });
  }
  if (start > end) throw cliError('发布时间开始日期不能晚于结束日期', { code: 4 });
}

export function normalizeRssDateRange(pubStartDate?: string, pubEndDate?: string) {
  assertRssDateRange(pubStartDate, pubEndDate);
  if (!pubStartDate || !pubEndDate) return {};
  return {
    pubStartDate: `${pubStartDate.slice(0, 10)} 00:00:00`,
    pubEndDate: `${pubEndDate.slice(0, 10)} 23:59:59`,
  };
}

export function isGuidMassMismatch(data: RssCompareData): boolean {
  const oldCount = Number(data.oldFeedItemCount);
  const newCount = Number(data.newFeedItemCount);
  const matched = Number(data.guidMatchedCount);
  if (![oldCount, newCount, matched].every(Number.isFinite)) return false;
  return Math.max(oldCount, newCount) - matched > Math.abs(newCount - oldCount);
}

export function isRssVerificationCodeInvalid(error: unknown): boolean {
  const stack = [error];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') continue;
    const record = current as Record<string, unknown>;
    if (record.errorType === 'VerificationCodeInvalid' || record.msg === 'wrong_verified_code') {
      return true;
    }
    if (record.data && typeof record.data === 'object') stack.push(record.data);
    if (record.details && typeof record.details === 'object') stack.push(record.details);
    if (record.cause && typeof record.cause === 'object') stack.push(record.cause);
  }
  return false;
}

export function rssVerificationCodeError(error: unknown) {
  return cliError('RSS 验证码错误，请重新输入或重新发送验证码', {
    code: 4,
    cause: error,
    hint: 'Console 会把 VerificationCodeInvalid / wrong_verified_code 识别为验证码字段错误，CLI 也按字段错误处理',
  });
}

export function isRssRelatedResource(info: {
  feedUrl?: unknown;
  rssGuid?: unknown;
  rssPubDate?: unknown;
}): boolean {
  return [info.feedUrl, info.rssGuid, info.rssPubDate].some(
    (value) => typeof value === 'string' && value.trim() !== '',
  );
}

export function assertRssManagedContentEditable(
  info: { feedUrl?: unknown; rssGuid?: unknown; rssPubDate?: unknown },
  operation: string,
): void {
  if (!isRssRelatedResource(info)) return;
  throw cliError(`RSS 合集内容由 feed 管理，不能执行：${operation}`, {
    code: 4,
    hint: '可使用 collection rss inspect/bind/sync 管理订阅源；RSS 托管期间不能手工修改标题、封面、简介、目录或发版内容，标签仍可手动维护',
  });
}

export function assertRssListingFieldsEditable(
  info: { feedUrl?: unknown; rssGuid?: unknown; rssPubDate?: unknown },
  fields: Iterable<RssListingField>,
): void {
  if (!isRssRelatedResource(info)) return;
  const locked = [...fields].filter((field) => RSS_MANAGED_LISTING_FIELDS.has(field));
  if (!locked.length) return;
  throw cliError(`RSS 资源展示信息由 feed 管理，不能修改：${locked.join(', ')}`, {
    code: 4,
    hint: 'Console 对 RSS 相关资源锁定标题、封面、简介；标签允许手动维护',
    details: { lockedFields: locked, editableFields: ['tags'] },
  });
}
