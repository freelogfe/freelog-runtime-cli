import { requireAuth } from '../../core/auth.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  loadResourceProject,
  savePlatformResourceState,
  saveResourceProject,
  saveVersionProject,
  tryLoadVersionProject,
} from '../../config/project.js';
import type { ResourceProject, VersionProject } from '../../config/project.js';
import { ownersMatch } from '../shared/owner.js';
import {
  applyOwnerToResource,
  applyPlatformFactsToResource,
  assertApplyListingAllowed,
  listingDrifted,
} from '../shared/listing.js';
import { fetchResourceInfo } from './fetch.js';
import { ensureOwner } from './owner.js';
import type { EnsureOwnerResult, PlatformResourceInfo } from './types.js';

export { ownersMatch } from '../shared/owner.js';

export async function ensureSynced(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  owner?: EnsureOwnerResult;
}): Promise<EnsureOwnerResult> {
  const owner = opts.owner || (await ensureOwner({ cwd: opts.cwd }));
  if (!owner.info.resourceId) return owner;

  const drifted = listingDrifted(owner.resource, owner.info);

  if (drifted) {
    if (opts.noAutoPull) {
      throw cliError(I18N_KEYS.resource_info_mismatch, {
        code: 3,
        hint: 'freelog-cli pull 或去掉 --no-auto-pull',
      });
    }
    const pulled = await pullResourceToLocal({ cwd: opts.cwd });
    return {
      ...owner,
      resource: pulled.resource,
      info: pulled.info,
      version: pulled.version,
    };
  }

  return owner;
}

export async function pullResourceToLocal(opts: {
  cwd?: string;
  version?: string;
  applyListing?: boolean;
  force?: boolean;
}): Promise<{
  resource: ResourceProject;
  version?: VersionProject;
  info: PlatformResourceInfo;
}> {
  const auth = requireAuth();
  const { data: resource } = loadResourceProject(opts.cwd);
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
    assertApplyListingAllowed({ local: resource, info, cwd: opts.cwd, force: opts.force });
    saveResourceProject(nextResource, opts.cwd);
  } else {
    savePlatformResourceState(nextResource, opts.cwd);
  }

  let version: VersionProject | undefined;
  const versionLoaded = tryLoadVersionProject(opts.cwd);
  const targetVersion = opts.version || versionLoaded?.data.version || info.latestVersion;
  if (versionLoaded) {
    version = {
      ...versionLoaded.data,
      resourceId: info.resourceId,
      resourceName: info.resourceName || versionLoaded.data.resourceName,
      resourceTypeCode: info.resourceTypeCode || versionLoaded.data.resourceTypeCode,
      userId: info.userId,
      username: info.username,
      version: opts.version || versionLoaded.data.version,
    };
    if (opts.version) {
      saveVersionProject(version, opts.cwd);
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
      saveVersionProject(version, opts.cwd);
    }
  }

  return { resource: nextResource, version, info };
}
