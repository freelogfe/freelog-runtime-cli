import fs from 'node:fs';
import path from 'node:path';
import {
  createEmptyState,
  ensureProjectGitignore,
  saveManifest,
  saveState,
} from '../../config/project/index.js';
import { shortName } from '../../config/project/projects.js';
import type { FreelogManifest, FreelogState } from '../../config/project/types.js';
import { getCliEnv } from '../../core/env.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { EphemeralStore } from './ephemeralStore.js';

function assertExportTargetEmpty(targetDir: string): void {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    return;
  }
  const entries = fs.readdirSync(targetDir).filter((name) => name !== '.git');
  if (entries.length > 0) {
    throw cliError(I18N_KEYS.export_project_dir_not_empty, {
      code: 4,
      params: { path: targetDir },
      hint: '目标目录须为空或仅含 .git',
    });
  }
}

/** 会话成功结束后写出最小工程（§9）；Console 无等价 — CLI 独有落盘能力。 */
export function exportSessionProject(store: EphemeralStore, targetDir: string): string {
  const resolved = path.resolve(targetDir);
  assertExportTargetEmpty(resolved);

  const resource = store.loadResource();
  const version = store.tryLoadVersion();
  const memoryState = store.loadState();
  const resourceId = resource.resourceId?.trim();
  const resourceName = resource.resourceName?.trim();
  if (!resourceId && !resourceName) {
    throw cliError(I18N_KEYS.export_project_missing_resource, {
      code: 4,
      hint: '先完成 create/publish 或传入 --resource-id',
    });
  }

  const identityName = resourceName || resourceId || 'resource';
  const manifest: FreelogManifest = {
    schemaVersion: 1,
    subject: 'resource',
    identity: { name: identityName },
    resource: {
      typeCode: resource.resourceTypeCode || '',
      typeName: resource.resourceTypeName,
      title: resource.resourceTitle || shortName(resourceName, identityName),
      intro: resource.intro || '',
      tags: resource.tags || [],
      coverImages: resource.coverImages || [],
    },
    policies: (resource.policies || [])
      .filter((p) => p?.policyName)
      .map((p) => ({
        policyId: p.policyId,
        policyName: p.policyName || '',
        policyText: '',
        status: (p.status === 0 ? 0 : 1) as 0 | 1,
      })),
    version: version
      ? {
          version: version.version,
          filePath: version.filePath || 'dist',
          artifactMode: version.artifactMode,
          description: version.description ?? '',
          videoCover: version.videoCover,
          runtimeVersion: version.runtimeVersion ?? null,
          dependencies: version.dependencies || [],
          baseUpcastResources: version.baseUpcastResources || [],
          authExcludedItems: version.authExcludedItems || [],
          inputAttrs: version.inputAttrs || [],
          customPropertyDescriptors: version.customPropertyDescriptors || [],
        }
      : null,
    collection: null,
  };

  const exportState: FreelogState = {
    ...createEmptyState('resource'),
    env: memoryState.env || getCliEnv(),
    resource: {
      resourceId: resourceId || memoryState.resource.resourceId || null,
      resourceName: resourceName || memoryState.resource.resourceName || identityName,
      resourceType: resource.resourceType?.length
        ? resource.resourceType
        : memoryState.resource.resourceType,
      resourceTypeCode: resource.resourceTypeCode || memoryState.resource.resourceTypeCode || null,
      resourceTypeName: resource.resourceTypeName || memoryState.resource.resourceTypeName || null,
      subjectType: memoryState.resource.subjectType ?? null,
      owner: memoryState.resource.owner ?? null,
      status: resource.status ?? memoryState.resource.status ?? null,
      latestVersion: resource.latestVersion ?? memoryState.resource.latestVersion ?? null,
      policies: resource.policies ?? memoryState.resource.policies ?? [],
    },
    version: {
      lastPublishedVersion:
        memoryState.version.lastPublishedVersion ??
        (version?.published ? version.version : null),
      lastPublishedVersionId:
        memoryState.version.lastPublishedVersionId ?? version?.versionId ?? null,
      fileSha1: memoryState.version.fileSha1 ?? version?.fileSha1 ?? null,
      filename: memoryState.version.filename ?? version?.filename ?? null,
      draftSync: null,
    },
    sync: memoryState.sync,
  };

  saveManifest(manifest, resolved);
  saveState(exportState, resolved, 'resource');
  ensureProjectGitignore(resolved);
  return resolved;
}
