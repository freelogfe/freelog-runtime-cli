import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionUpdateCommand } from '../../src/commands/collection/update';
import * as listing from '../../src/domain/collection/listing';
import * as tty from '../../src/core/tty';
import { createProgram, runCli } from '../../src/bin/program';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { createCollectionIdentity } from '../../src/local/identity';
import { FServiceAPI } from '../../src/platform/api';

// SDK导出为只读命名空间；只替换请求端口，根入口/鉴权/事务/标签编辑仍跑真实实现。
vi.mock('../../src/platform/api', async (original) => {
  const actual = await original<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: { ...actual.FServiceAPI,
    Resource: { ...actual.FServiceAPI.Resource, info: vi.fn(), availableTags: vi.fn(), update: vi.fn() },
    Storage: { ...actual.FServiceAPI.Storage, uploadImage: vi.fn() },
  } };
});

describe('合集标签编辑命令入口', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('将独立标签编辑与JSON/确认选项传给域层，目标不被标题代替', async () => {
    const update = vi.spyOn(listing, 'updateCollectionListing').mockResolvedValue({ resourceId: 'collection_1' });
    const command = createCollectionUpdateCommand().exitOverride().configureOutput({ writeErr() {} });
    await command.parseAsync(['--resource', 'id:collection_1', '--edit-tags', '--json', '--yes'], { from: 'user' });
    expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      selector: 'id:collection_1', editTags: true, json: true, yes: true,
    }));
  });

  it('重复tag保持完整单项文字，不隐式进入编辑', async () => {
    const update = vi.spyOn(listing, 'updateCollectionListing').mockResolvedValue({ resourceId: 'collection_1' });
    await createCollectionUpdateCommand().parseAsync(['--resource', 'id:collection_1', '--tag', 'a,b', '--tag', '中文', '--yes'], { from: 'user' });
    expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tags: ['a,b', '中文'] }));
    expect(update.mock.calls[0]![0].editTags).toBeUndefined();
  });

  it.each([
    [false, false, [], 'COLLECTION_TAGS_TTY_REQUIRED'], [false, true, [], 'COLLECTION_TAGS_TTY_REQUIRED'],
    [true, true, [], 'COLLECTION_TAGS_TTY_REQUIRED'], [true, true, ['--tag', 'a'], 'COLLECTION_TAGS_CONFLICT'],
    [true, true, ['--clear-tags'], 'COLLECTION_TAGS_CONFLICT'],
  ] as const)('完整入口TTY=%s/JSON=%s/冲突%j在事务前拒绝并保持原字节', async (interactive, json, extra, code) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-tag-entry-'));
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    mkdirSync(path.join(cwd, '.freelog'));
    writeFileSync(path.join(cwd, '.freelog/.sequence'), '1\n');
    writeFileSync(path.join(cwd, '.freelog/.txn.json'), JSON.stringify({ schemaVersion: 1, entries: [{ path: '.sequence',
      before: '1\n', beforeSha256: hash('1\n'), after: '2\n', afterSha256: hash('2\n') }] }));
    writeFileSync(path.join(cwd, '.freelog/keep.bin'), Buffer.from([0, 255, 254]));
    const snapshot = () => readdirSync(path.join(cwd, '.freelog')).sort().map((name) => [name, readFileSync(path.join(cwd, '.freelog', name)).toString('base64')]);
    const before = snapshot(), out = vi.fn(), err = vi.fn();
    vi.spyOn(tty, 'isInteractive').mockReturnValue(interactive);
    try {
      expect(await runCli(['collection', 'update', '--resource', 'id:collection_1', '--edit-tags', ...extra,
        '--env', 'dev', ...(json ? ['--json'] : []), '--yes', '--cwd', cwd], { writeOut: out, writeErr: err })).toBe(1);
      if (json) { expect(JSON.parse(out.mock.calls[0]![0] as string).code).toBe(code); expect(err).not.toHaveBeenCalled(); }
      else { expect(out).not.toHaveBeenCalled(); expect(err).toHaveBeenCalledOnce(); }
      expect(snapshot()).toEqual(before);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it.each(['menu-cancel', 'ctrl-c', 'finish-unchanged', 'final-cancel'] as const)('合法TTY的%s不回滚上次已验证事务，也不另改身份或写平台', async (mode) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-tag-transaction-'));
    const homeDir = path.join(cwd, 'home'); mkdirSync(homeDir);
    applyCliEnv({ flag: 'test' });
    try {
      await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
      const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1', resourceName: 'alice/collection',
        name: 'collection', typeCode: 'COLLECTION_LEAF', title: '旧缓存标题', env: 'test' });
      const file = path.join(cwd, '.freelog', `${local.n}.json`), before = readFileSync(file, 'utf8');
      const after = `${JSON.stringify({ ...JSON.parse(before), title: '前次事务已确认标题' })}\n`;
      const hash = (value: string) => createHash('sha256').update(value).digest('hex');
      const txn = path.join(cwd, '.freelog/.txn.json');
      writeFileSync(txn, JSON.stringify({ schemaVersion: 1, entries: [{ path: `${local.n}.json`, before, beforeSha256: hash(before), after, afterSha256: hash(after) }] }));
      const snapshot = () => readdirSync(path.join(cwd, '.freelog')).sort().map((name) => [name, readFileSync(path.join(cwd, '.freelog', name)).toString('base64')]);
      const expected = snapshot().filter(([name]) => name !== '.txn.json').map(([name, bytes]) => [name, name === `${local.n}.json` ? Buffer.from(after).toString('base64') : bytes]);
      const info = vi.spyOn(FServiceAPI.Resource, 'info').mockResolvedValue({ ret: 0, errCode: 0, data: { resourceId: 'collection_1',
        resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0, resourceTitle: '前次事务已确认标题', tags: ['旧标签'] } } as never);
      const recommendations = vi.spyOn(FServiceAPI.Resource, 'availableTags').mockResolvedValue({ ret: 0, errCode: 0, data: [] } as never);
      const update = vi.spyOn(FServiceAPI.Resource, 'update'); const upload = vi.spyOn(FServiceAPI.Storage, 'uploadImage');
      vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
      const menu = vi.spyOn(tty, 'selectQuestion');
      if (mode === 'ctrl-c') menu.mockRejectedValueOnce(Object.assign(new Error('SYNTHETIC_ONLY'), { name: 'ExitPromptError' }));
      else if (mode === 'menu-cancel') menu.mockResolvedValueOnce('cancel');
      else if (mode === 'final-cancel') menu.mockResolvedValueOnce('remove:0').mockResolvedValueOnce('done');
      else menu.mockResolvedValueOnce('done');
      const confirm = vi.spyOn(tty, 'confirmWrite').mockRejectedValueOnce(Object.assign(new Error('取消'), { code: 'FORM_CANCELLED' }));
      const call = createProgram().parseAsync(['collection', 'update', '--resource', `file:${local.n}.json`, '--edit-tags', '--env', 'test', '--cwd', cwd], { from: 'user' });
      if (mode === 'finish-unchanged') await call;
      else await expect(call).rejects.toMatchObject({ code: 'FORM_CANCELLED' });
      expect(info).toHaveBeenCalledOnce(); expect(recommendations).toHaveBeenCalledExactlyOnceWith({ resourceTypeCode: 'COLLECTION_LEAF' });
      expect(confirm).toHaveBeenCalledTimes(mode === 'final-cancel' ? 1 : 0);
      expect(update).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
      expect(existsSync(txn)).toBe(false); expect(snapshot()).toEqual(expected);
    } finally { rmSync(cwd, { recursive: true, force: true }); resetEnvForTests(); }
  });

  it.each(['bad-json', 'bad-checksum', 'conflicting-current'] as const)('合法TTY在%s旧事务时先阻断，零问句/SDK/上传且保留原字节', async (mode) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-tag-transaction-'));
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    mkdirSync(path.join(cwd, '.freelog')); writeFileSync(path.join(cwd, '.freelog/.sequence'), mode === 'conflicting-current' ? '3\n' : '1\n');
    writeFileSync(path.join(cwd, '.freelog/.txn.json'), mode === 'bad-json' ? '{synthetic-malformed' : JSON.stringify({ schemaVersion: 1,
      entries: [{ path: '.sequence', before: '1\n', after: '2\n', beforeSha256: mode === 'bad-checksum' ? '0'.repeat(64) : hash('1\n'), afterSha256: hash('2\n') }] }));
    const snapshot = () => readdirSync(path.join(cwd, '.freelog')).sort().map((name) => [name, readFileSync(path.join(cwd, '.freelog', name)).toString('base64')]);
    const before = snapshot();
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true); const menu = vi.spyOn(tty, 'selectQuestion');
    const info = vi.spyOn(FServiceAPI.Resource, 'info'), available = vi.spyOn(FServiceAPI.Resource, 'availableTags');
    const update = vi.spyOn(FServiceAPI.Resource, 'update'), upload = vi.spyOn(FServiceAPI.Storage, 'uploadImage');
    try {
      await expect(createProgram().parseAsync(['collection', 'update', '--resource', 'id:collection_1', '--edit-tags', '--env', 'test', '--cwd', cwd], { from: 'user' }))
        .rejects.toMatchObject({ code: mode === 'conflicting-current' ? 'LOCAL_TXN_CONFLICT' : 'LOCAL_TXN_INVALID' });
      expect(menu).not.toHaveBeenCalled(); expect(info).not.toHaveBeenCalled(); expect(available).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(snapshot()).toEqual(before);
    } finally { rmSync(cwd, { recursive: true, force: true }); resetEnvForTests(); }
  });
});
