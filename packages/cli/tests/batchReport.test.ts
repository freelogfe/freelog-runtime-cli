import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createBatchReport,
  loadBatchReport,
  markReportFailure,
  markReportBatchRemote,
  markReportRemote,
  markReportRemoteOutcomeUnknown,
  markReportSkipped,
  prepareBatchRecovery,
  summarizeBatchReport,
} from '../src/services/batch/index.js';
import type { FromDirCreatedItem, PreparedFile } from '../src/services/batch/types.js';

function fixture(parent: string, filename: string, sha1: string): PreparedFile {
  const absolutePath = path.join(parent, filename);
  fs.writeFileSync(absolutePath, filename);
  const actualSha1 = createHash('sha1').update(filename).digest('hex');
  return {
    absolutePath,
    filename,
    sha1: actualSha1 || sha1,
    name: path.parse(filename).name,
    resourceTitle: filename,
    resourceTypeCode: 'RT005001',
    safeDir: path.parse(filename).name,
    version: '1.0.0',
    description: '',
    dependencies: [],
    baseUpcastResources: [],
    authExcludedItems: [],
    batchSignContracts: [],
    inputAttrs: [],
    customPropertyDescriptors: [],
  };
}

describe('persistent batch report', () => {
  it('writes versioned run report and latest pointer with stable item keys', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-report-'));
    const item = fixture(parent, 'a.png', 'sha-a');
    const report = createBatchReport({
      parent,
      prepared: [item],
      configFingerprintSource: { type: 'RT005001' },
    });

    expect(fs.existsSync(report.reportPath)).toBe(true);
    expect(report.items[0]?.idempotencyKey).toMatch(/^[a-f0-9]{64}$/);
    expect(report.summary).toEqual({
      passed: 0,
      failed: 0,
      skipped: 0,
      remotePending: 0,
      remoteUnknown: 0,
      pending: 1,
    });

    const latestPath = path.join(parent, '.freelog', 'reports', 'latest.json');
    const loaded = loadBatchReport(latestPath);
    expect(loaded.runId).toBe(report.runId);
  });

  it('keeps skipped separate from passed and retry selects failed only', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-retry-report-'));
    const skipped = fixture(parent, 'skip.png', 'sha-skip');
    const failed = fixture(parent, 'fail.png', 'sha-fail');
    const report = createBatchReport({
      parent,
      prepared: [skipped, failed],
      configFingerprintSource: {},
    });
    const existing: FromDirCreatedItem = {
      subdir: 'skip',
      resourceId: 'resource-skip',
      resourceName: 'user/skip',
      resourceTitle: 'skip.png',
    };
    markReportSkipped(report, parent, skipped, existing);
    markReportFailure(report, parent, failed, 'broken');

    expect(summarizeBatchReport(report.items)).toEqual({
      passed: 0,
      failed: 1,
      skipped: 1,
      remotePending: 0,
      remoteUnknown: 0,
      pending: 0,
    });
    const recovery = await prepareBatchRecovery({ reportPath: report.reportPath, mode: 'retry' });
    expect(recovery.prepared.map((item) => item.filename)).toEqual(['fail.png']);
  });

  it('resume preserves remote success so execution can repair local state without creating again', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-resume-report-'));
    const item = fixture(parent, 'remote.png', 'sha-remote');
    const report = createBatchReport({
      parent,
      prepared: [item],
      configFingerprintSource: {},
    });
    markReportRemote(report, parent, item, {
      resourceId: 'resource-remote',
      resourceName: 'user/remote',
      versionId: 'version-remote',
    });

    const recovery = await prepareBatchRecovery({ reportPath: report.reportPath, mode: 'resume' });
    expect(recovery.prepared).toHaveLength(1);
    expect(recovery.report.items[0]).toMatchObject({
      result: 'remote_succeeded_local_pending',
      resourceId: 'resource-remote',
      versionId: 'version-remote',
      attempts: 2,
    });
  });

  it('rejects recovery when an input or declarative config changed', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-fingerprint-report-'));
    const item = fixture(parent, 'source.png', 'sha-source');
    const configPath = path.join(parent, 'freelog.batch.json');
    fs.writeFileSync(configPath, '{"items":[]}');
    const report = createBatchReport({
      parent,
      prepared: [item],
      configPath,
      configFingerprintSource: {},
    });
    markReportFailure(report, parent, item, 'retry me');

    fs.writeFileSync(item.absolutePath, 'changed');
    await expect(
      prepareBatchRecovery({ reportPath: report.reportPath, mode: 'retry' }),
    ).rejects.toThrow(/输入文件内容已变化/);

    fs.writeFileSync(item.absolutePath, item.filename);
    fs.writeFileSync(configPath, '{"items":[{"filePath":"source.png"}]}');
    await expect(
      prepareBatchRecovery({ reportPath: report.reportPath, mode: 'retry' }),
    ).rejects.toThrow(/批量配置已变化/);
  });

  it('fault injection: crash after batch request but before response persistence blocks all automatic recovery', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-unknown-report-'));
    const items = [fixture(parent, 'a.png', 'a'), fixture(parent, 'b.png', 'b')];
    const report = createBatchReport({ parent, prepared: items, configFingerprintSource: {} });

    // 注入点：请求已经发出，进程在收到响应或落盘前崩溃。
    markReportRemoteOutcomeUnknown(report, parent, items);
    const reloaded = loadBatchReport(report.reportPath);
    expect(reloaded.summary.remoteUnknown).toBe(2);
    await expect(
      prepareBatchRecovery({ reportPath: report.reportPath, mode: 'resume' }),
    ).rejects.toThrow(/远端结果未知.*禁止 resume 自动恢复/);
    await expect(
      prepareBatchRecovery({ reportPath: report.reportPath, mode: 'retry' }),
    ).rejects.toThrow(/远端结果未知.*禁止 retry 自动恢复/);
  });

  it('fault injection: complete batch response is persisted atomically before local recovery', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-atomic-report-'));
    const items = [fixture(parent, 'a.png', 'a'), fixture(parent, 'b.png', 'b')];
    const report = createBatchReport({ parent, prepared: items, configFingerprintSource: {} });
    markReportRemoteOutcomeUnknown(report, parent, items);

    markReportBatchRemote(report, parent, [
      { item: items[0]!, resourceId: 'r-a', resourceName: 'user/a' },
      { item: items[1]!, resourceId: 'r-b', resourceName: 'user/b' },
    ]);
    const reloaded = loadBatchReport(report.reportPath);
    expect(reloaded.items.map((item) => item.resourceId)).toEqual(['r-a', 'r-b']);
    expect(reloaded.summary).toMatchObject({ remotePending: 2, remoteUnknown: 0 });

    const recovery = await prepareBatchRecovery({ reportPath: report.reportPath, mode: 'resume' });
    expect(recovery.prepared).toHaveLength(2);
    expect(recovery.report.items.every((item) => item.result === 'remote_succeeded_local_pending')).toBe(true);
  });
});
