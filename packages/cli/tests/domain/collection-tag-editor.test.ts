import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as tty from '../../src/core/tty';
import { collectionTagsPreview, editCollectionTags, validateCollectionTags } from '../../src/domain/collection/tagEditor';

vi.mock('../../src/core/tty', async (original) => ({
  ...await original<typeof tty>(), selectQuestion: vi.fn(), askInput: vi.fn(),
}));

// 正式合集信息§2.4：编辑仅在内存；推荐名原样保留，自定义输入沿用显式--tag语义。
describe('合集标签编辑器', () => {
  const recommended = [
    { tagId: 'recommend_1', tagName: '推荐', tagType: 1 },
    { tagId: 'activity_1', tagName: '活动', tagType: 2, tagNote: '活动说明' },
  ];
  const available = () => vi.fn(async () => ({ ret: 0, errCode: 0, data: recommended }));
  const choicesAt = (index: number) => vi.mocked(tty.selectQuestion).mock.calls[index]![1];

  beforeEach(() => {
    vi.mocked(tty.selectQuestion).mockReset().mockRejectedValue(new Error('UNEXPECTED_SYNTHETIC_PROMPT'));
    vi.mocked(tty.askInput).mockReset().mockRejectedValue(new Error('UNEXPECTED_SYNTHETIC_INPUT'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('完整转义DEL及C1控制区，不能让JSON未覆盖的字符成为终端指令', () => {
    for (let point = 0x7f; point <= 0x9f; point += 1) {
      const raw = `A${String.fromCodePoint(point)}B`;
      const output = collectionTagsPreview([raw]);
      expect(/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(output), `unsafe U+${point.toString(16)}`).toBe(false);
      expect(output).toBe(`["A\\u${point.toString(16).padStart(4, '0')}B"]`);
      expect(raw.codePointAt(1)).toBe(point);
    }
  });

  it('自定义标签保留逗号，沿用trim去#且接受20项/单项20字符边界', () => {
    expect(validateCollectionTags([' #a,b ', 'x'.repeat(20)])).toEqual(['a,b', 'x'.repeat(20)]);
    expect(validateCollectionTags(Array.from({ length: 20 }, (_, index) => `tag${index}`))).toHaveLength(20);
    expect(validateCollectionTags([])).toEqual([]);
  });
  it.each([
    [['#'], 'COLLECTION_TAG_EMPTY'],
    [[' '], 'COLLECTION_TAG_EMPTY'],
    [['x'.repeat(21)], 'COLLECTION_TAG_TOO_LONG'],
    [Array.from({ length: 21 }, (_, index) => `tag${index}`), 'COLLECTION_TAGS_TOO_MANY'],
    [['#a', 'a'], 'COLLECTION_TAG_DUPLICATE'],
  ])('显式标签坏输入%#保留原有字段错误码', (tags, code) => {
    expect(() => validateCollectionTags(tags as string[])).toThrow(expect.objectContaining({ code }));
  });

  it('推荐/活动/自定义/删除得到完整字符串数组，只读取一次当前类型推荐', async () => {
    const current = ['旧标签'];
    const availableTags = available();
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('add:0').mockResolvedValueOnce('add:1')
      .mockResolvedValueOnce('custom').mockResolvedValueOnce('remove:0').mockResolvedValueOnce('done');
    vi.mocked(tty.askInput).mockResolvedValueOnce(' #自定义,逗号 ');
    await expect(editCollectionTags({ current, resourceTypeCode: 'COLLECTION_LEAF', availableTags }))
      .resolves.toEqual(['推荐', '活动', '自定义,逗号']);
    expect(current).toEqual(['旧标签']);
    expect(availableTags).toHaveBeenCalledExactlyOnceWith({ resourceTypeCode: 'COLLECTION_LEAF' });
    expect(choicesAt(1).some((item) => item.value === 'add:0')).toBe(false);
    expect(choicesAt(2).some((item) => item.value === 'add:1')).toBe(false);
  });

  it('当前已选推荐不重复呈现，未选推荐保持平台原始数组索引', async () => {
    const availableTags = available();
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('add:1').mockResolvedValueOnce('done');
    await expect(editCollectionTags({ current: ['推荐'], resourceTypeCode: 'T', availableTags })).resolves.toEqual(['推荐', '活动']);
    expect(choicesAt(0).some((item) => item.value === 'add:0')).toBe(false);
    expect(choicesAt(0).some((item) => item.value === 'add:1')).toBe(true);
  });

  it('20项时隐藏添加仍可移除，移除后才可添加自定义', async () => {
    const current = Array.from({ length: 20 }, (_, index) => `tag${index}`);
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('remove:0').mockResolvedValueOnce('custom').mockResolvedValueOnce('done');
    vi.mocked(tty.askInput).mockResolvedValueOnce('替换项');
    await expect(editCollectionTags({ current, resourceTypeCode: 'T', availableTags: available() }))
      .resolves.toEqual([...current.slice(1), '替换项']);
    expect(choicesAt(0).some((item) => item.value === 'custom' || item.value.startsWith('add:'))).toBe(false);
    expect(choicesAt(0).map((item) => item.value)).toEqual(expect.arrayContaining(['done', 'cancel', 'remove:0']));
    expect(choicesAt(1).some((item) => item.value === 'custom')).toBe(true);
  });

  it('不规范推荐隐藏并警告，不截断/去#/trim平台名称后悄悄提交', async () => {
    const availableTags = vi.fn(async () => ({ ret: 0, errCode: 0, data: [
      { tagId: 'bad_1', tagName: '#原名', tagType: 1 },
      { tagId: 'bad_2', tagName: ' 带空格 ', tagType: 1 },
      { tagId: 'bad_3', tagName: 'x'.repeat(21), tagType: 2 },
      { tagId: 'good', tagName: 'a,b', tagType: 1 },
    ] }));
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('add:3').mockResolvedValueOnce('done');
    await expect(editCollectionTags({ current: [], resourceTypeCode: 'T', availableTags })).resolves.toEqual(['a,b']);
    expect(choicesAt(0).filter((item) => item.value.startsWith('add:')).map((item) => item.value)).toEqual(['add:3']);
    expect(console.warn).toHaveBeenCalled();
  });

  it('无效现有标签不能完成，移除后可继续；无效自定义输入也可修正', async () => {
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('done').mockResolvedValueOnce('remove:0')
      .mockResolvedValueOnce('custom').mockResolvedValueOnce('custom').mockResolvedValueOnce('done');
    vi.mocked(tty.askInput).mockResolvedValueOnce('#').mockResolvedValueOnce('修正');
    await expect(editCollectionTags({ current: ['x'.repeat(21)], resourceTypeCode: 'T', availableTags: available() })).resolves.toEqual(['修正']);
    expect(console.warn).toHaveBeenCalled();
    expect(tty.askInput).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, {}, ['正常', 7]])('当前标签不是完整字符串数组%#时拒绝且不取推荐', async (current) => {
    const availableTags = available();
    await expect(editCollectionTags({ current, resourceTypeCode: 'T', availableTags })).rejects.toMatchObject({ code: 'COLLECTION_TAGS_RESPONSE_INVALID' });
    expect(availableTags).not.toHaveBeenCalled();
    expect(tty.selectQuestion).not.toHaveBeenCalled();
  });

  it.each([
    null, {}, { data: [] }, { ret: '0', errCode: 0, data: [] }, { ret: 0, errCode: '0', data: [] },
    { ret: 1, errCode: 0, data: [] }, { ret: 0, errCode: 9, data: [] }, { ret: 0, errCode: 0, data: {} },
    { ret: 0, errCode: 0, data: [{ tagId: '', tagName: '名称', tagType: 1 }] },
    { ret: 0, errCode: 0, data: [{ tagId: 'id', tagName: '名称', tagType: 3 }] },
    { ret: 0, errCode: 0, data: [{ tagId: 'id', tagName: '名称', tagType: 1, tagNote: 3 }] },
  ])('推荐信封或单条结构无效%#时固定拒绝、不重试/询问', async (response) => {
    const availableTags = vi.fn(async () => response);
    await expect(editCollectionTags({ current: [], resourceTypeCode: 'T', availableTags })).rejects.toMatchObject({ code: 'COLLECTION_TAGS_RESPONSE_INVALID' });
    expect(availableTags).toHaveBeenCalledOnce();
    expect(tty.selectQuestion).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'select-ctrl-c', 'input-ctrl-c'])('取消%s固定FORM_CANCELLED且不泄露异常', async (mode) => {
    const secret = 'SYNTHETIC_PROMPT_DIAGNOSTIC';
    if (mode === 'cancel') vi.mocked(tty.selectQuestion).mockResolvedValueOnce('cancel');
    if (mode === 'select-ctrl-c') vi.mocked(tty.selectQuestion).mockRejectedValueOnce(Object.assign(new Error(secret), { name: 'ExitPromptError' }));
    if (mode === 'input-ctrl-c') {
      vi.mocked(tty.selectQuestion).mockResolvedValueOnce('custom');
      vi.mocked(tty.askInput).mockRejectedValueOnce(Object.assign(new Error(secret), { name: 'AbortPromptError' }));
    }
    const failure = await editCollectionTags({ current: [], resourceTypeCode: 'T', availableTags: available() }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'FORM_CANCELLED' });
    expect(String(failure)).not.toContain(secret);
  });

  it('推荐读取异常固定错误且不泄露原始诊断', async () => {
    const availableTags = vi.fn(async () => { throw new Error('SYNTHETIC_RECOMMENDATION_DIAGNOSTIC'); });
    const failure = await editCollectionTags({ current: [], resourceTypeCode: 'T', availableTags }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'COLLECTION_TAGS_RESPONSE_INVALID' });
    expect(String(failure)).not.toContain('SYNTHETIC_RECOMMENDATION_DIAGNOSTIC');
    expect(availableTags).toHaveBeenCalledOnce();
  });

  it('非取消提示异常使用固定失败码且不泄露诊断', async () => {
    vi.mocked(tty.selectQuestion).mockRejectedValueOnce(new Error('SYNTHETIC_PROMPT_DIAGNOSTIC'));
    const failure = await editCollectionTags({ current: [], resourceTypeCode: 'T', availableTags: available() }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'COLLECTION_TAGS_PROMPT_FAILED' });
    expect(String(failure)).not.toContain('SYNTHETIC_PROMPT_DIAGNOSTIC');
  });

  it('本轮菜单之外的选择不能被解释为添加或完成', async () => {
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('add:900');
    await expect(editCollectionTags({ current: [], resourceTypeCode: 'T', availableTags: available() }))
      .rejects.toMatchObject({ code: 'COLLECTION_TAGS_SELECTION_INVALID' });
  });

  it('显示转义控制/格式字符，提交保留原业务文字', async () => {
    const name = '标签\u001b\u202e';
    const availableTags = vi.fn(async () => ({ ret: 0, errCode: 0, data: [{ tagId: 'id', tagName: name, tagType: 1, tagNote: '说明\n\u202e' }] }));
    vi.mocked(tty.selectQuestion).mockResolvedValueOnce('add:0').mockResolvedValueOnce('done');
    await expect(editCollectionTags({ current: [], resourceTypeCode: 'T', availableTags })).resolves.toEqual([name]);
    const promptText = vi.mocked(tty.selectQuestion).mock.calls.map(([message, choices]) => `${message}${choices.map((item) => item.name).join('')}`).join('');
    expect(/[\u001b\u202e]/.test(promptText)).toBe(false);
  });
});
