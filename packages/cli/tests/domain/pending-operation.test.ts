import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { recoverPendingOperation } from '../../src/domain/resource/recover';
import { submitVersion } from '../../src/domain/version/submit';
import { readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { createPendingVersionSubmit, readPendingOperation } from '../../src/local/pendingOperation';

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
      kind: 'version-submit', resourceId: 'res_pending', resourceN: 1, version: '1.0.0', fileSha1: 'sha-pending', env: 'test',
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
});
