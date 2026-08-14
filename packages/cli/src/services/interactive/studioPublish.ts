import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { consola } from 'consola';
import { tryLoadResourceProject, withProjectWriteLockAsync } from '../../config/project.js';
import { requireAuth } from '../../core/auth.js';
import { assertExplicitEnvForWriteOperation } from '../../core/command.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { getSHA1Hash } from '../../platform/index.js';
import { uploadFileIfNeeded } from '../storageUpload.js';
import { filterIgnoredFiles, loadFreelogIgnorePatterns } from '../freelogIgnore.js';
import { assertLeafResourceTypeCode } from '../typeService.js';
import { assertLocalFileAllowedByType } from '../resourceTypeCapabilities.js';
import { assertSha1PublishAllowed } from '../shared/guards/index.js';
import { assertOwnerMatch } from '../shared/owner.js';
import {
  applyGeneratedResourceNames,
  createOneResource,
  ensureVersionAfterCreateBatch,
  resolveExistingImportBySha1,
  resolveInitialBatchResourceName,
  resolveUniqueSubdir,
  writeItemConfigs,
} from '../batch/prepare.js';
import type { PreparedFile } from '../batch/types.js';
import {
  createBatchReport,
  findReportItem,
  finishBatchReport,
  markReportComplete,
  markReportFailure,
  markReportLocalWritePlanned,
  markReportRemote,
  markReportRemoteOutcomeUnknown,
  markReportRemoteRequestNotApplied,
  type BatchReport,
} from '../batch/report.js';
import {
  findStudioRecovery,
  isStudioRemoteRequestDefinitelyNotApplied,
} from './studioRecovery.js';

const CONFIG_RE = /^freelog\..*\.config/i;

export function listRootMediaFiles(workspaceRoot: string): string[] {
  if (!fs.existsSync(workspaceRoot) || !fs.statSync(workspaceRoot).isDirectory()) {
    return [];
  }
  const files = fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((ent) => ent.isFile() && !CONFIG_RE.test(ent.name))
    .map((ent) => path.join(workspaceRoot, ent.name));
  return filterIgnoredFiles(files, loadFreelogIgnorePatterns(workspaceRoot)).sort((a, b) =>
    path.basename(a).localeCompare(path.basename(b)),
  );
}

export interface StudioPublishOptions {
  /** 自动化与集成测试可显式指定；交互模式留空时仍由菜单选择。 */
  filePath?: string;
  resourceTypeCode?: string;
  onReportCreated?: (reportPath: string) => void;
}

export interface StudioPublishResult {
  subdir: string;
  resourceId: string;
  resourceName: string;
  versionId?: string;
  reportPath?: string;
  outcome: 'created' | 'recovered' | 'existing';
}

function resolvePlannedSubdir(workspaceRoot: string, relativeSubdir: string | undefined): string | undefined {
  if (!relativeSubdir) return undefined;
  const candidate = path.resolve(workspaceRoot, relativeSubdir);
  const relative = path.relative(workspaceRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Studio 恢复报告包含越界子目录: ${relativeSubdir}`);
  }
  return candidate;
}

function writeStudioProject(opts: {
  report: BatchReport;
  workspaceRoot: string;
  prepared: PreparedFile;
  subdir: string;
  resourceId: string;
  resourceName: string;
  versionId?: string;
  userId: number;
  username: string;
}): void {
  const { report, workspaceRoot, prepared, subdir, resourceId, resourceName, versionId } = opts;
  markReportLocalWritePlanned(report, workspaceRoot, prepared, subdir);
  writeItemConfigs({
    subdir,
    sourceFile: prepared.absolutePath,
    resourceId,
    resourceName,
    resourceTypeCode: prepared.resourceTypeCode,
    resourceTypeName: prepared.resourceTypeName,
    resourceTitle: prepared.resourceTitle,
    fileSha1: prepared.sha1,
    filename: prepared.filename,
    version: prepared.version,
    description: prepared.description,
    intro: prepared.intro,
    coverImages: prepared.coverImages,
    tags: prepared.tags,
    dependencies: prepared.dependencies,
    baseUpcastResources: prepared.baseUpcastResources,
    authExcludedItems: prepared.authExcludedItems,
    inputAttrs: prepared.inputAttrs,
    customPropertyDescriptors: prepared.customPropertyDescriptors,
    versionId,
    userId: opts.userId,
    username: opts.username,
  });
  markReportComplete(
    report,
    workspaceRoot,
    prepared,
    {
      subdir: path.relative(workspaceRoot, subdir) || path.basename(subdir),
      resourceId,
      resourceName,
      resourceTitle: prepared.resourceTitle,
      itemTitle: prepared.itemTitle,
      authExcludedItems: prepared.authExcludedItems,
    },
    versionId,
  );
  finishBatchReport(report);
}

function recordStudioFailure(
  report: BatchReport,
  workspaceRoot: string,
  prepared: PreparedFile,
  error: unknown,
): void {
  try {
    const row = findReportItem(report, workspaceRoot, prepared);
    if (
      row.result === 'remote_outcome_unknown' &&
      isStudioRemoteRequestDefinitelyNotApplied(error)
    ) {
      markReportRemoteRequestNotApplied(report, workspaceRoot, [prepared]);
    }
    markReportFailure(
      report,
      workspaceRoot,
      prepared,
      error instanceof Error ? error.message : String(error),
    );
    finishBatchReport(report);
  } catch {
    // 保留原始发行错误；最后一次成功的原子报告仍可用于人工恢复或对账。
  }
}

/** studio：从工作区根目录选择单个媒体文件发行并落盘子工程。 */
export async function studioPublishOneFile(
  workspaceRoot: string,
  options: StudioPublishOptions = {},
): Promise<StudioPublishResult | null> {
  assertExplicitEnvForWriteOperation();
  const auth = requireAuth();
  if (!auth.username) {
    throw cliError(I18N_KEYS.auth_missing_username, { code: 2, hint: '重新 login' });
  }
  const username = auth.username;
  const userId = Number(auth.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw cliError(I18N_KEYS.owner_compare_missing_user_id, { code: 2, hint: '重新 login' });
  }

  const files = listRootMediaFiles(workspaceRoot);
  if (files.length === 0) {
    consola.warn('工作文件夹内没有可发行的文件');
    return null;
  }

  let absolutePath: string;
  if (options.filePath) {
    absolutePath = path.resolve(options.filePath);
    if (!files.some((file) => path.resolve(file) === absolutePath)) {
      throw new Error(`Studio 只能发行工作区根目录内的普通文件: ${absolutePath}`);
    }
  } else {
    const pick = await p.select({
      message: '选择要发行的文件',
      options: files.map((file) => ({
        value: file,
        label: path.basename(file),
      })),
    });
    if (p.isCancel(pick)) return null;
    absolutePath = String(pick);
  }
  const sha1 = await getSHA1Hash(absolutePath);
  const basename = path.parse(absolutePath).name;
  const safeDir = basename.replace(/[\\/:*?"<>|\s@$#]+/g, '_').replace(/_+/g, '_') || 'file';
  const name = resolveInitialBatchResourceName(undefined, safeDir);
  const draftPrepared = {
    absolutePath,
    filename: path.basename(absolutePath),
    sha1,
    name,
    resourceTitle: basename,
    resourceTypeCode: '',
    safeDir,
    version: '1.0.0',
    description: '',
  };
  let resourceTypeCode = options.resourceTypeCode?.trim();
  if (!resourceTypeCode) {
    const typeCode = await p.text({
      message: '资源类型 code（如 RT005001）',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(typeCode)) return null;
    resourceTypeCode = String(typeCode).trim();
  }
  const selectedResourceTypeCode = resourceTypeCode;
  const typeInfo = await assertLeafResourceTypeCode(selectedResourceTypeCode);
  assertLocalFileAllowedByType({
    typeInfo,
    filePath: absolutePath,
    filename: path.basename(absolutePath),
  });
  return withProjectWriteLockAsync(workspaceRoot, async () => {
    const existing = resolveExistingImportBySha1(workspaceRoot, draftPrepared);
    if (existing) {
      const existingProject = tryLoadResourceProject(path.join(workspaceRoot, existing.subdir));
      assertOwnerMatch({
        authUserId: userId,
        authUsername: username,
        platformUserId: existingProject?.data.userId,
        platformUsername: existingProject?.data.username,
        hint: '该文件已有其他账号的 Studio 子工程，请切换账号或更换文件',
      });
      consola.info(`该文件已有子工程: ${existing.subdir}（resourceId=${existing.resourceId}）`);
      return {
        subdir: path.join(workspaceRoot, existing.subdir),
        resourceId: existing.resourceId,
        resourceName: existing.resourceName,
        outcome: 'existing',
      };
    }

    draftPrepared.resourceTypeCode = selectedResourceTypeCode;
    const recovery = findStudioRecovery(workspaceRoot, draftPrepared);
    if (recovery?.item.result === 'remote_outcome_unknown') {
      throw new Error(
        `此前 Studio 发行的远端结果未知，已禁止自动重试以避免重复创建；请先在 Console 核对。恢复报告: ${recovery.report.reportPath}`,
      );
    }
    if (recovery?.item.resourceId) {
      assertOwnerMatch({
        authUserId: userId,
        authUsername: username,
        platformUserId: recovery.report.actor?.userId,
        platformUsername: recovery.report.actor?.username,
        hint: '请切换回创建该 Studio 资源的账号后恢复',
      });
      const prepared = recovery.item.prepared;
      let versionId = recovery.item.versionId;
      const resourceName = recovery.item.resourceName || prepared.name;
      let subdir = resolvePlannedSubdir(workspaceRoot, recovery.item.subdir);
      try {
        await uploadFileIfNeeded(prepared.absolutePath, prepared.sha1);
        const version = await ensureVersionAfterCreateBatch(prepared, recovery.item.resourceId);
        versionId = version.versionId || versionId;
        markReportRemote(recovery.report, workspaceRoot, prepared, {
          resourceId: recovery.item.resourceId,
          resourceName,
          versionId,
        });
        subdir ||= resolveUniqueSubdir(workspaceRoot, prepared.safeDir);
        writeStudioProject({
          report: recovery.report,
          workspaceRoot,
          prepared,
          subdir,
          resourceId: recovery.item.resourceId,
          resourceName,
          versionId,
          userId,
          username,
        });
      } catch (error) {
        recordStudioFailure(recovery.report, workspaceRoot, prepared, error);
        throw error;
      }
      consola.info(`已从恢复报告完成本地落盘: ${recovery.report.reportPath}`);
      return {
        subdir: subdir!,
        resourceId: recovery.item.resourceId,
        resourceName,
        versionId,
        reportPath: recovery.report.reportPath,
        outcome: 'recovered',
      };
    }

    await assertSha1PublishAllowed(sha1);
    await uploadFileIfNeeded(absolutePath, sha1);

    const [prepared] = await applyGeneratedResourceNames([
      {
        ...draftPrepared,
        resourceTypeCode: selectedResourceTypeCode,
      },
    ]);

    const subdir = resolveUniqueSubdir(workspaceRoot, prepared.safeDir);
    const report = createBatchReport({
      parent: workspaceRoot,
      prepared: [prepared],
      command: 'studio publish',
      actor: { userId, username },
      configFingerprintSource: {
        file: prepared.absolutePath,
        sha1: prepared.sha1,
        resourceTypeCode: prepared.resourceTypeCode,
        resourceName: prepared.name,
      },
    });
    options.onReportCreated?.(report.reportPath);
    markReportLocalWritePlanned(report, workspaceRoot, prepared, subdir);
    const spinner = p.spinner();
    spinner.start('发行中…');
    try {
      markReportRemoteOutcomeUnknown(report, workspaceRoot, [prepared]);
      const created = await createOneResource(prepared, (remote) => {
        markReportRemote(report, workspaceRoot, prepared, remote);
      });
      markReportRemote(report, workspaceRoot, prepared, created);
      writeStudioProject({
        report,
        workspaceRoot,
        prepared,
        subdir,
        resourceId: created.resourceId,
        resourceName: created.resourceName,
        versionId: created.versionId,
        userId,
        username,
      });
      spinner.stop(`已发行 → ${path.relative(workspaceRoot, subdir) || path.basename(subdir)}`);
      consola.info(`resourceId=${created.resourceId} owner=${username} report=${report.reportPath}`);
      return {
        subdir,
        resourceId: created.resourceId,
        resourceName: created.resourceName,
        versionId: created.versionId,
        reportPath: report.reportPath,
        outcome: 'created',
      };
    } catch (error) {
      recordStudioFailure(report, workspaceRoot, prepared, error);
      spinner.stop('发行失败');
      consola.error(`Studio 恢复/对账报告: ${report.reportPath}`);
      throw error;
    }
  });
}

export function summarizeStudioWorkspace(workspaceRoot: string): void {
  if (!fs.existsSync(workspaceRoot)) {
    consola.warn('工作文件夹不存在');
    return;
  }
  const subdirs = fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  const files = listRootMediaFiles(workspaceRoot).map((f) => path.basename(f));
  consola.info(`工作文件夹: ${workspaceRoot}`);
  consola.info(`根目录文件: ${files.length ? files.join(', ') : '（无）'}`);
  consola.info(`子工程: ${subdirs.length ? subdirs.join(', ') : '（无）'}`);
}
