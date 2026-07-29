import { createHash } from 'node:crypto';
import type { CollectionShell, DraftSyncMeta } from '../config/writeShell.js';

/** 合集发版表单草稿（目录草稿仍走 collection item *） */
export interface CollectionVersionDraftData {
  versionInput?: string;
  descriptionEditorInput?: string;
  collectionItemsSetting?: unknown;
  collectionItemsChanged?: boolean;
  additionalProperties?: Array<{ key: string; value: string }>;
  [key: string]: unknown;
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
    versionInput: String(d.versionInput || '').trim(),
    descriptionEditorInput: String(d.descriptionEditorInput || '').trim(),
    collectionItemsChanged: Boolean(d.collectionItemsChanged),
    collectionItemsSetting: d.collectionItemsSetting ?? null,
    additionalProperties: [...(d.additionalProperties || [])]
      .map((a) => ({ key: String(a.key || '').trim(), value: String(a.value ?? '') }))
      .filter((a) => a.key)
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
  return createHash('sha256').update(stableStringify(canonical)).digest('hex');
}

export function toCollectionDraftData(local: CollectionShell & { version?: string; description?: string }): CollectionVersionDraftData {
  return {
    versionInput: local.version || '',
    descriptionEditorInput: local.description || '',
    collectionItemsSetting: local.catalogueItems ?? [],
    collectionItemsChanged: false,
    additionalProperties: [],
  };
}

export function applyCollectionDraft(
  local: CollectionShell,
  draft: CollectionVersionDraftData,
): CollectionShell & { version?: string; description?: string } {
  return {
    ...local,
    version: String(draft.versionInput || '').trim() || (local as { version?: string }).version,
    description:
      draft.descriptionEditorInput !== undefined
        ? String(draft.descriptionEditorInput)
        : (local as { description?: string }).description,
    catalogueItems:
      draft.collectionItemsSetting !== undefined
        ? (draft.collectionItemsSetting as CollectionShell['catalogueItems'])
        : local.catalogueItems,
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
