import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as atomicWrite from '../../src/core/atomicWrite';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { recoverPendingOperation } from '../../src/domain/resource/recover';
import { submitVersion } from '../../src/domain/version/submit';
import { runCreateVersion } from '../../src/domain/version/createVersion';
import { runUpdateVersion } from '../../src/domain/version/updateVersion';
import { draftFilePath, readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity, identityFilePath, readIdentity } from '../../src/local/identity';
import { createPendingVersionSubmit, markPendingVersionSubmitSending, pendingOperationFilePath, readPendingOperation } from '../../src/local/pendingOperation';
import { transactionFilePath } from '../../src/local/transaction';
import { sseResult } from '../helpers/sse';

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('提交快照与恢复：只清本次未变稿（ARCH02 §2.1.1）', () => {
  let cwd: string;
  let homeDir: string;
  const info = async () => ({ data: { resourceId: 'res_snapshot', userId: 7 } });
  const remoteVersion = () => ({ data: { resourceId: 'res_snapshot', version: '1.1.0', fileSha1: 'sha-original' } });
  const file = () => draftFilePath(cwd, 1);
  const raw = () => readFileSync(file());
  const change = (patch: Record<string, unknown>) => writeFileSync(file(), JSON.stringify({ ...JSON.parse(raw().toString('utf8')), ...patch }));
  function arm() {
    const prepared = createPendingVersionSubmit({ cwd, resourceN: 1, resourceId: 'res_snapshot', env: 'test', version: '1.1.0',
      fileSha1: 'sha-original', draftSha256: digest(raw()) });
    markPendingVersionSubmitSending(cwd, prepared.sha256);
  }

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-draft-snapshot-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-draft-snapshot-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic-token' } }) });
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_snapshot', resourceName: 'alice/snapshot', name: 'snapshot',
      typeCode: 'VIDEO', filePath: 'video.mp4', env: 'test' });
    writeFileSync(path.join(cwd, 'video.mp4'), 'synthetic video');
    writeDraft(cwd, 1, { fromVersion: '1.0.0', fileSha1: 'sha-original', filename: 'video.mp4', analyzedSha1: 'sha-original', description: 'original' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });

  it('新marker与实际POST体绑定同一读盘稿，sending保留v3摘要', async () => {
    const before = raw(), identityBefore = readFileSync(identityFilePath(cwd, 1));
    let observedMarker: unknown;
    const createVersion = vi.fn(async (body: Record<string, unknown>) => {
      observedMarker = readPendingOperation(cwd);
      void body;
      throw new Error('synthetic unknown transport');
    });
    await expect(submitVersion({ cwd, identity: readIdentity(cwd, 1), version: '1.1.0', apis: { createVersion } }))
      .rejects.toMatchObject({ code: 'SUBMIT_RESULT_UNKNOWN' });
    expect(createVersion).toHaveBeenCalledOnce();
    expect(createVersion.mock.calls[0]![0]).toEqual({ resourceId: 'res_snapshot', version: '1.1.0', fileSha1: 'sha-original', filename: 'video.mp4',
      description: 'original', customPropertyDescriptors: [], dependencies: [], inputAttrs: [], baseUpcastResources: [], authExcludedItems: [] });
    expect(observedMarker).toMatchObject({ schemaVersion: 3, state: 'sending', draftSha256: digest(before) });
    expect(raw()).toEqual(before);
    expect(readFileSync(identityFilePath(cwd, 1))).toEqual(identityBefore);
  });

  it('异步类型校验期间稿改变：零POST、零新marker且保留新字节', async () => {
    writeDraft(cwd, 1, { ...readDraft(cwd, 1), customPropertyDescriptors: [{ key: 'mode', name: '模式', type: 'editableText', defaultValue: 'old' }] });
    const createVersion = vi.fn(async () => ({ data: {} }));
    let changed!: Buffer;
    await expect(submitVersion({ cwd, homeDir, identity: readIdentity(cwd, 1), version: '1.1.0', apis: {
      getByCode: async ({ code }) => { change({ description: 'changed while checking' }); changed = raw();
        return { data: { code, isTerminate: true, status: 1, subjectType: 1, supportOptionalConfig: 2, attrs: [] } }; },
      filesListInfoSse: sseResult({ metaAnalyzeStatus: 2, metaInfoArray: [] }), createVersion,
    } })).rejects.toMatchObject({ code: 'SUBMIT_DRAFT_CHANGED' });
    expect(createVersion).not.toHaveBeenCalled();
    expect(readPendingOperation(cwd)).toBeUndefined();
    expect(raw()).toEqual(changed);
  });

  it('POST成功但外部改了稿：清本次marker，保留稿并返回可提示的结果', async () => {
    let changed!: Buffer;
    const createVersion = vi.fn(async () => { change({ description: 'after send' }); changed = raw(); return { data: {} }; });
    await expect(submitVersion({ cwd, identity: readIdentity(cwd, 1), version: '1.1.0', apis: { createVersion } }))
      .resolves.toEqual({ draftRetained: true });
    expect(raw()).toEqual(changed);
    expect(readPendingOperation(cwd)).toBeUndefined();
    expect(createVersion).toHaveBeenCalledOnce();
  });

  const mutations = [
    ['文件SHA', () => change({ fileSha1: 'new-sha', analyzedSha1: 'new-sha' })],
    ['来源版本', () => change({ fromVersion: '0.9.0' })],
    ['说明', () => change({ description: 'local new work' })],
    ['属性', () => change({ inputAttrs: [{ key: 'width', value: '800' }] })],
    ['可选配置', () => change({ customPropertyDescriptors: [{ key: 'mode', name: '模式', type: 'editableText', defaultValue: 'new' }] })],
    ['依赖', () => change({ dependencies: [{ resourceId: 'new-dependency', versionRange: '^2.0.0' }] })],
    ['纯空白', () => writeFileSync(file(), Buffer.concat([raw(), Buffer.from('\n ')]))],
    ['无效JSON', () => writeFileSync(file(), '{')],
    ['错配资源', () => change({ resourceId: 'another-resource' })],
  ] as const;

  it.each(mutations)('恢复时%s已变化：远端成功仅清marker，整份稿原样保留', async (_label, mutate) => {
    arm(); mutate();
    const before = raw(), identityBefore = readFileSync(identityFilePath(cwd, 1));
    const version = vi.fn(async () => remoteVersion());
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, yes: true, apis: { info, resourceVersionInfo1: version } }))
      .resolves.toContain('工作稿已保留');
    expect(raw()).toEqual(before);
    expect(readPendingOperation(cwd)).toBeUndefined();
    expect(readFileSync(identityFilePath(cwd, 1))).toEqual(identityBefore);
    expect(version).toHaveBeenCalledExactlyOnceWith({ resourceId: 'res_snapshot', version: '1.1.0' });
  });

  it('查询进行中才改变的稿也必须保留，不能依据查询前摘要删除', async () => {
    arm(); let changed!: Buffer;
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, yes: true, apis: { info,
      resourceVersionInfo1: async () => { change({ description: 'changed during last await' }); changed = raw(); return remoteVersion(); },
    } })).resolves.toContain('工作稿已保留');
    expect(raw()).toEqual(changed);
    expect(readPendingOperation(cwd)).toBeUndefined();
  });

  it.each([1, 2])('旧v%s没有摘要不能推断稿未变：确认后只清marker', async (schemaVersion) => {
    arm();
    const { state: _state, draftSha256: _digest, ...original } = JSON.parse(readFileSync(pendingOperationFilePath(cwd), 'utf8'));
    writeFileSync(pendingOperationFilePath(cwd), JSON.stringify({ ...original, schemaVersion, ...(schemaVersion === 2 ? { state: 'sending' } : {}) }));
    const before = raw();
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, yes: true, apis: { info, resourceVersionInfo1: async () => remoteVersion() } }))
      .resolves.toContain('工作稿已保留');
    expect(raw()).toEqual(before);
    expect(readPendingOperation(cwd)).toBeUndefined();
  });

  it('只读的保留预览不改任何字节；未确认与缺yes仍全部保留', async () => {
    arm(); change({ description: 'later' });
    const before = raw(), marker = readFileSync(pendingOperationFilePath(cwd));
    await expect(recoverPendingOperation({ cwd, homeDir, apis: { info, resourceVersionInfo1: async () => remoteVersion() } }))
      .resolves.toContain('工作稿将保留');
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, apis: { info, resourceVersionInfo1: async () => remoteVersion() } }))
      .rejects.toMatchObject({ code: 'RECOVER_APPLY_NEED_YES' });
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, yes: true, apis: { info,
      resourceVersionInfo1: async () => ({ data: { ...remoteVersion().data, fileSha1: 'different' } }),
    } })).rejects.toMatchObject({ code: 'RECOVER_NOT_CONFIRMED' });
    expect(raw()).toEqual(before);
    expect(readFileSync(pendingOperationFilePath(cwd))).toEqual(marker);
  });

  it.each(['unchanged', 'absent'] as const)('v3正控%s：清完成marker且不额外创建稿', async (kind) => {
    arm(); if (kind === 'absent') rmSync(file());
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, yes: true, apis: { info, resourceVersionInfo1: async () => remoteVersion() } }))
      .resolves.toContain('已完成恢复');
    expect(existsSync(file())).toBe(false);
    expect(readPendingOperation(cwd)).toBeUndefined();
  });

  it('查询期间marker被另一份记录替换时，不能清理新记录或工作稿', async () => {
    arm(); const before = raw(); let changed!: string;
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, yes: true, apis: { info,
      resourceVersionInfo1: async () => { changed = JSON.stringify({ ...JSON.parse(readFileSync(pendingOperationFilePath(cwd), 'utf8')), version: '2.0.0' });
        writeFileSync(pendingOperationFilePath(cwd), changed); return remoteVersion(); },
    } })).rejects.toMatchObject({ code: 'LOCAL_TXN_CONFLICT' });
    expect(raw()).toEqual(before);
    expect(readFileSync(pendingOperationFilePath(cwd), 'utf8')).toBe(changed);
    expect(existsSync(transactionFilePath(cwd))).toBe(false);
  });

  it.each([
    ['initial', false], ['initial', true], ['update', false], ['update', true],
  ] as const)('%s发行编排：变稿=%s时明确提示，正常仍只返回版本号', async (kind, changed) => {
    if (kind === 'initial') writeDraft(cwd, 1, { fileSha1: 'sha-original', filename: 'video.mp4', analyzedSha1: 'sha-original' });
    let retained!: Buffer;
    const createVersion = vi.fn(async () => {
      if (changed) { writeFileSync(file(), Buffer.concat([raw(), Buffer.from('\n ')])); retained = raw(); }
      return { data: {} };
    });
    const apis = { info: async () => ({ data: { resourceId: 'res_snapshot', userId: 7,
      ...(kind === 'update' ? { latestVersion: '1.0.0' } : {}) } }), fileIsExist: async () => ({ data: { isExisting: true } }),
    filesListInfoSse: sseResult({ metaAnalyzeStatus: 2, metaInfoArray: [] }), createVersion };
    const result = kind === 'initial'
      ? await runCreateVersion({ cwd, homeDir, yes: true, apis })
      : await runUpdateVersion({ cwd, homeDir, yes: true, version: '1.1.0', apis });
    const version = kind === 'initial' ? '1.0.0' : '1.1.0';
    expect(createVersion).toHaveBeenCalledOnce();
    expect(readPendingOperation(cwd)).toBeUndefined();
    if (changed) {
      expect(result).toBe(`${version} 已提交；工作稿已变化并完整保留，请检查后准备下一版，勿重复提交此版本`);
      expect(raw()).toEqual(retained);
    } else {
      expect(result).toBe(version);
      expect(existsSync(file())).toBe(false);
    }
  });

  it.each([undefined, '', 'x'.repeat(64), 'A'.repeat(64), null, []])('v3稿摘要畸形值%s不能变成可信恢复记录', (draftSha256) => {
    arm();
    const marker = pendingOperationFilePath(cwd);
    writeFileSync(marker, JSON.stringify({ ...JSON.parse(readFileSync(marker, 'utf8')), draftSha256 }));
    const before = readFileSync(marker);
    expect(() => readPendingOperation(cwd)).toThrow(expect.objectContaining({ code: 'PENDING_OPERATION_INVALID' }));
    expect(readFileSync(marker)).toEqual(before);
  });

  it.each([
    ['prepared', 'other-operation'], ['prepared', 'other-draft'], ['prepared', 'legacy-prepared'],
    ['sending', 'other-operation'], ['sending', 'other-draft'], ['sending', 'legacy-prepared'],
  ] as const)('%s被替换成%s：零POST并保留替换记录和稿', async (phase, fault) => {
    const originalWrite = atomicWrite.atomicWriteFile;
    let replacement!: string;
    vi.spyOn(atomicWrite, 'atomicWriteFile').mockImplementation((target, content) => {
      originalWrite(target, content);
      if (target !== pendingOperationFilePath(cwd)) return;
      const record = JSON.parse(content);
      if (record.state !== phase) return;
      if (fault === 'other-operation') { record.operationId = '123e4567-e89b-12d3-a456-426614174000'; record.version = '2.0.0'; }
      if (fault === 'other-draft') record.draftSha256 = '0'.repeat(64);
      if (fault === 'legacy-prepared') { record.schemaVersion = 2; delete record.draftSha256; }
      replacement = `${JSON.stringify(record)}\n`;
      writeFileSync(target, replacement);
    });
    const before = raw(), createVersion = vi.fn(async () => ({ data: {} }));
    await expect(submitVersion({ cwd, identity: readIdentity(cwd, 1), version: '1.1.0', apis: { createVersion } }))
      .rejects.toMatchObject({ code: 'LOCAL_TXN_CONFLICT' });
    expect(createVersion).not.toHaveBeenCalled();
    expect(raw()).toEqual(before);
    expect(readFileSync(pendingOperationFilePath(cwd), 'utf8')).toBe(replacement);
    expect(existsSync(transactionFilePath(cwd))).toBe(false);
  });

  it.each(['resource-id', 'type', 'env'] as const)('选中后本地身份及稿发生自洽%s变化：零POST、零marker保留新状态', async (fault) => {
    const selected = readIdentity(cwd, 1);
    const identityFile = identityFilePath(cwd, 1), record = JSON.parse(readFileSync(identityFile, 'utf8'));
    const patch = fault === 'resource-id' ? { resourceId: 'res_other', resourceName: 'alice/other', name: 'other' }
      : fault === 'type' ? { typeCode: 'RT005001' } : { env: 'dev' };
    writeFileSync(identityFile, JSON.stringify({ ...record, ...patch }));
    change({ resourceId: fault === 'resource-id' ? 'res_other' : 'res_snapshot', resourceTypeCode: fault === 'type' ? 'RT005001' : 'VIDEO' });
    const before = raw(), identityBefore = readFileSync(identityFile), createVersion = vi.fn(async () => ({ data: {} }));
    await expect(submitVersion({ cwd, identity: selected, version: '1.1.0', apis: { createVersion } }))
      .rejects.toMatchObject({ code: 'DRAFT_IDENTITY_MISMATCH' });
    expect(createVersion).not.toHaveBeenCalled();
    expect(raw()).toEqual(before);
    expect(readFileSync(identityFile)).toEqual(identityBefore);
    expect(readPendingOperation(cwd)).toBeUndefined();
  });

  it('异步校验期间只改身份环境、不改稿摘要，也不能发送旧身份payload', async () => {
    writeDraft(cwd, 1, { ...readDraft(cwd, 1), customPropertyDescriptors: [{ key: 'mode', name: '模式', type: 'editableText', defaultValue: 'old' }] });
    const selected = readIdentity(cwd, 1), before = raw(), createVersion = vi.fn(async () => ({ data: {} }));
    let identityAfter!: string;
    await expect(submitVersion({ cwd, homeDir, identity: selected, version: '1.1.0', apis: {
      getByCode: async ({ code }) => { identityAfter = JSON.stringify({ ...JSON.parse(readFileSync(identityFilePath(cwd, 1), 'utf8')), env: 'dev' });
        writeFileSync(identityFilePath(cwd, 1), identityAfter);
        return { data: { code, isTerminate: true, status: 1, subjectType: 1, supportOptionalConfig: 2, attrs: [] } }; },
      filesListInfoSse: sseResult({ metaAnalyzeStatus: 2, metaInfoArray: [] }), createVersion,
    } })).rejects.toMatchObject({ code: 'DRAFT_IDENTITY_MISMATCH' });
    expect(createVersion).not.toHaveBeenCalled();
    expect(readPendingOperation(cwd)).toBeUndefined();
    expect(raw()).toEqual(before);
    expect(readFileSync(identityFilePath(cwd, 1), 'utf8')).toBe(identityAfter);
  });

  it('POST期间身份与稿同时被换成B：不清B稿及未决记录、不重发', async () => {
    let identityAfter!: string, draftAfter!: Buffer;
    const createVersion = vi.fn(async () => {
      identityAfter = JSON.stringify({ ...JSON.parse(readFileSync(identityFilePath(cwd, 1), 'utf8')), resourceId: 'res_other' });
      writeFileSync(identityFilePath(cwd, 1), identityAfter);
      change({ resourceId: 'res_other', description: 'new resource work' }); draftAfter = raw();
      return { data: {} };
    });
    await expect(submitVersion({ cwd, identity: readIdentity(cwd, 1), version: '1.1.0', apis: { createVersion } }))
      .rejects.toMatchObject({ code: 'DRAFT_IDENTITY_MISMATCH' });
    expect(createVersion).toHaveBeenCalledOnce();
    expect(readPendingOperation(cwd)).toMatchObject({ schemaVersion: 3, resourceId: 'res_snapshot', state: 'sending' });
    expect(raw()).toEqual(draftAfter);
    expect(readFileSync(identityFilePath(cwd, 1), 'utf8')).toBe(identityAfter);
  });

  it('recover查询期间仅换N身份而稿字节未变：仍不得清理稿或marker', async () => {
    arm(); const before = raw(), markerBefore = readFileSync(pendingOperationFilePath(cwd));
    let identityAfter!: string;
    await expect(recoverPendingOperation({ cwd, homeDir, apply: true, yes: true, apis: { info,
      resourceVersionInfo1: async () => { identityAfter = JSON.stringify({ ...JSON.parse(readFileSync(identityFilePath(cwd, 1), 'utf8')), resourceId: 'res_other' });
        writeFileSync(identityFilePath(cwd, 1), identityAfter); return remoteVersion(); },
    } })).rejects.toMatchObject({ code: 'PENDING_OPERATION_LOCAL_MISMATCH' });
    expect(raw()).toEqual(before);
    expect(readFileSync(pendingOperationFilePath(cwd))).toEqual(markerBefore);
    expect(readFileSync(identityFilePath(cwd, 1), 'utf8')).toBe(identityAfter);
  });
});
