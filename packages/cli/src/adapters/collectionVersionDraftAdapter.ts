import { createHash } from 'node:crypto';
import type {
  CollectionProject,
  CustomPropertyDescriptor,
  DraftSyncMeta,
} from '../config/project.js';

/** 合集发版表单草稿（目录草稿仍走 collection item *） */
export interface CollectionVersionDraftData {
  versionInput?: string;
  descriptionEditorInput?: string;
  collectionItemsSetting?: unknown;
  collectionItemsChanged?: boolean;
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
  [key: string]: unknown;
}

function trimStr(v: unknown): string {
  return v === undefined || v === null ? '' : String(v).trim();
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function fingerprintCollectionDraft(d: CollectionVersionDraftData): string {
  const canonical = {
    versionInput: trimStr(d.versionInput),
    descriptionEditorInput: trimStr(d.descriptionEditorInput),
    collectionItemsChanged: Boolean(d.collectionItemsChanged),
    collectionItemsSetting: d.collectionItemsSetting ?? null,
    directDependencies: [...(d.directDependencies || [])]
      .map((x) => ({
        id: trimStr(x.id),
        name: trimStr(x.name),
        type: trimStr(x.type) || 'resource',
        versionRange: trimStr(x.versionRange),
      }))
      .filter((x) => x.id)
      .sort((a, b) => a.id.localeCompare(b.id)),
    baseUpcastResources: [...(d.baseUpcastResources || [])]
      .map((x) => ({
        resourceID: trimStr(x.resourceID),
        resourceName: trimStr(x.resourceName),
      }))
      .filter((x) => x.resourceID)
      .sort((a, b) => a.resourceID.localeCompare(b.resourceID)),
    authExcludedItems: [...(d.authExcludedItems || [])]
      .map((x) => ({
        resourceId: trimStr(x.resourceId),
        excludedType: x.excludedType === 'policyId' ? 'policyId' : 'contractId',
        excludedValue: trimStr(x.excludedValue),
      }))
      .filter((x) => x.resourceId && x.excludedValue)
      .sort((a, b) => {
        const byResource = a.resourceId.localeCompare(b.resourceId);
        if (byResource !== 0) return byResource;
        const byType = a.excludedType.localeCompare(b.excludedType);
        if (byType !== 0) return byType;
        return a.excludedValue.localeCompare(b.excludedValue);
      }),
    additionalProperties: [...(d.additionalProperties || [])]
      .map((a) => ({ key: trimStr(a.key), value: String(a.value ?? '') }))
      .filter((a) => a.key)
      .sort((a, b) => a.key.localeCompare(b.key)),
    customProperties: [...(d.customProperties || [])]
      .map((x) => ({
        key: trimStr(x.key),
        name: trimStr(x.name) || trimStr(x.key),
        value: String(x.value ?? ''),
        description: trimStr(x.description),
      }))
      .filter((x) => x.key)
      .sort((a, b) => a.key.localeCompare(b.key)),
    customConfigurations: [...(d.customConfigurations || [])]
      .map((x) => ({
        key: trimStr(x.key),
        name: trimStr(x.name) || trimStr(x.key),
        description: trimStr(x.description),
        type: (x.type === 'select' ? 'select' : 'input') as 'input' | 'select',
        input: trimStr(x.input),
        select: [...(x.select || [])].map(String).sort(),
      }))
      .filter((x) => x.key)
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
  return createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

function splitCustomPropertyDescriptors(descriptors: CustomPropertyDescriptor[] | undefined) {
  const customProperties: NonNullable<CollectionVersionDraftData['customProperties']> = [];
  const customConfigurations: NonNullable<CollectionVersionDraftData['customConfigurations']> = [];

  for (const desc of descriptors || []) {
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
      const select = [...(desc.candidateItems || [])].map(String);
      customConfigurations.push({
        key: desc.key,
        name,
        description,
        type: 'select',
        input: String(desc.defaultValue ?? select[0] ?? ''),
        select,
      });
    }
  }

  return { customProperties, customConfigurations };
}

export function toCollectionDraftData(
  local: CollectionProject & { version?: string; description?: string },
): CollectionVersionDraftData {
  const { customProperties, customConfigurations } = splitCustomPropertyDescriptors(
    local.customPropertyDescriptors,
  );
  return {
    versionInput: local.version || '',
    descriptionEditorInput: local.description || '',
    collectionItemsSetting: local.display ?? {},
    collectionItemsChanged: false,
    directDependencies: (local.dependencies || []).map((d) => ({
      id: d.resourceId,
      name: d.resourceName || '',
      type: 'resource',
      versionRange: d.versionRange || '',
    })),
    baseUpcastResources: (local.baseUpcastResources || []).map((b) => ({
      resourceID: b.resourceId,
      resourceName: b.resourceName || '',
    })),
    authExcludedItems: (local.authExcludedItems || []).map((a) => ({
      resourceId: a.resourceId,
      excludedType: a.excludedType,
      excludedValue: a.excludedValue,
    })),
    additionalProperties: (local.inputAttrs || []).map((a) => ({
      key: a.key,
      value: String(a.value),
    })),
    customProperties,
    customConfigurations,
  };
}

export function applyCollectionDraft(
  local: CollectionProject,
  draft: CollectionVersionDraftData,
): CollectionProject & { version?: string; description?: string } {
  return {
    ...local,
    version: trimStr(draft.versionInput) || (local as { version?: string }).version,
    description:
      draft.descriptionEditorInput !== undefined
        ? String(draft.descriptionEditorInput)
        : (local as { description?: string }).description,
    display:
      draft.collectionItemsSetting !== undefined
        ? (draft.collectionItemsSetting as CollectionProject['display'])
        : local.display,
    dependencies: (draft.directDependencies || [])
      .filter((d) => d.id && d.type !== 'object')
      .map((d) => ({
        resourceId: d.id,
        resourceName: d.name || '',
        versionRange: d.versionRange || '',
      })),
    baseUpcastResources: (draft.baseUpcastResources || [])
      .filter((b) => b.resourceID)
      .map((b) => ({
        resourceId: b.resourceID,
        resourceName: b.resourceName || '',
      })),
    authExcludedItems: (draft.authExcludedItems || [])
      .filter((a) => a.resourceId && a.excludedValue)
      .map((a) => ({
        resourceId: a.resourceId,
        excludedType: a.excludedType === 'policyId' ? 'policyId' : 'contractId',
        excludedValue: a.excludedValue,
      })),
    inputAttrs: (draft.additionalProperties || [])
      .filter((a) => a.key)
      .map((a) => ({ key: a.key, value: a.value })),
    customPropertyDescriptors: [
      ...(draft.customProperties || [])
        .filter((p) => p.key)
        .map((p) => ({
          type: 'readonlyText',
          key: p.key,
          name: p.name || p.key,
          defaultValue: String(p.value ?? ''),
          remark: p.description || '',
        })),
      ...(draft.customConfigurations || [])
        .filter((c) => c.key)
        .map((c) => {
          const select = [...(c.select || [])].map(String);
          return {
            type: c.type === 'input' ? 'editableText' : 'select',
            key: c.key,
            name: c.name || c.key,
            defaultValue: String(c.type === 'input' ? c.input ?? '' : c.input ?? select[0] ?? ''),
            candidateItems: c.type === 'input' ? undefined : select,
            remark: c.description || '',
          };
        }),
    ],
  };
}

export function buildCollectionDraftSync(
  draft: CollectionVersionDraftData,
  remoteUpdateDate?: string,
  pushed = false,
): DraftSyncMeta {
  return {
    lastFingerprint: fingerprintCollectionDraft(draft),
    lastRemoteUpdateDate: remoteUpdateDate,
    lastPushedAt: pushed ? new Date().toISOString() : undefined,
  };
}
