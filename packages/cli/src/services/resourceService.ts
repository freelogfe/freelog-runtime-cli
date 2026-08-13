import { consola } from 'consola';
import { requireAuth } from '../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { t } from '../i18n/index.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureOwner, ensureSynced } from './sync/index.js';
import type { ProjectStore } from './store/types.js';
import { assertIntro, assertResourceTitle, assertTags } from './validation.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import { assertLeafResourceTypeCode } from './typeService.js';
import {
  normalizeCreateName,
  requireAuthUsername,
  resolveCreateApiResourceTypeName,
  toFullResourceName,
} from './resourceName.js';

export interface CreateResourceOptions {
  store: ProjectStore;
  title?: string;
  typeCode?: string;
  name?: string;
  resourceTypeName?: string;
}

function resolveCreateName(opts: {
  explicitName?: string;
  localName?: string;
  title: string;
}): string {
  return normalizeCreateName(opts.explicitName || opts.localName || opts.title);
}

export async function createResource(opts: CreateResourceOptions) {
  assertExplicitEnvForWriteOperation();
  const store = opts.store;
  const auth = requireAuth();
  const username = requireAuthUsername(auth.username);
  const owner = await ensureOwner({ store, allowCreateWithoutId: true });
  const local = owner.resource;
  if (local.resourceId?.trim()) {
    throw cliError(I18N_KEYS.resource_already_exists, {
      code: 4,
      hint: '换目录或先清空 resourceId',
    });
  }

  const title = (opts.title || local.resourceTitle || local.resourceName || '').trim();
  const typeCode = (opts.typeCode || local.resourceTypeCode || '').trim();
  const resourceTypeName = resolveCreateApiResourceTypeName(typeCode, {
    explicit: opts.resourceTypeName,
    manifest: local.resourceTypeName,
  });
  if (!title) {
    throw cliError(I18N_KEYS.naming_convention_resource_title_required, {
      code: 4,
      hint: '传 --title，或在 freelog.manifest.json 写 resource.title',
    });
  }
  if (!typeCode) {
    throw cliError(I18N_KEYS.naming_convention_resource_type_required, {
      code: 4,
      hint: '传 --type，或在 freelog.manifest.json 写 resource.typeCode',
    });
  }
  assertResourceTitle(title, true);
  await assertLeafResourceTypeCode(typeCode);

  const nameSource = opts.name || local.resourceName || title;
  const name = resolveCreateName({
    explicitName: opts.name,
    localName: local.resourceName,
    title,
  });
  if (!opts.name && !local.resourceName && nameSource.trim() !== name) {
    consola.info(t(I18N_KEYS.input_resourceauthid_automodified_msg, { authid: name }));
  }

  const existing = unwrapData(
    await FServiceAPI.Resource.info({
      resourceIdOrName: toFullResourceName(username, name),
    }),
  );
  if (existing) {
    throw cliError(I18N_KEYS.resource_auth_id_exists, {
      code: 4,
      params: { resourceName: toFullResourceName(username, name) },
      hint: '传 --name 指定其他短授权标识',
    });
  }

  const envelope = await FServiceAPI.Resource.create({
    name,
    resourceTypeCode: typeCode,
    resourceTypeName,
    resourceTitle: title,
  });
  const data = unwrapData<{
    resourceId: string;
    resourceName: string;
    resourceType: string[];
    resourceTypeCode: string;
    resourceTypeName?: string;
    userId?: number | string;
    username?: string;
  }>(envelope);

  if (!data?.resourceId) {
    throw cliError(I18N_KEYS.create_missing_resource_id, { code: 1, details: data });
  }

  const next = {
    ...local,
    resourceId: data.resourceId,
    resourceName: data.resourceName || toFullResourceName(username, name),
    resourceType: data.resourceType || local.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || typeCode,
    resourceTypeName: data.resourceTypeName || resourceTypeName,
    resourceTitle: title,
    userId: data.userId ?? auth.userId,
    username: data.username ?? auth.username,
  };
  store.saveResource(next);

  const version = store.tryLoadVersion();
  if (version) {
    store.saveVersion({
      ...version,
      resourceId: data.resourceId,
      resourceName: next.resourceName,
      resourceTypeCode: next.resourceTypeCode,
      userId: next.userId,
      username: next.username,
    });
  }

  return next;
}

export async function updateListing(opts: {
  store: ProjectStore;
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string[];
  noAutoPull?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  if (opts.title !== undefined) assertResourceTitle(opts.title, true);
  if (opts.intro !== undefined) assertIntro(opts.intro);
  assertTags(opts.tags);

  const store = opts.store;
  const ctx = await ensureSynced({ store, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  let coverUrl: string | undefined;
  if (opts.cover !== undefined) {
    coverUrl = await resolveCoverImageUrl(opts.cover, store.rootDir());
  }

  const params: Record<string, unknown> = { resourceId };
  if (opts.title !== undefined) params.resourceTitle = opts.title.trim();
  if (opts.intro !== undefined) params.intro = opts.intro;
  if (coverUrl !== undefined) params.coverImages = [coverUrl];
  if (opts.tags !== undefined) params.tags = [...new Set(opts.tags.map((t) => t.trim()))];

  await FServiceAPI.Resource.update(
    params as unknown as Parameters<typeof FServiceAPI.Resource.update>[0],
  );

  const next = {
    ...ctx.resource,
    resourceTitle: opts.title ?? ctx.resource.resourceTitle,
    intro: opts.intro ?? ctx.resource.intro,
    coverImages: coverUrl ? [coverUrl] : ctx.resource.coverImages,
    tags: opts.tags ?? ctx.resource.tags,
  };
  store.saveResource(next);
  return next;
}
