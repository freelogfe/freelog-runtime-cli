import { requireAuth } from '../../core/auth.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { ResourceProject, VersionProject } from '../../config/project.js';
import type { ProjectStore } from '../store/types.js';
import { ownersMatch } from '../shared/owner.js';
import {
  applyOwnerToResource,
  applyPlatformFactsToResource,
  assertApplyListingAllowed,
} from '../shared/listing.js';
import { fetchResourceInfo } from './fetch.js';
import type { PlatformResourceInfo } from './types.js';

export async function pullResourceToLocal(opts: {
  store: ProjectStore;
  version?: string;
  applyListing?: boolean;
  force?: boolean;
}): Promise<{
  resource: ResourceProject;
  version?: VersionProject;
  info: PlatformResourceInfo;
}> {
  const store = opts.store;
  const auth = requireAuth();
  const resource = store.loadResource();
  const id = resource.resourceId?.trim() || resource.resourceName;
  if (!id) {
    throw cliError(I18N_KEYS.pull_missing_id, { code: 4 });
  }
  const info = await fetchResourceInfo(id);
  if (
    Number.isFinite(Number(auth.userId)) &&
    Number.isFinite(Number(info.userId)) &&
    !ownersMatch(auth.userId, info.userId)
  ) {
    throw cliError(I18N_KEYS.pull_owner_denied, { code: 2 });
  }

  const nextResource = opts.applyListing
    ? applyOwnerToResource(resource, info)
    : applyPlatformFactsToResource(resource, info);
  if (opts.applyListing) {
    assertApplyListingAllowed({ local: resource, info, cwd: store.rootDir(), force: opts.force });
    store.saveResource(nextResource);
  } else {
    store.savePlatformFacts(nextResource);
  }

  let version: VersionProject | undefined;
  const versionLoaded = store.tryLoadVersion();
  const targetVersion = opts.version || versionLoaded?.version || info.latestVersion;
  if (versionLoaded) {
    version = {
      ...versionLoaded,
      resourceId: info.resourceId,
      resourceName: info.resourceName || versionLoaded.resourceName,
      resourceTypeCode: info.resourceTypeCode || versionLoaded.resourceTypeCode,
      userId: info.userId,
      username: info.username,
      version: opts.version || versionLoaded.version,
    };
    if (opts.version) {
      store.saveVersion(version);
    }
  } else if (targetVersion) {
    version = {
      resourceId: info.resourceId,
      resourceName: info.resourceName,
      resourceTypeCode: info.resourceTypeCode,
      version: targetVersion,
      filePath: 'dist',
      userId: info.userId,
      username: info.username,
    };
    if (opts.version) {
      store.saveVersion(version);
    }
  }

  return { resource: nextResource, version, info };
}
