import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import {
  loadResourceConfig,
  saveResourceConfig,
  saveVersionConfig,
  tryLoadVersionConfig,
} from '../config/read.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureOwner, ensureSynced } from './syncService.js';
import { assertResourceTitle, assertTags } from './validation.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import { assertResourceTypeCode } from './typeService.js';

export interface CreateResourceOptions {
  cwd?: string;
  title: string;
  typeCode: string;
  name?: string;
  resourceTypeName?: string;
}

export async function createResource(opts: CreateResourceOptions) {
  const auth = requireAuth();
  assertResourceTitle(opts.title, true);
  await assertResourceTypeCode(opts.typeCode);
  await ensureOwner({ cwd: opts.cwd, allowCreateWithoutId: true });
  const { data: local } = loadResourceConfig(opts.cwd);
  if (local.resourceId?.trim()) {
    throw new CliError('本地已有 resourceId，勿重复 create', {
      code: 4,
      hint: '换目录或先清空 resourceId',
    });
  }

  const name =
    opts.name ||
    local.resourceName ||
    `${auth.username || 'user'}/${(opts.title || 'resource').replace(/\s+/g, '-').toLowerCase()}`;

  if (name.length > 60) {
    throw new CliError('资源名（授权标识）长度不能超过 60', { code: 4 });
  }

  const envelope = await FServiceAPI.Resource.create({
    name,
    resourceTypeCode: opts.typeCode,
    resourceTypeName: opts.resourceTypeName,
    resourceTitle: opts.title.trim(),
  });
  const data = unwrapData<{
    resourceId: string;
    resourceName: string;
    resourceType: string[];
    resourceTypeCode: string;
    userId?: number | string;
    username?: string;
  }>(envelope);

  if (!data?.resourceId) {
    throw new CliError('create 响应缺少 resourceId', { code: 1, details: data });
  }

  const next = {
    ...local,
    resourceId: data.resourceId,
    resourceName: data.resourceName || name,
    resourceType: data.resourceType || local.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || opts.typeCode,
    resourceTitle: opts.title,
    userId: data.userId ?? auth.userId,
    username: data.username ?? auth.username,
  };
  saveResourceConfig(next, opts.cwd);

  const version = tryLoadVersionConfig(opts.cwd);
  if (version) {
    saveVersionConfig(
      {
        ...version.data,
        resourceId: data.resourceId,
        resourceName: next.resourceName,
        userId: next.userId,
        username: next.username,
      },
      opts.cwd,
    );
  }

  return next;
}

export async function updateListing(opts: {
  cwd?: string;
  title?: string;
  intro?: string;
  cover?: string;
  tags?: string[];
  noAutoPull?: boolean;
}) {
  if (opts.title !== undefined) assertResourceTitle(opts.title, true);
  if (opts.intro !== undefined && opts.intro.length > 1000) {
    throw new CliError('简介长度不能超过 1000', { code: 4 });
  }
  assertTags(opts.tags);

  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  let coverUrl: string | undefined;
  if (opts.cover !== undefined) {
    coverUrl = await resolveCoverImageUrl(opts.cover, opts.cwd);
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
  saveResourceConfig(next, opts.cwd);
  return next;
}
