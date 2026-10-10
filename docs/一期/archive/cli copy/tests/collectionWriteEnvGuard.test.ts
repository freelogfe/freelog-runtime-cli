import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const servicesDir = path.resolve(import.meta.dirname, '../src/services');

function exportedFunctionSource(relativeFile: string, functionName: string): string {
  const source = fs.readFileSync(path.join(servicesDir, relativeFile), 'utf8');
  const start = source.indexOf(`export async function ${functionName}`);
  expect(start, `${relativeFile} should export ${functionName}`).toBeGreaterThanOrEqual(0);
  const nextExport = source.indexOf('\nexport ', start + 1);
  return source.slice(start, nextExport === -1 ? undefined : nextExport);
}

describe('platform write environment guards', () => {
  const guardedWrites: Array<[string, string]> = [
    ['collection/create.ts', 'createCollection'],
    ['collection/items.ts', 'itemAdd'],
    ['collection/items.ts', 'itemImportDir'],
    ['collection/items.ts', 'itemRemove'],
    ['collection/items.ts', 'itemUpdate'],
    ['collection/items.ts', 'itemReorder'],
    ['collection/maintenance.ts', 'collectionUpdate'],
    ['collection/platform.ts', 'collectRulesSet'],
    ['collection/platform.ts', 'collectionRssSendCode'],
    ['collection/platform.ts', 'collectionRssBind'],
    ['collection/platform.ts', 'collectionRssSync'],
    ['collection/policy.ts', 'collectionPolicyApply'],
    ['collection/policy.ts', 'collectionPolicySetStatus'],
    ['collection/internal.ts', 'onlineImportedChild'],
    ['policyService.ts', 'policyApplyFromFile'],
    ['policyService.ts', 'policySetStatus'],
    ['resourceService.ts', 'createResource'],
    ['resourceService.ts', 'updateListing'],
    ['bindService.ts', 'bindProject'],
    ['onlineService.ts', 'onlineResource'],
    ['onlineService.ts', 'offlineResource'],
    ['draftService.ts', 'draftPush'],
    ['draftService.ts', 'draftDiscard'],
    ['collectionDraftService.ts', 'collectionDraftPush'],
    ['collectionDraftService.ts', 'collectionDraftDiscard'],
    ['versionEditService.ts', 'editReleasedVersion'],
    ['storageUpload.ts', 'uploadFileIfNeeded'],
    ['coverUpload.ts', 'resolveCoverImageUrl'],
    ['batch/createFromDir.ts', 'createFromDir'],
  ];

  it.each(guardedWrites)('%s:%s guards direct service calls', (file, functionName) => {
    expect(exportedFunctionSource(file, functionName)).toContain(
      'assertExplicitEnvForWriteOperation();',
    );
  });

  it.each([
    ['collection/publish.ts', 'collectionPublish'],
    ['collection/publish.ts', 'collectionSyncProperties'],
    ['resource/publishVersion.ts', 'publishVersion'],
    ['releaseService.ts', 'releaseProject'],
  ])('%s:%s exempts dry-run while guarding writes', (file, functionName) => {
    expect(exportedFunctionSource(file, functionName)).toContain(
      'if (!opts.dryRun) assertExplicitEnvForWriteOperation();',
    );
  });

  it.each([
    ['collection/maintenance.ts', 'collectionLogs'],
    ['collection/platform.ts', 'collectRulesGet'],
    ['collection/policy.ts', 'collectionPolicyList'],
    ['policyService.ts', 'policyList'],
  ])('%s:%s remains a read operation', (file, functionName) => {
    expect(exportedFunctionSource(file, functionName)).not.toContain(
      'assertExplicitEnvForWriteOperation',
    );
  });
});
