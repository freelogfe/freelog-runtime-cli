import path from 'node:path';
import { requireAuth } from '../../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
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
  createOneResource,
  ensureVersionAfterCreateBatch,
  normalizeBatchSignContracts,
  prepareFiles,
  resolveExistingImportBySha1,
  resolveUniqueSubdir,
  writeItemConfigs,
} from './prepare.js';
import { normalizeCreateBatchResults } from './results.js';
import { emitBatchProgress, type BatchImportProgressEvent } from './progress.js';
import type { CreateBatchResultItem, FromDirCreatedItem, PreparedFile } from './types.js';
import { resolveConfigPath } from './config.js';
import { assertPreparedBatchAuthorization } from './authorization.js';
import {
  createBatchReport,
  findReportItem,
  finishBatchReport,
  markReportBatchRemote,
  markReportComplete,
  markReportFailure,
  markReportLocalWritePlanned,
  markReportRemote,
  markReportRemoteOutcomeUnknown,
  markReportSkipped,
  prepareBatchRecovery,
} from './report.js';

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
  onReportCreated?: (reportPath: string) => void;
  resumeReport?: string;
  retryReport?: string;
}): Promise<FromDirCreatedItem[]> {
  assertExplicitEnvForWriteOperation();
  const auth = requireAuth();
  if (!auth.username) {
    throw cliError(I18N_KEYS.auth_missing_username, { code: 2, hint: '重新 login' });
  }
  if (opts.resumeReport && opts.retryReport) {
    throw new Error('--resume 与 --retry 不能同时使用');
  }
  const requestedParent = path.resolve(opts.dir || opts.cwd || resolveCwd());
  const recoveryPath = opts.resumeReport || opts.retryReport;
  const recovery = recoveryPath
    ? await prepareBatchRecovery({
        reportPath: recoveryPath,
        mode: opts.retryReport ? 'retry' : 'resume',
        cwd: opts.cwd,
      })
    : undefined;
  const parent = recovery?.report.input.directory || requestedParent;
  const prepared = recovery
    ? recovery.prepared
    : await applyGeneratedResourceNames(
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
  const configPath = recovery
    ? recovery.report.config.path
    : resolveConfigPath(opts.cwd, parent, opts.configFile);
  const report =
    recovery?.report ||
    createBatchReport({
      parent,
      prepared,
      configPath: configPath || undefined,
      configFingerprintSource: {
        configPath: configPath || null,
        typeCode: opts.typeCode || null,
        resourceTypeName: opts.resourceTypeName || null,
        titlePrefix: opts.titlePrefix || null,
        items: prepared.map((item) => ({
          name: item.name,
          resourceTitle: item.resourceTitle,
          resourceTypeCode: item.resourceTypeCode,
          version: item.version,
          description: item.description,
          policies: item.policies,
          dependencies: item.dependencies,
        })),
      },
    });
  opts.onReportCreated?.(report.reportPath);

  assertBatchFileCount(prepared.length, opts.strictBatchLimit);
  warnBatchChunkingIfNeeded(prepared.length);
  await confirmBatchReleaseWithoutPolicies({
    withoutPolicyCount: countPreparedWithoutPolicies(prepared),
    yes: opts.yes,
  });
  assertPreparedBatchAuthorization(prepared);

  emitBatchProgress(opts.onProgress, { event: 'start', total: prepared.length });

  const created: FromDirCreatedItem[] = [];
  const failures: Array<{ file: string; error: string }> = [];
  const batchResults = new Map<PreparedFile, CreateBatchResultItem>();
  const existingResults = new Map<PreparedFile, FromDirCreatedItem>();

  for (const item of prepared) {
    const reportItem = findReportItem(report, parent, item);
    if (reportItem.result === 'remote_succeeded_local_pending' && reportItem.resourceId) continue;
    const existing = resolveExistingImportBySha1(parent, item);
    if (existing) existingResults.set(item, existing);
  }

  const groups = new Map<string, PreparedFile[]>();
  for (const item of prepared) {
    const reportItem = findReportItem(report, parent, item);
    if (existingResults.has(item) || (reportItem.result === 'remote_succeeded_local_pending' && reportItem.resourceId)) {
      continue;
    }
    const key = `${item.resourceTypeCode}\u0000${item.resourceTypeName || ''}`;
    const rows = groups.get(key) || [];
    rows.push(item);
    groups.set(key, rows);
  }

  for (const rows of groups.values()) {
    const typeInfo = await assertResourceTypeCode(rows[0]!.resourceTypeCode);
    if (!isCreateBatchSupported(typeInfo)) continue;
    if (typeof FServiceAPI.Resource.createBatch !== 'function') continue;
    const batchable = rows.filter((item) => !(item.authExcludedItems || []).length);
    if (!batchable.length) continue;

    for (let offset = 0; offset < batchable.length; offset += CREATE_BATCH_CHUNK_SIZE) {
      const chunk = batchable.slice(offset, offset + CREATE_BATCH_CHUNK_SIZE);
      markReportRemoteOutcomeUnknown(report, parent, chunk);
      let rowsData: CreateBatchResultItem[];
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
        rowsData = normalizeCreateBatchResults(
          unwrapData(envelope),
          chunk.map((p) => p.name),
        );
      } catch (error) {
        finishBatchReport(report);
        throw cliError(I18N_KEYS.create_batch_remote_outcome_unknown, {
          code: 4,
          params: { count: chunk.length },
          details: {
            reportFile: report.reportPath,
            resourceNames: chunk.map((item) => item.name),
          },
          cause: error,
          hint: '禁止自动逐项重试；请先在 Console 按授权名、版本和 owner 对账，再处理恢复报告',
        });
      }
      markReportBatchRemote(
        report,
        parent,
        chunk.map((item, index) => {
          const row = rowsData[index]!;
          return {
            item,
            resourceId: row.resourceId,
            resourceName: row.resourceName || row.name || item.name,
          };
        }),
      );
      chunk.forEach((item, index) => batchResults.set(item, rowsData[index]!));
    }
  }

  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i]!;
    try {
      const existing = existingResults.get(item);
      if (existing) {
        created.push(existing);
        markReportSkipped(report, parent, item, existing);
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
      const reportItem = findReportItem(report, parent, item);

      if (reportItem.result === 'remote_succeeded_local_pending' && reportItem.resourceId) {
        resourceId = reportItem.resourceId;
        resourceName = reportItem.resourceName || item.name;
        const versionMeta = await ensureVersionAfterCreateBatch(item, resourceId);
        versionId = versionMeta.versionId || reportItem.versionId;
        markReportRemote(report, parent, item, { resourceId, resourceName, versionId });
      } else if (batchResults.has(item)) {
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
        markReportRemote(report, parent, item, { resourceId, resourceName, versionId });
      } else {
        markReportRemoteOutcomeUnknown(report, parent, [item]);
        const one = await createOneResource(item, (remote) => {
          markReportRemote(report, parent, item, remote);
        });
        resourceId = one.resourceId;
        resourceName = one.resourceName;
        versionId = one.versionId;
        markReportRemote(report, parent, item, { resourceId, resourceName, versionId });
      }

      const savedSubdir = reportItem.subdir ? path.resolve(parent, reportItem.subdir) : undefined;
      if (savedSubdir) {
        const relativeSavedSubdir = path.relative(parent, savedSubdir);
        if (
          !relativeSavedSubdir ||
          relativeSavedSubdir.startsWith('..') ||
          path.isAbsolute(relativeSavedSubdir)
        ) {
          throw new Error(`批量报告包含越界子目录: ${reportItem.subdir}`);
        }
      }
      const subdir = savedSubdir || resolveUniqueSubdir(parent, item.safeDir);
      markReportLocalWritePlanned(report, parent, item, subdir);
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
      const createdItem: FromDirCreatedItem = {
        subdir: path.relative(parent, subdir) || path.basename(subdir),
        resourceId,
        resourceName: resourceName || item.name,
        resourceTitle: item.resourceTitle,
        itemTitle: item.itemTitle,
        authExcludedItems: item.authExcludedItems,
      };
      created.push(createdItem);
      markReportComplete(report, parent, item, createdItem, versionId);
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
      markReportFailure(report, parent, item, message);
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
  finishBatchReport(report);

  if (failures.length > 0) {
    const unknownCount = report.summary.remoteUnknown;
    throw cliError(I18N_KEYS.import_dir_partial_failed, {
      code: 4,
      params: { success: created.length, total: prepared.length },
      details: {
        created,
        failures,
        reportFile: report.reportPath,
        remoteOutcomeUnknown: unknownCount,
      },
      hint: unknownCount
        ? `${unknownCount} 项远端结果未知，禁止 --resume/--retry 自动恢复；请先在 Console 按授权名/版本核对后再决定后续操作。`
        : `正式报告 ${report.reportPath}；请 freelog-cli resource import-dir --retry "${report.reportPath}" --yes`,
    });
  }

  if (report.summary.remoteUnknown > 0) {
    throw cliError(I18N_KEYS.import_dir_partial_failed, {
      code: 4,
      params: { success: created.length, total: report.items.length },
      details: {
        created,
        reportFile: report.reportPath,
        remoteOutcomeUnknown: report.summary.remoteUnknown,
      },
      hint: `${report.summary.remoteUnknown} 项远端结果未知，当前运行不能标记成功；请先在 Console 按授权名/版本核对`,
    });
  }

  return created;
}
