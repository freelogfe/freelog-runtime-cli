import path from 'node:path';
import semver from 'semver';
import { CliError } from '../core/errors.js';
import { loadVersionConfig, saveVersionConfig } from '../config/read.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './syncService.js';
import { assertSemverLike } from './validation.js';
import { uploadFileIfNeeded } from './storageUpload.js';
import { cleanupTempFile, processFileForPublish } from './processFile.js';

function needsRuntimeVersion(resourceType: string[] | undefined, code: string | undefined): boolean {
  const joined = [...(resourceType || []), code || ''].join(' ').toLowerCase();
  return (
    joined.includes('主题') ||
    joined.includes('插件') ||
    joined.includes('theme') ||
    joined.includes('widget') ||
    joined.includes('plugin')
  );
}

/** 供单测与 publish 守卫共用 */
export function isFrozenStatus(status: number | undefined): boolean {
  if (status === undefined || status === null) return false;
  const n = Number(status);
  // 文档：(status&2)===2；亦见 status===2
  return n === 2 || (n & 2) === 2;
}

/** 纯版本比较：新版本须 > latest（latest 无效时跳过 gt） */
export function assertVersionGreaterThanLatest(version: string, latestVersion?: string): void {
  assertSemverLike(version);
  if (!latestVersion || !semver.valid(latestVersion) || !semver.valid(version)) return;
  if (!semver.gt(version, latestVersion)) {
    throw new CliError(`新版本必须大于平台最新版 ${latestVersion}`, {
      code: 4,
      hint: `当前意图 ${version}`,
    });
  }
}

/** --bump：基于平台 latest 升 patch；无 latest 则 1.0.0 */
export function computeBumpedVersion(latestVersion?: string): string {
  if (!latestVersion || !semver.valid(latestVersion)) return '1.0.0';
  const next = semver.inc(latestVersion, 'patch');
  if (!next) {
    throw new CliError(`无法从 ${latestVersion} 计算 bump 版本`, { code: 4 });
  }
  return next;
}

async function assertPublishableVersion(resourceId: string, version: string, latestVersion?: string) {
  assertSemverLike(version);

  // 平台已有同版本 → exit 4
  try {
    const listEnv = await FServiceAPI.Resource.getVersionListByResourceID({
      resourceId,
      // projection 可选
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
      throw new CliError(`版本 ${version} 已存在，不能重复发行`, {
        code: 4,
        hint: 'freelog-cli updateVersion --version <更高版本>',
      });
    }
  } catch (error) {
    if (error instanceof CliError && error.code === 4) throw error;
    // 列表接口失败时仍用 latestVersion 做 gt 校验
  }

  assertVersionGreaterThanLatest(version, latestVersion);
}

export interface PublishResult {
  resourceId: string;
  version: string;
  fileSha1: string;
  filename: string;
  versionId?: string;
}

export async function publishVersion(opts: {
  cwd?: string;
  noAutoPull?: boolean;
  bump?: boolean;
}): Promise<PublishResult> {
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  let { data: versionCfg } = loadVersionConfig(opts.cwd);

  if (opts.bump) {
    const bumped = computeBumpedVersion(ctx.info.latestVersion);
    versionCfg = { ...versionCfg, version: bumped };
    saveVersionConfig(versionCfg, opts.cwd);
  }

  if (!versionCfg.version) {
    throw new CliError('version.config 缺少 version', {
      code: 4,
      hint: 'freelog-cli updateVersion 或 publish --bump',
    });
  }
  if (!versionCfg.filePath) {
    throw new CliError('version.config 缺少 filePath', { code: 4 });
  }

  if (isFrozenStatus(ctx.info.status)) {
    throw new CliError('资源已冻结，无法 publish', {
      code: 4,
      details: { status: ctx.info.status },
    });
  }

  const requireRt = needsRuntimeVersion(ctx.resource.resourceType, ctx.resource.resourceTypeCode);
  if (requireRt && !versionCfg.runtimeVersion) {
    throw new CliError('主题/插件发布必须指定 runtimeVersion（0.4|0.5）', {
      code: 4,
      hint: '在 freelog.version.config 写入 runtimeVersion，或 init --runtime 0.5',
    });
  }

  await assertPublishableVersion(resourceId, versionCfg.version, ctx.info.latestVersion);

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
      throw new CliError('无法校验依赖授权（authTree 失败），存在本地 dependencies 时拒绝 publish', {
        code: 5,
        details: {
          unresolvedDependencies: deps,
          consoleHint: `请在 Console 完成依赖签约后重试：资源 ${resourceId}`,
          cause: error instanceof Error ? error.message : String(error),
        },
        hint: '打开 Console 资源依赖页完成授权，或清空 version.config.dependencies 后重试',
      });
    }
    if (Array.isArray(unresolved) && unresolved.length > 0) {
      throw new CliError('依赖授权未完成', {
        code: 5,
        details: {
          unresolvedDependencies: unresolved,
          consoleHint: `请在 Console 完成依赖签约后重试：资源 ${resourceId}`,
        },
        hint: '打开 Console 资源依赖页完成授权',
      });
    }
  }

  const processed = await processFileForPublish({
    versionConfig: versionCfg,
    resourceName: ctx.resource.resourceName || versionCfg.resourceName || 'resource',
    resourceType: ctx.resource.resourceType || versionCfg.resourceType,
    resourceTypeCode: ctx.resource.resourceTypeCode,
    cwd: opts.cwd,
  });

  try {
    await uploadFileIfNeeded(processed.filePath, processed.fileSha1);

    const inputAttrs: { key: string; value: string }[] = [];
    if (versionCfg.runtimeVersion) {
      inputAttrs.push({ key: 'runtimeVersion', value: String(versionCfg.runtimeVersion) });
    }

    const envelope = await FServiceAPI.Resource.createVersion({
      resourceId,
      version: versionCfg.version,
      fileSha1: processed.fileSha1,
      filename: processed.filename,
      description: versionCfg.description || '',
      dependencies: (deps as Array<{ resourceId: string; versionRange?: string }>).map((d) => ({
        resourceId: d.resourceId,
        versionRange: (d as { versionRange?: string }).versionRange || '',
      })),
      baseUpcastResources: [],
      authExcludedItems: [],
      inputAttrs: inputAttrs.length ? inputAttrs : undefined,
    } as Parameters<typeof FServiceAPI.Resource.createVersion>[0]);

    const data = unwrapData<{ versionId?: string; version?: string }>(envelope);

    saveVersionConfig(
      {
        ...versionCfg,
        resourceId,
        userId: ctx.resource.userId,
        username: ctx.resource.username,
        fileSha1: processed.fileSha1,
        filename: processed.filename,
      },
      opts.cwd,
    );

    return {
      resourceId,
      version: data?.version || versionCfg.version,
      fileSha1: processed.fileSha1,
      filename: processed.filename,
      versionId: data?.versionId,
    };
  } finally {
    if (processed.isTempFile) cleanupTempFile(processed.filePath);
  }
}
