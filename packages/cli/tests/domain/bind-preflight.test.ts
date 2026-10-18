import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from '../../src/bin/program';
import { loginAccount } from '../../src/domain/account/login';
import { bindResource } from '../../src/domain/bind/bind';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { writeDraft } from '../../src/local/draft';
import { createIdentity, identityFilePath, prepareIdentityUpdate, readIdentity, serializeIdentity, updateIdentity } from '../../src/local/identity';
import { acquireProjectLock, lockFilePath, withProjectLock } from '../../src/local/lock';
import { pendingOperationFilePath } from '../../src/local/pendingOperation';
import { transactionFilePath } from '../../src/local/transaction';
import { FServiceAPI } from '../../src/platform/api';

vi.mock('../../src/platform/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: { ...actual.FServiceAPI, Resource: { ...actual.FServiceAPI.Resource, info: vi.fn() } } };
});

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name);
      if (statSync(file).isDirectory()) walk(file);
      else files[path.relative(root, file)] = readFileSync(file).toString('base64');
    }
  };
  walk(root);
  return files;
}

describe('bind：全量状态/选择器在GET前校验且锁覆盖异步查询（ARCH04/08）', () => {
  let cwd: string;
  let homeDir: string;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-bind-preflight-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-bind-preflight-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic-token' } }) });
    for (const file of ['first.mp4', 'new.mp4', 'second.mp4']) writeFileSync(path.join(cwd, file), file);
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_first', resourceName: 'alice/first', name: 'first', title: '本地标题', typeCode: 'VIDEO', filePath: 'first.mp4', env: 'test' });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    resetEnvForTests();
  });
  const response = (resourceId = 'res_remote', name = 'remote') => ({ data: {
    resourceId, resourceName: `alice/${name}`, resourceTitle: '线上标题', resourceTypeCode: 'VIDEO', subjectType: 1, userId: 7,
  } });
  function rewriteIdentity(n: number, patch: Record<string, unknown>) {
    const original = JSON.parse(readFileSync(identityFilePath(cwd, 1), 'utf8'));
    writeFileSync(identityFilePath(cwd, n), `${JSON.stringify({ ...original, ...patch })}\n`);
  }
  const corruptions = [
    ['坏身份JSON', 'IDENTITY_INVALID', () => writeFileSync(identityFilePath(cwd, 2), '{')],
    ['重复资源ID', 'IDENTITY_CONFLICT', () => rewriteIdentity(2, { resourceName: 'alice/other', name: 'other', filePath: 'second.mp4' })],
    ['重复完整标识', 'IDENTITY_CONFLICT', () => rewriteIdentity(2, { resourceId: 'res_other', filePath: 'second.mp4' })],
    ['重复产物路径', 'IDENTITY_CONFLICT', () => rewriteIdentity(2, { resourceId: 'res_other', resourceName: 'alice/other', name: 'other' })],
    ['孤儿稿', 'DRAFT_ORPHAN', () => writeFileSync(path.join(cwd, '.freelog/2.version.json'), '{}')],
    ['错配稿', 'DRAFT_IDENTITY_MISMATCH', () => {
      writeDraft(cwd, 1, { fileSha1: 'synthetic-sha', filename: 'first.mp4' });
      const file = path.join(cwd, '.freelog/1.version.json');
      writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), resourceId: 'res_wrong' }));
    }],
  ] as const;

  it.each(corruptions)('%s必须零GET并保留全部原始文件', async (_label, code, corrupt) => {
    corrupt();
    const before = snapshot(cwd);
    const info = vi.fn(async () => response());
    await expect(bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } })).rejects.toMatchObject({ code });
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each(['file:99.json', 'id:missing', 'name:alice/missing'])('错误显式选择器%s必须零GET', async (selector) => {
    const before = snapshot(cwd);
    const info = vi.fn(async () => response());
    await expect(bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', selector, apis: { info } })).rejects.toMatchObject({ code: 'IDENTITY_RESOURCE_NOT_FOUND' });
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it('另一个存活锁占用时在GET前停止且不改它', async () => {
    const lock = acquireProjectLock(cwd, 'synthetic-independent-writer');
    try {
      const before = snapshot(cwd);
      const info = vi.fn(async () => response());
      await expect(bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } })).rejects.toMatchObject({ code: 'PROJECT_LOCKED' });
      expect(info).not.toHaveBeenCalled();
      expect(snapshot(cwd)).toEqual(before);
    } finally { lock.release(); }
  });

  it.each(['prepared', 'sending'])('领域入口的%s未决记录也在GET前拒绝', async (state) => {
    writeFileSync(pendingOperationFilePath(cwd), JSON.stringify({ schemaVersion: 2, operationId: '123e4567-e89b-12d3-a456-426614174000',
      kind: 'version-submit', resourceN: 1, resourceId: 'res_first', env: 'test', version: '1.0.0', fileSha1: 'synthetic-sha', createdAt: new Date().toISOString(), state }));
    const before = snapshot(cwd);
    const info = vi.fn(async () => response());
    await expect(bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } })).rejects.toMatchObject({ code: 'PENDING_OPERATION_EXISTS' });
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each(['prepared', 'sending'])('实际CLI的%s门禁不退化为领域绑定或平台查询', async (state) => {
    writeFileSync(pendingOperationFilePath(cwd), JSON.stringify({ schemaVersion: 2, operationId: '123e4567-e89b-12d3-a456-426614174000',
      kind: 'version-submit', resourceN: 1, resourceId: 'res_first', env: 'test', version: '1.0.0', fileSha1: 'synthetic-sha', createdAt: new Date().toISOString(), state }));
    const before = snapshot(cwd), out: string[] = [], err: string[] = [];
    const info = vi.mocked(FServiceAPI.Resource.info).mockResolvedValue(response() as never);
    expect(await runCli(['bind', 'res_remote', '--artifact', 'new.mp4', '--cwd', cwd, '--env', 'test', '--yes', '--json'], {
      writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); },
    })).toBe(1);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!)).toEqual({ code: 'PENDING_OPERATION_EXISTS', message: `存在未完成收尾的版本提交（res_first 1.0.0，${state}）；请先 resource recover` });
    expect(err).toEqual([]);
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it('可恢复事务先前滚，GET观察到恢复后的状态且已持锁', async () => {
    const file = identityFilePath(cwd, 1), before = readFileSync(file, 'utf8');
    const after = serializeIdentity(prepareIdentityUpdate(cwd, 1, { title: '已前滚' }));
    writeFileSync(transactionFilePath(cwd), JSON.stringify({ schemaVersion: 1, entries: [{ path: '1.json', before, beforeSha256: digest(before), after, afterSha256: digest(after) }] }));
    let heldDuringGet = false;
    const info = vi.fn(async () => { heldDuringGet = existsSync(lockFilePath(cwd)); expect(readIdentity(cwd, 1).title).toBe('已前滚'); return response(); });
    const result = await bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } });
    expect(heldDuringGet).toBe(true);
    expect(result).toMatchObject({ n: 2, resourceId: 'res_remote' });
    expect(existsSync(transactionFilePath(cwd))).toBe(false);
    expect(existsSync(lockFilePath(cwd))).toBe(false);
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'res_remote', isLoadLatestVersionInfo: 1 });
  });

  it('冲突事务零GET并保留原文件和日志', async () => {
    const before = 'not the current identity';
    writeFileSync(transactionFilePath(cwd), JSON.stringify({ schemaVersion: 1, entries: [{ path: '1.json', before, beforeSha256: digest(before), after: null, afterSha256: null }] }));
    const baseline = snapshot(cwd);
    const info = vi.fn(async () => response());
    await expect(bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } })).rejects.toMatchObject({ code: 'LOCAL_TXN_CONFLICT' });
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(baseline);
  });

  it('GET挂起时阻止独立调用链的另一bind和身份写入', async () => {
    let release!: () => void, entered!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let heldDuringGet = false;
    const info = vi.fn(async () => { heldDuringGet = existsSync(lockFilePath(cwd)); entered(); await wait; return response(); });
    const first = bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } });
    await started;
    const otherInfo = vi.fn(async () => response('res_second', 'second'));
    let bindError: unknown, writeError: unknown;
    try {
      try { await bindResource({ cwd, homeDir, target: 'res_second', file: 'second.mp4', apis: { info: otherInfo } }); } catch (error) { bindError = error; }
      try { updateIdentity(cwd, 1, { title: '不能并发改' }); } catch (error) { writeError = error; }
    } finally { release(); }
    const firstResult = await first;
    expect(heldDuringGet).toBe(true);
    expect(bindError).toMatchObject({ code: 'PROJECT_LOCKED' });
    expect(writeError).toMatchObject({ code: 'PROJECT_LOCKED' });
    expect(otherInfo).not.toHaveBeenCalled();
    expect(firstResult.n).toBe(2);
    expect(readIdentity(cwd, 1).title).toBe('本地标题');
    expect(existsSync(lockFilePath(cwd))).toBe(false);
  });

  it('同一锁调用链可重入，GET失败后释放锁且不新增状态', async () => {
    const before = snapshot(cwd);
    let heldDuringGet = false;
    const info = vi.fn(async () => { heldDuringGet = existsSync(lockFilePath(cwd)); throw new Error('synthetic SDK failure'); });
    await expect(withProjectLock(cwd, () => bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } }), 'synthetic-parent')).rejects.toThrow('synthetic SDK failure');
    expect(heldDuringGet).toBe(true);
    expect(info).toHaveBeenCalledOnce();
    expect(snapshot(cwd)).toEqual(before);
    const lock = acquireProjectLock(cwd, 'after-failure');
    lock.release();
  });

  it('保留GET后的全量复验：外部新增坏状态时不绑定或覆盖它', async () => {
    let changed!: Record<string, string>;
    const info = vi.fn(async () => { writeFileSync(identityFilePath(cwd, 3), '{'); changed = snapshot(cwd); delete changed[path.relative(cwd, lockFilePath(cwd))]; return response(); });
    await expect(bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } })).rejects.toMatchObject({ code: 'IDENTITY_INVALID' });
    expect(info).toHaveBeenCalledOnce();
    expect(snapshot(cwd)).toEqual(changed);
    expect(existsSync(identityFilePath(cwd, 2))).toBe(false);
  });

  it('多份未绑定状态不阻止显式新产物新增一份身份', async () => {
    writeFileSync(path.join(cwd, 'third.mp4'), 'third');
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'second.mp4' });
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'third.mp4' });
    const oldStates = [1, 2, 3].map((n) => readFileSync(identityFilePath(cwd, n), 'utf8'));
    const info = vi.fn(async () => response());
    const result = await bindResource({ cwd, homeDir, target: 'res_remote', file: 'new.mp4', apis: { info } });
    expect(result).toMatchObject({ n: 4, resourceId: 'res_remote', filePath: 'new.mp4' });
    expect([1, 2, 3].map((n) => readFileSync(identityFilePath(cwd, n), 'utf8'))).toEqual(oldStates);
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'res_remote', isLoadLatestVersionInfo: 1 });
  });

  it.each(['same-path', 'ambiguous', 'same-id'] as const)('多份未绑定路由正控：%s', async (route) => {
    writeFileSync(path.join(cwd, 'third.mp4'), 'third');
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'second.mp4' });
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'third.mp4' });
    const before = snapshot(cwd);
    const info = vi.fn(async () => route === 'same-id' ? response('res_first', 'first') : response());
    const operation = bindResource({ cwd, homeDir, target: route === 'same-id' ? 'res_first' : 'res_remote',
      ...(route === 'same-path' ? { file: 'second.mp4' } : {}), apis: { info } });
    if (route === 'ambiguous') {
      await expect(operation).rejects.toMatchObject({ code: 'IDENTITY_RESOURCE_REQUIRED' });
      expect(snapshot(cwd)).toEqual(before);
    } else {
      expect(await operation).toMatchObject({ n: route === 'same-id' ? 1 : 2, resourceId: route === 'same-id' ? 'res_first' : 'res_remote' });
      expect(existsSync(identityFilePath(cwd, 4))).toBe(false);
    }
    expect(info).toHaveBeenCalledOnce();
  });

  it('同ID同类型重复bind保留工作稿原始字节', async () => {
    writeDraft(cwd, 1, { fromVersion: '1.0.0', fileSha1: 'synthetic-sha', filename: 'first.mp4', description: '未提交内容' });
    const draft = path.join(cwd, '.freelog/1.version.json'), before = readFileSync(draft, 'utf8');
    expect(JSON.parse(before).description).toBe('未提交内容');
    const result = await bindResource({ cwd, homeDir, target: 'res_first', apis: { info: async () => response('res_first', 'first') } });
    expect(result).toMatchObject({ n: 1, resourceId: 'res_first', title: '线上标题' });
    expect(readFileSync(draft, 'utf8')).toBe(before);
    expect(existsSync(identityFilePath(cwd, 2))).toBe(false);
  });

  it('同ID工作稿与线上类型不一致须保留整组状态，force也不绕过', async () => {
    writeDraft(cwd, 1, { fromVersion: '1.0.0', fileSha1: 'synthetic-sha', filename: 'first.mp4', description: '不能删除' });
    expect(JSON.parse(readFileSync(path.join(cwd, '.freelog/1.version.json'), 'utf8')).description).toBe('不能删除');
    const before = snapshot(cwd);
    const info = vi.fn(async () => ({ data: { ...response('res_first', 'first').data, resourceTypeCode: 'RT005001' } }));
    await expect(bindResource({ cwd, homeDir, target: 'res_first', force: true, yes: true, apis: { info } }))
      .rejects.toMatchObject({ code: 'DRAFT_IDENTITY_MISMATCH' });
    expect(info).toHaveBeenCalledOnce();
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each([[false, false], [true, false], [false, true]])('换ID必须同时force=%s/yes=%s的拒绝正控', async (force, yes) => {
    writeDraft(cwd, 1, { fromVersion: '1.0.0', fileSha1: 'synthetic-sha', filename: 'first.mp4', description: '保留' });
    const before = snapshot(cwd);
    await expect(bindResource({ cwd, homeDir, target: 'res_remote', selector: 'file:1.json', force, yes,
      apis: { info: async () => response() } })).rejects.toMatchObject({ code: 'BIND_FORCE_REQUIRED' });
    expect(snapshot(cwd)).toEqual(before);
  });

  it('换ID的force+yes仍在同一目标上成功并删除其旧稿', async () => {
    writeDraft(cwd, 1, { fromVersion: '1.0.0', fileSha1: 'synthetic-sha', filename: 'first.mp4', description: '旧资源内容' });
    createIdentity(cwd, { subject: 'resource', typeCode: 'VIDEO', filePath: 'second.mp4' });
    const other = readFileSync(identityFilePath(cwd, 2), 'utf8');
    const result = await bindResource({ cwd, homeDir, target: 'res_remote', selector: 'file:1.json', force: true, yes: true,
      apis: { info: async () => response() } });
    expect(result).toMatchObject({ n: 1, resourceId: 'res_remote', filePath: 'first.mp4' });
    expect(existsSync(path.join(cwd, '.freelog/1.version.json'))).toBe(false);
    expect(readFileSync(identityFilePath(cwd, 2), 'utf8')).toBe(other);
    expect(existsSync(transactionFilePath(cwd))).toBe(false);
  });

  it('领域入口的显式空selector不是未给：零GET且原字节不变', async () => {
    const before = snapshot(cwd), info = vi.fn(async () => response());
    await expect(bindResource({ cwd, homeDir, target: 'res_remote', selector: '', file: 'new.mp4', apis: { info } }))
      .rejects.toMatchObject({ code: 'IDENTITY_RESOURCE_NOT_FOUND' });
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it('真实CLI保留空参数的语义，不在bind忽略它新增身份', async () => {
    const before = snapshot(cwd), out: string[] = [], err: string[] = [];
    const info = vi.mocked(FServiceAPI.Resource.info).mockResolvedValue(response() as never);
    expect(await runCli(['bind', 'res_remote', '--resource', '', '--artifact', 'new.mp4', '--cwd', cwd, '--env', 'test', '--yes', '--json'], {
      writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); },
    })).toBe(1);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!)).toEqual({ code: 'IDENTITY_RESOURCE_NOT_FOUND', message: '找不到资源选择器 ' });
    expect(err).toEqual([]);
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each(['missing', 'directory'] as const)('已显式选择且将复用的%s锚点在GET前拒绝', async (kind) => {
    rmSync(path.join(cwd, 'first.mp4'));
    if (kind === 'directory') mkdirSync(path.join(cwd, 'first.mp4'));
    const before = snapshot(cwd), info = vi.fn(async () => response('res_first', 'first'));
    await expect(bindResource({ cwd, homeDir, target: 'res_first', selector: 'file:1.json', apis: { info } }))
      .rejects.toMatchObject({ code: kind === 'missing' ? 'ARTIFACT_ANCHOR_MISSING' : 'FILE_DIRECTORY_UNSUPPORTED' });
    expect(info).not.toHaveBeenCalled();
    expect(snapshot(cwd)).toEqual(before);
  });

  it.each(['replace-selected', 'new-independent'] as const)('旧锚点缺失仍允许使用有效新产物：%s', async (route) => {
    rmSync(path.join(cwd, 'first.mp4'));
    const first = readFileSync(identityFilePath(cwd, 1), 'utf8');
    const same = route === 'replace-selected';
    const info = vi.fn(async () => same ? response('res_first', 'first') : response());
    const result = await bindResource({ cwd, homeDir, target: same ? 'res_first' : 'res_remote',
      ...(same ? { selector: 'file:1.json' } : {}), file: 'new.mp4', apis: { info } });
    expect(result).toMatchObject({ n: same ? 1 : 2, filePath: 'new.mp4' });
    expect(info).toHaveBeenCalledOnce();
    if (!same) expect(readFileSync(identityFilePath(cwd, 1), 'utf8')).toBe(first);
  });
});
