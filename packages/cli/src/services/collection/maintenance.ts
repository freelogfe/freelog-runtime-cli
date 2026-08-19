import type { CollectionProject } from '../../config/project.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { assertIntro, assertResourceTitle, assertTags } from '../validation.js';
import { resolveCoverImageUrl } from '../coverUpload.js';
import { ensureCollectionOwner, ensureCollectionSynced } from './owner.js';
import { mapDisplayFlags } from './internal.js';
import { assertRssManagedContentEditable, isRssRelatedResource } from './rssContract.js';
import { collectionStoreFromCwd } from '../store/index.js';

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
  assertExplicitEnvForWriteOperation();
  const normalizedTitle = opts.title?.trim();
  const normalizedTags = opts.tags
    ? [...new Set(opts.tags.map((tag) => tag.trim()))]
    : undefined;
  if (normalizedTitle !== undefined) assertResourceTitle(normalizedTitle, true);
  if (opts.intro !== undefined) assertIntro(opts.intro);
  assertTags(normalizedTags);

  const ctx = await ensureCollectionSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const store = collectionStoreFromCwd(opts.cwd);
  const resourceId = ctx.collection.resourceId!;

  const changesRssManagedListing =
    opts.title !== undefined ||
    opts.intro !== undefined ||
    opts.cover !== undefined ||
    opts.tags !== undefined ||
    opts.displaySort !== undefined ||
    opts.displayTitle !== undefined ||
    opts.displayNo !== undefined ||
    opts.displayImage !== undefined ||
    opts.displayDescr !== undefined ||
    opts.displayView !== undefined;
  if (changesRssManagedListing && isRssRelatedResource(ctx.info)) {
    assertRssManagedContentEditable(ctx.info, '修改标题、封面、标签、简介或目录展示');
  }

  let coverUrl: string | undefined;
  if (opts.cover !== undefined) {
    coverUrl = await resolveCoverImageUrl(opts.cover, opts.cwd);
  }

  const params: Record<string, unknown> = { resourceId };
  if (normalizedTitle !== undefined) params.resourceTitle = normalizedTitle;
  if (opts.intro !== undefined) params.intro = opts.intro;
  if (coverUrl !== undefined) params.coverImages = [coverUrl];
  if (normalizedTags !== undefined) params.tags = normalizedTags;

  const hasListing =
    opts.title !== undefined ||
    opts.intro !== undefined ||
    coverUrl !== undefined ||
    opts.tags !== undefined;
  const display = mapDisplayFlags({
    sort: opts.displaySort,
    title: opts.displayTitle,
    no: opts.displayNo,
    image: opts.displayImage,
    descr: opts.displayDescr,
    view: opts.displayView,
  });

  const completedRemoteStages: string[] = [];
  try {
    if (hasListing) {
      await FServiceAPI.Resource.update(
        params as unknown as Parameters<typeof FServiceAPI.Resource.update>[0],
      );
      completedRemoteStages.push('listing');
    }
    if (Object.keys(display).length) {
      await FServiceAPI.Resource.updateCollection({
        resourceId,
        catalogueProperty: display,
      } as Parameters<typeof FServiceAPI.Resource.updateCollection>[0]);
      completedRemoteStages.push('display');
    }
  } catch (error) {
    if (!completedRemoteStages.length) throw error;
    throw cliError('合集部分字段已在平台更新，剩余字段未确认；使用相同参数重试可安全对账', {
      code: 1,
      cause: error,
      details: { error: 'REMOTE_WRITE_PARTIAL', completedRemoteStages },
      hint: '不要反向修改已完成字段；直接使用相同 collection update 参数重试',
    });
  }

  const next: CollectionProject = {
    ...ctx.collection,
    resourceTitle: normalizedTitle ?? ctx.collection.resourceTitle,
    intro: opts.intro ?? ctx.collection.intro,
    coverImages: coverUrl ? [coverUrl] : ctx.collection.coverImages,
    tags: normalizedTags ?? ctx.collection.tags,
    display: Object.keys(display).length
      ? { ...(ctx.collection.display || {}), ...display }
      : ctx.collection.display,
  };
  store.savePatch(
    {
      ...(opts.title !== undefined ? { resourceTitle: next.resourceTitle } : {}),
      ...(opts.intro !== undefined ? { intro: next.intro } : {}),
      ...(opts.cover !== undefined ? { coverImages: next.coverImages } : {}),
      ...(opts.tags !== undefined ? { tags: next.tags } : {}),
      ...(Object.keys(display).length ? { display: next.display } : {}),
    },
    {
      expectedResourceId: resourceId,
      expected: {
        ...(opts.title !== undefined ? { resourceTitle: ctx.collection.resourceTitle } : {}),
        ...(opts.intro !== undefined ? { intro: ctx.collection.intro } : {}),
        ...(opts.cover !== undefined ? { coverImages: ctx.collection.coverImages } : {}),
        ...(opts.tags !== undefined ? { tags: ctx.collection.tags } : {}),
        ...(Object.keys(display).length ? { display: ctx.collection.display } : {}),
      },
    },
  );
  return store.load();
}

export async function collectionVersionSet(opts: {
  cwd?: string;
  version?: string;
  description?: string;
}) {
  if (opts.version !== undefined) {
    throw cliError(I18N_KEYS.collection_fixed_version, {
      code: 4,
      hint: '官方 updateCollection 接口说明：合集目前固定版本，所以无需传递版本号；这里只能设置 --description',
    });
  }
  const store = collectionStoreFromCwd(opts.cwd);
  const collection = store.load();
  if (collection.resourceId) {
    const ctx = await ensureCollectionOwner({ cwd: opts.cwd, readOnly: true });
    assertRssManagedContentEditable(ctx.info, '修改合集发版描述');
  }
  const next: CollectionProject = {
    ...collection,
    description: opts.description ?? collection.description ?? '',
  };
  store.save(next);
  return next;
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
