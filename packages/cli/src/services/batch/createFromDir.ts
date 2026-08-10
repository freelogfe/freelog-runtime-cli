import path from 'node:path';
import { requireAuth } from '../../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { CliError } from '../../core/errors.js';
import { resolveCwd } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { FServiceAPI, unwrapData } from '../../platform/index.js';
import { assertResourceTypeCode } from '../typeService.js';
import { isCreateBatchSupported } from '../resourceTypeCapabilities.js';
import {
  assertBatchFileCount,
  confirmBatchReleaseWithoutPolicies,
  countPreparedWithoutPolicies,
  CREATE_BATCH_CHUNK_SIZE,
  warnBatchChunkingIfNeeded,
} from '../shared/guards/index.js';
import { resolveCreateApiResourceTypeName } from '../resourceName.js';
import {
  applyGeneratedResourceNames,
  createOneFallback,
  ensureVersionAfterCreateBatch,
  normalizeBatchSignContracts,
  prepareFiles,
  resolveExistingImportBySha1,
  resolveUniqueSubdir,
  writeItemConfigs,
  writeRetryBatchConfig,
} from './prepare.js';
import { normalizeCreateBatchResults, shouldFallbackCreateBatch } from './results.js';
import { emitBatchProgress, type BatchImportProgressEvent } from './progress.js';
import type { CreateBatchResultItem, FromDirCreatedItem, PreparedFile } from './types.js';

export type { BatchImportProgressEvent };

export async function createFromDir(opts: {
  dir: string;
  typeCode?: string;
  resourceTypeName?: string;
  titlePrefix?: string;
  configFile?: string;
  cwd?: string;
  yes?: boolean;
  strictBatchLimit?: boolean;
  onProgress?: (event: BatchImportProgressEvent) => void;
}): Promise<FromDirCreatedItem[]> {
  assertExplicitEnvForWriteOperation();
  const auth = requireAuth();
  if (!auth.username) {
    throw cliError(I18N_KEYS.auth_missing_username, { code: 2, hint: '重新 login' });
  }
  const parent = path.resolve(opts.dir || opts.cwd || resolveCwd());
  const prepared = await applyGeneratedResourceNames(
    await prepareFiles({
      dir: parent,
      typeCode: opts.typeCode,
      resourceTypeName: opts.resourceTypeName,
      titlePrefix: opts.titlePrefix,
      username: auth.username,
      cwd: opts.cwd,
      configFile: opts.configFile,
    }),
  );

  assertBatchFileCount(prepared.length, opts.strictBatchLimit);
  warnBatchChunkingIfNeeded(prepared.length);
  await confirmBatchReleaseWithoutPolicies({
    withoutPolicyCount: countPreparedWithoutPolicies(prepared),
    yes: opts.yes,
  });

  emitBatchProgress(opts.onProgress, { event: 'start', total: prepared.length });

  const created: FromDirCreatedItem[] = [];
  const failures: Array<{ file: string; error: string }> = [];
  const batchResults = new Map<PreparedFile, CreateBatchResultItem>();

  const groups = new Map<string, PreparedFile[]>();
  for (const item of prepared) {
    const key = `${item.resourceTypeCode}\u0000${item.resourceTypeName || ''}`;
    const rows = groups.get(key) || [];
    rows.push(item);
    groups.set(key, rows);
  }

  for (const rows of groups.values()) {
    const typeInfo = await assertResourceTypeCode(rows[0]!.resourceTypeCode);
    if (!isCreateBatchSupported(typeInfo)) continue;
    const batchable = rows.filter((item) => !(item.authExcludedItems || []).length);
    if (!batchable.length) continue;

    for (let offset = 0; offset < batchable.length; offset += CREATE_BATCH_CHUNK_SIZE) {
      const chunk = batchable.slice(offset, offset + CREATE_BATCH_CHUNK_SIZE);
      try {
        const envelope = await FServiceAPI.Resource.createBatch({
          resourceTypeCode: chunk[0]!.resourceTypeCode,
          resourceTypeName: resolveCreateApiResourceTypeName(chunk[0]!.resourceTypeCode, {
            manifest: chunk[0]!.resourceTypeName,
          }),
          createResourceObjects: chunk.map((p) => ({
            name: p.name,
            resourceTitle: p.resourceTitle,
            intro: p.intro,
            coverImages: p.coverImages,
            tags: p.tags,
            policies: p.policies,
            version: p.version,
            fileSha1: p.sha1,
            filename: p.filename,
            description: p.description,
            dependencies: p.dependencies,
            baseUpcastResources: p.baseUpcastResources,
            inputAttrs: p.inputAttrs,
            customPropertyDescriptors: p.customPropertyDescriptors,
            batchSignContracts: normalizeBatchSignContracts(p.batchSignContracts),
          })),
        } as Parameters<typeof FServiceAPI.Resource.createBatch>[0]);
        const rowsData = normalizeCreateBatchResults(
          unwrapData(envelope),
          chunk.map((p) => p.name),
        );
        chunk.forEach((item, index) => batchResults.set(item, rowsData[index]!));
      } catch (error) {
        if (error instanceof CliError && error.code === 2) throw error;
        if (!shouldFallbackCreateBatch(error)) throw error;
        // 本批次降级为逐个 create + createVersion；其它批次仍可继续批量。
      }
    }
  }

  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i]!;
    try {
      const existing = resolveExistingImportBySha1(parent, item);
      if (existing) {
        created.push(existing);
        emitBatchProgress(opts.onProgress, {
          event: 'skip',
          index: i,
          file: item.filename,
          resourceId: existing.resourceId,
          subdir: existing.subdir,
          reason: 'sha1-reuse',
        });
        continue;
      }

      let resourceId: string | undefined;
      let resourceName: string | undefined;
      let versionId: string | undefined;

      if (batchResults.has(item)) {
        const row = batchResults.get(item);
        resourceId = row?.resourceId;
        resourceName = row?.resourceName || row?.name || item.name;
        if (!resourceId) {
          throw cliError(I18N_KEYS.create_batch_missing_resource_id, {
            code: 1,
            details: row,
          });
        }
        const versionMeta = await ensureVersionAfterCreateBatch(item, resourceId);
        versionId = versionMeta.versionId;
      } else {
        const one = await createOneFallback(item);
        resourceId = one.resourceId;
        resourceName = one.resourceName;
        versionId = one.versionId;
      }

      const subdir = resolveUniqueSubdir(parent, item.safeDir);
      writeItemConfigs({
        subdir,
        sourceFile: item.absolutePath,
        resourceId,
        resourceName: resourceName || item.name,
        resourceTypeCode: item.resourceTypeCode,
        resourceTypeName: item.resourceTypeName,
        resourceTitle: item.resourceTitle,
        fileSha1: item.sha1,
        filename: item.filename,
        version: item.version,
        description: item.description,
        intro: item.intro,
        coverImages: item.coverImages,
        tags: item.tags,
        dependencies: item.dependencies,
        baseUpcastResources: item.baseUpcastResources,
        authExcludedItems: item.authExcludedItems,
        inputAttrs: item.inputAttrs,
        customPropertyDescriptors: item.customPropertyDescriptors,
        versionId,
        userId: auth.userId,
        username: auth.username,
      });
      created.push({
        subdir: path.relative(parent, subdir) || path.basename(subdir),
        resourceId,
        resourceName: resourceName || item.name,
        resourceTitle: item.resourceTitle,
        itemTitle: item.itemTitle,
        authExcludedItems: item.authExcludedItems,
      });
      emitBatchProgress(opts.onProgress, {
        event: 'ok',
        index: i,
        file: item.filename,
        resourceId,
        resourceName: resourceName || item.name,
        subdir: path.relative(parent, subdir) || path.basename(subdir),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({
        file: item.filename,
        error: message,
      });
      emitBatchProgress(opts.onProgress, {
        event: 'fail',
        index: i,
        file: item.filename,
        error: message,
      });
    }
  }

  emitBatchProgress(opts.onProgress, {
    event: 'done',
    ok: created.length,
    fail: failures.length,
    total: prepared.length,
  });

  if (failures.length > 0) {
    const retryPath = writeRetryBatchConfig(parent, failures, prepared);
    throw cliError(I18N_KEYS.import_dir_partial_failed, {
      code: 4,
      params: { success: created.length, total: prepared.length },
      details: { created, failures, retryBatchFile: retryPath || undefined },
      hint: retryPath
        ? `已写入 ${path.basename(retryPath)}，请 freelog-cli resource import-dir "${parent}" --config retry.batch.json --yes`
        : '成功项已写入子目录 manifest/state；失败项可单独 create/publish',
    });
  }

  return created;
}
