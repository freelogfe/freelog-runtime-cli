import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { uploadAndAnalyze, waitAnalyze } from '../../src/domain/version/file';
import { createIdentity } from '../../src/local/identity';
import { readDraft } from '../../src/local/draft';

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
      name: 'clip',
      typeCode: 'VIDEO',
      filePath: 'a.mp4',
    });
    writeFileSync(path.join(cwd, 'a.mp4'), 'video-bytes');
    await uploadAndAnalyze({
      cwd,
      identity,
      yes: true,
      apis: {
        fileIsExist: async () => ({ data: { isExisting: false } }),
        uploadFile: async () => ({ data: {} }),
        filesListInfo: async () => ({ data: { metaAnalyzeStatus: 2 } }),
      },
    });
    const draft = readDraft(cwd, 1);
    expect(draft?.filename).toBe('a.mp4');
    expect(draft?.fileSha1).toMatch(/^[a-f0-9]{40}$/);
  });
});
