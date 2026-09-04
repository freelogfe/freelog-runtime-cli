import type { ArtifactMode, RuntimeVersion, VersionProject } from '../../config/project/types.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { ensureOperationContext } from '../sync/operationContext.js';
import type { ProjectStore } from '../store/types.js';
import { computeBumpedVersion } from './publishVersion.js';
import { applyReuseVersionIntent } from './reuseVersionIntent.js';

export async function applySessionPublishIntent(opts: {
  store: ProjectStore;
  file?: string;
  reuseVersion?: string;
  version?: string;
  bump?: boolean;
  description?: string;
  videoCover?: string;
  artifactMode?: ArtifactMode;
  runtime?: RuntimeVersion;
  noInheritDeps?: boolean;
}): Promise<VersionProject> {
  const resourceId = opts.store.resolveResourceId();
  if (!resourceId) {
    throw cliError(I18N_KEYS.session_resource_id_required, {
      code: 4,
      hint: '首发请省略 --resource-id，由 createThenPublish 创建资源',
    });
  }
  if (opts.reuseVersion && opts.file) {
    throw cliError(I18N_KEYS.session_reuse_file_mutex, { code: 4 });
  }
  if (!opts.reuseVersion && !opts.file?.trim()) {
    throw cliError(I18N_KEYS.session_publish_file_or_reuse, { code: 4 });
  }

  const ctx = await ensureOperationContext({ store: opts.store });
  let version = opts.version?.trim();
  if (opts.bump) {
    version = computeBumpedVersion(ctx.platform.latestVersion);
  }
  if (!version) {
    throw cliError(I18N_KEYS.manifest_version_missing, {
      code: 4,
      hint: '传 --version 或 --bump',
    });
  }

  const base: Partial<VersionProject> = {
    version,
    resourceId,
    resourceName: ctx.resource.resourceName,
    resourceTypeCode: ctx.resource.resourceTypeCode,
    userId: ctx.resource.userId,
    username: ctx.resource.username,
    authExcludedItems: [],
  };

  if (opts.reuseVersion) {
    return applyReuseVersionIntent({
      store: opts.store,
      resourceId,
      resourceName: ctx.resource.resourceName,
      resourceTypeCode: ctx.resource.resourceTypeCode,
      userId: ctx.resource.userId,
      username: ctx.resource.username,
      reuseVersion: opts.reuseVersion,
      targetVersion: version,
      description: opts.description,
      videoCover: opts.videoCover,
      runtime: opts.runtime,
      noInheritDeps: opts.noInheritDeps,
    });
  }

  const next: VersionProject = {
    ...base,
    version,
    filePath: opts.file!.trim(),
    description: opts.description,
    videoCover: opts.videoCover,
    artifactMode: opts.artifactMode,
    runtimeVersion: opts.runtime,
    dependencies: opts.store.tryLoadVersion()?.dependencies ?? [],
    baseUpcastResources: opts.store.tryLoadVersion()?.baseUpcastResources ?? [],
    authExcludedItems: [],
  } satisfies VersionProject;
  opts.store.saveVersion(next);
  return next;
}
