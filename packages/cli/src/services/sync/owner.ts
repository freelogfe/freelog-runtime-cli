import { consola } from 'consola';
import { requireAuth } from '../../core/auth.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  loadResourceProject,
  savePlatformResourceState,
  tryLoadVersionProject,
} from '../../config/project.js';
import type { VersionProject } from '../../config/project.js';
import { assertOwnerMatch } from '../shared/owner.js';
import { applyPlatformFactsToResource } from '../shared/listing.js';
import { fetchResourceInfo } from './fetch.js';
import type { EnsureOwnerResult } from './types.js';

export async function ensureOwner(opts: {
  cwd?: string;
  allowCreateWithoutId?: boolean;
}): Promise<EnsureOwnerResult> {
  const auth = requireAuth();
  const { data: resource } = loadResourceProject(opts.cwd);
  const resourceId = resource.resourceId?.trim();

  if (!resourceId) {
    if (opts.allowCreateWithoutId) {
      return {
        auth,
        resource,
        info: { resourceId: '' },
      };
    }
    throw cliError(I18N_KEYS.no_local_resource_id, {
      code: 4,
      hint: '新目录先执行 freelog-cli init <name> --resource-type <code>，再执行 freelog-cli create',
    });
  }

  const info = await fetchResourceInfo(resourceId);
  assertOwnerMatch({
    authUserId: auth.userId,
    authUsername: auth.username,
    platformUserId: info.userId,
    platformUsername: info.username,
    hint: '切换账号或更换目录',
  });

  const nextResource = applyPlatformFactsToResource(resource, info);
  if (info.username && resource.username && info.username !== resource.username) {
    consola.warn(`username 已以平台为准更新: ${resource.username} → ${info.username}`);
  }
  savePlatformResourceState(nextResource, opts.cwd);

  let version: VersionProject | undefined;
  const versionLoaded = tryLoadVersionProject(opts.cwd);
  if (versionLoaded) {
    version = {
      ...versionLoaded.data,
      resourceId: info.resourceId,
      resourceName: info.resourceName || versionLoaded.data.resourceName,
      resourceTypeCode: info.resourceTypeCode || versionLoaded.data.resourceTypeCode,
      userId: info.userId,
      username: info.username,
    };
  }

  return { auth, resource: nextResource, info, version };
}
