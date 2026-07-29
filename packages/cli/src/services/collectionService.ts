import fs from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/paths.js';
import {
  loadCollectionConfig,
  loadResourceConfig,
  saveCollectionConfig,
  tryLoadResourceConfig,
} from '../config/read.js';
import { writeCollectionConfig, type CollectionShell } from '../config/writeShell.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import {
  fetchResourceInfo,
  ownersMatch,
  type PlatformResourceInfo,
} from './syncService.js';
import { assertResourceTitle, assertTags } from './validation.js';
import { assertResourceTypeCode } from './typeService.js';
import { parsePolicyFile } from './policyService.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import {
  rssBindFeed,
  rssGetSyncProgress,
  rssSendVerificationCode,
  rssSyncBinding,
} from './platformExtra.js';
import { evaluateOnlineGates } from './onlineService.js';

export interface EnsureCollectionOwnerResult {
  auth: ReturnType<typeof requireAuth>;
  collection: CollectionShell;
  info: PlatformResourceInfo;
}

function applyOwnerToCollection(
  local: CollectionShell,
  info: PlatformResourceInfo,
): CollectionShell {
  return {
    ...local,
    resourceId: info.resourceId || local.resourceId,
    resourceName: info.resourceName || local.resourceName,
    resourceType: info.resourceType || local.resourceType,
    resourceTypeCode: info.resourceTypeCode || local.resourceTypeCode,
    resourceTitle: info.resourceTitle || local.resourceTitle,
    intro: info.intro ?? local.intro,
    coverImages: info.coverImages ?? local.coverImages,
    tags: info.tags ?? local.tags,
    userId: info.userId,
    username: info.username,
  };
}

function listingDrifted(local: CollectionShell, info: PlatformResourceInfo): boolean {
  const norm = (v: unknown) => JSON.stringify(v ?? null);
  return (
    (local.resourceTitle !== undefined &&
      info.resourceTitle !== undefined &&
      local.resourceTitle !== info.resourceTitle) ||
    (local.intro !== undefined && info.intro !== undefined && local.intro !== info.intro) ||
    (local.tags !== undefined && info.tags !== undefined && norm(local.tags) !== norm(info.tags)) ||
    (local.coverImages !== undefined &&
      info.coverImages !== undefined &&
      norm(local.coverImages) !== norm(info.coverImages))
  );
}

export async function ensureCollectionOwner(opts: {
  cwd?: string;
  allowCreateWithoutId?: boolean;
}): Promise<EnsureCollectionOwnerResult> {
  const auth = requireAuth();
  const { data: collection } = loadCollectionConfig(opts.cwd);
  const resourceId = collection.resourceId?.trim();

  if (!resourceId) {
    if (opts.allowCreateWithoutId) {
      return { auth, collection, info: { resourceId: '' } };
    }
    throw new CliError('本地无合集 resourceId，请先 collection create 或 pull --collection', {
      code: 4,
    });
  }

  const info = await fetchResourceInfo(resourceId);
  if (!ownersMatch(auth.userId, info.userId)) {
    throw new CliError(
      `合集属于 ${info.username || info.userId}，当前登录为 ${auth.username || auth.userId}`,
      { code: 2, hint: '切换账号或更换目录' },
    );
  }

  const next = applyOwnerToCollection(collection, info);
  if (info.username && collection.username && info.username !== collection.username) {
    consola.warn(`username 已以平台为准更新: ${collection.username} → ${info.username}`);
  }
  saveCollectionConfig(next, opts.cwd);
  return { auth, collection: next, info };
}

export async function ensureCollectionSynced(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  owner?: EnsureCollectionOwnerResult;
}): Promise<EnsureCollectionOwnerResult> {
  const owner = opts.owner || (await ensureCollectionOwner({ cwd: opts.cwd }));
  if (!owner.info.resourceId) return owner;

  if (listingDrifted(owner.collection, owner.info)) {
    if (opts.noAutoPull) {
      throw new CliError('本地与平台合集信息不一致', {
        code: 3,
        hint: 'freelog-cli pull --collection 或去掉 --no-auto-pull',
      });
    }
    const pulled = await pullCollection({ cwd: opts.cwd });
    return {
      ...owner,
      collection: pulled.collection,
      info: pulled.info,
    };
  }
  return owner;
}

export async function createCollection(opts: {
  title: string;
  typeCode: string;
  name?: string;
  cwd?: string;
}) {
  const auth = requireAuth();
  assertResourceTitle(opts.title, true);
  await assertResourceTypeCode(opts.typeCode);

  const cwd = resolveCwd(opts.cwd);
  let local: CollectionShell = {
    resourceName: '',
    resourceType: [],
  };
  try {
    local = loadCollectionConfig(cwd).data;
  } catch {
    // 无本地合集配置时写新壳
  }
  if (local.resourceId?.trim()) {
    throw new CliError('本地已有合集 resourceId，勿重复 create', { code: 4 });
  }

  const name =
    opts.name ||
    local.resourceName ||
    `${auth.username || 'user'}/${opts.title.replace(/\s+/g, '-').toLowerCase()}`.slice(0, 60);

  if (name.length > 60) {
    throw new CliError('资源名（授权标识）长度不能超过 60', { code: 4 });
  }

  const envelope = await FServiceAPI.Resource.create({
    name,
    subjectType: 4,
    resourceTypeCode: opts.typeCode,
    resourceTitle: opts.title.trim(),
  } as Parameters<typeof FServiceAPI.Resource.create>[0]);

  const data = unwrapData<{
    resourceId: string;
    resourceName: string;
    resourceType?: string[];
    resourceTypeCode?: string;
    userId?: number | string;
    username?: string;
  }>(envelope);

  if (!data?.resourceId) {
    throw new CliError('collection create 响应缺少 resourceId', { code: 1, details: data });
  }

  const next: CollectionShell = {
    ...local,
    resourceId: data.resourceId,
    resourceName: data.resourceName || name,
    resourceType: data.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || opts.typeCode,
    resourceTitle: opts.title.trim(),
    userId: data.userId ?? auth.userId,
    username: data.username ?? auth.username,
  };
  writeCollectionConfig(next, cwd);
  return next;
}

function looksLikePath(target: string): boolean {
  if (!target) return false;
  if (target.includes('/') || target.includes('\\')) return true;
  if (target.startsWith('.')) return true;
  try {
    return fs.existsSync(path.resolve(target)) && fs.statSync(path.resolve(target)).isDirectory();
  } catch {
    return false;
  }
}

export async function itemAdd(opts: {
  target: string;
  title?: string;
  cwd?: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const collectionId = ctx.collection.resourceId!;
  let resourceId = opts.target.trim();
  let itemTitle = opts.title;

  if (looksLikePath(opts.target)) {
    const itemCwd = path.resolve(resolveCwd(opts.cwd), opts.target);
    const loaded = tryLoadResourceConfig(itemCwd) || loadResourceConfig(itemCwd);
    const auth = requireAuth();
    if (!ownersMatch(auth.userId, loaded.data.userId)) {
      // 路径场景：先用本地 owner；若有 resourceId 再对平台核对
      if (loaded.data.resourceId) {
        const info = await fetchResourceInfo(loaded.data.resourceId);
        if (!ownersMatch(auth.userId, info.userId)) {
          throw new CliError('路径资源不属于当前登录账号', { code: 2 });
        }
      } else {
        throw new CliError('路径资源缺少 resourceId 或 owner 不符', { code: 4 });
      }
    }
    if (!loaded.data.resourceId) {
      throw new CliError('路径目录缺少 resourceId', { code: 4 });
    }
    resourceId = loaded.data.resourceId;
    itemTitle = itemTitle || loaded.data.resourceTitle;
  }

  await FServiceAPI.Resource.addResourceItems_Draft({
    resourceId: collectionId,
    addCollectionItems: [{ resourceId, itemTitle }],
    isPublish: 0,
  } as Parameters<typeof FServiceAPI.Resource.addResourceItems_Draft>[0]);

  return { collectionId, resourceId, itemTitle };
}

export async function itemRemove(opts: {
  itemIds: string[];
  cwd?: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.itemIds.length) throw new CliError('缺少 itemId', { code: 4 });
  await FServiceAPI.Resource.deleteCollectionItems_Draft({
    resourceId: ctx.collection.resourceId!,
    removeCollectionItemIds: opts.itemIds,
  } as Parameters<typeof FServiceAPI.Resource.deleteCollectionItems_Draft>[0]);
}

export async function itemUpdate(opts: {
  itemId: string;
  title: string;
  cwd?: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.itemId) throw new CliError('缺少 itemId', { code: 4 });
  if (!opts.title?.trim()) throw new CliError('缺少 --title', { code: 4 });
  await FServiceAPI.Resource.updateCollectionItemsInfo_Draft({
    resourceId: ctx.collection.resourceId!,
    data: [{ itemId: opts.itemId, itemTitle: opts.title.trim() }],
  } as Parameters<typeof FServiceAPI.Resource.updateCollectionItemsInfo_Draft>[0]);
}

export async function itemReorder(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  /** 自动排序字段 */
  sortField?: 'createDate' | 'itemTitle' | 'sortId' | 'resourceUpdateDate';
  sortType?: 1 | -1;
  /** order 文件：JSON 数组 itemId[]，走 manualSort */
  orderFile?: string;
  itemIds?: string[];
  targetSortId?: number;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.collection.resourceId!;

  if (opts.orderFile || opts.itemIds?.length) {
    let itemIds = opts.itemIds || [];
    if (opts.orderFile) {
      const file = path.resolve(resolveCwd(opts.cwd), opts.orderFile);
      if (!fs.existsSync(file)) throw new CliError(`order 文件不存在: ${file}`, { code: 4 });
      try {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
        if (!Array.isArray(raw) || !raw.every((x) => typeof x === 'string')) {
          throw new Error('need string[]');
        }
        itemIds = raw as string[];
      } catch (error) {
        throw new CliError('order 文件须为 JSON 字符串数组', { code: 4, cause: error });
      }
    }
    await FServiceAPI.Resource.setCollectionItemsSortID_Draft({
      resourceId,
      data: {
        itemIds,
        targetSortId: opts.targetSortId ?? 1,
      },
    } as Parameters<typeof FServiceAPI.Resource.setCollectionItemsSortID_Draft>[0]);
    return { mode: 'manual' as const, itemIds };
  }

  if (!opts.sortField) {
    throw new CliError('请提供 --order-file / itemIds，或 --sort-field', { code: 4 });
  }
  await FServiceAPI.Resource.reorderCollectionItems_Draft({
    resourceId,
    sortField: opts.sortField,
    sortType: opts.sortType ?? 1,
  } as Parameters<typeof FServiceAPI.Resource.reorderCollectionItems_Draft>[0]);
  return { mode: 'auto' as const, sortField: opts.sortField, sortType: opts.sortType ?? 1 };
}

function mapDisplayFlags(flags: {
  sort?: string;
  title?: string;
  no?: string;
  image?: string;
  descr?: string;
  view?: string;
}): Record<string, string> {
  const display: Record<string, string> = {};
  if (flags.sort) {
    const v = flags.sort === 'desc' || flags.sort === 'descending' ? 'descending' : 'ascending';
    display.collection_sort_list = v;
  }
  if (flags.title) {
    const map: Record<string, string> = {
      rtitle: 'rtitle',
      sn: 'sn',
      empty: 'empty',
      custom: 'custom',
    };
    display.collection_item_title = map[flags.title] || flags.title;
  }
  if (flags.no) {
    display.collection_item_no_display =
      flags.no === 'hide'
        ? 'collection_item_no_display_hide'
        : 'collection_item_no_display_show';
  }
  if (flags.image) {
    display.collection_item_image_display =
      flags.image === 'hide'
        ? 'collection_item_image_display_hide'
        : 'collection_item_image_display_show';
  }
  if (flags.descr) {
    display.collection_item_descr_display =
      flags.descr === 'hide'
        ? 'collection_item_descr_display_hide'
        : 'collection_item_descr_display_show';
  }
  if (flags.view) {
    display.collection_view =
      flags.view === 'card' ? 'collection_view_card' : 'collection_view_list';
  }
  return display;
}

export async function collectionUpdate(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string[];
  displaySort?: string;
  displayTitle?: string;
  displayNo?: string;
  displayImage?: string;
  displayDescr?: string;
  displayView?: string;
}) {
  if (opts.title !== undefined) assertResourceTitle(opts.title, true);
  if (opts.intro !== undefined && opts.intro.length > 1000) {
    throw new CliError('简介长度不能超过 1000', { code: 4 });
  }
  assertTags(opts.tags);

  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.collection.resourceId!;

  let coverUrl: string | undefined;
  if (opts.cover !== undefined) {
    coverUrl = await resolveCoverImageUrl(opts.cover, opts.cwd);
  }

  const params: Record<string, unknown> = { resourceId };
  if (opts.title !== undefined) params.resourceTitle = opts.title.trim();
  if (opts.intro !== undefined) params.intro = opts.intro;
  if (coverUrl !== undefined) params.coverImages = [coverUrl];
  if (opts.tags !== undefined) params.tags = [...new Set(opts.tags.map((t) => t.trim()))];

  const hasListing =
    opts.title !== undefined ||
    opts.intro !== undefined ||
    coverUrl !== undefined ||
    opts.tags !== undefined;
  if (hasListing) {
    await FServiceAPI.Resource.update(
      params as unknown as Parameters<typeof FServiceAPI.Resource.update>[0],
    );
  }

  const display = mapDisplayFlags({
    sort: opts.displaySort,
    title: opts.displayTitle,
    no: opts.displayNo,
    image: opts.displayImage,
    descr: opts.displayDescr,
    view: opts.displayView,
  });

  if (Object.keys(display).length) {
    await FServiceAPI.Resource.updateCollection({
      resourceId,
      catalogueProperty: display,
      authExcludedItems: [],
    } as Parameters<typeof FServiceAPI.Resource.updateCollection>[0]);
  }

  const next: CollectionShell = {
    ...ctx.collection,
    resourceTitle: opts.title ?? ctx.collection.resourceTitle,
    intro: opts.intro ?? ctx.collection.intro,
    coverImages: coverUrl ? [coverUrl] : ctx.collection.coverImages,
    tags: opts.tags ?? ctx.collection.tags,
    display: Object.keys(display).length
      ? { ...(ctx.collection.display || {}), ...display }
      : ctx.collection.display,
  };
  saveCollectionConfig(next, opts.cwd);
  return next;
}

export async function collectionPolicyAdd(opts: {
  cwd?: string;
  fromFile: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const items = parsePolicyFile(opts.fromFile);
  await FServiceAPI.Resource.update({
    resourceId: ctx.collection.resourceId!,
    addPolicies: items.map((p) => ({
      policyName: p.policyName,
      policyText: encodeURIComponent(p.policyText),
      status: p.status ?? 1,
    })),
  } as Parameters<typeof FServiceAPI.Resource.update>[0]);
  return items;
}

export async function collectionPolicyList(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  return info.policies || [];
}

async function fetchDraftItems(resourceId: string) {
  const envelope = await FServiceAPI.Resource.getCollectionItems_Draft({
    resourceId,
    skip: 0,
    limit: 500,
  } as Parameters<typeof FServiceAPI.Resource.getCollectionItems_Draft>[0]);
  const data = unwrapData<{
    dataList?: Array<{ itemId?: string; itemTitle?: string; resourceId?: string }>;
  }>(envelope);
  return Array.isArray(data?.dataList) ? data.dataList : Array.isArray(data) ? (data as never[]) : [];
}

export async function collectionPublish(opts: { cwd?: string; noAutoPull?: boolean }) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.collection.resourceId!;

  const items = await fetchDraftItems(resourceId);
  const itemIds = items
    .map((it) => (it as { itemId?: string }).itemId)
    .filter((id): id is string => Boolean(id));

  if (itemIds.length) {
    const authEnv = await FServiceAPI.Resource.getCollectionItemsAuth_Draft({
      resourceId,
      itemIds: itemIds.join(','),
    } as Parameters<typeof FServiceAPI.Resource.getCollectionItemsAuth_Draft>[0]);
    const authData = unwrapData<
      | Array<{ itemId?: string; isAuth?: boolean; authStatus?: number; resourceId?: string }>
      | { dataList?: Array<{ itemId?: string; isAuth?: boolean; authStatus?: number }> }
    >(authEnv);
    const rows = Array.isArray(authData)
      ? authData
      : Array.isArray((authData as { dataList?: unknown[] })?.dataList)
        ? (authData as { dataList: Array<{ itemId?: string; isAuth?: boolean; authStatus?: number }> })
            .dataList
        : [];

    const unresolved = rows.filter((r) => {
      if (typeof r.isAuth === 'boolean') return !r.isAuth;
      if (r.authStatus !== undefined) return Number(r.authStatus) !== 1;
      return false;
    });

    if (unresolved.length) {
      throw new CliError('合集单品授权未完成', {
        code: 5,
        details: {
          error: 'DEPENDENCY_AUTH_INCOMPLETE',
          unresolvedDependencies: [],
          unresolvedItems: unresolved,
        },
        hint: '打开 Console 合集发版页完成单品授权',
      });
    }
  }

  await FServiceAPI.Resource.updateCollection({
    resourceId,
    isMergeCatalogueDraft: 1,
    authExcludedItems: [],
  } as Parameters<typeof FServiceAPI.Resource.updateCollection>[0]);

  return { resourceId, itemCount: items.length };
}

export async function collectionUnpublish(opts: { cwd?: string; noAutoPull?: boolean }) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  await FServiceAPI.Resource.update({
    resourceId: ctx.collection.resourceId!,
    status: 4,
  } as unknown as Parameters<typeof FServiceAPI.Resource.update>[0]);
}

export async function pullCollection(opts: { cwd?: string }) {
  const auth = requireAuth();
  const { data: collection } = loadCollectionConfig(opts.cwd);
  const id = collection.resourceId?.trim() || collection.resourceName;
  if (!id) {
    throw new CliError('无法 pull：缺少合集 resourceId / resourceName', { code: 4 });
  }
  const info = await fetchResourceInfo(id);
  if (
    Number.isFinite(Number(auth.userId)) &&
    Number.isFinite(Number(info.userId)) &&
    !ownersMatch(auth.userId, info.userId)
  ) {
    throw new CliError('无权 pull 他人合集到本地写缓存（Owner 不符）', { code: 2 });
  }

  const itemsEnv = await FServiceAPI.Resource.getCollectionItems_Draft({
    resourceId: info.resourceId,
    skip: 0,
    limit: 500,
  } as Parameters<typeof FServiceAPI.Resource.getCollectionItems_Draft>[0]);
  const itemsData = unwrapData<{ dataList?: unknown[] }>(itemsEnv);
  const catalogueItems = Array.isArray(itemsData?.dataList)
    ? itemsData.dataList
    : Array.isArray(itemsData)
      ? (itemsData as unknown[])
      : [];

  let collectRules: unknown;
  try {
    const rulesEnv = await FServiceAPI.Resource.getCollectionCollectRules({
      resourceId: info.resourceId,
    } as Parameters<typeof FServiceAPI.Resource.getCollectionCollectRules>[0]);
    collectRules = unwrapData(rulesEnv);
  } catch {
    collectRules = collection.collectRules;
  }

  const next = applyOwnerToCollection(
    { ...collection, catalogueItems, collectRules },
    info,
  );
  saveCollectionConfig(next, opts.cwd);
  return { collection: next, info, catalogueItems, collectRules };
}

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
    if (!fs.existsSync(file)) throw new CliError(`规则文件不存在: ${file}`, { code: 4 });
    try {
      body = JSON.parse(fs.readFileSync(file, 'utf8')) as typeof body;
    } catch (error) {
      throw new CliError('collect-rules 文件不是合法 JSON', { code: 4, cause: error });
    }
  } else {
    if (opts.status === undefined || opts.conditionType === undefined) {
      throw new CliError('请提供 --from-file 或 --status + --condition-type', { code: 4 });
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
  saveCollectionConfig(next, opts.cwd);
  return body;
}

export async function collectionLogs(opts: {
  cwd?: string;
  skip?: number;
  limit?: number;
}) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const envelope = await FServiceAPI.Resource.getCollectionUpdateLogs({
    resourceId: ctx.collection.resourceId!,
    skip: opts.skip ?? 0,
    limit: opts.limit ?? 50,
  } as Parameters<typeof FServiceAPI.Resource.getCollectionUpdateLogs>[0]);
  return unwrapData(envelope);
}

export async function collectionRssSendCode(opts: {
  cwd?: string;
  feedUrl: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.feedUrl?.trim()) throw new CliError('缺少 feedUrl', { code: 4 });
  const data = await rssSendVerificationCode({
    feedUrl: opts.feedUrl.trim(),
    resourceId: ctx.collection.resourceId!,
  });
  saveCollectionConfig(
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
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  if (!opts.code?.trim()) {
    throw new CliError('缺少验证码 --code（请查邮箱后注入）', { code: 4 });
  }
  const feedUrl = opts.feedUrl?.trim() || ctx.collection.rssFeedUrl;
  if (!feedUrl) throw new CliError('缺少 feedUrl', { code: 4 });

  const data = await rssBindFeed({
    resourceId: ctx.collection.resourceId!,
    feedUrl,
    verificationCode: opts.code.trim(),
    pubStartDate: opts.pubStartDate,
    pubEndDate: opts.pubEndDate,
  });
  saveCollectionConfig({ ...ctx.collection, rssFeedUrl: feedUrl }, opts.cwd);
  return data;
}

export async function collectionRssSync(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  pollMs?: number;
  timeoutMs?: number;
}) {
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
      throw new CliError('RSS 同步失败', { code: 1, details: last });
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new CliError('RSS 同步超时', {
    code: 1,
    details: last,
    hint: '稍后 freelog-cli collection rss sync 重试',
  });
}

/** 合集目录下 online：门禁同单品 */
export async function onlineCollection(opts: { cwd?: string; noAutoPull?: boolean }) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const info = ctx.info;
  if (Number(info.status) === 2) {
    throw new CliError('合集已冻结，无法上架', { code: 4, details: { status: info.status } });
  }
  const gates = evaluateOnlineGates(info);
  if (!gates.ok) {
    throw new CliError('上架门禁未满足：需要 latestVersion 与至少一条启用策略', {
      code: 4,
      details: {
        error: 'ONLINE_GATE_FAILED',
        gates: {
          hasLatestVersion: gates.hasLatestVersion,
          enabledPolicyCount: gates.enabledPolicyCount,
        },
        platformStatus: info.status,
      },
      hint: '先 collection publish / policy add，然后 online',
    });
  }
  if (Number(info.status) === 1) {
    return { already: true as const, info, gates };
  }
  await FServiceAPI.Resource.update({
    resourceId: ctx.collection.resourceId!,
    status: 1,
  } as Parameters<typeof FServiceAPI.Resource.update>[0]);
  return { already: false as const, info, gates };
}
