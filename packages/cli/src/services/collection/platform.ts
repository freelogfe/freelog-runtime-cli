import fs from 'node:fs';
import path from 'node:path';
import { resolveCwd, saveCollectionProject } from '../../config/project.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import {
  rssBindFeed,
  rssGetSyncProgress,
  rssSendVerificationCode,
  rssSyncBinding,
} from '../platformExtra.js';
import { ensureCollectionOwner, ensureCollectionSynced } from './owner.js';

export async function collectRulesGet(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const envelope = await FServiceAPI.Resource.getCollectionCollectRules({
    resourceId: ctx.collection.resourceId!,
  } as Parameters<typeof FServiceAPI.Resource.getCollectionCollectRules>[0]);
  return unwrapData(envelope);
}

export async function collectRulesSet(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  fromFile?: string;
  status?: 0 | 1;
  serializeStatus?: 0 | 1;
  conditionType?: 1 | 2;
  filterConditions?: Array<{
    key: 'resourceTitle' | 'resourceTypeCode' | 'authIdentity';
    limitOperatorType:
      | 'INCLUDES'
      | 'NOT_INCLUDES'
      | 'STARTS_WITH'
      | 'ENDS_WITH'
      | 'EQUAL'
      | 'NOT_EQUAL';
    value: string;
  }>;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  let body: {
    status: 0 | 1;
    serializeStatus?: 0 | 1;
    conditionType: 1 | 2;
    filterConditions: Array<{
      key: 'resourceTitle' | 'resourceTypeCode' | 'authIdentity';
      limitOperatorType:
        | 'INCLUDES'
        | 'NOT_INCLUDES'
        | 'STARTS_WITH'
        | 'ENDS_WITH'
        | 'EQUAL'
        | 'NOT_EQUAL';
      value: string;
    }>;
  };

  if (opts.fromFile) {
    const file = path.resolve(resolveCwd(opts.cwd), opts.fromFile);
    if (!fs.existsSync(file)) throw cliError(I18N_KEYS.rules_file_not_found, { code: 4 });
    try {
      body = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof body;
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
    body = {
      status: opts.status,
      serializeStatus: opts.serializeStatus,
      conditionType: opts.conditionType,
      filterConditions: opts.filterConditions || [],
    };
  }

  await FServiceAPI.Resource.setCollectRules({
    resourceId: ctx.collection.resourceId!,
    ...body,
  } as Parameters<typeof FServiceAPI.Resource.setCollectRules>[0]);

  const next = { ...ctx.collection, collectRules: body };
  saveCollectionProject(next, opts.cwd);
  return body;
}

export async function collectionRssSendCode(opts: {
  cwd?: string;
  feedUrl: string;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.feedUrl?.trim()) throw cliError(I18N_KEYS.missing_feed_url, { code: 4 });
  const data = await rssSendVerificationCode({
    feedUrl: opts.feedUrl.trim(),
    resourceId: ctx.collection.resourceId!,
  });
  saveCollectionProject(
    { ...ctx.collection, rssFeedUrl: opts.feedUrl.trim() },
    opts.cwd,
  );
  return data;
}

export async function collectionRssBind(opts: {
  cwd?: string;
  feedUrl: string;
  code: string;
  pubStartDate?: string;
  pubEndDate?: string;
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.code?.trim()) {
    throw cliError(I18N_KEYS.missing_verification_code, { code: 4 });
  }
  const feedUrl = opts.feedUrl?.trim() || ctx.collection.rssFeedUrl;
  if (!feedUrl) throw cliError(I18N_KEYS.missing_feed_url, { code: 4 });

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
  await rssSyncBinding({ resourceId });

  const timeoutMs = opts.timeoutMs ?? 300_000;
  const pollMs = opts.pollMs ?? 2000;
  const start = Date.now();
  let last: unknown;
  while (Date.now() - start < timeoutMs) {
    last = await rssGetSyncProgress({ resourceId });
    const progress = last as { status?: string | number; isFinished?: boolean; percent?: number };
    if (
      progress?.isFinished === true ||
      progress?.status === 'done' ||
      progress?.status === 'success' ||
      progress?.status === 2 ||
      progress?.percent === 100
    ) {
      return { done: true as const, progress: last };
    }
    if (progress?.status === 'failed' || progress?.status === 'error') {
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
