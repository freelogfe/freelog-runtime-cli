import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import {
  saveResourceProject,
  saveVersionProject,
  tryLoadVersionProject,
} from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureOwner, ensureSynced } from './syncService.js';
import { assertResourceTitle, assertTags } from './validation.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import { assertResourceTypeCode } from './typeService.js';
import {
  normalizeCreateName,
  requireAuthUsername,
  toFullResourceName,
} from './resourceName.js';

export interface CreateResourceOptions {
  cwd?: string;
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
  const auth = requireAuth();
  const username = requireAuthUsername(auth.username);
  const owner = await ensureOwner({ cwd: opts.cwd, allowCreateWithoutId: true });
  const local = owner.resource;
  if (local.resourceId?.trim()) {
    throw new CliError('本地已有 resourceId，勿重复 create', {
      code: 4,
      hint: '换目录或先清空 resourceId',
    });
  }

  const title = (opts.title || local.resourceTitle || local.resourceName || '').trim();
  const typeCode = (opts.typeCode || local.resourceTypeCode || '').trim();
  if (!title) {
    throw new CliError('缺少资源标题', {
      code: 4,
      hint: '传 --title，或在 freelog.manifest.json 写 resource.title',
    });
  }
  if (!typeCode) {
    throw new CliError('缺少资源类型 resourceTypeCode', {
      code: 4,
      hint: '传 --type，或在 freelog.manifest.json 写 resource.typeCode',
    });
  }
  assertResourceTitle(title, true);
  await assertResourceTypeCode(typeCode);

  const name =
    resolveCreateName({
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
    resourceTypeCode: typeCode,
    resourceTypeName: opts.resourceTypeName,
    resourceTitle: title,
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
    resourceName: data.resourceName || toFullResourceName(username, name),
    resourceType: data.resourceType || local.resourceType || [],
    resourceTypeCode: data.resourceTypeCode || typeCode,
    resourceTitle: title,
    userId: data.userId ?? auth.userId,
    username: data.username ?? auth.username,
  };
  saveResourceProject(next, opts.cwd);

  const version = tryLoadVersionProject(opts.cwd);
  if (version) {
    saveVersionProject(
      {
        ...version.data,
        resourceId: data.resourceId,
        resourceName: next.resourceName,
        resourceTypeCode: next.resourceTypeCode,
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
  saveResourceProject(next, opts.cwd);
  return next;
}
