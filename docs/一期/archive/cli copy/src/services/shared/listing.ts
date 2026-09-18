import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { listingFingerprint, loadState } from '../../config/project.js';
import type { ResourceProject } from '../../config/project.js';
import type { PlatformResourceInfo } from './platform/types.js';

type ListingProject = Pick<
  ResourceProject,
  | 'resourceId'
  | 'resourceName'
  | 'resourceType'
  | 'resourceTypeCode'
  | 'resourceTitle'
  | 'intro'
  | 'coverImages'
  | 'tags'
  | 'userId'
  | 'username'
  | 'status'
  | 'latestVersion'
  | 'policies'
>;

/** 采用平台 listing 展示字段（pull --apply-listing） */
export function applyOwnerListing<T extends ListingProject>(local: T, info: PlatformResourceInfo): T {
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

/** 同步平台事实字段（status / latestVersion / policies），不覆盖 listing 展示字段 */
export function applyPlatformFacts<T extends ListingProject>(local: T, info: PlatformResourceInfo): T {
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

export const applyOwnerToResource = applyOwnerListing;
export const applyOwnerToCollection = applyOwnerListing;
export const applyPlatformFactsToResource = applyPlatformFacts;
export const applyPlatformFactsToCollection = applyPlatformFacts;

export function listingDrifted(local: ListingProject, info: PlatformResourceInfo): boolean {
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

export function assertApplyListingAllowed(opts: {
  local: ListingProject;
  info: PlatformResourceInfo;
  cwd?: string;
  force?: boolean;
  collection?: boolean;
}): void {
  if (opts.force) return;
  const subject = opts.collection ? 'collection' : 'resource';
  const state = loadState(opts.cwd, subject).data;
  const baseline = state.sync.listingFingerprint;
  const localChangedSinceBaseline = baseline
    ? listingFingerprint(opts.local) !== baseline
    : listingDrifted(opts.local, opts.info);
  const platformChangedSinceBaseline = baseline
    ? listingFingerprint(opts.info) !== baseline
    : listingDrifted(opts.local, opts.info);
  if (localChangedSinceBaseline && platformChangedSinceBaseline) {
    throw cliError(I18N_KEYS.listing_and_local_both_changed, {
      code: 3,
      hint: opts.collection
        ? '先手动合并，或确认采用平台 listing 后重试：freelog-cli pull --collection --apply-listing --force'
        : '先手动合并，或确认采用平台 listing 后重试：freelog-cli pull --apply-listing --force',
    });
  }
}
