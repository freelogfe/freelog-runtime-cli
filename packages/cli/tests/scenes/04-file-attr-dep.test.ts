import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { attrAdd } from '../../src/domain/version/form/attr';
import { depAdd } from '../../src/domain/version/form/dep';
import { parseLine } from '../../src/domain/version/form/parseLine';
import { createIdentity } from '../../src/local/identity';
import { readDraft } from '../../src/local/draft';

describe('S26–S35 文件属性依赖', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-s4-'));
    applyCliEnv({ flag: 'test' });
    createIdentity(cwd, { subject: 'resource', name: 'clip', typeCode: 'VIDEO' });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('S26 一行式加属性；依赖只看 isAuth', async () => {
    expect(parseLine('名称=宽 键=width 值=1').key).toBe('width');
    await attrAdd(cwd, { line: '名称=宽 键=width 值=1', yes: true });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]?.key).toBe('width');

    await depAdd({
      cwd,
      resourceId: 'dep1',
      versionRange: '^1.0.0',
      apis: {
        info: async () => ({
          data: {
            resourceId: 'dep1',
            latestVersion: '1.0.0',
            status: 1,
            subjectType: 1,
            baseUpcastResources: [],
          },
        }),
        getVersionListByResourceID: async () => ({
          data: { dataList: [{ version: '1.0.0' }] },
        }),
        batchAuth: async () => ({ data: { isAuth: true } }),
      },
    });
    expect(readDraft(cwd, 1)?.dependencies?.[0]?.resourceId).toBe('dep1');
  });

  it('S27 --yes 且本地不在须 --file；S35 超时文案', async () => {
    const { confirmLocalPath } = await import('../../src/domain/version/file');
    const { waitAnalyze } = await import('../../src/domain/version/file');
    const identity = { n: 1, subject: 'resource' as const, name: 'clip', typeCode: 'VIDEO', filePath: 'gone.mp4' };
    expect(() => confirmLocalPath(identity, undefined, true, cwd)).toThrow(/请 --file/);

    let calls = 0;
    await expect(
      waitAnalyze(
        'sha',
        'VIDEO',
        {
          filesListInfo: async () => {
            calls += 1;
            return { data: { metaAnalyzeStatus: 1 } };
          },
        },
        () => (calls > 1 ? 200_000 : 0),
        async () => {},
      ),
    ).rejects.toMatchObject({ message: '属性解析超时' });
  });
});
