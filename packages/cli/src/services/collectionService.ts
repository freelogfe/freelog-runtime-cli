import fs from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { resolveCwd } from '../config/project.js';
import {
  loadCollectionProject,
  loadResourceProject,
  saveCollectionProject,
  savePlatformCollectionState,
  tryLoadResourceProject,
} from '../config/project.js';
import {
  writeCollectionProject,
  type CollectionProject,
  type CustomPropertyDescriptor,
} from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import {
  assertApplyListingAllowed,
  fetchResourceInfo,
  ownersMatch,
  type PlatformResourceInfo,
} from './syncService.js';
import { assertResourceTitle, assertSemverLike, assertTags } from './validation.js';
import { assertResourceTypeCode } from './typeService.js';
import {
  assertPolicyStatusChangeAllowed,
  buildPolicyUpdatePayload,
  parsePolicyFile,
} from './policyService.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import {
  rssBindFeed,
  rssGetSyncProgress,
  rssSendVerificationCode,
  rssSyncBinding,
} from './platformExtra.js';
import {
  normalizeCreateName,
  requireAuthUsername,
  toFullResourceName,
} from './resourceName.js';
import { createFromDir, type FromDirCreatedItem } from './fromDirService.js';

export interface EnsureCollectionOwnerResult {
  auth: ReturnType<typeof requireAuth>;
  collection: CollectionProject;
  info: PlatformResourceInfo;
}

type UpdateCollectionParams = Parameters<typeof FServiceAPI.Resource.updateCollection>[0];
type UpdateCollectionCustomProperty = NonNullable<
  UpdateCollectionParams['customPropertyDescriptors']
>[number];

const COLLECTION_CUSTOM_PROPERTY_TYPES = new Set([
  'editableText',
  'readonlyText',
  'radio',
  'checkbox',
  'select',
]);

function normalizeCollectionCustomPropertyDescriptors(
  descriptors: CustomPropertyDescriptor[] | undefined,
): UpdateCollectionCustomProperty[] | undefined {
  if (!descriptors?.length) return undefined;

  return descriptors
    .filter((desc) => desc?.key)
    .map((desc) => {
      if (!COLLECTION_CUSTOM_PROPERTY_TYPES.has(desc.type)) {
        throw new CliError(`customPropertyDescriptors.type 不合法: ${desc.type}`, {
          code: 4,
          hint: '允许值：editableText / readonlyText / radio / checkbox / select',
          details: { key: desc.key, type: desc.type },
        });
      }
      return {
        key: desc.key,
        name: desc.name || desc.key,
        defaultValue: String(desc.defaultValue ?? ''),
        type: desc.type as UpdateCollectionCustomProperty['type'],
        candidateItems: desc.candidateItems?.map(String),
        remark: desc.remark,
      };
    });
}

export function buildCollectionPublishParams(opts: {
  resourceId: string;
  collection: CollectionProject;
  mergeCatalogueDraft: 0 | 1;
}): UpdateCollectionParams {
  const { resourceId, collection, mergeCatalogueDraft } = opts;

  return {
    resourceId,
    description: collection.description || '',
    catalogueProperty: collection.display as UpdateCollectionParams['catalogueProperty'],
    isMergeCatalogueDraft: mergeCatalogueDraft,
    inputAttrs: collection.inputAttrs?.map((attr) => ({
      key: attr.key,
      value: String(attr.value ?? ''),
    })),
    customPropertyDescriptors: normalizeCollectionCustomPropertyDescriptors(
      collection.customPropertyDescriptors,
    ),
    dependencies: collection.dependencies?.map((dep) => ({
      resourceId: dep.resourceId,
      versionRange: dep.versionRange || '',
    })),
    baseUpcastResources: collection.baseUpcastResources?.map((resource) => ({
      resourceId: resource.resourceId,
    })),
    authExcludedItems: (collection.authExcludedItems || []).map((item) => ({
      resourceId: item.resourceId,
      excludedType: item.excludedType,
      excludedValue: item.excludedValue,
    })),
  };
}

function applyOwnerToCollection(
  local: CollectionProject,
  info: PlatformResourceInfo,
): CollectionProject {
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

function applyPlatformFactsToCollection(
  local: CollectionProject,
  info: PlatformResourceInfo,
): CollectionProject {
  return {
    ...local,
    resourceId: info.resourceId || local.resourceId,
    resourceName: info.resourceName || local.resourceName,
    resourceType: info.resourceType || local.resourceType,
    resourceTypeCode: info.resourceTypeCode || local.resourceTypeCode,
    userId: info.userId,
    username: info.username,
    status: info.status,
    latestVersion: info.latestVersion,
    policies: info.policies || local.policies,
  };
}

function listingDrifted(local: CollectionProject, info: PlatformResourceInfo): boolean {
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
  const { data: collection } = loadCollectionProject(opts.cwd);
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

  const next = applyPlatformFactsToCollection(collection, info);
  if (info.username && collection.username && info.username !== collection.username) {
    consola.warn(`username 已以平台为准更新: ${collection.username} → ${info.username}`);
  }
  savePlatformCollectionState(next, opts.cwd);
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
  title?: string;
  typeCode?: string;
  name?: string;
  cwd?: string;
}) {
  const auth = requireAuth();
  const username = requireAuthUsername(auth.username);

  const cwd = resolveCwd(opts.cwd);
  let local: CollectionProject = {
    resourceName: '',
    resourceType: [],
  };
  try {
    local = loadCollectionProject(cwd).data;
  } catch {
    // 无本地合集配置时写新壳
  }
  if (local.resourceId?.trim()) {
    throw new CliError('本地已有合集 resourceId，勿重复 create', { code: 4 });
  }

  const title = (opts.title || local.resourceTitle || local.resourceName || '').trim();
  const typeCode = (opts.typeCode || local.resourceTypeCode || '').trim();
  if (!title) {
    throw new CliError('缺少合集标题', {
      code: 4,
      hint: '传 --title，或在 freelog.manifest.json 写 resource.title',
    });
  }
  if (!typeCode) {
    throw new CliError('缺少合集类型 resourceTypeCode', {
      code: 4,
      hint: '传 --type，或在 freelog.manifest.json 写 resource.typeCode',
    });
  }
  assertResourceTitle(title, true);
  await assertResourceTypeCode(typeCode);

  const name = resolveCollectionCreateName({
    explicitName: opts.name,
    localName: local.resourceName,
    title,
  });

  const existing = unwrapData(
    await FServiceAPI.Resource.info({
      resourceIdOrName: toFullResourceName(username, name),
    }),
  );
  if (existing) {
    throw new CliError(`授权标识已存在: ${toFullResourceName(username, name)}`, {
      code: 4,
      hint: '传 --name 指定其他短授权标识',
    });
  }

  const envelope = await FServiceAPI.Resource.create({
    name,
    subjectType: 4,
    resourceTypeCode: typeCode,
    resourceTitle: title,
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

  const next: CollectionProject = {
    ...local,
    resourceId: data.resourceId,
    resourceName: data.resourceName || toFullResourceName(username, name),
    resourceType: data.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || typeCode,
    resourceTitle: title,
    userId: data.userId ?? auth.userId,
    username: data.username ?? auth.username,
  };
  writeCollectionProject(next, cwd);
  return next;
}

function resolveCollectionCreateName(opts: {
  explicitName?: string;
  localName?: string;
  title: string;
}): string {
  return normalizeCreateName(opts.explicitName || opts.localName || opts.title);
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
    const loaded = tryLoadResourceProject(itemCwd) || loadResourceProject(itemCwd);
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

  await refreshCollectionDraftState(ctx.collection, opts.cwd);
  return { collectionId, resourceId, itemTitle };
}

export async function itemImportDir(opts: {
  dir: string;
  resourceTypeCode: string;
  titlePrefix?: string;
  cwd?: string;
  yes?: boolean;
  noAutoPull?: boolean;
}): Promise<{ collectionId: string; created: FromDirCreatedItem[] }> {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const collectionId = ctx.collection.resourceId!;
  const created = await createFromDir({
    dir: path.resolve(resolveCwd(opts.cwd), opts.dir),
    typeCode: opts.resourceTypeCode,
    titlePrefix: opts.titlePrefix,
    cwd: opts.cwd,
    yes: opts.yes,
  });

  if (created.length) {
    await FServiceAPI.Resource.addResourceItems_Draft({
      resourceId: collectionId,
      addCollectionItems: created.map((item) => ({
        resourceId: item.resourceId,
        itemTitle: item.resourceName,
      })),
      isPublish: 0,
    } as Parameters<typeof FServiceAPI.Resource.addResourceItems_Draft>[0]);
    await refreshCollectionDraftState(ctx.collection, opts.cwd);
  }

  return { collectionId, created };
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
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
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
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
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
    await refreshCollectionDraftState(ctx.collection, opts.cwd);
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
  await refreshCollectionDraftState(ctx.collection, opts.cwd);
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

  const next: CollectionProject = {
    ...ctx.collection,
    resourceTitle: opts.title ?? ctx.collection.resourceTitle,
    intro: opts.intro ?? ctx.collection.intro,
    coverImages: coverUrl ? [coverUrl] : ctx.collection.coverImages,
    tags: opts.tags ?? ctx.collection.tags,
    display: Object.keys(display).length
      ? { ...(ctx.collection.display || {}), ...display }
      : ctx.collection.display,
  };
  saveCollectionProject(next, opts.cwd);
  return next;
}

export async function collectionVersionSet(opts: {
  cwd?: string;
  version?: string;
  description?: string;
}) {
  if (opts.version !== undefined) {
    assertSemverLike(opts.version);
  }
  const { data: collection } = loadCollectionProject(opts.cwd);
  const next: CollectionProject = {
    ...collection,
    version: opts.version ?? collection.version ?? '1.0.0',
    description: opts.description ?? collection.description ?? '',
  };
  saveCollectionProject(next, opts.cwd);
  return next;
}

export async function collectionPolicyApply(opts: {
  cwd?: string;
  fromFile: string;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const items = parsePolicyFile(opts.fromFile);
  await FServiceAPI.Resource.update({
    resourceId: ctx.collection.resourceId!,
    ...buildPolicyUpdatePayload(items),
  } as Parameters<typeof FServiceAPI.Resource.update>[0]);
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  savePlatformCollectionState({ ...ctx.collection, ...info }, opts.cwd);
  return items;
}

export async function collectionPolicyList(opts: { cwd?: string }) {
  const ctx = await ensureCollectionOwner({ cwd: opts.cwd });
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  return info.policies || [];
}

export async function collectionPolicySetStatus(opts: {
  cwd?: string;
  policyId: string;
  status: 0 | 1;
  noAutoPull?: boolean;
}) {
  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  assertPolicyStatusChangeAllowed(ctx.info, opts.policyId, opts.status);
  await FServiceAPI.Resource.update({
    resourceId: ctx.collection.resourceId!,
    updatePolicies: [{ policyId: opts.policyId, status: opts.status }],
  } as Parameters<typeof FServiceAPI.Resource.update>[0]);
  const info = await fetchResourceInfo(ctx.collection.resourceId!);
  savePlatformCollectionState({ ...ctx.collection, ...info }, opts.cwd);
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

async function refreshCollectionDraftState(collection: CollectionProject, cwd?: string) {
  const catalogueDraft = await fetchDraftItems(collection.resourceId!);
  savePlatformCollectionState(collection, cwd, {
    catalogueDraft,
    catalogueProperty: collection.display,
  });
  return catalogueDraft;
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

  await FServiceAPI.Resource.updateCollection(
    buildCollectionPublishParams({
      resourceId,
      collection: ctx.collection,
      mergeCatalogueDraft: 1,
    }),
  );

  const info = await fetchResourceInfo(resourceId);
  savePlatformCollectionState({ ...ctx.collection, ...info }, opts.cwd, {
    catalogueDraft: items,
    catalogueProperty: ctx.collection.display,
  });
  return { resourceId, itemCount: items.length };
}

export async function pullCollection(opts: {
  cwd?: string;
  applyListing?: boolean;
  force?: boolean;
}) {
  const auth = requireAuth();
  const { data: collection } = loadCollectionProject(opts.cwd);
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

  const withDraft = { ...collection, catalogueItems, collectRules };
  const next = opts.applyListing
    ? applyOwnerToCollection(withDraft, info)
    : applyPlatformFactsToCollection(withDraft, info);
  if (opts.applyListing) {
    assertApplyListingAllowed({
      local: collection,
      info,
      cwd: opts.cwd,
      force: opts.force,
      collection: true,
    });
    saveCollectionProject(next, opts.cwd);
  } else {
    savePlatformCollectionState(next, opts.cwd, {
      catalogueDraft: catalogueItems,
      catalogueProperty: next.display,
      collectRules,
    });
  }
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
  saveCollectionProject(next, opts.cwd);
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
  saveCollectionProject({ ...ctx.collection, rssFeedUrl: feedUrl }, opts.cwd);
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

