import { createHash } from 'node:crypto';
import { consola } from 'consola';
import type {
  CustomPropertyDescriptor,
  DraftSyncMeta,
  VersionProject,
} from '../config/project.js';

/** ≅ Console IResourceCreateVersionDraftType（独立资源发版草稿） */
export interface ResourceVersionDraftData {
  versionInput?: string;
  selectedFileInfo?: { name: string; sha1: string; from?: string } | null;
  descriptionEditorInput?: string;
  directDependencies?: Array<{
    id: string;
    name?: string;
    type?: string;
    versionRange?: string;
  }>;
  baseUpcastResources?: Array<{ resourceID: string; resourceName?: string }>;
  authExcludedItems?: Array<{
    resourceId: string;
    excludedType: 'contractId' | 'policyId';
    excludedValue: string;
  }>;
  additionalProperties?: Array<{ key: string; value: string }>;
  customProperties?: Array<{
    key: string;
    name?: string;
    value?: string;
    description?: string;
  }>;
  customConfigurations?: Array<{
    key: string;
    name?: string;
    description?: string;
    type: 'input' | 'select';
    input?: string;
    select?: string[];
  }>;
  videoCover?: string;
}

type CanonicalDraft = {
  versionInput: string;
  selectedFileInfo: { name: string; sha1: string } | null;
  descriptionEditorInput: string;
  directDependencies: { id: string; name: string; type: string; versionRange: string }[];
  baseUpcastResources: { resourceID: string; resourceName: string }[];
  authExcludedItems: {
    resourceId: string;
    excludedType: 'contractId' | 'policyId';
    excludedValue: string;
  }[];
  additionalProperties: { key: string; value: string }[];
  customProperties: { key: string; name: string; value: string; description: string }[];
  customConfigurations: {
    key: string;
    name: string;
    description: string;
    type: 'input' | 'select';
    input: string;
    select: string[];
  }[];
  videoCover: string;
};

function trimStr(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function normalizeDraft(d: ResourceVersionDraftData): CanonicalDraft {
  const file = d.selectedFileInfo;
  const selectedFileInfo =
    file && file.name && file.sha1
      ? { name: trimStr(file.name), sha1: trimStr(file.sha1) }
      : null;

  const directDependencies = [...(d.directDependencies || [])]
    .map((x) => ({
      id: trimStr(x.id),
      name: trimStr(x.name),
      type: trimStr(x.type) || 'resource',
      versionRange: trimStr(x.versionRange),
    }))
    .filter((x) => x.id)
    .sort((a, b) => a.id.localeCompare(b.id));

  const baseUpcastResources = [...(d.baseUpcastResources || [])]
    .map((x) => ({
      resourceID: trimStr(x.resourceID),
      resourceName: trimStr(x.resourceName),
    }))
    .filter((x) => x.resourceID)
    .sort((a, b) => a.resourceID.localeCompare(b.resourceID));

  const authExcludedItems = [...(d.authExcludedItems || [])]
    .map((x) => ({
      resourceId: trimStr(x.resourceId),
      excludedType: x.excludedType === 'policyId' ? ('policyId' as const) : ('contractId' as const),
      excludedValue: trimStr(x.excludedValue),
    }))
    .filter((x) => x.resourceId && x.excludedValue)
    .sort((a, b) => {
      const byResource = a.resourceId.localeCompare(b.resourceId);
      if (byResource !== 0) return byResource;
      const byType = a.excludedType.localeCompare(b.excludedType);
      if (byType !== 0) return byType;
      return a.excludedValue.localeCompare(b.excludedValue);
    });

  const additionalProperties = [...(d.additionalProperties || [])]
    .map((x) => ({ key: trimStr(x.key), value: String(x.value ?? '') }))
    .filter((x) => x.key)
    .sort((a, b) => a.key.localeCompare(b.key));

  const customProperties = [...(d.customProperties || [])]
    .map((x) => ({
      key: trimStr(x.key),
      name: trimStr(x.name) || trimStr(x.key),
      value: String(x.value ?? ''),
      description: trimStr(x.description),
    }))
    .filter((x) => x.key)
    .sort((a, b) => a.key.localeCompare(b.key));

  const customConfigurations = [...(d.customConfigurations || [])]
    .map((x) => {
      const select = [...(x.select || [])].map((s) => String(s)).sort();
      return {
        key: trimStr(x.key),
        name: trimStr(x.name) || trimStr(x.key),
        description: trimStr(x.description),
        type: (x.type === 'select' ? 'select' : 'input') as 'input' | 'select',
        input: trimStr(x.input),
        select,
      };
    })
    .filter((x) => x.key)
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    versionInput: trimStr(d.versionInput),
    selectedFileInfo,
    descriptionEditorInput: trimStr(d.descriptionEditorInput),
    directDependencies,
    baseUpcastResources,
    authExcludedItems,
    additionalProperties,
    customProperties,
    customConfigurations,
    videoCover: trimStr(d.videoCover),
  };
}

export function fingerprint(d: ResourceVersionDraftData): string {
  return createHash('sha256').update(stableStringify(normalizeDraft(d))).digest('hex');
}

export function toDraftData(config: VersionProject): ResourceVersionDraftData {
  const sha1 = config.fileSha1?.trim();
  const filename = config.filename?.trim();
  const selectedFileInfo =
    sha1 && filename ? { name: filename, sha1, from: 'freelog-cli' } : null;

  const customProperties: NonNullable<ResourceVersionDraftData['customProperties']> = [];
  const customConfigurations: NonNullable<ResourceVersionDraftData['customConfigurations']> = [];
  let warnedLossy = false;

  for (const desc of config.customPropertyDescriptors || []) {
    if (!desc?.key) continue;
    const name = desc.name || desc.key;
    const description = desc.remark || '';
    if (desc.type === 'readonlyText') {
      customProperties.push({
        key: desc.key,
        name,
        value: String(desc.defaultValue ?? ''),
        description,
      });
      continue;
    }
    if (desc.type === 'editableText') {
      customConfigurations.push({
        key: desc.key,
        name,
        description,
        type: 'input',
        input: String(desc.defaultValue ?? ''),
        select: [],
      });
      continue;
    }
    if (desc.type === 'select' || desc.type === 'radio' || desc.type === 'checkbox') {
      if ((desc.type === 'radio' || desc.type === 'checkbox') && !warnedLossy) {
        consola.warn('自定义属性 radio/checkbox 推入草稿后将变为 select（有损）');
        warnedLossy = true;
      }
      const select = [...(desc.candidateItems || [])].map(String);
      customConfigurations.push({
        key: desc.key,
        name,
        description,
        type: 'select',
        input: String(desc.defaultValue ?? select[0] ?? ''),
        select,
      });
      continue;
    }
    consola.warn(`跳过未知 customPropertyDescriptors.type=${desc.type} key=${desc.key}`);
  }

  if (
    (config.customPropertyDescriptors?.length || 0) > 30 ||
    customProperties.length + customConfigurations.length > 30
  ) {
    consola.warn('自定义属性超过 30 条（草稿仍推送；publish 再严拦）');
  }

  return {
    versionInput: config.version || '',
    selectedFileInfo,
    descriptionEditorInput: config.description || '',
    videoCover: config.videoCover?.trim() || '',
    directDependencies: (config.dependencies || []).map((d) => ({
      id: d.resourceId,
      name: d.resourceName || '',
      type: 'resource',
      versionRange: d.versionRange || '',
    })),
    baseUpcastResources: (config.baseUpcastResources || []).map((b) => ({
      resourceID: b.resourceId,
      resourceName: b.resourceName || '',
    })),
    authExcludedItems: (config.authExcludedItems || []).map((a) => ({
      resourceId: a.resourceId,
      excludedType: a.excludedType,
      excludedValue: a.excludedValue,
    })),
    additionalProperties: (config.inputAttrs || []).map((a) => ({
      key: a.key,
      value: String(a.value),
    })),
    customProperties,
    customConfigurations,
  };
}

export function applyDraftToVersionConfig(
  config: VersionProject,
  draft: ResourceVersionDraftData,
): VersionProject {
  const next: VersionProject = { ...config };

  next.version = trimStr(draft.versionInput) || next.version;
  next.description = trimStr(draft.descriptionEditorInput);
  next.videoCover = trimStr(draft.videoCover) || undefined;

  if (draft.selectedFileInfo && draft.selectedFileInfo.sha1 && draft.selectedFileInfo.name) {
    next.fileSha1 = draft.selectedFileInfo.sha1;
    next.filename = draft.selectedFileInfo.name;
  } else {
    next.fileSha1 = undefined;
    next.filename = undefined;
  }

  next.dependencies = [];
  for (const dep of draft.directDependencies || []) {
    if (dep.type === 'object') {
      consola.warn(`跳过 type=object 依赖 id=${dep.id}`);
      continue;
    }
    if (!dep.id) continue;
    next.dependencies.push({
      resourceId: dep.id,
      resourceName: dep.name || '',
      versionRange: dep.versionRange || '',
    });
  }

  next.baseUpcastResources = (draft.baseUpcastResources || [])
    .filter((b) => b.resourceID)
    .map((b) => ({
      resourceId: b.resourceID,
      resourceName: b.resourceName || '',
    }));

  next.authExcludedItems = (draft.authExcludedItems || [])
    .filter((a) => a.resourceId && a.excludedValue)
    .map((a) => ({
      resourceId: a.resourceId,
      excludedType: a.excludedType === 'policyId' ? 'policyId' : 'contractId',
      excludedValue: a.excludedValue,
    }));

  next.inputAttrs = (draft.additionalProperties || [])
    .filter((a) => a.key)
    .map((a) => ({ key: a.key, value: a.value }));

  const descriptors: CustomPropertyDescriptor[] = [];
  for (const p of draft.customProperties || []) {
    if (!p.key) {
      consola.warn('跳过缺 key 的 customProperties 项');
      continue;
    }
    descriptors.push({
      type: 'readonlyText',
      key: p.key,
      name: p.name || p.key,
      defaultValue: String(p.value ?? ''),
      remark: p.description || '',
    });
  }
  for (const c of draft.customConfigurations || []) {
    if (!c.key) {
      consola.warn('跳过缺 key 的 customConfigurations 项');
      continue;
    }
    if (c.type === 'input') {
      descriptors.push({
        type: 'editableText',
        key: c.key,
        name: c.name || c.key,
        defaultValue: String(c.input ?? ''),
        remark: c.description || '',
      });
    } else {
      const select = [...(c.select || [])].map(String);
      descriptors.push({
        type: 'select',
        key: c.key,
        name: c.name || c.key,
        defaultValue: String(c.input ?? select[0] ?? ''),
        candidateItems: select,
        remark: c.description || '',
      });
    }
  }
  next.customPropertyDescriptors = descriptors;

  // filePath / resourceId / userId / resourceName / resourceType 永不改
  return next;
}

export function buildDraftSync(
  draft: ResourceVersionDraftData,
  remoteUpdateDate?: string,
  pushed = false,
): DraftSyncMeta {
  return {
    lastFingerprint: fingerprint(draft),
    lastRemoteUpdateDate: remoteUpdateDate,
    lastPushedAt: pushed ? new Date().toISOString() : undefined,
  };
}

export type DraftPushDecision =
  | { action: 'save'; reason: 'no-remote' | 'force' | 'aligned' | 'fast-forward' | 'first-save' }
  | { action: 'conflict'; reason: string; hint: string };

/** §7 冲突判定（纯函数，供单测） */
export function decideDraftPush(opts: {
  localFp: string;
  remote: { draftData: ResourceVersionDraftData; updateDate?: string } | null;
  sync?: DraftSyncMeta | null;
  force?: boolean;
}): DraftPushDecision {
  const { localFp, remote, sync, force } = opts;

  if (!remote) {
    return { action: 'save', reason: 'no-remote' };
  }
  if (force) {
    return { action: 'save', reason: 'force' };
  }

  const remoteFp = fingerprint(remote.draftData);
  if (localFp === remoteFp) {
    return { action: 'save', reason: 'aligned' };
  }

  if (!sync?.lastFingerprint) {
    return {
      action: 'conflict',
      reason: 'remote-exists-without-sync',
      hint: 'freelog-cli draft pull 或 freelog-cli draft push --force',
    };
  }

  const lastFp = sync.lastFingerprint;
  const lastDate = sync.lastRemoteUpdateDate;
  const localDirty = localFp !== lastFp;
  const remoteDirty =
    remoteFp !== lastFp ||
    (lastDate != null && remote.updateDate != null && remote.updateDate !== lastDate);

  if (localDirty && remoteDirty) {
    return {
      action: 'conflict',
      reason: 'both-dirty',
      hint: 'freelog-cli draft pull 合并后重试，或 --force 覆盖远端',
    };
  }
  if (!localDirty && remoteDirty) {
    return {
      action: 'conflict',
      reason: 'remote-dirty',
      hint: 'freelog-cli draft pull 或 --force',
    };
  }
  if (localDirty && !remoteDirty) {
    return { action: 'save', reason: 'fast-forward' };
  }
  return { action: 'save', reason: 'first-save' };
}
