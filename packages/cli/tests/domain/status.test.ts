import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError, reportCliError } from '../../src/core/errors';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { statusProject } from '../../src/domain/status';
import { draftFilePath, writeDraft } from '../../src/local/draft';
import { createIdentity, identityFilePath } from '../../src/local/identity';
import { createPendingVersionSubmit } from '../../src/local/pendingOperation';

const messages = {
  STATUS_RESPONSE_INVALID: '平台详情响应不是成功信封或缺少有效对象，无法确认线上现状',
  STATUS_ID_MISMATCH: '平台详情缺少或不匹配 resourceId，无法确认线上现状',
  STATUS_LATEST_INVALID: '平台详情缺少有效 latestVersion，无法确认线上现状',
  STATUS_REQUEST_FAILED: '请求失败，无法确认线上现状',
};
const response = (latestVersion: unknown = '1.1.0', resourceId: unknown = 'r1') => ({ ret: 0, errCode: 0, data: { resourceId, latestVersion } });

function snapshot(directory: string, prefix = ''): unknown[] {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const name = `${prefix}${entry.name}`, file = path.join(directory, entry.name);
    return entry.isDirectory() ? [{ path: name, directory: true }, ...snapshot(file, `${name}/`)]
      : [{ path: name, bytes: readFileSync(file).toString('hex') }];
  });
}

describe('status只读事实契约（ARCH02 §1.1）', () => {
  let root: string, cwd: string, homeDir: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'freelog-status-contract-'));
    cwd = path.join(root, 'work'); homeDir = path.join(root, 'home');
    mkdirSync(cwd); mkdirSync(homeDir);
    applyCliEnv({ flag: 'dev' });
  });
  afterEach(() => {
    vi.restoreAllMocks(); resetEnvForTests();
    if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith('freelog-status-contract-')) throw new Error('Unexpected status fixture root');
    rmSync(root, { recursive: true, force: true });
  });
  async function login() {
    await loginAccount({ cwd, homeDir, loginName: 'fixture', password: 'FAKE_PASSWORD',
      loginApi: async () => ({ data: { userId: 1, username: 'fixture', token: 'FAKE_TOKEN' } }),
    });
  }
  function identity(bound = true, suffix = 'one') {
    writeFileSync(path.join(cwd, `${suffix}.png`), `artifact-${suffix}`);
    return createIdentity(cwd, { subject: 'resource', typeCode: 'RT005001', filePath: `${suffix}.png`,
      ...(bound ? { resourceId: suffix === 'one' ? 'r1' : 'r2', resourceName: `fixture/${suffix}`, name: suffix, title: '缓存标题', env: 'dev' } : {}),
    });
  }
  function protectDraftAndPending() {
    writeDraft(cwd, 1, { draftKind: 'initial', description: '未提交的稿' });
    createPendingVersionSubmit({ cwd, resourceN: 1, resourceId: 'r1', env: 'dev', version: '1.2.0', fileSha1: 'a'.repeat(40),
      draftSha256: createHash('sha256').update(readFileSync(draftFilePath(cwd, 1))).digest('hex'),
    });
  }
  function expected(version: string, draft = false, n = 1, name = 'one') {
    return `本地：${n}.json ${name} RT005001 ${name}.png\n工作稿：${draft ? '有' : '无'}\n线上：resourceId=${n === 1 ? 'r1' : 'r2'} latestVersion=${version}`;
  }

  it.each(['1.1.0', '2.0.0-beta.1+build.2', 'v1.1.0', ''])('只显示成功信封原始合法版本 %s，不改任何文件', async (version) => {
    identity(); await login(); protectDraftAndPending();
    const before = snapshot(root), info = vi.fn(async () => response(version));
    const text = await statusProject({ cwd, homeDir, apis: { info } });
    expect(text).toBe(expected(version || '无', true));
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'r1', isLoadLatestVersionInfo: 1 });
    expect(snapshot(root)).toEqual(before);
  });
  it.each(['id:r2', 'name:fixture/two', 'artifact:two.png', 'file:2.json'])('精确选择 %s，只GET选中资源，不刷新标题', async (file) => {
    identity(); identity(true, 'two'); await login();
    const before = snapshot(root), info = vi.fn(async () => response('1.1.0', 'r2'));
    expect(await statusProject({ cwd, homeDir, file, apis: { info } })).toBe(expected('1.1.0', false, 2, 'two'));
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'r2', isLoadLatestVersionInfo: 1 });
    expect(snapshot(root)).toEqual(before);
  });
  it('未绑定不登录、不请求平台；prod本地查看也不误触平台门禁', async () => {
    identity(false); applyCliEnv({ flag: 'prod' });
    const before = snapshot(root), info = vi.fn();
    expect(await statusProject({ cwd, homeDir, apis: { info } })).toBe('本地：1.json  RT005001 one.png\n工作稿：无\n线上：未查询');
    expect(info).not.toHaveBeenCalled(); expect(snapshot(root)).toEqual(before);
  });
  it.each([{ userId: 999, status: 4 }, { status: 2, isFrozen: true }, {}])('不要求owner或冻结写权限 %#', async (extra) => {
    identity(); await login();
    const before = snapshot(root), info = vi.fn(async () => ({ ...response(), data: { ...response().data, ...extra } }));
    expect(await statusProject({ cwd, homeDir, apis: { info } })).toBe(expected('1.1.0'));
    expect(info).toHaveBeenCalledTimes(1); expect(snapshot(root)).toEqual(before);
  });

  const badResponses: [string, unknown, keyof typeof messages][] = [
    ['null', null, 'STATUS_RESPONSE_INVALID'], ['undefined', undefined, 'STATUS_RESPONSE_INVALID'],
    ['裸详情', response().data, 'STATUS_RESPONSE_INVALID'], ['空对象', {}, 'STATUS_RESPONSE_INVALID'],
    ['data-only旧替身', { data: response().data }, 'STATUS_RESPONSE_INVALID'],
    ['错误ret', { ...response(), ret: 1 }, 'STATUS_RESPONSE_INVALID'],
    ['错误errCode', { ...response(), errCode: 1 }, 'STATUS_RESPONSE_INVALID'],
    ['字符串ret', { ...response(), ret: '0' }, 'STATUS_RESPONSE_INVALID'],
    ['null data', { ...response(), data: null }, 'STATUS_RESPONSE_INVALID'],
    ['数组data', { ...response(), data: [] }, 'STATUS_RESPONSE_INVALID'],
    ['缺ID', { ...response(), data: { latestVersion: '1.1.0' } }, 'STATUS_ID_MISMATCH'],
    ['错误ID', response('1.1.0', 'other'), 'STATUS_ID_MISMATCH'],
    ['对象ID', response('1.1.0', { value: 'r1' }), 'STATUS_ID_MISMATCH'],
    ['缺latest', { ...response(), data: { resourceId: 'r1' } }, 'STATUS_LATEST_INVALID'],
    ...[null, undefined, 0, false, {}, [], ' ', 'not-a-version', '1.1'].map((value, index): [string, unknown, keyof typeof messages] => [`畸形latest${index}`, { ret: 0, errCode: 0, data: { resourceId: 'r1', latestVersion: value } }, 'STATUS_LATEST_INVALID']),
  ];
  it.each(badResponses)('拒绝%s；不以本地ID/空值/字符串化掩盖失败', async (_label, invalid, code) => {
    identity(); await login(); protectDraftAndPending();
    const before = snapshot(root), info = vi.fn(async () => invalid);
    await expect(statusProject({ cwd, homeDir, apis: { info } })).rejects.toMatchObject({ name: 'CliError', code, message: messages[code] });
    expect(info).toHaveBeenCalledExactlyOnceWith({ resourceIdOrName: 'r1', isLoadLatestVersionInfo: 1 });
    expect(snapshot(root)).toEqual(before);
  });
  it.each([true, false])('未知请求异常经过实际统一出口不泄漏（json=%s）', async (json) => {
    identity(); await login(); protectDraftAndPending();
    const toJSON = vi.fn(() => { throw new Error('FAKE_SERIALIZATION_SECRET'); });
    const failure = Object.assign(new Error('Authorization: Bearer FAKE_STATUS_SECRET'), { toJSON, cause: { password: 'FAKE_PASSWORD' } });
    const before = snapshot(root), info = vi.fn(async () => { throw failure; });
    let caught: unknown;
    try { await statusProject({ cwd, homeDir, apis: { info } }); } catch (error) { caught = error; }
    const out: string[] = [], err: string[] = [];
    const result = reportCliError(caught, json ? ['--json'] : [], { writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); } });
    const expectedError = { code: 'STATUS_REQUEST_FAILED', message: messages.STATUS_REQUEST_FAILED };
    expect(result).toBe(1);
    expect(out).toEqual(json ? [`${JSON.stringify(expectedError)}\n`] : []);
    expect(err).toEqual(json ? [] : [`${expectedError.message}\n`]);
    expect(toJSON).not.toHaveBeenCalled(); expect(info).toHaveBeenCalledTimes(1); expect(snapshot(root)).toEqual(before);
  });
  it('受控CliError保留代码和说明，不重试、不处理pending', async () => {
    identity(); await login(); protectDraftAndPending();
    const controlled = new CliError('受控说明', 'CONTROLLED_READ_FAILED');
    const before = snapshot(root), info = vi.fn(async () => { throw controlled; });
    await expect(statusProject({ cwd, homeDir, apis: { info } })).rejects.toBe(controlled);
    expect(info).toHaveBeenCalledTimes(1); expect(snapshot(root)).toEqual(before);
  });
  it.each(['零身份', '多身份', '错selector', '坏身份', '坏稿', '孤儿稿', '未登录', '环境不符', 'prod'] as const)('%s前置失败零GET且不改字节', async (kind) => {
    if (kind !== '零身份') identity();
    if (kind !== '未登录') await login();
    let file: string | undefined;
    if (kind === '多身份') identity(true, 'two');
    if (kind === '错selector') file = 'id:missing';
    if (kind === '坏身份') writeFileSync(identityFilePath(cwd, 1), '{invalid');
    if (kind === '坏稿') writeFileSync(draftFilePath(cwd, 1), '{invalid');
    if (kind === '孤儿稿') writeFileSync(draftFilePath(cwd, 2), '{}');
    if (kind === '环境不符') applyCliEnv({ flag: 'test' });
    if (kind === 'prod') applyCliEnv({ flag: 'prod' });
    const before = snapshot(root), info = vi.fn();
    await expect(statusProject({ cwd, homeDir, file, apis: { info } })).rejects.toBeInstanceOf(CliError);
    expect(info).not.toHaveBeenCalled(); expect(snapshot(root)).toEqual(before);
    expect(existsSync(path.join(cwd, '.freelog/.lock'))).toBe(false);
  });
});
