import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { uploadAndAnalyze, waitAnalyze } from '../../src/domain/version/file';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { readDraft, writeDraft } from '../../src/local/draft';

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

  it('filesListInfo 0/1 继续、2 完成、3 失败、超时', async () => {
    const failed = waitAnalyze(
      'sha',
      'VIDEO',
      { filesListInfo: async () => ({ data: { metaAnalyzeStatus: 3 } }) },
      () => 0,
      async () => {},
    );
    await expect(failed).rejects.toMatchObject({ message: '属性解析失败' });

    const done = await waitAnalyze(
      'sha',
      'VIDEO',
      { filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }) },
      () => 0,
      async () => {},
    );
    expect(done.metaAnalyzeStatus).toBe(2);

    let calls = 0;
    await expect(
      waitAnalyze(
        'sha',
        'VIDEO',
        {
          filesListInfo: async () => {
            calls += 1;
            return { data: { metaAnalyzeStatus: calls === 1 ? 0 : 1 } };
          },
        },
        () => (calls > 2 ? 200_000 : 0),
        async () => {},
      ),
    ).rejects.toMatchObject({ message: '属性解析超时' });
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
    let uploadedFile: unknown;
    await uploadAndAnalyze({
      cwd,
      identity,
      yes: true,
      apis: {
        fileIsExist: async () => ({ data: { isExisting: false } }),
        uploadFile: async ({ file }) => {
          uploadedFile = file;
          return { data: {} };
        },
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
      },
    });
    const draft = readDraft(cwd, 1);
    expect(draft?.filename).toBe('a.mp4');
    expect(draft?.fileSha1).toMatch(/^[a-f0-9]{40}$/);
    expect(draft?.analyzedSha1).toBe(draft?.fileSha1);
    expect(readIdentity(cwd, identity.n)?.filePath).toBe('a.mp4');
    expect(uploadedFile).toBeInstanceOf(Blob);
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
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
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
        filesListInfo: async () => ({ data: {
          metaAnalyzeStatus: 2,
          metaInfoArray: [
            { insertMode: 2, key: 'still-here' },
            { insertMode: 2, key: 'returned' },
          ],
        } }),
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
