import type { CustomPropertyDescriptor } from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import {
  buildCreateVersionInputAttrs,
  normalizeCustomPropertyDescriptors,
} from './resource/index.js';
import type { VersionProject } from '../config/project.js';
import { assertResourceTypeCode } from './typeService.js';

type ReleasedVersionInfo = {
  fileSha1?: string;
  filename?: string;
  description?: string;
  dependencies?: Array<{
    resourceId?: string;
    resourceName?: string;
    versionRange?: string;
  }>;
  systemPropertyDescriptors?: Array<{
    key?: string;
    insertMode?: number;
    valueDisplay?: string;
  }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  inputAttrs?: Array<{ key?: string; value?: string | number | boolean }>;
};

export type ReleasedVersionSnapshot = Pick<
  VersionProject,
  | 'fileSha1'
  | 'filename'
  | 'description'
  | 'dependencies'
  | 'inputAttrs'
  | 'customPropertyDescriptors'
>;

function pickSupportOptionalConfig(typeInfo: unknown): unknown {
  if (!typeInfo || typeof typeInfo !== 'object') return undefined;
  const record = typeInfo as Record<string, unknown>;
  const resourceConfig =
    record.resourceConfig && typeof record.resourceConfig === 'object'
      ? (record.resourceConfig as Record<string, unknown>)
      : undefined;
  return resourceConfig?.supportOptionalConfig ?? record.supportOptionalConfig;
}

function isSupportOptionalConfigEnabled(support: unknown): boolean {
  return support === 2 || support === '2';
}

function mapPlatformInputAttrs(info: ReleasedVersionInfo) {
  const systemDescriptors = (info.systemPropertyDescriptors || []).filter((sp) => sp?.key);
  if (systemDescriptors.length > 0) {
    return systemDescriptors
      .filter((sp) => Number(sp.insertMode) === 2)
      .map((sp) => ({
        key: String(sp.key),
        value: String(sp.valueDisplay ?? ''),
      }));
  }

  return (info.inputAttrs || [])
    .filter((a) => a?.key)
    .map((a) => ({ key: String(a.key), value: String(a.value ?? '') }));
}

function mapPlatformCustomPropertyDescriptors(
  info: ReleasedVersionInfo,
  supportOptionalConfig?: unknown,
): CustomPropertyDescriptor[] {
  const optionalEnabled =
    supportOptionalConfig === undefined || isSupportOptionalConfigEnabled(supportOptionalConfig);

  return (info.customPropertyDescriptors || [])
    .filter((desc) => desc?.key)
    .filter((desc) => desc.type === 'readonlyText' || optionalEnabled)
    .map((desc) => ({
      type: desc.type,
      key: desc.key,
      name: desc.name || desc.key,
      defaultValue: String(desc.defaultValue ?? ''),
      candidateItems: desc.candidateItems?.map(String),
      remark: desc.remark,
    }));
}

async function resolveSupportOptionalConfig(resourceTypeCode?: string): Promise<unknown> {
  if (!resourceTypeCode?.trim()) return undefined;
  const typeInfo = await assertResourceTypeCode(resourceTypeCode.trim());
  return pickSupportOptionalConfig(typeInfo);
}

function mapReleasedVersionFields(
  info: ReleasedVersionInfo,
  supportOptionalConfig?: unknown,
) {
  return {
    inputAttrs: mapPlatformInputAttrs(info),
    customPropertyDescriptors: mapPlatformCustomPropertyDescriptors(info, supportOptionalConfig),
  };
}

/** 读取平台已发版属性（≅ Console resourceVersionEditorPage fetchDataSource） */
export async function fetchReleasedVersionProperties(opts: {
  resourceId: string;
  version: string;
  resourceTypeCode?: string;
}) {
  const info = await loadReleasedVersionInfo(opts);
  const supportOptionalConfig = await resolveSupportOptionalConfig(opts.resourceTypeCode);
  return mapReleasedVersionFields(info, supportOptionalConfig);
}

async function loadReleasedVersionInfo(opts: { resourceId: string; version: string }) {
  const envelope = await FServiceAPI.Resource.resourceVersionInfo1({
    resourceId: opts.resourceId,
    version: opts.version,
  });
  return unwrapData<ReleasedVersionInfo>(envelope);
}

/** 读取平台已发版完整快照（≅ Console versionCreator「上个版本」resourceVersionInfo1） */
export async function fetchReleasedVersionSnapshot(opts: {
  resourceId: string;
  version: string;
  resourceTypeCode?: string;
}): Promise<ReleasedVersionSnapshot> {
  const info = await loadReleasedVersionInfo(opts);
  const supportOptionalConfig = await resolveSupportOptionalConfig(opts.resourceTypeCode);
  const mapped = mapReleasedVersionFields(info, supportOptionalConfig);
  const fileSha1 = info.fileSha1?.trim();
  const filename = info.filename?.trim();
  if (!fileSha1 || !filename) {
    throw new Error(
      `resourceVersionInfo1 missing fileSha1/filename for ${opts.resourceId}@${opts.version}`,
    );
  }
  return {
    fileSha1,
    filename,
    description: info.description,
    dependencies: (info.dependencies || [])
      .filter((dep) => dep?.resourceId)
      .map((dep) => ({
        resourceId: String(dep.resourceId),
        resourceName: dep.resourceName,
        versionRange: dep.versionRange,
      })),
    inputAttrs: mapped.inputAttrs,
    customPropertyDescriptors: mapped.customPropertyDescriptors,
  };
}

/**
 * sync-properties：以平台当前属性为底，manifest 同 key 覆盖（避免 manifest 不完整时丢字段）。
 */
export function mergeVersionPropertiesForSync(opts: {
  platform: {
    inputAttrs: Array<{ key: string; value: string }>;
    customPropertyDescriptors: CustomPropertyDescriptor[];
  };
  manifest: Pick<VersionProject, 'inputAttrs' | 'customPropertyDescriptors' | 'runtimeVersion'>;
}) {
  const inputMap = new Map(
    opts.platform.inputAttrs.map((attr) => [attr.key, attr.value] as const),
  );
  for (const attr of opts.manifest.inputAttrs || []) {
    if (!attr?.key || attr.key === 'runtimeVersion') continue;
    inputMap.set(attr.key, String(attr.value ?? ''));
  }
  if (opts.manifest.runtimeVersion) {
    inputMap.set('runtimeVersion', String(opts.manifest.runtimeVersion));
  }

  const customMap = new Map(
    opts.platform.customPropertyDescriptors
      .filter((desc) => desc?.key)
      .map((desc) => [desc.key, desc] as const),
  );
  for (const desc of opts.manifest.customPropertyDescriptors || []) {
    if (!desc?.key) continue;
    customMap.set(desc.key, desc);
  }

  const versionCfg: VersionProject = {
    version: '',
    filePath: '',
    inputAttrs: [...inputMap.entries()].map(([key, value]) => ({ key, value })),
    customPropertyDescriptors: [...customMap.values()],
    runtimeVersion: opts.manifest.runtimeVersion,
  };

  return {
    inputAttrs: buildCreateVersionInputAttrs(versionCfg) || [],
    customPropertyDescriptors: normalizeCustomPropertyDescriptors(
      versionCfg.customPropertyDescriptors,
    ) || [],
  };
}

export async function inspectReleasedVersion(opts: {
  resourceId: string;
  version: string;
}) {
  const properties = await fetchReleasedVersionProperties(opts);
  return {
    resourceId: opts.resourceId,
    version: opts.version,
    ...properties,
  };
}
