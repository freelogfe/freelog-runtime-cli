import type { RuntimeVersion, VersionProject } from '../../config/project/types.js';
import { fetchResourceInfo } from '../sync/fetch.js';
import type { ProjectStore } from '../store/types.js';
import { fetchReleasedVersionSnapshot } from '../versionPropertyService.js';

export async function applyReuseVersionIntent(opts: {
  store: ProjectStore;
  resourceId: string;
  resourceName?: string;
  resourceTypeCode?: string;
  userId?: number | string;
  username?: string;
  reuseVersion: string;
  targetVersion: string;
  description?: string;
  videoCover?: string;
  runtime?: RuntimeVersion;
  noInheritDeps?: boolean;
}): Promise<VersionProject> {
  const snapshot = await fetchReleasedVersionSnapshot({
    resourceId: opts.resourceId,
    version: opts.reuseVersion,
    resourceTypeCode: opts.resourceTypeCode,
  });
  const platform = await fetchResourceInfo(opts.resourceId);
  const next: VersionProject = {
    version: opts.targetVersion,
    resourceId: opts.resourceId,
    resourceName: opts.resourceName,
    resourceTypeCode: opts.resourceTypeCode,
    userId: opts.userId,
    username: opts.username,
    filePath: '',
    fileSha1: snapshot.fileSha1,
    filename: snapshot.filename,
    reusePlatformFile: true,
    description: opts.description ?? snapshot.description,
    dependencies: opts.noInheritDeps ? [] : snapshot.dependencies ?? [],
    inputAttrs: snapshot.inputAttrs,
    customPropertyDescriptors: snapshot.customPropertyDescriptors,
    baseUpcastResources: (platform.baseUpcastResources || []).map((item) => ({
      resourceId: item.resourceId,
      resourceName: item.resourceName,
    })),
    videoCover: opts.videoCover,
    runtimeVersion: opts.runtime,
    authExcludedItems: [],
  } satisfies VersionProject;
  opts.store.saveVersion(next);
  return next;
}
