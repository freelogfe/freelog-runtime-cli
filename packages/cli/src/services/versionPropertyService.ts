import type { CustomPropertyDescriptor } from '../config/project.js';
import { FServiceAPI, unwrapData } from '../platform/index.js';
import {
  buildCreateVersionInputAttrs,
  normalizeCustomPropertyDescriptors,
} from './publishService.js';
import type { VersionProject } from '../config/project.js';

type ReleasedVersionInfo = {
  systemPropertyDescriptors?: Array<{
    key?: string;
    insertMode?: number;
    valueDisplay?: string;
  }>;
  customPropertyDescriptors?: CustomPropertyDescriptor[];
  inputAttrs?: Array<{ key?: string; value?: string | number | boolean }>;
};

function mapPlatformInputAttrs(info: ReleasedVersionInfo) {
  const fromInputAttrs = (info.inputAttrs || [])
    .filter((a) => a?.key)
    .map((a) => ({ key: String(a.key), value: String(a.value ?? '') }));
  if (fromInputAttrs.length) return fromInputAttrs;

  return (info.systemPropertyDescriptors || [])
    .filter((sp) => sp?.key && Number(sp.insertMode) === 2)
    .map((sp) => ({
      key: String(sp.key),
      value: String(sp.valueDisplay ?? ''),
    }));
}

function mapPlatformCustomPropertyDescriptors(
  info: ReleasedVersionInfo,
): CustomPropertyDescriptor[] {
  return (info.customPropertyDescriptors || [])
    .filter((desc) => desc?.key)
    .map((desc) => ({
      type: desc.type,
      key: desc.key,
      name: desc.name || desc.key,
      defaultValue: String(desc.defaultValue ?? ''),
      candidateItems: desc.candidateItems?.map(String),
      remark: desc.remark,
    }));
}

/** 读取平台已发版属性（≅ Console resourceVersionEditorPage fetchDataSource） */
export async function fetchReleasedVersionProperties(opts: {
  resourceId: string;
  version: string;
}) {
  const envelope = await FServiceAPI.Resource.resourceVersionInfo1({
    resourceId: opts.resourceId,
    version: opts.version,
  });
  const info = unwrapData<ReleasedVersionInfo>(envelope);
  return {
    inputAttrs: mapPlatformInputAttrs(info),
    customPropertyDescriptors: mapPlatformCustomPropertyDescriptors(info),
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
