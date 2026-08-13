import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { atomicWriteFile } from '../../config/atomicWrite.js';
import { getCliEnv, type FreelogEnv } from '../../core/env.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import type { FromDirCreatedItem, PreparedFile } from './types.js';

export const BATCH_REPORT_SCHEMA_VERSION = 1 as const;

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
  command: 'resource import-dir';
  env: FreelogEnv;
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

export function batchIdempotencyKey(parent: string, item: PreparedFile): string {
  const relativePath = path.relative(parent, item.absolutePath).replace(/\\/g, '/').toLowerCase();
  return sha256([relativePath, item.sha1, item.resourceTypeCode, item.name].join('\0'));
}

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

function writeLatest(parent: string, reportPath: string): void {
  const relative = path.relative(parent, reportPath).replace(/\\/g, '/');
  atomicWriteFile(
    path.join(reportsDir(parent), 'latest.json'),
    `${JSON.stringify({ schemaVersion: BATCH_REPORT_SCHEMA_VERSION, report: relative }, null, 2)}\n`,
  );
}

export function persistBatchReport(report: BatchReport): void {
  report.summary = summarizeBatchReport(report.items);
  atomicWriteFile(report.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeLatest(report.input.directory, report.reportPath);
}

export function createBatchReport(opts: {
  parent: string;
  prepared: PreparedFile[];
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
    command: 'resource import-dir',
    env: getCliEnv(),
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
      row.command === 'resource import-dir' &&
      typeof row.runId === 'string' &&
      row.input &&
      typeof row.input.directory === 'string' &&
      Array.isArray(row.items),
  );
}

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

export async function prepareBatchRecovery(opts: {
  reportPath: string;
  mode: 'resume' | 'retry';
  cwd?: string;
}): Promise<{ report: BatchReport; prepared: PreparedFile[] }> {
  const report = loadBatchReport(opts.reportPath, opts.cwd);
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

export function findReportItem(report: BatchReport, parent: string, item: PreparedFile): BatchReportItem {
  const key = batchIdempotencyKey(parent, item);
  const row = report.items.find((entry) => entry.idempotencyKey === key);
  if (!row) throw batchReportError(`批量报告缺少输入项: ${item.filename}`);
  return row;
}

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

export function finishBatchReport(report: BatchReport): void {
  report.finishedAt = new Date().toISOString();
  persistBatchReport(report);
}
