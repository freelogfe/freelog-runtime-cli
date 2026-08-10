import { requireAuth } from '../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import {
  loadCollectionProject,
  loadResourceProject,
  savePlatformResourceState,
  tryLoadManifest,
  type ProjectSubject,
} from '../config/project.js';
import { pullCollection } from './collection/index.js';
import {
  fetchResourceInfo,
  ownersMatch,
  pullResourceToLocal,
  type PlatformResourceInfo,
} from './sync/index.js';

function platformToResourcePatch(info: PlatformResourceInfo) {
  return {
    resourceId: info.resourceId,
    resourceName: info.resourceName,
    resourceType: info.resourceType,
    resourceTypeCode: info.resourceTypeCode,
    resourceTitle: info.resourceTitle,
    intro: info.intro,
    coverImages: info.coverImages,
    tags: info.tags,
    userId: info.userId,
    username: info.username,
    status: info.status,
    latestVersion: info.latestVersion,
    policies: info.policies,
    updateDate: info.updateDate,
  };
}

/** 将现有平台资源绑定到本地项目，然后刷新平台事实；仅显式请求时采用平台展示字段。 */
export async function bindProject(opts: {
  cwd?: string;
  target: string;
  applyListing?: boolean;
  force?: boolean;
  yes?: boolean;
}) {
  assertExplicitEnvForWriteOperation();
  const auth = requireAuth();
  const target = opts.target?.trim();
  if (!target) {
    throw cliError(I18N_KEYS.missing_resource_id_or_name, { code: 4 });
  }

  const manifestLoaded = tryLoadManifest(opts.cwd);
  if (!manifestLoaded) {
    throw cliError(I18N_KEYS.manifest_not_found, {
      code: 4,
      hint: '先运行 freelog-cli init，或使用 --scaffold none|collection 接入现有目录',
    });
  }

  const subject: ProjectSubject = manifestLoaded.data.subject;
  const local =
    subject === 'collection'
      ? loadCollectionProject(opts.cwd).data
      : loadResourceProject(opts.cwd).data;

  if (local.resourceId?.trim() && local.resourceId !== target && !opts.force) {
    throw cliError(I18N_KEYS.dir_already_bound, {
      code: 3,
      hint: '如需更换绑定，请同时传 --force --yes',
    });
  }

  const info = await fetchResourceInfo(target);
  if (!ownersMatch(auth.userId, info.userId)) {
    throw cliError(I18N_KEYS.resource_owner_mismatch, {
      code: 2,
      params: {
        owner: String(info.username || info.userId),
        current: String(auth.username || auth.userId),
      },
      hint: '请使用当前账号拥有的 resourceId',
    });
  }

  savePlatformResourceState(
    {
      ...local,
      ...platformToResourcePatch(info),
      resourceName: info.resourceName ?? local.resourceName,
      resourceType: info.resourceType ?? local.resourceType,
    },
    opts.cwd,
    subject,
  );

  if (subject === 'collection') {
    const pulled = await pullCollection({
      cwd: opts.cwd,
      applyListing: opts.applyListing,
      force: opts.force,
    });
    return {
      subject,
      resourceId: info.resourceId,
      resourceName: info.resourceName,
      latestVersion: info.latestVersion,
      collection: pulled.collection,
    };
  }

  const pulled = await pullResourceToLocal({
    cwd: opts.cwd,
    applyListing: opts.applyListing,
    force: opts.force,
  });
  return {
    subject,
    resourceId: info.resourceId,
    resourceName: info.resourceName,
    latestVersion: info.latestVersion,
    resource: pulled.resource,
  };
}
