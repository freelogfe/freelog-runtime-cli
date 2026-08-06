import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import {
  loadCollectionProject,
  loadResourceProject,
  savePlatformResourceState,
  tryLoadManifest,
  type ProjectSubject,
} from '../config/project.js';
import { pullCollection } from './collectionService.js';
import {
  fetchResourceInfo,
  ownersMatch,
  pullResourceToLocal,
  type PlatformResourceInfo,
} from './syncService.js';

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

/** 绑定 Console 已有资源：写 state.resourceId 后 pull（≅ 手工改 state + pull） */
export async function bindProject(opts: {
  cwd?: string;
  target: string;
  applyListing?: boolean;
  force?: boolean;
  yes?: boolean;
}) {
  const auth = requireAuth();
  const target = opts.target?.trim();
  if (!target) {
    throw new CliError('缺少 resourceId 或 username/shortname', { code: 4 });
  }

  const manifestLoaded = tryLoadManifest(opts.cwd);
  if (!manifestLoaded) {
    throw new CliError('未找到 freelog.manifest.json', {
      code: 4,
      hint: '先 freelog-cli init … --scaffold none|collection',
    });
  }

  const subject: ProjectSubject = manifestLoaded.data.subject;
  const local =
    subject === 'collection'
      ? loadCollectionProject(opts.cwd).data
      : loadResourceProject(opts.cwd).data;

  if (local.resourceId?.trim() && local.resourceId !== target && !opts.force) {
    throw new CliError(`目录已绑定 ${local.resourceId}`, {
      code: 3,
      hint: '确认换绑后加 --force --yes',
    });
  }

  const info = await fetchResourceInfo(target);
  if (!ownersMatch(auth.userId, info.userId)) {
    throw new CliError(
      `资源属于 ${info.username || info.userId}，当前登录为 ${auth.username || auth.userId}`,
      { code: 2, hint: '切换账号或确认 resourceId' },
    );
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
