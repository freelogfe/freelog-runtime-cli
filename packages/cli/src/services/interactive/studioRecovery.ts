import fs from 'node:fs';
import path from 'node:path';
import { withProjectWriteLockAsync } from '../../config/project.js';
import { requireAuth } from '../../core/auth.js';
import { getCliEnv } from '../../core/env.js';
import { FServiceAPI, getSHA1Hash, unwrapData } from '../../platform/index.js';
import { assertOwnerMatch } from '../shared/owner.js';
import { fetchResourceInfo } from '../shared/platform/index.js';
import type { PreparedFile } from '../batch/types.js';
import {
  buildCreateVersionParams,
  diffReleasedVersionIntent,
} from '../resource/createVersionParams.js';
import {
  finishBatchReport,
  markReportFailure,
  markReportRemote,
  markReportRemoteRequestNotApplied,
  loadBatchReport,
  type BatchReport,
  type BatchReportItem,
} from '../batch/report.js';

export interface StudioRecovery {
  report: BatchReport;
  item: BatchReportItem;
}

function recordValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

function httpStatus(error: unknown): number | undefined {
  const candidates = [
    recordValue(error, 'status'),
    recordValue(error, 'statusCode'),
    recordValue(recordValue(error, 'response'), 'status'),
    recordValue(recordValue(error, 'response'), 'statusCode'),
    recordValue(recordValue(error, 'data'), 'status'),
    recordValue(recordValue(error, 'data'), 'statusCode'),
  ];
  const status = candidates.map(Number).find((value) => Number.isInteger(value));
  return status;
}

/** 只有明确 HTTP 4xx 才能断言 create 请求未被平台接受；超时/断连/响应缺失仍是 unknown。 */
export function isStudioRemoteRequestDefinitelyNotApplied(error: unknown): boolean {
  const status = httpStatus(error);
  return status !== undefined && status >= 400 && status < 500;
}

export type StudioReconcileResolution = 'confirmed-not-created' | 'confirmed-created';

async function verifyConfirmedStudioResource(opts: {
  resourceId: string;
  report: BatchReport;
  row: BatchReportItem;
  auth: { userId?: number | string; username?: string };
}): Promise<{ resourceName: string; versionId?: string }> {
  const info = await fetchResourceInfo(opts.resourceId);
  assertOwnerMatch({
    authUserId: opts.auth.userId,
    authUsername: opts.auth.username,
    platformUserId: info.userId,
    platformUsername: info.username,
    hint: 'resourceId 不属于当前对账账号，拒绝写回报告',
  });

  const expectedName = opts.auth.username
    ? `${opts.auth.username}/${opts.row.prepared.name}`
    : opts.row.prepared.name;
  if (info.resourceName !== expectedName) {
    throw new Error(
      `Studio 对账资源授权名不匹配：期望 ${expectedName}，平台为 ${info.resourceName || 'unknown'}`,
    );
  }
  if (info.resourceTypeCode !== opts.row.prepared.resourceTypeCode) {
    throw new Error(
      `Studio 对账资源类型不匹配：期望 ${opts.row.prepared.resourceTypeCode}，平台为 ${info.resourceTypeCode || 'unknown'}`,
    );
  }

  const listEnvelope = await FServiceAPI.Resource.getVersionListByResourceID({
    resourceId: opts.resourceId,
  } as Parameters<typeof FServiceAPI.Resource.getVersionListByResourceID>[0]);
  const listData = unwrapData<
    | Array<{ version?: string; versionId?: string }>
    | { dataList?: Array<{ version?: string; versionId?: string }> }
  >(listEnvelope);
  const versions = Array.isArray(listData)
    ? listData
    : Array.isArray(listData?.dataList)
      ? listData.dataList
      : [];
  const targetVersion = versions.find((item) => item.version === opts.row.prepared.version);
  if (targetVersion) {
    const versionEnvelope = await FServiceAPI.Resource.resourceVersionInfo1({
      resourceId: opts.resourceId,
      version: opts.row.prepared.version,
    } as Parameters<typeof FServiceAPI.Resource.resourceVersionInfo1>[0]);
    const versionInfo = unwrapData<Record<string, unknown> & { fileSha1?: string; versionId?: string }>(
      versionEnvelope,
    );
    const prepared = opts.row.prepared;
    const expectedParams = buildCreateVersionParams({
      resourceId: opts.resourceId,
      versionCfg: {
        version: prepared.version,
        filePath: prepared.absolutePath,
        description: prepared.description,
        dependencies: prepared.dependencies,
        baseUpcastResources: prepared.baseUpcastResources,
        authExcludedItems: prepared.authExcludedItems,
        batchSignContracts: prepared.batchSignContracts,
        inputAttrs: prepared.inputAttrs,
        customPropertyDescriptors: prepared.customPropertyDescriptors,
      },
      fileSha1: prepared.sha1,
      filename: prepared.filename,
    });
    const conflictingFields = versionInfo
      ? diffReleasedVersionIntent(versionInfo, expectedParams)
      : ['remoteVersion'];
    if (conflictingFields.length) {
      throw new Error(
        `Studio 对账版本发布内容不匹配：${conflictingFields.join(', ')}`,
      );
    }
    return {
      resourceName: info.resourceName,
      versionId: versionInfo.versionId || targetVersion.versionId,
    };
  }

  if (info.latestVersion) {
    throw new Error(
      `Studio 对账资源不存在目标版本 ${opts.row.prepared.version}，但已有 latestVersion=${info.latestVersion}，拒绝绑定`,
    );
  }

  const createDate = Date.parse(String(recordValue(info, 'createDate') || ''));
  const reportStartedAt = Date.parse(opts.report.startedAt);
  if (
    !Number.isFinite(createDate) ||
    !Number.isFinite(reportStartedAt) ||
    createDate < reportStartedAt - 5 * 60 * 1000
  ) {
    throw new Error('Studio 对账只能绑定本次未知请求期间新建的资源壳，平台创建时间无法证明匹配');
  }

  return { resourceName: info.resourceName };
}

export async function reconcileStudioPublish(opts: {
  workspaceRoot: string;
  reportPath?: string;
  resolution: StudioReconcileResolution;
  resourceId?: string;
}): Promise<BatchReport> {
  const workspaceRoot = path.resolve(opts.workspaceRoot);
  return withProjectWriteLockAsync(workspaceRoot, async () => {
    const reportPath = opts.reportPath?.trim()
      ? path.resolve(workspaceRoot, opts.reportPath)
      : path.join(workspaceRoot, '.freelog', 'reports', 'studio-latest.json');
    const report = loadBatchReport(reportPath);
    if (report.command !== 'studio publish') {
      throw new Error(`报告不属于 Studio 发行: ${report.reportPath}`);
    }
    if (path.resolve(report.input.directory) !== workspaceRoot) {
      throw new Error(`Studio 报告工作区不匹配: ${report.input.directory}`);
    }
    if (report.env !== getCliEnv()) {
      throw new Error(`Studio 报告环境为 ${report.env}，当前环境为 ${getCliEnv()}，拒绝跨环境对账`);
    }
    if (report.items.length !== 1) {
      throw new Error(`Studio 报告必须且只能包含一项: ${report.reportPath}`);
    }
    const row = report.items[0]!;
    if (row.result !== 'remote_outcome_unknown') {
      throw new Error(`仅 remote_outcome_unknown 报告允许人工对账，当前为 ${row.result}`);
    }
    const auth = requireAuth();
    assertOwnerMatch({
      authUserId: auth.userId,
      authUsername: auth.username,
      platformUserId: report.actor?.userId,
      platformUsername: report.actor?.username,
      hint: '请切换回发起该 Studio 发行的账号后对账',
    });
    if (!fs.existsSync(row.prepared.absolutePath)) {
      throw new Error(`Studio 对账输入文件不存在: ${row.prepared.absolutePath}`);
    }
    const currentSha1 = await getSHA1Hash(row.prepared.absolutePath);
    if (currentSha1 !== row.prepared.sha1) {
      throw new Error(`Studio 对账输入文件内容已变化: ${row.prepared.absolutePath}`);
    }

    if (opts.resolution === 'confirmed-not-created') {
      markReportRemoteRequestNotApplied(report, workspaceRoot, [row.prepared]);
      markReportFailure(report, workspaceRoot, row.prepared, '人工对账确认：平台未创建资源，可安全重试');
    } else {
      const resourceId = opts.resourceId?.trim();
      if (!resourceId) throw new Error('confirmed-created 必须提供 resourceId');
      const verified = await verifyConfirmedStudioResource({
        resourceId,
        report,
        row,
        auth,
      });
      markReportRemote(report, workspaceRoot, row.prepared, {
        resourceId,
        resourceName: verified.resourceName,
        versionId: verified.versionId,
      });
    }
    finishBatchReport(report);
    return report;
  });
}

/** 查找同一工作区、文件内容与发行配置最近一次未完成的 Studio 远端写。 */
export function findStudioRecovery(
  workspaceRoot: string,
  item: PreparedFile,
): StudioRecovery | null {
  const reportsDir = path.join(workspaceRoot, '.freelog', 'reports');
  if (!fs.existsSync(reportsDir)) return null;

  const latestPointer = path.join(reportsDir, 'studio-latest.json');
  if (fs.existsSync(latestPointer)) {
    try {
      loadBatchReport(latestPointer);
    } catch (error) {
      throw new Error(
        `无法验证 Studio 最近发行报告，已阻止远端写以避免重复创建: ${latestPointer}`,
        { cause: error },
      );
    }
  }

  const reportFiles = fs
    .readdirSync(reportsDir)
    .filter((name) => name.endsWith('.json') && !name.endsWith('latest.json'))
    .sort((a, b) => b.localeCompare(a));

  for (const filename of reportFiles) {
    try {
      const report = loadBatchReport(path.join(reportsDir, filename));
      if (report.command !== 'studio publish' || report.env !== getCliEnv()) continue;
      const row = report.items.find(
        (candidate) =>
          path.resolve(candidate.prepared.absolutePath) === path.resolve(item.absolutePath) &&
          candidate.prepared.sha1 === item.sha1 &&
          candidate.prepared.resourceTypeCode === item.resourceTypeCode,
      );
      if (!row || row.result === 'passed' || row.result === 'skipped') continue;
      if (row.result === 'remote_outcome_unknown') return { report, item: row };
      if (row.result === 'remote_succeeded_local_pending' && row.resourceId) {
        return { report, item: row };
      }
    } catch (error) {
      throw new Error(
        `无法验证已有发行报告，已阻止 Studio 远端写以避免重复创建: ${path.join(reportsDir, filename)}`,
        { cause: error },
      );
    }
  }
  return null;
}
