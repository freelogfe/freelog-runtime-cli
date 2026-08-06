import path from 'node:path';
import semver from 'semver';
import { CliError } from '../core/errors.js';
import { loadVersionProject, saveVersionProject } from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import { ensureSynced } from './syncService.js';
import { assertSemverLike } from './validation.js';
import { uploadFileIfNeeded } from './storageUpload.js';
import { cleanupTempFile, processFileForPublish } from './processFile.js';
import { assertResourceTypeCode } from './typeService.js';
import { assertOptionalConfigAllowed } from './resourceTypeCapabilities.js';
import { resolveCoverImageUrl } from './coverUpload.js';
import {
  inheritDataFromVersionConfig,
  resolveCreateVersionPropertiesFromFile,
} from './filePropertyService.js';
import type { CustomPropertyDescriptor, VersionProject } from '../config/project.js';

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

type CreateVersionParams = Parameters<typeof FServiceAPI.Resource.createVersion>[0];
type CreateVersionInputAttrs = NonNullable<CreateVersionParams['inputAttrs']>;
type CreateVersionCustomProperty = NonNullable<CreateVersionParams['customPropertyDescriptors']>[number];

const CUSTOM_PROPERTY_TYPES = new Set<CreateVersionCustomProperty['type']>([
  'editableText',
  'readonlyText',
  'radio',
  'checkbox',
  'select',
]);

export function buildCreateVersionInputAttrs(versionCfg: VersionProject): CreateVersionInputAttrs | undefined {
  const inputAttrs = (versionCfg.inputAttrs || [])
    .filter((a) => a?.key && a.key !== 'runtimeVersion')
    .map((a) => ({ key: a.key, value: String(a.value ?? '') }));

  if (versionCfg.runtimeVersion) {
    inputAttrs.push({ key: 'runtimeVersion', value: String(versionCfg.runtimeVersion) });
  }

  return inputAttrs.length ? inputAttrs : undefined;
}

export function normalizeCustomPropertyDescriptors(
  descriptors: CustomPropertyDescriptor[] | undefined,
): CreateVersionCustomProperty[] | undefined {
  if (!descriptors?.length) return undefined;

  return descriptors
    .filter((desc) => desc?.key)
    .map((desc) => {
      if (!CUSTOM_PROPERTY_TYPES.has(desc.type as CreateVersionCustomProperty['type'])) {
        throw new CliError(`customPropertyDescriptors.type 不合法: ${desc.type}`, {
          code: 4,
          hint: '允许值：editableText / readonlyText / radio / checkbox / select',
          details: { key: desc.key, type: desc.type },
        });
      }
      return {
        key: desc.key,
        name: desc.name || desc.key,
        defaultValue: String(desc.defaultValue ?? ''),
        type: desc.type as CreateVersionCustomProperty['type'],
        candidateItems: desc.candidateItems?.map(String),
        remark: desc.remark,
      };
    });
}

export function buildCreateVersionParams(opts: {
  resourceId: string;
  versionCfg: VersionProject;
  fileSha1: string;
  filename: string;
}): CreateVersionParams {
  const { resourceId, versionCfg, fileSha1, filename } = opts;
  const dependencies = (versionCfg.dependencies || []).map((d) => ({
    resourceId: d.resourceId,
    versionRange: d.versionRange || '',
  }));

  return {
    resourceId,
    version: versionCfg.version,
    fileSha1,
    filename,
    description: versionCfg.description || '',
    videoCover: versionCfg.videoCover?.trim() || undefined,
    dependencies,
    baseUpcastResources: (versionCfg.baseUpcastResources || []).map((r) => ({
      resourceId: r.resourceId,
    })),
    authExcludedItems: (versionCfg.authExcludedItems || []).map((a) => ({
      resourceId: a.resourceId,
      excludedType: a.excludedType,
      excludedValue: a.excludedValue,
    })),
    batchSignContracts:
      versionCfg.batchSignContracts && versionCfg.batchSignContracts.length > 0
        ? versionCfg.batchSignContracts.map((entry) => ({
            resourceId: entry.resourceId,
            policyIds: entry.policyIds,
            ...(entry.subjectType ? { subjectType: entry.subjectType } : {}),
          }))
        : undefined,
    inputAttrs: buildCreateVersionInputAttrs(versionCfg),
    customPropertyDescriptors: normalizeCustomPropertyDescriptors(
      versionCfg.customPropertyDescriptors,
    ),
  };
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
        hint: 'freelog-cli version set --version <更高版本>',
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
  const ctx = await ensureSynced({ cwd: opts.cwd, noAutoPull: opts.noAutoPull });
  const resourceId = ctx.resource.resourceId!;
  let { data: versionCfg } = loadVersionProject(opts.cwd);

  if (opts.bump) {
    const bumped = computeBumpedVersion(ctx.info.latestVersion);
    versionCfg = { ...versionCfg, version: bumped };
    saveVersionProject(versionCfg, opts.cwd);
  }

  if (!versionCfg.version) {
    throw new CliError('manifest.version 缺少 version', {
      code: 4,
      hint: 'freelog-cli version set --version <版本号> 或 publish --bump',
    });
  }
  if (!versionCfg.filePath) {
    throw new CliError('manifest.version 缺少 filePath', { code: 4 });
  }
  if (versionCfg.videoCover?.trim()) {
    versionCfg = {
      ...versionCfg,
      videoCover: await resolveCoverImageUrl(versionCfg.videoCover, opts.cwd),
    };
    saveVersionProject(versionCfg, opts.cwd);
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
      hint: '运行 freelog-cli version set --runtime 0.5，或在 freelog.manifest.json 写 version.runtimeVersion',
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
      throw new CliError('无法校验依赖授权（authTree 失败），存在本地 dependencies 时拒绝 publish', {
        code: 5,
        details: {
          unresolvedDependencies: deps,
          consoleHint: `请在 Console 完成依赖签约后重试：资源 ${resourceId}`,
          cause: error instanceof Error ? error.message : String(error),
        },
        hint: '打开 Console 资源依赖页完成授权，或清空 freelog.manifest.json 的 version.dependencies 后重试',
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
    resourceTypeInfo: typeInfo,
    cwd: opts.cwd,
  });

  try {
    await uploadFileIfNeeded(processed.filePath, processed.fileSha1);

    const resourceTypeCode = ctx.resource.resourceTypeCode;
    if (!resourceTypeCode) {
      throw new CliError('资源缺少 resourceTypeCode，无法解析文件属性', { code: 4 });
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
