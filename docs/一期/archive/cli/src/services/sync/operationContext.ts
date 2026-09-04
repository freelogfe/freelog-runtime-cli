import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { ResourceProject, VersionProject } from '../../config/project.js';
import { applyPlatformFactsToResource, listingDrifted } from '../shared/listing.js';
import { ensureOwner } from './owner.js';
import { fetchResourceInfo } from './fetch.js';
import { pullResourceToLocal } from './pullResource.js';
import type { OperationContext } from './types.js';
import type { ProjectStore } from '../store/types.js';

export async function ensureOperationContext(opts: {
  store: ProjectStore;
  noAutoPull?: boolean;
  dryRun?: boolean;
  allowCreateWithoutId?: boolean;
}): Promise<OperationContext> {
  const owner = await ensureOwner({
    store: opts.store,
    allowCreateWithoutId: opts.allowCreateWithoutId,
  });

  let resource: ResourceProject = { ...opts.store.loadResource(), ...owner.resource };
  let platform = owner.info;
  let listingWasDrifted = false;

  if (opts.store.supportsListingSync()) {
    listingWasDrifted = listingDrifted(resource, platform);
    if (listingWasDrifted) {
      if (opts.noAutoPull || opts.dryRun) {
        throw cliError(I18N_KEYS.resource_info_mismatch, {
          code: 3,
          hint: 'freelog-cli pull 或去掉 --no-auto-pull',
        });
      }
      const pulled = await pullResourceToLocal({ store: opts.store });
      resource = pulled.resource;
      platform = pulled.info;
      listingWasDrifted = false;
    }
  } else if (opts.store.resolveResourceId()) {
    platform = await fetchResourceInfo(opts.store.resolveResourceId()!);
    resource = applyPlatformFactsToResource(resource, platform);
    if (!opts.dryRun) {
      opts.store.savePlatformFacts(resource);
    }
  }

  const versionLoaded = opts.store.tryLoadVersion();
  let version: VersionProject | undefined;
  if (versionLoaded) {
    version = {
      ...versionLoaded,
      resourceId: platform.resourceId || versionLoaded.resourceId,
      resourceName: platform.resourceName || versionLoaded.resourceName,
      resourceTypeCode: platform.resourceTypeCode || versionLoaded.resourceTypeCode,
      userId: platform.userId,
      username: platform.username,
    };
  }

  return {
    mode: opts.store.mode(),
    auth: owner.auth,
    resource,
    version,
    platform,
    listingDrifted: listingWasDrifted,
  };
}
