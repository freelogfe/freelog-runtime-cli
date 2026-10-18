import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirm, input as promptInput, select as promptSelect } from '@inquirer/prompts';
import { runCli } from '../../src/bin/program';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { updateListing } from '../../src/domain/listing/update';
import { offlineResource, onlineResource, validateForOnline } from '../../src/domain/online/online';
import { createIdentity, identityFilePath, updateIdentity } from '../../src/local/identity';
import { setCredentialStoreForTests } from '../../src/local/auth';
import { FServiceAPI } from '../../src/platform/api';

vi.mock('@inquirer/prompts', () => ({ confirm: vi.fn(), input: vi.fn(), select: vi.fn() }));
vi.mock('../../src/platform/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/platform/api')>();
  return { ...original, FServiceAPI: { ...original.FServiceAPI,
    Resource: { ...original.FServiceAPI.Resource, info: vi.fn(), update: vi.fn() },
    Storage: { ...original.FServiceAPI.Storage, uploadImage: vi.fn() },
  } };
});

describe('单资源资料与上下架的确认、读回和安全出口（管理02/05）', () => {
  const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  let root: string, cwd: string, homeDir: string;
  let remote: Record<string, unknown>;
  let out: string[], err: string[];
  const tty = (value: boolean) => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value });
  };
  const info = vi.fn(async () => ({ ret: 0, errCode: 0, data: structuredClone(remote) }));
  const update = vi.fn(async (payload: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(payload)) if (key !== 'resourceId') remote[key] = value;
    return { ret: 0, errCode: 0, data: {} };
  });
  const uploadImage = vi.fn(async () => ({ ret: 0, errCode: 0, data: { url: 'https://cdn.example/cover.png' } }));
  const listing = (extra: Record<string, unknown> = {}) => updateListing({ cwd, homeDir, yes: true, apis: { info, update, uploadImage }, ...extra });
  const shelf = (action: 'online' | 'offline', extra: Record<string, unknown> = {}) => (action === 'online' ? onlineResource : offlineResource)(
    { cwd, homeDir, yes: true, apis: { info, update }, ...extra },
  );
  const localBytes = () => fs.readFileSync(identityFilePath(cwd, 1));
  const execute = (args: string[]) => runCli([...args, '--cwd', cwd, '--env', 'dev'], {
    writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); },
  });
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(tmpdir(), 'freelog-management-boundary-'));
    cwd = path.join(root, 'work'); homeDir = path.join(root, 'home');
    fs.mkdirSync(cwd); fs.mkdirSync(homeDir);
    const credentials = new Map<string, string>();
    setCredentialStoreForTests({ get: (key) => credentials.get(key), set: (key, value) => { credentials.set(key, value); }, delete: (key) => credentials.delete(key) });
    applyCliEnv({ flag: 'dev' });
    await loginAccount({ cwd, homeDir, loginName: 'fixture', password: 'FAKE_PASSWORD',
      loginApi: async () => ({ data: { userId: 1, username: 'fixture', token: 'FAKE_TOKEN' } }),
    });
    createIdentity(cwd, { subject: 'resource', resourceId: 'r1', resourceName: 'fixture/one', name: 'one', title: '旧标题',
      typeCode: 'RT005001', filePath: 'photo.png', env: 'dev' });
    fs.writeFileSync(path.join(cwd, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    remote = { resourceId: 'r1', resourceName: 'fixture/one', userId: 1, status: 4, resourceTitle: '旧标题', intro: '旧简介', tags: ['旧标签'], coverImages: [],
      latestVersion: '1.0.0', policies: [{ policyId: 'p1', policyName: '免费', status: 1 }], private: 'FAKE_PRIVATE_RESPONSE' };
    out = []; err = []; tty(false);
    info.mockClear(); update.mockClear(); uploadImage.mockClear(); vi.mocked(confirm).mockReset(); vi.mocked(promptInput).mockReset(); vi.mocked(promptSelect).mockReset();
    vi.mocked(FServiceAPI.Resource.info).mockImplementation(info as never);
    vi.mocked(FServiceAPI.Resource.update).mockImplementation(update as never);
    vi.mocked(FServiceAPI.Storage.uploadImage).mockImplementation(uploadImage as never);
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { out.push(`${String(value)}\n`); });
  });
  afterEach(() => {
    vi.restoreAllMocks(); resetEnvForTests(); setCredentialStoreForTests();
    for (const [stream, descriptor] of [[process.stdin, stdinTTY], [process.stdout, stdoutTTY]] as const) {
      if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor); else Reflect.deleteProperty(stream, 'isTTY');
    }
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('freelog-management-boundary-')) throw new Error('Unsafe test root');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('listing非TTY无yes在封面上传前拒绝，身份原字节保留', async () => {
    const before = localBytes();
    await expect(listing({ title: '新标题', cover: 'cover.png', yes: false })).rejects.toMatchObject({ code: 'FORM_NEED_YES' });
    expect(uploadImage).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(localBytes()).toEqual(before);
  });
  it('TTY取消listing时不上传、不PUT、不改缓存', async () => {
    tty(true); vi.mocked(confirm).mockResolvedValueOnce(false);
    const before = localBytes();
    await expect(listing({ title: '新标题', cover: 'cover.png', yes: false })).rejects.toMatchObject({ code: 'FORM_CANCELLED' });
    expect(confirm).toHaveBeenCalledOnce(); expect(uploadImage).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(localBytes()).toEqual(before);
  });
  it('先校验所有字段：有效封面搭配非法标签也必须零上传', async () => {
    await expect(listing({ cover: 'cover.png', tags: 'a,,b' })).rejects.toMatchObject({ code: 'UPDATE_TAG_EMPTY' });
    expect(uploadImage).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it('无flag的TTY逐项回车保留，返回changed=false且零上传/PUT', async () => {
    tty(true); vi.mocked(promptInput).mockResolvedValue('');
    const before = localBytes();
    await expect(listing({ yes: false })).resolves.toMatchObject({ resourceId: 'r1', changed: false, listing: { title: '旧标题', intro: '旧简介' } });
    expect(promptInput).toHaveBeenCalledTimes(4); expect(confirm).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled(); expect(localBytes()).toEqual(before);
  });
  it.each([false, true])('无flag且非交互（yes=%s）不能发送空PUT', async (yes) => {
    await expect(listing({ yes })).rejects.toMatchObject({ code: 'UPDATE_NO_FLAGS' });
    expect(update).not.toHaveBeenCalled(); expect(uploadImage).not.toHaveBeenCalled();
  });
  it('TTY逐项问时非法字段重问，回车保留其它项，确认后只写最终字段', async () => {
    tty(true); vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(promptInput).mockResolvedValueOnce('标'.repeat(101)).mockResolvedValueOnce('  新标题  ').mockResolvedValue('');
    await expect(listing({ yes: false })).resolves.toMatchObject({ resourceId: 'r1', changed: true, listing: { title: '新标题' } });
    expect(promptInput).toHaveBeenCalledTimes(5); expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'r1', resourceTitle: '新标题' });
  });
  it('有flag不额外问字段；精确读回后才同步标题，仅选中标题变动', async () => {
    tty(true); vi.mocked(confirm).mockResolvedValueOnce(true);
    const before = JSON.parse(localBytes().toString());
    const result = await listing({ title: ' 新标题 ', intro: '', tags: '#a,b', yes: false });
    expect(promptInput).not.toHaveBeenCalled(); expect(info).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'r1', resourceTitle: '新标题', intro: '', tags: ['a', 'b'] });
    expect(JSON.parse(localBytes().toString())).toEqual({ ...before, title: '新标题' });
    expect(result).toEqual({ resourceId: 'r1', changed: true, listing: { resourceName: 'fixture/one', title: '新标题', intro: '', tags: ['a', 'b'], coverImages: [], status: 4 } });
  });
  it('TTY逐项编辑展示当前标题/简介/标签，而不是只有字段名', async () => {
    tty(true); vi.mocked(promptInput).mockResolvedValue('');
    await listing({ yes: false });
    const messages = vi.mocked(promptInput).mock.calls.map(([options]) => options.message).join('\n');
    expect(messages).toContain('旧标题'); expect(messages).toContain('旧简介'); expect(messages).toContain('旧标签');
    expect(update).not.toHaveBeenCalled();
  });
  it('listing显式值与当前相同则不发PUT', async () => {
    await expect(listing({ title: '旧标题' })).resolves.toMatchObject({ changed: false });
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['feedUrl', 'rssGuid', 'rssPubDate'])('Console RSS门禁 %s 非空时零写入', async (key) => {
    remote[key] = 'RSS_MARKER';
    await expect(listing({ title: '新标题' })).rejects.toMatchObject({ code: 'UPDATE_RSS_READONLY' });
    expect(update).not.toHaveBeenCalled(); expect(uploadImage).not.toHaveBeenCalled();
  });
  it.each([
    ['未达到目标', (data: Record<string, unknown>) => { data.resourceTitle = '旧标题'; }],
    ['错误ID', (data: Record<string, unknown>) => { data.resourceId = 'other'; }],
    ['错误owner', (data: Record<string, unknown>) => { data.userId = 2; }],
    ['意外改简介', (data: Record<string, unknown>) => { data.intro = '意外修改'; }],
    ['意外上下架', (data: Record<string, unknown>) => { data.status = 1; }],
    ['意外改授权标识', (data: Record<string, unknown>) => { data.resourceName = 'fixture/other'; }],
    ['缺标签', (data: Record<string, unknown>) => { delete data.tags; }],
    ['额外冻结标记', (data: Record<string, unknown>) => { data.isFrozen = true; }],
  ])('listing写后%s不能假成功或缓存新标题', async (_label, corrupt) => {
    const before = localBytes();
    const write = vi.fn(async (payload: Record<string, unknown>) => { await update(payload); corrupt(remote); return { data: {} }; });
    await expect(listing({ title: '新标题', apis: { info, update: write } })).rejects.toMatchObject({ code: 'UPDATE_VERIFY_FAILED' });
    expect(write).toHaveBeenCalledOnce(); expect(info).toHaveBeenCalledTimes(2); expect(localBytes()).toEqual(before);
  });
  it.each(['write', 'read'])('listing %s未知时零重试且不泄漏私有诊断', async (stage) => {
    const before = localBytes(); const unsafe = new Error('Authorization: Bearer FAKE_SECRET Cookie: FAKE_COOKIE');
    const read = vi.fn(async () => { if (stage === 'read' && read.mock.calls.length > 1) throw unsafe; return info(); });
    const write = vi.fn(async (payload: Record<string, unknown>) => { if (stage === 'write') throw unsafe; return update(payload); });
    await expect(listing({ title: '新标题', apis: { info: read, update: write } })).rejects.toMatchObject({ code: 'UPDATE_RESULT_UNKNOWN' });
    expect(write).toHaveBeenCalledOnce(); expect(localBytes()).toEqual(before); expect(out.join('') + err.join('')).not.toContain('FAKE_SECRET');
  });
  it('确认至远端写期间持有工程锁，阻止另一异步调用换绑缓存', async () => {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void; const started = new Promise<void>((resolve) => { entered = resolve; });
    const pending = listing({ title: '新标题', apis: { info, update: async (payload: Record<string, unknown>) => { entered(); await waiting; return update(payload); } } });
    await started;
    let conflict: unknown;
    try { updateIdentity(cwd, 1, { title: '并发缓存' }); } catch (error) { conflict = error; }
    release(); await pending;
    expect(conflict).toMatchObject({ code: 'PROJECT_LOCKED' });
  });
  it('线上已精确核验但本地落盘失败时不能重发远端', async () => {
    const rename = fs.renameSync;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === identityFilePath(cwd, 1)) throw new Error('FAKE_DISK_PRIVATE');
      return rename(from, to);
    });
    await expect(listing({ title: '线上成功' })).rejects.toMatchObject({ code: 'UPDATE_LOCAL_CACHE_FAILED' });
    expect(remote.resourceTitle).toBe('线上成功'); expect(update).toHaveBeenCalledOnce();
    expect(JSON.parse(localBytes().toString()).title).toBe('旧标题');
  });
  it.each(['listing', 'online', 'offline'] as const)('%s明确失败信封不能用相符读回冒充写成功', async (action) => {
    remote.status = action === 'offline' ? 1 : 4;
    const write = vi.fn(async () => ({ ret: 0, errCode: 7, msg: 'FAKE_PRIVATE_DIAGNOSTIC', data: null }));
    const operation = action === 'listing' ? listing({ title: '新标题', apis: { info, update: write } }) : shelf(action, { apis: { info, update: write } });
    await expect(operation).rejects.toMatchObject({ code: action === 'listing' ? 'UPDATE_RESULT_UNKNOWN' : 'SHELF_RESULT_UNKNOWN' });
    expect(info).toHaveBeenCalledOnce(); expect(write).toHaveBeenCalledOnce();
  });

  it.each(['online', 'offline'] as const)('%s未显式yes的非TTY拒绝零PUT', async (action) => {
    remote.status = action === 'online' ? 4 : 1;
    await expect(shelf(action, { yes: false })).rejects.toMatchObject({ code: 'FORM_NEED_YES' });
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['online', 'offline'] as const)('%s交互取消零PUT', async (action) => {
    tty(true); vi.mocked(confirm).mockResolvedValueOnce(false); remote.status = action === 'online' ? 4 : 1;
    await expect(shelf(action, { yes: false })).rejects.toMatchObject({ code: 'FORM_CANCELLED' });
    expect(confirm).toHaveBeenCalledOnce(); expect(update).not.toHaveBeenCalled();
  });
  it('上架最终确认须显示启用策略名称，不泄漏策略正文或显示停用策略', async () => {
    tty(true); vi.mocked(confirm).mockResolvedValueOnce(false);
    remote.policies = [{ policyId: 'p1', policyName: '当前免费策略', status: 1, policyText: 'FAKE_PRIVATE_POLICY_TEXT' }, { policyId: 'p2', policyName: '停用策略', status: 0 }];
    await expect(shelf('online', { yes: false })).rejects.toMatchObject({ code: 'FORM_CANCELLED' });
    const message = vi.mocked(confirm).mock.calls[0]?.[0].message;
    expect(message).toContain('当前免费策略'); expect(message).not.toContain('停用策略'); expect(message).not.toContain('FAKE_PRIVATE_POLICY_TEXT');
    expect(update).not.toHaveBeenCalled();
  });
  it.each([0, 4])('offline状态%s幂等保留而非总PUT4', async (status) => {
    remote.status = status; remote.policies = []; remote.latestVersion = undefined;
    await expect(shelf('offline', { yes: false })).resolves.toEqual({ resourceId: 'r1', status, changed: false });
    expect(info).toHaveBeenCalledOnce(); expect(update).not.toHaveBeenCalled();
  });
  it('online已上架仍核验版本/策略，合法幂等零PUT', async () => {
    remote.status = 1;
    await expect(shelf('online', { yes: false })).resolves.toEqual({ resourceId: 'r1', status: 1, changed: false });
    expect(update).not.toHaveBeenCalled(); remote.policies = [];
    await expect(shelf('online')).rejects.toMatchObject({ code: 'ONLINE_NO_POLICY' });
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['online', 'offline'] as const)('%s成功只PUT状态并强制精确读回', async (action) => {
    remote.status = action === 'online' ? 4 : 1; const status = action === 'online' ? 1 : 4; const before = localBytes();
    await expect(shelf(action)).resolves.toEqual({ resourceId: 'r1', status, changed: true });
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'r1', status }); expect(info).toHaveBeenCalledTimes(2); expect(localBytes()).toEqual(before);
  });
  it.each(['online', 'offline'] as const)('%s成功响应未改状态也必须失败', async (action) => {
    remote.status = action === 'online' ? 4 : 1; const write = vi.fn(async () => ({ ret: 0, errCode: 0, data: {} }));
    await expect(shelf(action, { apis: { info, update: write } })).rejects.toMatchObject({ code: 'SHELF_VERIFY_FAILED' });
    expect(write).toHaveBeenCalledOnce();
  });
  it.each(['online', 'offline'] as const)('%s未知状态不猜测可写', async (action) => {
    remote.status = 99;
    await expect(shelf(action)).rejects.toMatchObject({ code: 'RESOURCE_STATUS_INVALID' }); expect(update).not.toHaveBeenCalled();
  });
  it('上架策略结构损坏是受控拒绝，不从TypeError猜业务', () => {
    expect(() => validateForOnline({ latestVersion: '1.0.0', policies: {} })).toThrow(expect.objectContaining({ code: 'ONLINE_INFO_INVALID' }));
  });
  it.each(['online', 'offline'] as const)('%s写错误为安全未知且不重试', async (action) => {
    remote.status = action === 'online' ? 4 : 1;
    const write = vi.fn(async () => { throw new Error('FAKE_PRIVATE_TRANSPORT'); });
    await expect(shelf(action, { apis: { info, update: write } })).rejects.toMatchObject({ code: 'SHELF_RESULT_UNKNOWN' });
    expect(write).toHaveBeenCalledOnce();
  });
  it.each(['online', 'offline'] as const)('%s写后读错误也不能假成功', async (action) => {
    remote.status = action === 'online' ? 4 : 1;
    const read = vi.fn(async () => { if (read.mock.calls.length > 1) throw new Error('FAKE_READ_PRIVATE'); return info(); });
    await expect(shelf(action, { apis: { info: read, update } })).rejects.toMatchObject({ code: 'SHELF_RESULT_UNKNOWN' });
    expect(update).toHaveBeenCalledOnce(); expect(read).toHaveBeenCalledTimes(2);
  });
  it.each(['online', 'offline'] as const)('%s错误读回身份不能只凭状态成功', async (action) => {
    remote.status = action === 'online' ? 4 : 1;
    const write = vi.fn(async (payload: Record<string, unknown>) => { await update(payload); remote.userId = 2; return { data: {} }; });
    await expect(shelf(action, { apis: { info, update: write } })).rejects.toMatchObject({ code: 'SHELF_VERIFY_FAILED' });
    expect(write).toHaveBeenCalledOnce();
  });

  it('真实runCli update JSON仅单对象，值来自读回，未带字段保持', async () => {
    expect(await execute(['update', '--title', '命令新标题', '--yes', '--json'])).toBe(0);
    expect(err).toEqual([]); expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!)).toEqual({ resourceId: 'r1', changed: true, listing: { resourceName: 'fixture/one', title: '命令新标题', intro: '旧简介', tags: ['旧标签'], coverImages: [], status: 4 } });
    expect(out.join('')).not.toContain('FAKE_PRIVATE_RESPONSE');
  });
  it('真实runCli shelf透传yes并区分成功/幂等JSON', async () => {
    for (const [action, status, changed] of [['online', 1, true], ['online', 1, false], ['offline', 4, true], ['offline', 4, false]] as const) {
      out.length = 0; err.length = 0;
      expect(await execute([action, '--yes', '--json'])).toBe(0);
      expect(out).toHaveLength(1); expect(JSON.parse(out[0]!)).toEqual({ resourceId: 'r1', status, changed }); expect(err).toEqual([]);
    }
    expect(update).toHaveBeenCalledTimes(2);
  });
  it.each(['online', 'offline', 'update'] as const)('真实runCli %s JSON+TTY确认内容只发stderr，不自动同意', async (command) => {
    tty(true); vi.mocked(confirm).mockResolvedValueOnce(false); if (command === 'offline') remote.status = 1;
    expect(await execute([command, ...(command === 'update' ? ['--title', '待确认'] : []), '--json'])).toBe(1);
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('确认写入') }), { output: process.stderr });
    expect(out).toHaveLength(1); expect(JSON.parse(out[0]!)).toEqual({ code: 'FORM_CANCELLED', message: '已取消' });
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['online', 'offline', 'update'] as const)('多资源真实runCli %s JSON选择菜单也只发stderr，未选目标不变', async (command) => {
    tty(true); vi.mocked(promptSelect).mockResolvedValueOnce('file:2.json'); vi.mocked(confirm).mockResolvedValueOnce(true);
    createIdentity(cwd, { subject: 'resource', resourceId: 'r2', resourceName: 'fixture/two', name: 'two', title: '第二标题', typeCode: 'RT005001', filePath: 'second.png', env: 'dev' });
    const second: Record<string, unknown> = { ...structuredClone(remote), resourceId: 'r2', resourceName: 'fixture/two', resourceTitle: '第二标题', status: command === 'offline' ? 1 : 4 };
    const before = localBytes(); const originalRemote = structuredClone(remote);
    vi.mocked(FServiceAPI.Resource.info).mockImplementation(async (args) => ({ ret: 0, errCode: 0, data: structuredClone(args.resourceIdOrName === 'r2' ? second : remote) }) as never);
    vi.mocked(FServiceAPI.Resource.update).mockImplementation(async (args) => { Object.assign(args.resourceId === 'r2' ? second : remote, args); return { ret: 0, errCode: 0, data: {} } as never; });
    expect(await execute([command, ...(command === 'update' ? ['--title', '第二新标题'] : []), '--json'])).toBe(0);
    expect(promptSelect).toHaveBeenCalledWith(expect.objectContaining({ message: '请选择资源' }), { output: process.stderr });
    expect(out).toHaveLength(1); expect(JSON.parse(out[0]!)).toMatchObject({ resourceId: 'r2', changed: true });
    expect(err).toEqual([]); expect(localBytes()).toEqual(before); expect(remote).toEqual(originalRemote);
    expect(FServiceAPI.Resource.update).toHaveBeenCalledExactlyOnceWith(command === 'update'
      ? { resourceId: 'r2', resourceTitle: '第二新标题' } : { resourceId: 'r2', status: command === 'online' ? 1 : 4 });
    const identity2 = JSON.parse(fs.readFileSync(identityFilePath(cwd, 2), 'utf8'));
    expect(identity2).toEqual({ schemaVersion: 1, subject: 'resource', resourceId: 'r2', resourceName: 'fixture/two', name: 'two',
      title: command === 'update' ? '第二新标题' : '第二标题', typeCode: 'RT005001', filePath: 'second.png', env: 'dev' });
  });
  it.each(['online', 'offline', 'update'] as const)('真实runCli %s无yes错误JSON不混预览且零写', async (command) => {
    if (command === 'offline') remote.status = 1;
    expect(await execute([command, ...(command === 'update' ? ['--title', '不应写'] : []), '--json'])).toBe(1);
    expect(out).toHaveLength(1); expect(JSON.parse(out[0]!)).toEqual({ code: 'FORM_NEED_YES', message: '请加 --yes 确认预览' });
    expect(err).toEqual([]); expect(update).not.toHaveBeenCalled(); expect(uploadImage).not.toHaveBeenCalled();
  });
  it.each(['online', 'offline', 'update'] as const)('真实runCli %s未知结果JSON无凭据且零重试', async (command) => {
    if (command === 'offline') remote.status = 1;
    vi.mocked(FServiceAPI.Resource.update).mockRejectedValueOnce(new Error('Authorization: Bearer FAKE_SECRET Cookie: FAKE_COOKIE'));
    expect(await execute([command, ...(command === 'update' ? ['--title', '未知写入'] : []), '--yes', '--json'])).toBe(1);
    expect(err).toEqual([]); expect(out).toHaveLength(1);
    const actual = JSON.parse(out[0]!); expect(Object.keys(actual).sort()).toEqual(['code', 'message']);
    expect(actual.code).toBe(command === 'update' ? 'UPDATE_RESULT_UNKNOWN' : 'SHELF_RESULT_UNKNOWN');
    expect(out.join('')).not.toMatch(/FAKE_SECRET|FAKE_COOKIE/); expect(FServiceAPI.Resource.update).toHaveBeenCalledOnce();
  });
});
