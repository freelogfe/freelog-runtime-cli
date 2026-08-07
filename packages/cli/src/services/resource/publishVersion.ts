import semver from 'semver';
import { CliError } from '../../core/errors.js';
import { loadVersionProject, saveVersionProject } from '../../config/project.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { ensureSynced } from '../sync/index.js';
import { assertSemverLike } from '../validation.js';
import { uploadFileIfNeeded } from '../storageUpload.js';
import { cleanupTempFile, processFileForPublish } from '../processFile.js';
import { assertResourceTypeCode } from '../typeService.js';
import { assertOptionalConfigAllowed } from '../resourceTypeCapabilities.js';
import { resolveCoverImageUrl } from '../coverUpload.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  inheritDataFromVersionConfig,
  resolveCreateVersionPropertiesFromFile,
} from '../fileProperty/index.js';
import {
  assertPublishNotCollectionCwd,
  assertPublishVersionReady,
  assertVersionGreaterThanLatest,
  isFrozenStatus,
} from '../shared/guards/index.js';
import {
  buildCreateVersionParams,
  type CreateVersionParams,
} from './createVersionParams.js';

function needsRuntimeVersion(resourceType: string[] | undefined, code: string | undefined): boolean {
  const joined = [...(resourceType || []), code || ''].join(' ').toLowerCase();
  return (
    joined.includes('??') ||
    joined.includes('??') ||
    joined.includes('theme') ||
    joined.includes('widget') ||
    joined.includes('plugin')
  );
}

/** --bump ??? latest ??? patch?? latest ? 1.0.0 */
export function computeBumpedVersion(latestVersion?: string): string {
  if (!latestVersion || !semver.valid(latestVersion)) return '1.0.0';
  const next = semver.inc(latestVersion, 'patch');
  if (!next) {
    throw cliError(I18N_KEYS.bump_version_compute_failed, { code: 4 });
  }
  return next;
}

async function assertPublishableVersion(resourceId: string, version: string, latestVersion?: string) {
  assertSemverLike(version);

  try {
    const listEnv = await FServiceAPI.Resource.getVersionListByResourceID({
      resourceId,
    } as Parameters<typeof FServiceAPI.Resource.getVersionListByResourceID>[0]);
    const list = unwrapData<Array<{ version?: string }> | { dataList?: Array<{ version?: string }> }>(
      listEnv,
    );
    const versions = Array.isArray(list)
      ? list
      : Array.isArray((list as { dataList?: unknown[] })?.dataList)
        ? ((list as { dataList: Array<{ version?: string }> }).dataList)
        : [];
    if (versions.some((v) => v.version === version)) {
      throw cliError(I18N_KEYS.version_already_exists, {
        code: 4,
        hint: 'freelog-cli version set --version <???>',
      });
    }
  } catch (error) {
    if (error instanceof CliError && error.code === 4) throw error;
  }

  assertVersionGreaterThanLatest(version, latestVersion);
}

export interface PublishResult {
  resourceId: string;
  version: string;
  fileSha1: string;
  filename: string;
  versionId?: string;
  createVersionParams?: CreateVersionParams;
  dryRun?: boolean;
}

export async function publishVersion(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  bump?: boolean;
  dryRun?: boolean;
  debug?: boolean;
}): Promise<PublishResult> {
  assertPublishNotCollectionCwd(opts.cwd);
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  let { data: versionCfg } = loadVersionProject(opts.cwd);

  if (opts.bump) {
    const bumped = computeBumpedVersion(ctx.info.latestVersion);
    versionCfg = { ...versionCfg, version: bumped };
    saveVersionProject(versionCfg, opts.cwd);
  }

  assertPublishVersionReady(versionCfg);
  if (versionCfg.videoCover?.trim()) {
    versionCfg = {
      ...versionCfg,
      videoCover: await resolveCoverImageUrl(versionCfg.videoCover, opts.cwd),
    };
    saveVersionProject(versionCfg, opts.cwd);
  }

  if (isFrozenStatus(ctx.info.status)) {
    throw cliError(I18N_KEYS.resource_frozen_cannot_publish, {
      code: 4,
      details: { status: ctx.info.status },
    });
  }

  const requireRt = needsRuntimeVersion(ctx.resource.resourceType, ctx.resource.resourceTypeCode);
  if (requireRt && !versionCfg.runtimeVersion) {
    throw cliError(I18N_KEYS.theme_widget_runtime_required, {
      code: 4,
      hint: '?? freelog-cli version set --runtime 0.5??? freelog.manifest.json ? version.runtimeVersion',
    });
  }

  await assertPublishableVersion(resourceId, versionCfg.version, ctx.info.latestVersion);
  const typeInfo = ctx.resource.resourceTypeCode
    ? await assertResourceTypeCode(ctx.resource.resourceTypeCode)
    : undefined;
  assertOptionalConfigAllowed({
    typeInfo,
    customPropertyDescriptors: versionCfg.customPropertyDescriptors,
  });

  const deps = (versionCfg.dependencies as Array<{ resourceId: string }> | undefined) || [];
  if (deps.length > 0) {
    let unresolved: unknown[] | undefined;
    try {
      const treeEnv = await FServiceAPI.Resource.authTree({
        resourceId,
        version: versionCfg.version,
      });
      const tree = unwrapData<{ unresolvedDependencies?: unknown[] } | unknown[]>(treeEnv);
      unresolved =
        tree && typeof tree === 'object' && !Array.isArray(tree)
          ? (tree as { unresolvedDependencies?: unknown[] }).unresolvedDependencies
          : undefined;
    } catch (error) {
      if (error instanceof CliError && error.code === 5) throw error;
      throw cliError(I18N_KEYS.publish_dep_auth_tree_failed, {
        code: 5,
        details: {
          unresolvedDependencies: deps,
          consoleHint: `?? Console ???????????? ${resourceId}`,
          cause: error instanceof Error ? error.message : String(error),
        },
        hint: '?? Console ????????????? freelog.manifest.json ? version.dependencies ???',
      });
    }
    if (Array.isArray(unresolved) && unresolved.length > 0) {
      throw cliError(I18N_KEYS.cli_dependency_unauthorized, {
        code: 5,
        details: {
          unresolvedDependencies: unresolved,
          consoleHint: `?? Console ???????????? ${resourceId}`,
        },
        hint: '?? Console ?????????',
      });
    }
  }

  const processed = await processFileForPublish({
    versionConfig: versionCfg,
    resourceName: ctx.resource.resourceName || versionCfg.resourceName || 'resource',
    resourceType: ctx.resource.resourceType || versionCfg.resourceType,
    resourceTypeCode: ctx.resource.resourceTypeCode,
    resourceTypeInfo: typeInfo,
    cwd: opts.cwd,
  });

  try {
    await uploadFileIfNeeded(processed.filePath, processed.fileSha1);

    const resourceTypeCode = ctx.resource.resourceTypeCode;
    if (!resourceTypeCode) {
      throw cliError(I18N_KEYS.missing_type_for_file_properties, { code: 4 });
    }

    const resolvedProperties = await resolveCreateVersionPropertiesFromFile({
      sha1: processed.fileSha1,
      resourceTypeCode,
      inheritData: inheritDataFromVersionConfig(versionCfg),
    });
    versionCfg = {
      ...versionCfg,
      inputAttrs: resolvedProperties.inputAttrs,
      customPropertyDescriptors: resolvedProperties.customPropertyDescriptors,
    };
    saveVersionProject(versionCfg, opts.cwd);

    const createVersionParams = buildCreateVersionParams({
      resourceId,
      versionCfg,
      fileSha1: processed.fileSha1,
      filename: processed.filename,
    });

    if (opts.dryRun) {
      return {
        resourceId,
        version: versionCfg.version,
        fileSha1: processed.fileSha1,
        filename: processed.filename,
        createVersionParams,
        dryRun: true,
      };
    }

    const envelope = await FServiceAPI.Resource.createVersion(createVersionParams);
    const data = unwrapData<{ versionId?: string; version?: string }>(envelope);

    saveVersionProject(
      {
        ...versionCfg,
        resourceId,
        userId: ctx.resource.userId,
        username: ctx.resource.username,
        fileSha1: processed.fileSha1,
        filename: processed.filename,
        versionId: data?.versionId,
        published: true,
      },
      opts.cwd,
    );

    return {
      resourceId,
      version: data?.version || versionCfg.version,
      fileSha1: processed.fileSha1,
      filename: processed.filename,
      versionId: data?.versionId,
      ...(opts.debug || opts.dryRun ? { createVersionParams } : {}),
    };
  } finally {
    if (processed.isTempFile) cleanupTempFile(processed.filePath);
  }
}
