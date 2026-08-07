import {
  loadCollectionProject,
  saveCollectionProject,
  type CollectionProject,
} from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { assertIntro, assertResourceTitle, assertTags } from '../validation.js';
import { resolveCoverImageUrl } from '../coverUpload.js';
import { ensureCollectionOwner, ensureCollectionSynced } from './owner.js';
import { mapDisplayFlags } from './internal.js';

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
  if (opts.intro !== undefined) assertIntro(opts.intro);
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
    throw cliError(I18N_KEYS.collection_fixed_version, {
      code: 4,
      hint: '官方 updateCollection 接口说明：合集目前固定版本，所以无需传递版本号；这里只能设置 --description',
    });
  }
  const { data: collection } = loadCollectionProject(opts.cwd);
  const next: CollectionProject = {
    ...collection,
    description: opts.description ?? collection.description ?? '',
  };
  saveCollectionProject(next, opts.cwd);
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
