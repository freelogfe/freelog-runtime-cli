import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicWriteFile } from '../../config/atomicWrite.js';
import { getCliEnv, type FreelogEnv } from '../../core/env.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { FromDirCreatedItem, PreparedFile } from './types.js';

/**
 * 批量发行与 Studio 共用的恢复事实源。远端请求发出前先落盘 remote_outcome_unknown；
 * 拿到并持久化 resourceId 后才能进入 remote_succeeded_local_pending。unknown 禁止自动
 * 重试，resume/retry 还会核对环境、配置指纹与输入 SHA1。
 */
export const BATCH_REPORT_SCHEMA_VERSION = 1 as const;

export type BatchReportCommand = 'resource import-dir' | 'studio publish';

function batchReportError(message: string, details?: unknown) {
  return cliError(I18N_KEYS.batch_report_error, { code: 4, params: { message }, details });
}

export type BatchReportResult =
  | 'pending'
  | 'passed'
  | 'failed'
  | 'skipped'
  | 'remote_outcome_unknown'
  | 'remote_succeeded_local_pending';

export type BatchReportStage = 'prepared' | 'remote-requested' | 'remote-created' | 'local-written';

export interface BatchReportItem {
  idempotencyKey: string;
  relativePath: string;
  prepared: PreparedFile;
  stage: BatchReportStage;
  result: BatchReportResult;
  attempts: number;
  resourceId?: string;
  resourceName?: string;
  versionId?: string;
  subdir?: string;
  error?: string;
  cleanup: { status: 'not-required' | 'pending' | 'complete' | 'failed'; error?: string };
}

export interface BatchReport {
  schemaVersion: typeof BATCH_REPORT_SCHEMA_VERSION;
  runId: string;
  command: BatchReportCommand;
  env: FreelogEnv;
  actor?: { userId: number | string; username: string };
  input: { directory: string; fingerprint: string };
  config: { path?: string; fingerprint: string };
  startedAt: string;
  finishedAt?: string;
  reportPath: string;
  recovery?: { mode: 'resume' | 'retry'; sourceReport: string };
  items: BatchReportItem[];
  summary: {
    passed: number;
    failed: number;
    skipped: number;
    remotePending: number;
    remoteUnknown: number;
    pending: number;
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hashFile(filePath: string, algorithm: 'sha1' | 'sha256'): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm);
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * 为批量项生成跨进程可复现的幂等键。
 * 键同时绑定规范化相对路径、文件 SHA1、资源类型和资源名；仅路径相同不足以复用远端结果。
 */
export function batchIdempotencyKey(parent: string, item: PreparedFile): string {
  const normalizedPath = path.relative(parent, item.absolutePath).replace(/\\/g, '/');
  const relativePath = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
  return sha256([relativePath, item.sha1, item.resourceTypeCode, item.name].join('\0'));
}

/** 根据逐项结果重新计算摘要；remoteUnknown 始终独立计数，不能并入 failed 或 passed。 */
export function summarizeBatchReport(items: BatchReportItem[]): BatchReport['summary'] {
  return {
    passed: items.filter((item) => item.result === 'passed').length,
    failed: items.filter((item) => item.result === 'failed').length,
    skipped: items.filter((item) => item.result === 'skipped').length,
    remotePending: items.filter((item) => item.result === 'remote_succeeded_local_pending').length,
    remoteUnknown: items.filter((item) => item.result === 'remote_outcome_unknown').length,
    pending: items.filter((item) => item.result === 'pending').length,
  };
}

function reportsDir(parent: string): string {
  return path.join(parent, '.freelog', 'reports');
}

function writeLatest(parent: string, reportPath: string, command: BatchReportCommand): void {
  const relative = path.relative(parent, reportPath).replace(/\\/g, '/');
  atomicWriteFile(
    path.join(reportsDir(parent), command === 'studio publish' ? 'studio-latest.json' : 'latest.json'),
    `${JSON.stringify({ schemaVersion: BATCH_REPORT_SCHEMA_VERSION, report: relative }, null, 2)}\n`,
  );
}

/** 原子写入完整报告并更新 latest 指针；报告本身是恢复事实源，不是临时日志。 */
export function persistBatchReport(report: BatchReport): void {
  report.summary = summarizeBatchReport(report.items);
  atomicWriteFile(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeLatest(report.input.directory, report.reportPath, report.command);
}

/** 创建并立即持久化一份 prepared 报告，随后所有远端/本地阶段都在它上面推进。 */
export function createBatchReport(opts: {
  parent: string;
  prepared: PreparedFile[];
  command?: BatchReportCommand;
  actor?: { userId: number | string; username: string };
  configPath?: string;
  configFingerprintSource: unknown;
}): BatchReport {
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const reportPath = path.join(reportsDir(opts.parent), `${runId}.json`);
  const items = opts.prepared.map<BatchReportItem>((item) => ({
    idempotencyKey: batchIdempotencyKey(opts.parent, item),
    relativePath: path.relative(opts.parent, item.absolutePath).replace(/\\/g, '/'),
    prepared: item,
    stage: 'prepared',
    result: 'pending',
    attempts: 1,
    cleanup: { status: 'not-required' },
  }));
  const report: BatchReport = {
    schemaVersion: BATCH_REPORT_SCHEMA_VERSION,
    runId,
    command: opts.command || 'resource import-dir',
    env: getCliEnv(),
    ...(opts.actor ? { actor: opts.actor } : {}),
    input: {
      directory: opts.parent,
      fingerprint: sha256(stable(items.map((item) => [item.relativePath, item.prepared.sha1]))),
    },
    config: {
      ...(opts.configPath ? { path: opts.configPath } : {}),
      fingerprint:
        opts.configPath && fs.existsSync(opts.configPath)
          ? sha256(fs.readFileSync(opts.configPath, 'utf8'))
          : sha256(stable(opts.configFingerprintSource)),
    },
    startedAt: new Date().toISOString(),
    reportPath,
    items,
    summary: summarizeBatchReport(items),
  };
  persistBatchReport(report);
  return report;
}

function isBatchReport(value: unknown): value is BatchReport {
  const row = value as Partial<BatchReport> | null;
  return Boolean(
    row &&
      row.schemaVersion === BATCH_REPORT_SCHEMA_VERSION &&
      (row.command === 'resource import-dir' || row.command === 'studio publish') &&
      typeof row.runId === 'string' &&
      row.input &&
      typeof row.input.directory === 'string' &&
      Array.isArray(row.items),
  );
}

/** 读取正式报告或 latest 指针，并校验 schema/命令形态；无效报告不会降级为空任务。 */
export function loadBatchReport(inputPath: string, cwd?: string): BatchReport {
  let reportPath = path.resolve(cwd || process.cwd(), inputPath);
  const readReportJson = (filePath: string): unknown => {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    } catch (error) {
      throw batchReportError(`无法读取批量报告: ${filePath}`, {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const parsed = readReportJson(reportPath);
  if (!isBatchReport(parsed)) {
    const latest = parsed as { schemaVersion?: number; report?: string };
    if (latest.schemaVersion === BATCH_REPORT_SCHEMA_VERSION && latest.report) {
      reportPath = path.resolve(path.dirname(path.dirname(path.dirname(reportPath))), latest.report);
      const target = readReportJson(reportPath);
      if (!isBatchReport(target)) throw batchReportError(`无效批量报告: ${reportPath}`);
      target.reportPath = reportPath;
      return target;
    }
    throw batchReportError(`无效批量报告: ${reportPath}`);
  }
  parsed.reportPath = reportPath;
  return parsed;
}

/**
 * 从正式报告选择可恢复项。任何 remote_outcome_unknown 都会阻断整个自动恢复，
 * 因为 CLI 无法证明再次 create 不会重复；输入或配置变化同样拒绝复用旧事实。
 */
export async function prepareBatchRecovery(opts: {
  reportPath: string;
  mode: 'resume' | 'retry';
  cwd?: string;
}): Promise<{ report: BatchReport; prepared: PreparedFile[] }> {
  const report = loadBatchReport(opts.reportPath, opts.cwd);
  if (report.command !== 'resource import-dir') {
    throw batchReportError(`报告 ${report.reportPath} 属于 ${report.command}，不能用于 import-dir 恢复`);
  }
  if (report.env !== getCliEnv()) {
    throw batchReportError(`批量报告环境为 ${report.env}，当前环境为 ${getCliEnv()}，拒绝跨环境恢复`);
  }
  if (report.config.path) {
    if (!fs.existsSync(report.config.path)) {
      throw batchReportError(`批量配置已不存在，拒绝从旧报告恢复: ${report.config.path}`);
    }
    const currentConfigFingerprint = await hashFile(report.config.path, 'sha256');
    if (currentConfigFingerprint !== report.config.fingerprint) {
      throw batchReportError(`批量配置已变化，拒绝从旧报告恢复: ${report.config.path}`);
    }
  }
  const accepted =
    opts.mode === 'retry'
      ? new Set<BatchReportResult>(['failed'])
      : new Set<BatchReportResult>(['pending', 'failed', 'remote_succeeded_local_pending']);
  const unknown = report.items.filter((item) => item.result === 'remote_outcome_unknown');
  if (unknown.length) {
    throw batchReportError(
      `批量报告有 ${unknown.length} 项远端结果未知，禁止 ${opts.mode} 自动恢复以避免重复创建；请先在 Console 按授权名/版本核对: ${unknown
        .map((item) => item.prepared.name)
        .join(', ')}`,
      { result: 'remote_outcome_unknown' },
    );
  }
  const selected = report.items.filter((item) => accepted.has(item.result));
  for (const item of selected) {
    if (!fs.existsSync(item.prepared.absolutePath)) {
      throw batchReportError(`恢复输入文件不存在: ${item.prepared.absolutePath}`);
    }
    const currentSha1 = await hashFile(item.prepared.absolutePath, 'sha1');
    if (currentSha1 !== item.prepared.sha1) {
      throw batchReportError(`恢复输入文件内容已变化: ${item.prepared.absolutePath}`);
    }
    item.attempts += 1;
    item.error = undefined;
    if (item.result !== 'remote_succeeded_local_pending') item.result = 'pending';
  }
  report.finishedAt = undefined;
  report.recovery = { mode: opts.mode, sourceReport: report.reportPath };
  persistBatchReport(report);
  return { report, prepared: selected.map((item) => item.prepared) };
}

/** 按同一幂等键定位报告项；缺项说明输入或报告已漂移，必须显式失败。 */
export function findReportItem(report: BatchReport, parent: string, item: PreparedFile): BatchReportItem {
  const key = batchIdempotencyKey(parent, item);
  const row = report.items.find((entry) => entry.idempotencyKey === key);
  if (!row) throw batchReportError(`批量报告缺少输入项: ${item.filename}`);
  return row;
}

/** 标记单项远端已成功、但本地子工程尚未完成写回。 */
export function markReportRemote(
  report: BatchReport,
  parent: string,
  item: PreparedFile,
  remote: { resourceId: string; resourceName?: string; versionId?: string },
): void {
  const row = findReportItem(report, parent, item);
  row.stage = 'remote-created';
  row.result = 'remote_succeeded_local_pending';
  row.resourceId = remote.resourceId;
  row.resourceName = remote.resourceName || item.name;
  if (remote.versionId) row.versionId = remote.versionId;
  row.error = undefined;
  persistBatchReport(report);
}

/** 在发出远端请求之前调用，先建立“结果未知”的耐久检查点。 */
export function markReportRemoteOutcomeUnknown(
  report: BatchReport,
  parent: string,
  items: PreparedFile[],
): void {
  for (const item of items) {
    const row = findReportItem(report, parent, item);
    row.stage = 'remote-requested';
    row.result = 'remote_outcome_unknown';
    row.error = '远端写请求已发出，结果尚未安全持久化';
  }
  persistBatchReport(report);
}

/** 仅在明确证明请求未到达/未应用时，把 remote-requested 退回 pending。 */
export function markReportRemoteRequestNotApplied(
  report: BatchReport,
  parent: string,
  items: PreparedFile[],
): void {
  for (const item of items) {
    const row = findReportItem(report, parent, item);
    row.stage = 'prepared';
    row.result = 'pending';
    row.error = undefined;
  }
  persistBatchReport(report);
}

/** 原子映射整批远端响应；缺任一 resourceId 就保持 unknown，禁止部分猜测。 */
export function markReportBatchRemote(
  report: BatchReport,
  parent: string,
  entries: Array<{
    item: PreparedFile;
    resourceId?: string;
    resourceName?: string;
    versionId?: string;
  }>,
): void {
  if (entries.some((entry) => !entry.resourceId)) {
    throw batchReportError('批量创建响应缺少 resourceId，远端结果保持 unknown，禁止自动恢复');
  }
  for (const entry of entries) {
    const row = findReportItem(report, parent, entry.item);
    row.stage = 'remote-created';
    row.result = 'remote_succeeded_local_pending';
    row.resourceId = entry.resourceId;
    row.resourceName = entry.resourceName || entry.item.name;
    if (entry.versionId) row.versionId = entry.versionId;
    row.error = undefined;
  }
  // 整批映射只持久化一次；atomicWriteFile 保证不会留下半份 JSON。
  persistBatchReport(report);
}

/** 标记本地子工程已写回，完成一项完整的 batch 生命周期。 */
export function markReportComplete(
  report: BatchReport,
  parent: string,
  item: PreparedFile,
  result: FromDirCreatedItem,
  versionId?: string,
): void {
  const row = findReportItem(report, parent, item);
  row.stage = 'local-written';
  row.result = 'passed';
  row.resourceId = result.resourceId;
  row.resourceName = result.resourceName;
  row.versionId = versionId || row.versionId;
  row.subdir = result.subdir;
  row.error = undefined;
  row.cleanup = { status: 'not-required' };
  persistBatchReport(report);
}

/** 在本地写入前记录预留子目录，供崩溃恢复识别安全写入位置。 */
export function markReportLocalWritePlanned(
  report: BatchReport,
  parent: string,
  item: PreparedFile,
  subdir: string,
): void {
  const row = findReportItem(report, parent, item);
  row.subdir = path.relative(parent, subdir).replace(/\\/g, '/');
  row.cleanup = { status: 'not-required' };
  persistBatchReport(report);
}

/** 记录按 SHA1/已有工程复用而跳过远端创建的项。 */
export function markReportSkipped(
  report: BatchReport,
  parent: string,
  item: PreparedFile,
  result: FromDirCreatedItem,
): void {
  const row = findReportItem(report, parent, item);
  row.stage = 'local-written';
  row.result = 'skipped';
  row.resourceId = result.resourceId;
  row.resourceName = result.resourceName;
  row.subdir = result.subdir;
  row.error = 'sha1-reuse';
  persistBatchReport(report);
}

/** 标记已知失败；若已有 resourceId，保留 remote_succeeded_local_pending 语义。 */
export function markReportFailure(
  report: BatchReport,
  parent: string,
  item: PreparedFile,
  error: string,
): void {
  const row = findReportItem(report, parent, item);
  if (row.result !== 'remote_outcome_unknown') {
    row.result = row.resourceId ? 'remote_succeeded_local_pending' : 'failed';
  }
  row.error = error;
  persistBatchReport(report);
}

/** 写入结束时间并刷新摘要/latest 指针；不会把 unknown 自动转成成功。 */
export function finishBatchReport(report: BatchReport): void {
  report.finishedAt = new Date().toISOString();
  persistBatchReport(report);
}
