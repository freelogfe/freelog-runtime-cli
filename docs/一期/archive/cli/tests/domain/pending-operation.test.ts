import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { recoverPendingOperation } from '../../src/domain/resource/recover';
import { submitVersion } from '../../src/domain/version/submit';
import { readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { createPendingVersionSubmit, markPendingVersionSubmitSending, pendingOperationFilePath, readPendingOperation } from '../../src/local/pendingOperation';

describe('结果未知的版本提交恢复', () => {
  let cwd: string;
  let homeDir: string;
  const ownInfo = async () => ({ data: { resourceId: 'res_pending', userId: 1, status: 2 } });

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-pending-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-pending-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd, homeDir, loginName: 'alice', password: 'pw',
      loginApi: async () => ({ data: { userId: 1, username: 'alice', token: 'token' } }),
    });
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_pending', resourceName: 'alice/pending', name: 'pending',
      typeCode: 'VIDEO', filePath: 'video.mp4', env: 'test',
    });
    writeDraft(cwd, 1, {
      fileSha1: 'sha-pending', filename: 'video.mp4', analyzedSha1: 'sha-pending',
      baseUpcastResources: [], authExcludedItems: [],
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('网络结果未知时保留稿和最小记录；核验 SHA 后才允许清理', async () => {
    await expect(submitVersion({
      cwd,
      identity: readIdentity(cwd, 1),
      version: '1.0.0',
      apis: { createVersion: async () => { throw new Error('socket closed'); } },
    })).rejects.toMatchObject({ code: 'SUBMIT_RESULT_UNKNOWN' });

    expect(readDraft(cwd, 1)?.fileSha1).toBe('sha-pending');
    expect(readPendingOperation(cwd)).toMatchObject({
      kind: 'version-submit', resourceId: 'res_pending', resourceN: 1, version: '1.0.0', fileSha1: 'sha-pending', env: 'test', state: 'sending',
    });

    await expect(recoverPendingOperation({
      cwd, homeDir,
      apis: { info: ownInfo, resourceVersionInfo1: async () => ({ data: { fileSha1: 'sha-pending' } }) },
    })).resolves.toContain('已确认');
    expect(readDraft(cwd, 1)).toBeDefined();
    expect(readPendingOperation(cwd)).toBeDefined();

    await expect(recoverPendingOperation({
      cwd, homeDir, apply: true,
      apis: { info: ownInfo, resourceVersionInfo1: async () => ({ data: { fileSha1: 'sha-pending' } }) },
    })).rejects.toMatchObject({ code: 'RECOVER_APPLY_NEED_YES' });
    await expect(recoverPendingOperation({
      cwd, homeDir, apply: true, yes: true,
      apis: { info: ownInfo, resourceVersionInfo1: async () => ({ data: { fileSha1: 'sha-pending' } }) },
    })).resolves.toContain('已完成恢复');
    expect(readDraft(cwd, 1)).toBeUndefined();
    expect(readPendingOperation(cwd)).toBeUndefined();
  });

  it('同版本但不同 SHA 不会被误判成功', async () => {
    createPendingVersionSubmit({
      cwd, resourceN: 1, resourceId: 'res_pending', env: 'test', version: '1.0.0', fileSha1: 'sha-pending',
    });
    markPendingVersionSubmitSending(cwd);
    await expect(recoverPendingOperation({
      cwd, homeDir, apply: true, yes: true,
      apis: { info: ownInfo, resourceVersionInfo1: async () => ({ data: { fileSha1: 'other-sha' } }) },
    })).rejects.toMatchObject({ code: 'RECOVER_NOT_CONFIRMED' });
    expect(readDraft(cwd, 1)?.fileSha1).toBe('sha-pending');
    expect(readPendingOperation(cwd)).toBeDefined();
  });

  it('不同 owner 不能核验或清理另一个账号留下的未决工作稿', async () => {
    createPendingVersionSubmit({
      cwd, resourceN: 1, resourceId: 'res_pending', env: 'test', version: '1.0.0', fileSha1: 'sha-pending',
    });
    markPendingVersionSubmitSending(cwd);
    let versionQueried = false;
    await expect(recoverPendingOperation({
      cwd, homeDir, apply: true, yes: true,
      apis: {
        info: async () => ({ data: { resourceId: 'res_pending', userId: 2, status: 4 } }),
        resourceVersionInfo1: async () => {
          versionQueried = true;
          return { data: { fileSha1: 'sha-pending' } };
        },
      },
    })).rejects.toMatchObject({ code: 'RECOVER_NOT_OWNER' });
    expect(versionQueried).toBe(false);
    expect(readDraft(cwd, 1)).toBeDefined();
    expect(readPendingOperation(cwd)).toBeDefined();
  });

  it('明确字段拒绝只撤销未决记录，保留工作稿供修正', async () => {
    await expect(submitVersion({
      cwd,
      identity: readIdentity(cwd, 1),
      version: '1.0.0',
      apis: { createVersion: async () => { throw { field: 'filename' }; } },
    })).rejects.toMatchObject({ code: 'SUBMIT_FAILED', message: '提交失败：filename' });
    expect(readDraft(cwd, 1)?.fileSha1).toBe('sha-pending');
    expect(readPendingOperation(cwd)).toBeUndefined();
  });

  it('prepared 只需显式本地收尾，保留工作稿且不查询平台', async () => {
    createPendingVersionSubmit({
      cwd, resourceN: 1, resourceId: 'res_pending', env: 'test', version: '1.0.0', fileSha1: 'sha-pending',
    });
    let queried = false;
    await expect(recoverPendingOperation({
      cwd,
      apis: {
        info: async () => { queried = true; return { data: {} }; },
        resourceVersionInfo1: async () => { queried = true; return { data: {} }; },
      },
    })).resolves.toContain('尚未发送');
    expect(queried).toBe(false);
    await expect(recoverPendingOperation({ cwd, apply: true, yes: true })).resolves.toContain('工作稿已保留');
    expect(readPendingOperation(cwd)).toBeUndefined();
    expect(readDraft(cwd, 1)?.fileSha1).toBe('sha-pending');
  });

  it('旧 schemaVersion=1 必须按 sending 保守核验', async () => {
    writeFileSync(pendingOperationFilePath(cwd), `${JSON.stringify({
      schemaVersion: 1,
      operationId: '123e4567-e89b-12d3-a456-426614174000',
      kind: 'version-submit', resourceN: 1, resourceId: 'res_pending', env: 'test',
      version: '1.0.0', fileSha1: 'sha-pending', createdAt: new Date().toISOString(),
    })}\n`);
    expect(readPendingOperation(cwd)).toMatchObject({ schemaVersion: 1, state: 'sending' });
    await expect(recoverPendingOperation({
      cwd, homeDir,
      apis: { info: ownInfo, resourceVersionInfo1: async () => ({ data: { fileSha1: 'sha-pending' } }) },
    })).resolves.toContain('已确认');
  });

  it('提交前会拒绝当前类型不支持的遗留可选配置，零 POST、零 marker', async () => {
    writeDraft(cwd, 1, {
      fileSha1: 'sha-pending', filename: 'video.mp4', analyzedSha1: 'sha-pending',
      customPropertyDescriptors: [{ key: 'theme', name: '主题', type: 'editableText', defaultValue: 'dark' }],
      baseUpcastResources: [], authExcludedItems: [],
    });
    let posted = false;
    await expect(submitVersion({
      cwd, homeDir, identity: readIdentity(cwd, 1), version: '1.0.0',
      apis: {
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1, subjectType: 1, supportOptionalConfig: 1 } }),
        createVersion: async () => { posted = true; return { data: {} }; },
      },
    })).rejects.toMatchObject({ code: 'OPTION_UNSUPPORTED' });
    expect(posted).toBe(false);
    expect(readPendingOperation(cwd)).toBeUndefined();
  });

  it('当前类型支持时会保留可选配置并正常提交', async () => {
    writeDraft(cwd, 1, {
      fileSha1: 'sha-pending', filename: 'video.mp4', analyzedSha1: 'sha-pending',
      customPropertyDescriptors: [{ key: 'theme', name: '主题', type: 'editableText', defaultValue: 'dark' }],
      baseUpcastResources: [], authExcludedItems: [],
    });
    let payload: Record<string, unknown> | undefined;
    await submitVersion({
      cwd, homeDir, identity: readIdentity(cwd, 1), version: '1.0.0',
      apis: {
        getByCode: async ({ code }) => ({ data: { code, isTerminate: true, status: 1, subjectType: 1, supportOptionalConfig: 2 } }),
        createVersion: async (body) => { payload = body; return { data: {} }; },
      },
    });
    expect(payload?.customPropertyDescriptors).toEqual([
      { key: 'theme', name: '主题', type: 'editableText', defaultValue: 'dark' },
    ]);
    expect(readDraft(cwd, 1)).toBeUndefined();
    expect(readPendingOperation(cwd)).toBeUndefined();
  });
});
