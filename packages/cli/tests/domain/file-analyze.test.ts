import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { uploadAndAnalyze, waitAnalyze, waitAnalyzeSse } from '../../src/domain/version/file';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { readDraft, writeDraft } from '../../src/local/draft';
import { sseEvents, sseResult } from '../helpers/sse';

describe('T6.2 SHA1 / 上传 / 解析', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t62-'));
    applyCliEnv({ flag: 'test' });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('SSE 的 0/1 继续，2/3 都按 Console 读取元数据', async () => {
    const status3 = waitAnalyze(
      'sha',
      'VIDEO',
      { filesListInfoSse: sseResult({ metaAnalyzeStatus: 3, metaInfoArray: [] }) },
    );
    await expect(status3).resolves.toMatchObject({ metaAnalyzeStatus: 3, metaInfoArray: [] });

    const done = await waitAnalyze(
      'sha',
      'VIDEO',
      { filesListInfoSse: sseResult({ metaAnalyzeStatus: 2 }) },
    );
    expect(done.metaAnalyzeStatus).toBe(2);

    await expect(
      waitAnalyze(
        'sha',
        'VIDEO',
        { filesListInfoSse: sseEvents({ metaAnalyzeStatus: 0 }, { metaAnalyzeStatus: 1 }) },
      ),
    ).rejects.toMatchObject({ code: 'FILE_ANALYZE_STREAM_INCOMPLETE' });
  });

  it('默认的 Console SSE 协议按 data 事件读取 2/3 终态', async () => {
    async function* events(): AsyncGenerator<string> {
      yield 'event: message\n';
      yield 'data: {"sha1":"other","metaAnalyzeStatus":2}\n\n';
      yield 'data: {"sha1":"sha","metaAnalyzeStatus":1}\n\n';
      yield 'data: {"sha1":"sha","metaAnalyzeStatus":2,"metaInfoArray":[{"key":"width"}]}\n\n';
    }
    await expect(waitAnalyzeSse(events(), 'sha')).resolves.toMatchObject({ metaAnalyzeStatus: 2 });

    async function* status3(): AsyncGenerator<string> {
      yield 'data: {"sha1":"sha","metaAnalyzeStatus":3,"metaInfoArray":[]}\n\n';
    }
    await expect(waitAnalyzeSse(status3(), 'sha')).resolves.toMatchObject({ metaAnalyzeStatus: 3 });
  });

  it('SSE 在解析窗口内未产出终态时超时并关闭流', async () => {
    let destroyed = false;
    const neverEnds: AsyncIterable<string> & { destroy: () => void } = {
      async *[Symbol.asyncIterator]() {
        await new Promise<void>(() => {});
      },
      destroy: () => { destroyed = true; },
    };
    await expect(waitAnalyzeSse(neverEnds, 'sha', 1)).rejects.toMatchObject({
      code: 'FILE_ANALYZE_TIMEOUT',
    });
    expect(destroyed).toBe(true);
  });

  it('上传后写入稿的 fileSha1 / filename', async () => {
    const identity = createIdentity(cwd, {
      subject: 'resource',
      resourceId: 'res_clip',
      name: 'clip',
      typeCode: 'VIDEO',
      filePath: './a.mp4',
    });
    writeFileSync(path.join(cwd, 'a.mp4'), 'video-bytes');
    let uploadParams: Record<string, unknown> | undefined;
    await uploadAndAnalyze({
      cwd,
      identity,
      yes: true,
      apis: {
        fileIsExist: async () => ({ data: { isExisting: false } }),
        uploadFile: async (params) => {
          uploadParams = params;
          return { data: {} };
        },
        filesListInfoSse: sseResult({ metaAnalyzeStatus: 2 }),
      },
    });
    const draft = readDraft(cwd, 1);
    expect(draft?.filename).toBe('a.mp4');
    expect(draft?.fileSha1).toMatch(/^[a-f0-9]{40}$/);
    expect(draft?.analyzedSha1).toBe(draft?.fileSha1);
    expect(readIdentity(cwd, identity.n)?.filePath).toBe('a.mp4');
    expect(uploadParams?.file).toBeInstanceOf(Blob);
    expect((uploadParams?.file as { name?: unknown }).name).toBe('a.mp4');
    expect((uploadParams?.file as { type?: unknown }).type).toBe('video/mp4');
    expect(uploadParams).not.toHaveProperty('resourceType');
  });

  it('哈希后文件发生变化时，拒绝上传且不写工作稿', async () => {
    const identity = createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_changed', name: 'changed', typeCode: 'VIDEO', filePath: 'changed.mp4',
    });
    const localPath = path.join(cwd, 'changed.mp4');
    writeFileSync(localPath, 'before');
    const uploadFile = vi.fn(async () => ({ data: {} }));

    await expect(uploadAndAnalyze({
      cwd,
      identity,
      yes: true,
      apis: {
        fileIsExist: async () => {
          writeFileSync(localPath, 'after-and-different-size');
          return { data: { isExisting: false } };
        },
        uploadFile,
        filesListInfoSse: sseResult({ metaAnalyzeStatus: 2 }),
      },
    })).rejects.toMatchObject({ code: 'FILE_CHANGED_DURING_PUBLISH' });

    expect(uploadFile).not.toHaveBeenCalled();
    expect(readDraft(cwd, identity.n)).toBeUndefined();
  });

  it('新分析重新出现待复核 key 时自动恢复该用户值', async () => {
    const identity = createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_restore', name: 'restore', typeCode: 'VIDEO', filePath: 'restore.mp4',
    });
    writeFileSync(path.join(cwd, 'restore.mp4'), 'video-bytes');
    writeDraft(cwd, identity.n, {
      inputAttrs: [{ key: 'still-here', value: 'kept' }],
      orphanedInputAttrs: [{ key: 'returned', value: 'restore-me' }, { key: 'gone', value: 'review-me' }],
      baseUpcastResources: [], authExcludedItems: [],
    });

    await uploadAndAnalyze({
      cwd,
      identity,
      yes: true,
      apis: {
        fileIsExist: async () => ({ data: { isExisting: true } }),
        filesListInfoSse: sseResult({
          metaAnalyzeStatus: 2,
          metaInfoArray: [
            { insertMode: 2, key: 'still-here' },
            { insertMode: 2, key: 'returned' },
          ],
        }),
      },
    });
    expect(readDraft(cwd, identity.n)?.inputAttrs).toEqual([
      { key: 'still-here', value: 'kept' },
      { key: 'returned', value: 'restore-me' },
    ]);
    expect(readDraft(cwd, identity.n)?.orphanedInputAttrs).toEqual([{ key: 'gone', value: 'review-me' }]);
  });

  it('主题临时 zip 在上传失败时也会清理', async () => {
    const identity = createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_theme', name: 'theme', typeCode: 'RT001', filePath: 'dist',
    });
    mkdirSync(path.join(cwd, 'dist'));
    writeFileSync(path.join(cwd, 'dist', 'index.html'), '<main/>');
    const prefix = `freelog-zip-${process.pid}-`;
    const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith(prefix)));
    await expect(uploadAndAnalyze({
      cwd,
      identity,
      yes: true,
      apis: {
        fileIsExist: async () => ({ data: { isExisting: false } }),
        uploadFile: async () => { throw new Error('upload failed'); },
      },
    })).rejects.toThrow('upload failed');
    const after = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith(prefix)));
    expect(after).toEqual(before);
  });
});
