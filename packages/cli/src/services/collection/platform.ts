import fs from 'node:fs';
import path from 'node:path';
import { resolveCwd, saveCollectionProject } from '../../config/project.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import {
  rssCompare,
  rssBindFeed,
  rssGetSyncProgress,
  rssPreview,
  rssSendVerificationCode,
  rssSyncBinding,
} from '../platformExtra.js';
import { ensureCollectionOwner, ensureCollectionSynced } from './owner.js';
import {
  normalizeCollectRulesBody,
  type CollectRuleCondition,
  type CollectRulesBody,
} from './collectRulesContract.js';
import {
  assertRssDateRange,
  assertRssEpisodeRange,
  assertRssPreviewCanContinue,
  isGuidMassMismatch,
  isRssRelatedResource,
  RSS_FAILURE_STATUSES,
  RSS_IMPORTING_STATUSES,
  summarizeRssPreview,
  type RssCompareData,
  type RssPreviewData,
} from './rssContract.js';

export async function collectRulesGet(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const envelope = await FServiceAPI.Resource.getCollectionCollectRules({
    resourceId: ctx.collection.resourceId!,
  } as Parameters<typeof FServiceAPI.Resource.getCollectionCollectRules>[0]);
  const rules = unwrapData<Record<string, unknown> | null>(envelope) || {};
  return {
    ...rules,
    serializeStatus: ctx.info.serializeStatus,
  };
}

export async function collectRulesSet(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  fromFile?: string;
  status?: 0 | 1;
  serializeStatus?: 0 | 1;
  conditionType?: 1 | 2;
  filterConditions?: CollectRuleCondition[];
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (isRssRelatedResource(ctx.info)) {
    throw cliError('RSS 合集的更新状态由 feed 管理，不能设置自动收录规则', { code: 4 });
  }
  let input: unknown;

  if (opts.fromFile) {
    const file = path.resolve(resolveCwd(opts.cwd), opts.fromFile);
    if (!fs.existsSync(file)) throw cliError(I18N_KEYS.rules_file_not_found, { code: 4 });
    try {
      input = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      throw cliError(I18N_KEYS.collect_rules_invalid_json, { code: 4, cause: error });
    }
  } else {
    if (opts.status === undefined || opts.conditionType === undefined) {
      throw cliError(I18N_KEYS.collect_rules_input_required, {
        code: 4,
        hint: '含 filterConditions 时推荐 --from-file rules.json；CLI 简写仅支持 --status + --condition-type',
      });
    }
    input = {
      status: opts.status,
      serializeStatus: opts.serializeStatus,
      conditionType: opts.conditionType,
      filterConditions: opts.filterConditions || [],
    };
  }

  const body: CollectRulesBody = normalizeCollectRulesBody(input, ctx.info.username);

  await FServiceAPI.Resource.setCollectRules({
    resourceId: ctx.collection.resourceId!,
    ...body,
  } as Parameters<typeof FServiceAPI.Resource.setCollectRules>[0]);

  const next = { ...ctx.collection, collectRules: body };
  saveCollectionProject(next, opts.cwd);
  return body;
}

export async function collectionRssPreview(opts: { cwd?: string; feedUrl: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd, readOnly: true });
  const feedUrl = opts.feedUrl?.trim();
  if (!feedUrl) throw cliError(I18N_KEYS.missing_feed_url, { code: 4 });
  const data = (await rssPreview({ feedUrl, isLoadItemData: 0 })) as RssPreviewData;
  assertRssPreviewCanContinue(data);
  return {
    feedUrl,
    resourceId: ctx.collection.resourceId!,
    preview: summarizeRssPreview(data),
    alreadyBoundBySelf: data.errorCode === 'submitpodcastwrss_error_alreadyexists',
  };
}

export async function collectionRssStatus(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd, readOnly: true });
  return rssGetSyncProgress({ resourceId: ctx.collection.resourceId! });
}

export async function collectionRssSendCode(opts: {
  cwd?: string;
  feedUrl: string;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const feedUrl = opts.feedUrl?.trim();
  if (!feedUrl) throw cliError(I18N_KEYS.missing_feed_url, { code: 4 });
  const preview = (await rssPreview({ feedUrl, isLoadItemData: 0 })) as RssPreviewData;
  assertRssPreviewCanContinue(preview);
  const data = await rssSendVerificationCode({
    feedUrl,
    resourceId: ctx.collection.resourceId!,
  });
  return { data, preview: summarizeRssPreview(preview) };
}

export async function collectionRssBind(opts: {
  cwd?: string;
  feedUrl: string;
  code: string;
  pubStartDate?: string;
  pubEndDate?: string;
  force?: boolean;
  confirmed?: boolean;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.code?.trim()) {
    throw cliError(I18N_KEYS.missing_verification_code, { code: 4 });
  }
  const feedUrl = opts.feedUrl?.trim() || ctx.collection.rssFeedUrl;
  if (!feedUrl) throw cliError(I18N_KEYS.missing_feed_url, { code: 4 });
  assertRssDateRange(opts.pubStartDate, opts.pubEndDate);

  const preview = (await rssPreview({
    feedUrl,
    isLoadItemData: 0,
    pubStartDate: opts.pubStartDate,
    pubEndDate: opts.pubEndDate,
  })) as RssPreviewData;
  assertRssPreviewCanContinue(preview);
  assertRssEpisodeRange(preview, opts.pubStartDate, opts.pubEndDate);

  const currentFeedUrl = ctx.info.feedUrl?.trim();
  if (currentFeedUrl && currentFeedUrl === feedUrl) {
    throw cliError('新的 RSS 订阅地址不能与原先的地址相同', { code: 4 });
  }
  if (currentFeedUrl) {
    const comparison = (await rssCompare({
      resourceId: ctx.collection.resourceId!,
      feedUrl,
    })) as RssCompareData;
    if (isGuidMassMismatch(comparison) && (!opts.force || !opts.confirmed)) {
      throw cliError('新的 RSS 源有大量单集 GUID 不匹配，将作为全新单集发布', {
        code: 3,
        hint: '确认风险后同时使用 --force --yes 重试',
        details: comparison,
      });
    }
  }

  const data = await rssBindFeed({
    resourceId: ctx.collection.resourceId!,
    feedUrl,
    verificationCode: opts.code.trim(),
    pubStartDate: opts.pubStartDate,
    pubEndDate: opts.pubEndDate,
  });
  saveCollectionProject({ ...ctx.collection, rssFeedUrl: feedUrl }, opts.cwd);
  return data;
}

export async function collectionRssSync(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  pollMs?: number;
  timeoutMs?: number;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.collection.resourceId!;
  if (!isRssRelatedResource(ctx.info)) {
    throw cliError('当前合集尚未绑定 RSS 地址', { code: 4 });
  }
  const current = (await rssGetSyncProgress({ resourceId })) as {
    status?: string;
  } | null;
  if (current && typeof current.status === 'string' && RSS_IMPORTING_STATUSES.has(current.status)) {
    throw cliError('RSS 正在同步中，请勿重复触发', { code: 3, details: current });
  }
  await rssSyncBinding({ resourceId });

  const timeoutMs = opts.timeoutMs ?? 300_000;
  const pollMs = opts.pollMs ?? 2000;
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    last = await rssGetSyncProgress({ resourceId });
    const progress = last as {
      status?: string | number;
      isFinished?: boolean;
      percent?: number;
      failedItems?: unknown[];
    };
    if (
      progress?.isFinished === true ||
      progress?.status === 'done' ||
      progress?.status === 'success' ||
      progress?.status === 2 ||
      progress?.percent === 100
    ) {
      return { done: true as const, progress: last };
    }
    if (typeof progress?.status === 'string' && RSS_FAILURE_STATUSES.has(progress.status)) {
      throw cliError(I18N_KEYS.rss_sync_failed, { code: 1, details: last });
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw cliError(I18N_KEYS.rss_sync_timeout, {
    code: 1,
    details: last,
    hint: '稍后 freelog-cli collection rss sync 重试',
  });
}
