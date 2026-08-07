export type { PlatformResourceInfo, PlatformVersionDraft, EnsureOwnerResult } from './types.js';

export { fetchResourceInfo, fetchVersionDraft } from './fetch.js';
export {
  applyOwnerToResource,
  applyPlatformFactsToResource,
  listingDrifted,
  assertApplyListingAllowed,
} from './listing.js';
export { ensureOwner } from './owner.js';
export { ensureSynced, pullResourceToLocal, ownersMatch } from './pull.js';
