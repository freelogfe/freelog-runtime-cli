import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { updateCollectionListing } from '../../src/domain/collection/listing';
import { createCollectionIdentity, readCollectionIdentity } from '../../src/local/identity';
import * as tty from '../../src/core/tty';
import * as atomicWrite from '../../src/core/atomicWrite';

vi.mock('../../src/core/tty', async (original) => ({ ...await original<typeof tty>(), confirmWrite: vi.fn(),
  isInteractive: vi.fn(), selectQuestion: vi.fn(), askInput: vi.fn(),
}));

describe('合集 listing', () => {
  let cwd: string;
  let homeDir: string;
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-listing-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-listing-home-'));
    applyCliEnv({ flag: 'test' });
    vi.mocked(tty.isInteractive).mockReset().mockReturnValue(false);
    vi.mocked(tty.selectQuestion).mockReset().mockRejectedValue(new Error('UNEXPECTED_SYNTHETIC_PROMPT'));
    vi.mocked(tty.askInput).mockReset().mockRejectedValue(new Error('UNEXPECTED_SYNTHETIC_INPUT'));
    vi.mocked(tty.confirmWrite).mockReset();
    vi.mocked(tty.confirmWrite).mockImplementation(async (preview, yes) => {
      if (!yes) throw Object.assign(new Error('确认未完成'), { code: 'FORM_NEED_YES' });
      return preview;
    });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { vi.restoreAllMocks(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  const info = async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'COLLECTION_LEAF', subjectType: [4], userId: 7, status: 0, resourceTitle: '新标题', intro: '简介', tags: ['a,b'] } });

  it.each(['invalid-tags', 'no-yes', 'cancel'])('封面%s在任何上传和PUT前失败', async (mode) => {
    writeFileSync(path.join(cwd, 'cover.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    const uploadImage = vi.fn(async () => ({ ret: 0, errCode: 0, data: { url: 'https://example.test/cover.png' } }));
    const update = vi.fn(async () => ({}));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    if (mode === 'cancel') vi.mocked(tty.confirmWrite).mockRejectedValueOnce(Object.assign(new Error('取消'), { code: 'FORM_CANCELLED' }));
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', cover: 'cover.png',
      ...(mode === 'invalid-tags' ? { tags: ['x', 'x'], yes: true } : {}), apis: { info, uploadImage, update },
    })).rejects.toMatchObject({ code: mode === 'invalid-tags' ? 'COLLECTION_TAG_DUPLICATE' : mode === 'cancel' ? 'FORM_CANCELLED' : 'FORM_NEED_YES' });
    expect(uploadImage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('原图警告、确认、上传、单次PUT、固定ID读回有严格顺序', async () => {
    const events: string[] = [];
    const coverBytes = Buffer.from('89504e470d0a1a0a', 'hex');
    writeFileSync(path.join(cwd, 'cover.png'), coverBytes);
    const url = 'https://example.test/cover.png';
    let stored: Record<string, unknown> = {};
    vi.spyOn(console, 'warn').mockImplementation(() => { events.push('warn'); });
    vi.mocked(tty.confirmWrite).mockImplementation(async (preview) => { events.push('confirm'); return preview; });
    const details = vi.fn(async (params: Record<string, unknown>) => { events.push(`read:${params.resourceIdOrName}`); return { ...await info(), data: { ...(await info()).data, ...stored } }; });
    const uploadImage = vi.fn(async () => { events.push('upload'); return { ret: 0, errCode: 0, data: { url } }; });
    const update = vi.fn(async (payload: Record<string, unknown>) => { events.push('update'); stored = payload; return { ret: 0, errCode: 0, data: {} }; });
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'name:alice/collection', cover: 'cover.png', tags: ['a,b'], apis: { info: details, uploadImage, update } }))
      .resolves.toEqual({ resourceId: 'collection_1', tags: ['a,b'], coverImages: [url] });
    expect(events).toEqual(['read:alice/collection', 'warn', 'confirm', 'upload', 'update', 'read:collection_1']);
    expect(uploadImage).toHaveBeenCalledWith({ file: coverBytes });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: { url: 'https://example.test/x.png' } },
    { ret: 1, errCode: 0, data: { url: 'https://example.test/x.png' } },
    { ret: 0, errCode: 3, data: { url: 'https://example.test/x.png' } },
    { ret: 0, errCode: 0, data: { fileUrl: 'https://example.test/x.png' } },
    { ret: 0, errCode: 0, data: { url: ' ' } }, null,
  ])('上传结果不可信 %# 时不得PUT或重试', async (response) => {
    writeFileSync(path.join(cwd, 'cover.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const uploadImage = vi.fn(async () => response);
    const update = vi.fn();
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', cover: 'cover.png', yes: true, apis: { info, uploadImage, update } })).rejects.toMatchObject({ code: 'COLLECTION_COVER_UPLOAD_INVALID' });
    expect(uploadImage).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    [{ title: ' ' }, 'COLLECTION_TITLE_REQUIRED'], [{ title: 'a'.repeat(101) }, 'COLLECTION_TITLE_TOO_LONG'],
    [{ intro: 'a'.repeat(201) }, 'COLLECTION_INTRO_TOO_LONG'], [{ tags: [' '] }, 'COLLECTION_TAG_EMPTY'],
    [{ tags: ['x'.repeat(21)] }, 'COLLECTION_TAG_TOO_LONG'], [{ tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) }, 'COLLECTION_TAGS_TOO_MANY'],
  ])('其它字段无效 %# 时封面也不能上传', async (patch, code) => {
    writeFileSync(path.join(cwd, 'cover.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    const uploadImage = vi.fn();
    const update = vi.fn();
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', cover: 'cover.png', yes: true, ...patch, apis: { info, uploadImage, update } })).rejects.toMatchObject({ code });
    expect(uploadImage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['zero.gif', Buffer.from('474946383961010001000000003b', 'hex'), 'COLLECTION_COVER_INVALID'],
    ['fake.png', Buffer.from('not an image'), 'COLLECTION_COVER_INVALID'],
    ['large.png', Buffer.alloc(5 * 1024 * 1024 + 1), 'COLLECTION_COVER_TOO_LARGE'],
  ] as const)('封面%s在上传前校验', async (name, content, code) => {
    writeFileSync(path.join(cwd, name), content);
    const uploadImage = vi.fn();
    const update = vi.fn();
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', cover: name, yes: true, apis: { info, uploadImage, update } })).rejects.toMatchObject({ code });
    expect(uploadImage).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('只发送用户明确提供的 listing 字段', async () => {
    let payload: Record<string, unknown> | undefined;
    await expect(updateCollectionListing({
      cwd, homeDir, selector: 'id:collection_1', title: '新标题', intro: '简介', tags: [' #a,b '], yes: true,
      apis: { info, update: async (value) => { payload = value; return { ret: 0, errCode: 0, data: {} }; } },
    })).resolves.toEqual({ resourceId: 'collection_1', resourceTitle: '新标题', intro: '简介', tags: ['a,b'] });
    expect(payload).toEqual({ resourceId: 'collection_1', resourceTitle: '新标题', intro: '简介', tags: ['a,b'] });
  });

  it.each([
    ['业务失败', { ret: 1, errCode: 0 }], ['错误码失败', { ret: 0, errCode: 7 }],
    ['缺ret', { errCode: 0 }], ['缺errCode', { ret: 0 }],
    ['字符串ret', { ret: '0', errCode: 0 }], ['字符串errCode', { ret: 0, errCode: '0' }],
    ['空对象', {}], ['数组', []], ['null', null], ['undefined', undefined], ['布尔', false],
  ])('请求值原本相同时，%s写信封也不能成功或更新标题缓存', async (_label, response) => {
    const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1',
      resourceName: 'alice/collection', name: 'collection', typeCode: 'COLLECTION_LEAF', title: '旧缓存标题', env: 'test' });
    const before = readCollectionIdentity(cwd, local.n);
    const details = vi.fn(info);
    const update = vi.fn(async () => response);
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', title: '新标题', yes: true,
      apis: { info: details, update },
    })).rejects.toMatchObject({ code: 'COLLECTION_LISTING_WRITE_UNCONFIRMED' });
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', resourceTitle: '新标题' });
    expect(details).toHaveBeenCalledTimes(1);
    expect(readCollectionIdentity(cwd, local.n)).toEqual(before);
  });

  it('写请求异常只给固定说明，不泄露诊断、不读回或重发', async () => {
    const details = vi.fn(info);
    const update = vi.fn(async () => { throw new Error('SYNTHETIC_PRIVATE_HTTP_DIAGNOSTIC'); });
    const failure = await updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', title: '新标题', yes: true,
      apis: { info: details, update },
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'COLLECTION_LISTING_WRITE_UNCONFIRMED' });
    expect(String(failure)).not.toContain('SYNTHETIC_PRIVATE_HTTP_DIAGNOSTIC');
    expect(update).toHaveBeenCalledTimes(1);
    expect(details).toHaveBeenCalledTimes(1);
  });

  it('成功信封后读回不符仍失败，不刷新本地标题', async () => {
    const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1',
      resourceName: 'alice/collection', name: 'collection', typeCode: 'COLLECTION_LEAF', title: '旧缓存标题', env: 'test' });
    const before = readCollectionIdentity(cwd, local.n);
    const details = vi.fn(info);
    const update = vi.fn(async () => ({ ret: 0, errCode: 0 }));
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', title: '另一标题', yes: true,
      apis: { info: details, update },
    })).rejects.toMatchObject({ code: 'COLLECTION_LISTING_VERIFY_FAILED' });
    expect(details).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
    expect(readCollectionIdentity(cwd, local.n)).toEqual(before);
  });

  it('四个资料字段只提交一次，完整读回后仅刷新匹配身份的标题', async () => {
    const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1', resourceName: 'alice/collection', name: 'collection', typeCode: 'COLLECTION_LEAF', title: '旧缓存', env: 'test' });
    const other = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_2', resourceName: 'alice/other', name: 'other', typeCode: 'COLLECTION_LEAF', title: '其它缓存', env: 'test' });
    const otherFile = path.join(cwd, '.freelog', `${other.n}.json`), otherBefore = readFileSync(otherFile);
    const current = readCollectionIdentity(cwd, local.n);
    writeFileSync(path.join(cwd, 'keep.form.json'), '{"untouched":"本地表单文件"}');
    const cover = Buffer.from('89504e470d0a1a0a', 'hex'); writeFileSync(path.join(cwd, 'cover.png'), cover);
    const expected = { resourceId: 'collection_1', resourceTitle: '新标题', intro: '', tags: ['新标签'], coverImages: ['https://example.test/new.png'] };
    const events: string[] = []; let wrote = false;
    const details = vi.fn(async (params: Record<string, unknown>) => { events.push(`read:${params.resourceIdOrName}`); return { ...await info(), data: { ...(await info()).data, ...(wrote ? expected : {}) } }; });
    const update = vi.fn(async (payload: Record<string, unknown>) => { expect(payload).toEqual(expected); events.push('put'); wrote = true; return { ret: 0, errCode: 0 }; });
    const uploadImage = vi.fn(async () => { events.push('upload'); return { ret: 0, errCode: 0, data: { url: 'https://example.test/new.png' } }; });
    vi.spyOn(console, 'warn').mockImplementation(() => { events.push('warn'); });
    vi.mocked(tty.confirmWrite).mockImplementation(async (preview) => { events.push('confirm'); return preview; });
    await expect(updateCollectionListing({ cwd, homeDir, selector: `file:${local.n}.json`, title: ' 新标题 ', intro: ' ', tags: [' #新标签 '], cover: 'cover.png', yes: true, apis: { info: details, update, uploadImage } })).resolves.toEqual(expected);
    expect(events).toEqual(['read:collection_1', 'warn', 'confirm', 'upload', 'put', 'read:collection_1']);
    expect(update).toHaveBeenCalledOnce(); expect(uploadImage).toHaveBeenCalledExactlyOnceWith({ file: cover });
    expect(readCollectionIdentity(cwd, local.n)).toEqual({ ...current, title: '新标题' });
    expect(readFileSync(otherFile)).toEqual(otherBefore); expect(readFileSync(path.join(cwd, 'keep.form.json'), 'utf8')).toBe('{"untouched":"本地表单文件"}');
  });

  it.each(['intro', 'coverImages'] as const)('四字段PUT成功但%s不符，不更新标题缓存或自动重发', async (field) => {
    const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1', resourceName: 'alice/collection', name: 'collection', typeCode: 'COLLECTION_LEAF', title: '旧缓存', env: 'test' });
    const file = path.join(cwd, '.freelog', `${local.n}.json`), before = readFileSync(file);
    writeFileSync(path.join(cwd, 'cover.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    const expected = { resourceId: 'collection_1', resourceTitle: '新标题', intro: '新简介', tags: ['新标签'], coverImages: ['https://example.test/new.png'] };
    let wrote = false;
    const details = vi.fn(async () => ({ ...await info(), data: { ...(await info()).data, ...(wrote ? { ...expected, [field]: field === 'intro' ? '旧简介' : ['https://example.test/old.png'] } : {}) } }));
    const update = vi.fn(async () => { wrote = true; return { ret: 0, errCode: 0 }; });
    const uploadImage = vi.fn(async () => ({ ret: 0, errCode: 0, data: { url: 'https://example.test/new.png' } }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(updateCollectionListing({ cwd, homeDir, selector: `file:${local.n}.json`, title: '新标题', intro: '新简介', tags: ['新标签'], cover: 'cover.png', yes: true, apis: { info: details, update, uploadImage } })).rejects.toMatchObject({ code: 'COLLECTION_LISTING_VERIFY_FAILED' });
    expect(update).toHaveBeenCalledExactlyOnceWith(expected); expect(uploadImage).toHaveBeenCalledOnce(); expect(details).toHaveBeenCalledTimes(2); expect(readFileSync(file)).toEqual(before);
  });

  it.each(['readback', 'cache'] as const)('平台已确认写入后的%s故障不刷新旧缓存或再发PUT', async (stage) => {
    const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1', resourceName: 'alice/collection', name: 'collection', typeCode: 'COLLECTION_LEAF', title: '旧缓存', env: 'test' });
    const file = path.join(cwd, '.freelog', `${local.n}.json`), before = readFileSync(file);
    const failure = Object.assign(new Error('SYNTHETIC_IO_FAILURE'), { code: 'EIO' });
    let wrote = false;
    const details = vi.fn(async () => { if (wrote && stage === 'readback') throw failure; return info(); });
    const update = vi.fn(async () => { wrote = true; return { ret: 0, errCode: 0 }; });
    const actual = atomicWrite.atomicWriteFile;
    const cacheWrite = vi.spyOn(atomicWrite, 'atomicWriteFile').mockImplementation((target, content) => { if (target === file) throw failure; return actual(target, content); });
    await expect(updateCollectionListing({ cwd, homeDir, selector: `file:${local.n}.json`, title: '新标题', yes: true, apis: { info: details, update } })).rejects.toBe(failure);
    expect(wrote).toBe(true); expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', resourceTitle: '新标题' });
    expect(details).toHaveBeenCalledTimes(2); expect(cacheWrite).toHaveBeenCalledTimes(stage === 'cache' ? 1 : 0); expect(readFileSync(file)).toEqual(before);
  });

  it('RSS 与冻结合集在任何 listing 写入前拒绝', async () => {
    let writes = 0;
    await expect(updateCollectionListing({
      cwd, homeDir, selector: 'id:collection_1', title: 'x', yes: true,
      apis: { info: async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'T', subjectType: [4], userId: 7, status: 0, rssSource: 'yes' } }), update: async () => { writes += 1; return { data: {} }; } },
    })).rejects.toMatchObject({ code: 'COLLECTION_RSS_READONLY' });
    await expect(updateCollectionListing({
      cwd, homeDir, selector: 'id:collection_1', title: 'x', yes: true,
      apis: { info: async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'T', subjectType: [4], userId: 7, status: 2 } }), update: async () => { writes += 1; return { data: {} }; } },
    })).rejects.toMatchObject({ code: 'COLLECTION_FROZEN' });
    expect(writes).toBe(0);
  });

  // 正式合集信息§2.4：三个标签入口冲突与TTY/JSON门禁必须早于任何目标读取。
  it.each([
    { editTags: true, tags: ['a'] }, { editTags: true, clearTags: true }, { tags: ['a'], clearTags: true },
  ])('标签入口两两冲突%#在所有读取前拒绝', async (patch) => {
    const details = vi.fn(info); const availableTags = vi.fn(); const update = vi.fn();
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', title: '新标题', yes: true,
      ...patch, apis: { info: details, availableTags, update },
    })).rejects.toMatchObject({ code: 'COLLECTION_TAGS_CONFLICT' });
    expect(details).not.toHaveBeenCalled(); expect(availableTags).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { interactive: false, json: false }, { interactive: false, json: true }, { interactive: true, json: true },
  ])('编辑标签的TTY/JSON门禁%#不能被yes绕过', async ({ interactive, json }) => {
    vi.mocked(tty.isInteractive).mockReturnValue(interactive);
    const details = vi.fn(info); const availableTags = vi.fn(); const update = vi.fn();
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', editTags: true, json, yes: true,
      apis: { info: details, availableTags, update },
    })).rejects.toMatchObject({ code: 'COLLECTION_TAGS_TTY_REQUIRED' });
    expect(details).not.toHaveBeenCalled(); expect(availableTags).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('编辑推荐和活动后按字符串完整数组单次PUT并固定ID读回', async () => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('add:0').mockResolvedValueOnce('add:1').mockResolvedValueOnce('done');
    const availableTags = vi.fn(async () => ({ ret: 0, errCode: 0, data: [
      { tagId: 'recommend', tagName: '推荐', tagType: 1 }, { tagId: 'activity', tagName: '活动', tagType: 2 },
    ] }));
    let stored: Record<string, unknown> = {};
    const details = vi.fn(async (_params: Record<string, unknown>) => ({ ...await info(), data: { ...(await info()).data, ...stored } }));
    const update = vi.fn(async (payload: Record<string, unknown>) => { stored = payload; return { ret: 0, errCode: 0 }; });
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'name:alice/collection', editTags: true, yes: true,
      apis: { info: details, availableTags, update },
    })).resolves.toEqual({ resourceId: 'collection_1', tags: ['a,b', '推荐', '活动'] });
    expect(availableTags).toHaveBeenCalledExactlyOnceWith({ resourceTypeCode: 'COLLECTION_LEAF' });
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', tags: ['a,b', '推荐', '活动'] });
    expect(details.mock.calls.map(([params]) => params)).toEqual([
      { resourceIdOrName: 'alice/collection', isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 },
      { resourceIdOrName: 'collection_1', isLoadLatestVersionInfo: 1, isLoadPolicyInfo: 1 },
    ]);
    expect(tty.selectQuestion).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['missing', undefined, []], ['null', null, []], ['object', {}, []], ['string', '', []], ['numeric-element', [7], ['7']],
  ])('编辑后写读回的%s不能被当空数组或String化为成功', async (mode, returned, desired) => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1', resourceName: 'alice/collection',
      name: 'collection', typeCode: 'COLLECTION_LEAF', title: '缓存标题', env: 'test' });
    const before = readCollectionIdentity(cwd, local.n);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('remove:0');
    if (Array.isArray(desired) && desired.length) {
      vi.mocked(tty.selectQuestion).mockResolvedValueOnce('custom');
      vi.mocked(tty.askInput).mockResolvedValueOnce('7');
    }
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('done');
    let reads = 0;
    const details = vi.fn(async () => {
      const value = await info();
      const data: Record<string, unknown> = { ...value.data, tags: ['旧标签'] };
      if (++reads > 1) { if (mode === 'missing') delete data.tags; else data.tags = returned; }
      return { ...value, data };
    });
    const update = vi.fn(async () => ({ ret: 0, errCode: 0 }));
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', title: '新标题', editTags: true, yes: true,
      apis: { info: details, availableTags: async () => ({ ret: 0, errCode: 0, data: [] }), update },
    })).rejects.toMatchObject({ code: 'COLLECTION_LISTING_VERIFY_FAILED' });
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', resourceTitle: '新标题', tags: desired });
    expect(details).toHaveBeenCalledTimes(2);
    expect(readCollectionIdentity(cwd, local.n)).toEqual(before);
  });

  it('标签未变且无其它字段时只读返回，不确认或发送空PUT', async () => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('done');
    const details = vi.fn(info); const availableTags = vi.fn(async () => ({ ret: 0, errCode: 0, data: [] })); const update = vi.fn();
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', editTags: true,
      apis: { info: details, availableTags, update },
    })).resolves.toEqual({ resourceId: 'collection_1' });
    expect(details).toHaveBeenCalledOnce(); expect(availableTags).toHaveBeenCalledOnce();
    expect(tty.confirmWrite).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('同时修改简介但标签未变时PUT不夹带tags', async () => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('done');
    const availableTags = vi.fn(async () => ({ ret: 0, errCode: 0, data: [] }));
    const update = vi.fn(async () => ({ ret: 0, errCode: 0 }));
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', editTags: true, intro: '简介', yes: true,
      apis: { info, availableTags, update },
    })).resolves.toEqual({ resourceId: 'collection_1', intro: '简介' });
    expect(availableTags).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', intro: '简介' });
  });

  it.each(['cancel', 'final-confirm', 'bad-recommendation', 'bad-current'])('编辑标签%s保持缓存且零上传PUT', async (mode) => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    const local = createCollectionIdentity(cwd, { subject: 'collection', resourceId: 'collection_1',
      resourceName: 'alice/collection', name: 'collection', typeCode: 'COLLECTION_LEAF', title: '缓存标题', env: 'test' });
    const before = readCollectionIdentity(cwd, local.n);
    writeFileSync(path.join(cwd, 'cover.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const availableTags = vi.fn(async () => mode === 'bad-recommendation' ? { ret: 1, errCode: 0, data: [] } : { ret: 0, errCode: 0, data: [] });
    const details = vi.fn(async () => ({ ...await info(), data: { ...(await info()).data, ...(mode === 'bad-current' ? { tags: null } : {}) } }));
    const uploadImage = vi.fn(); const update = vi.fn();
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce(mode === 'cancel' ? 'cancel' : 'done');
    if (mode === 'final-confirm') vi.mocked(tty.confirmWrite).mockRejectedValueOnce(Object.assign(new Error('取消'), { code: 'FORM_CANCELLED' }));
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', editTags: true, cover: 'cover.png', yes: true,
      apis: { info: details, availableTags, uploadImage, update },
    })).rejects.toMatchObject({ code: mode === 'cancel' || mode === 'final-confirm' ? 'FORM_CANCELLED' : 'COLLECTION_TAGS_RESPONSE_INVALID' });
    expect(uploadImage).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
    expect(readCollectionIdentity(cwd, local.n)).toEqual(before);
    expect(details).toHaveBeenCalledOnce();
  });

  it.each([
    [{ title: ' ' }, 'COLLECTION_TITLE_REQUIRED'], [{ intro: 'x'.repeat(201) }, 'COLLECTION_INTRO_TOO_LONG'],
    [{ cover: '' }, 'COLLECTION_COVER_REQUIRED'],
  ])('全部显式字段%#校验先于推荐读取和编辑器', async (patch, code) => {
    vi.mocked(tty.isInteractive).mockReturnValue(true);
    const availableTags = vi.fn(); const uploadImage = vi.fn(); const update = vi.fn();
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', editTags: true, yes: true,
      ...patch, apis: { info, availableTags, uploadImage, update },
    })).rejects.toMatchObject({ code });
    expect(availableTags).not.toHaveBeenCalled(); expect(tty.selectQuestion).not.toHaveBeenCalled();
    expect(uploadImage).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it.each([{ tags: ['a,b'] }, { clearTags: true }])('显式标签入口%#不读取推荐也不进入编辑器', async (patch) => {
    const tags = 'tags' in patch ? ['a,b'] : [];
    const availableTags = vi.fn(); const update = vi.fn(async () => ({ ret: 0, errCode: 0 }));
    const details = vi.fn(async () => ({ ...await info(), data: { ...(await info()).data, tags } }));
    await expect(updateCollectionListing({ cwd, homeDir, selector: 'id:collection_1', ...patch, yes: true,
      apis: { info: details, availableTags, update },
    })).resolves.toEqual({ resourceId: 'collection_1', tags });
    expect(availableTags).not.toHaveBeenCalled(); expect(tty.selectQuestion).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', tags });
  });
});
