import { cliError } from '../../i18n/cliError.js';

export const RSS_EPISODE_LIMIT = 15;
export const RSS_IMPORTING_STATUSES = new Set(['', 'pending', 'running']);
export const RSS_FAILURE_STATUSES = new Set(['partial_failed', 'failed', 'error']);

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
  const count = Number(data.matchedItemCount ?? data.audioItemCount ?? data.itemCount);
  if (Number.isFinite(count) && count > RSS_EPISODE_LIMIT && (!pubStartDate || !pubEndDate)) {
    throw cliError(`RSS 可导入单集超过 ${RSS_EPISODE_LIMIT} 条，必须同时提供发布时间范围`, {
      code: 4,
      hint: '使用 --pub-start <date> --pub-end <date>，与 Console 的单集数量弹窗一致',
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

export function isGuidMassMismatch(data: RssCompareData): boolean {
  const oldCount = Number(data.oldFeedItemCount);
  const newCount = Number(data.newFeedItemCount);
  const matched = Number(data.guidMatchedCount);
  if (![oldCount, newCount, matched].every(Number.isFinite)) return false;
  return Math.max(oldCount, newCount) - matched > Math.abs(newCount - oldCount);
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
    hint: '可使用 collection rss inspect/bind/sync 管理订阅源；标签仍可通过 collection update 修改',
  });
}
