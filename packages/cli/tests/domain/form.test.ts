import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attrAdd, attrReview, attrReviewDiscard, attrRm, attrSet } from '../../src/domain/version/form/attr';
import { optionAdd, optionRm, optionSet } from '../../src/domain/version/form/option';
import { assertKeyUnchanged, parseLine } from '../../src/domain/version/form/parseLine';
import { previewLine } from '../../src/domain/version/form/preview';
import { createIdentity } from '../../src/local/identity';
import { readDraft, writeDraft } from '../../src/local/draft';
import { FServiceAPI } from '../../src/platform/api';
import { sseResult } from '../helpers/sse';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import * as tty from '../../src/core/tty';
import { CliError } from '../../src/core/errors';

vi.mock('../../src/platform/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/platform/api')>();
  return { ...original, FServiceAPI: { ...original.FServiceAPI,
    Resource: { ...original.FServiceAPI.Resource }, Storage: { ...original.FServiceAPI.Storage },
  } };
});

describe('T7.1 一行式与预览', () => {
  it('解析、键不能改、预览文本稳定', () => {
    const parsed = parseLine('名称=作者 键=author 说明=作品作者 值=张三');
    expect(parsed).toMatchObject({
      name: '作者',
      key: 'author',
      remark: '作品作者',
      value: '张三',
    });
    expect(previewLine(parsed)).toBe(
      '预览：\n  名称=作者\n  键=author\n  说明=作品作者\n  值=张三',
    );
    expect(() => assertKeyUnchanged('author', 'writer')).toThrow('键不能改');
    expect(parseLine('名称="作品 作者" 键=author 值="张\\"三"')).toMatchObject({
      name: '作品 作者', key: 'author', value: '张"三',
    });
    expect(() => parseLine('键=author 键=writer')).toThrow(/字段重复/);
    expect(() => parseLine('未知=value')).toThrow(/不支持字段/);
  });
});

describe('T7.2 attr / option', () => {
  let cwd: string;

  beforeEach(() => {
    applyCliEnv({ flag: 'test' });
    vi.spyOn(FServiceAPI.Resource, 'getResourceTypeInfoByCode').mockResolvedValue({ data: { attrs: [] } } as never);
    vi.spyOn(FServiceAPI.Storage, 'filesListInfoSse').mockImplementation(sseResult({ metaAnalyzeStatus: 2, metaInfoArray: [] }) as never);
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t72-'));
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_a', name: 'a', typeCode: 'VIDEO', filePath: 'a.mp4' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetEnvForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  it('attr 写稿后能 list / rm；改附加须 fileSha1', async () => {
    const preview = await attrAdd(cwd, { line: '名称=作者 键=author 值=张三', yes: true });
    expect(preview).toContain('预览：');
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]?.key).toBe('author');
    await expect(attrSet(cwd, { line: '键=width 值=1', yes: true })).rejects.toMatchObject({
      code: 'ATTR_NEED_FILE',
    });
    writeDraft(cwd, 1, { ...readDraft(cwd, 1)!, fileSha1: 'abc', filename: 'clip.mp4', analyzedSha1: 'abc' });
    await attrSet(cwd, {
      line: '键=width 值=1', yes: true,
      apis: {
        filesListInfoSse: sseResult({ metaAnalyzeStatus: 2, metaInfoArray: [{ key: 'width', name: '宽度', insertMode: 2 }] }),
        getAttrsInfoByKey: async () => ({ data: { key: 'width', format: 8, contentRule: { min: 0, max: 4096 } } }),
      },
    });
    expect(readDraft(cwd, 1)?.inputAttrs?.[0]).toMatchObject({ key: 'width', value: '1' });
    expect(attrRm(cwd, 'author')).toBe('author');
    expect(readDraft(cwd, 1)?.customPropertyDescriptors ?? []).toHaveLength(0);
  });

  it('option 类型不支持时 add / set 都失败，rm 仍可清理遗留项；支持时可 set', async () => {
    await expect(
      optionAdd(cwd, { line: '名称=主题 键=theme 方式=文本 默认=dark', yes: true, supportOptionalConfig: false }),
    ).rejects.toMatchObject({ message: '当前类型不支持可选配置' });

    await optionAdd(cwd, {
      line: '名称=主题 键=theme 方式=文本 默认=dark',
      yes: true,
      supportOptionalConfig: true,
    });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]).toMatchObject({
      key: 'options_theme',
      type: 'editableText',
      defaultValue: 'dark',
    });
    await expect(optionSet(cwd, {
      line: '键=options_theme 默认=light', yes: true, supportOptionalConfig: false,
    })).rejects.toMatchObject({ code: 'OPTION_UNSUPPORTED' });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]?.defaultValue).toBe('dark');
    await optionSet(cwd, { line: '键=options_theme 默认=light', yes: true, supportOptionalConfig: true });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]?.defaultValue).toBe('light');
    expect(optionRm(cwd, 'options_theme')).toBe('options_theme');
  });

  it.each(['theme', 'options_theme', 'my_options_theme', '1theme', '_theme', 'a'.repeat(22)])('新建可选配置保存Console完整键 %s', async (key) => {
    await optionAdd(cwd, { line: `名称=主题 键=${key} 方式=文本 默认=dark`, yes: true, supportOptionalConfig: true });
    const canonical = key.startsWith('options_') ? key : `options_${key}`;
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]?.key).toBe(canonical);
  });

  it.each(['options_theme', 'options_my_options_theme', `options_${'a'.repeat(22)}`])('修改配置值保留完整键 %s', async (key) => {
    await optionAdd(cwd, { line: `名称=主题 键=${key} 方式=文本 默认=dark`, yes: true, supportOptionalConfig: true });
    const before = readDraft(cwd, 1)!;
    await optionSet(cwd, { line: `键=${key} 默认=light`, yes: true, supportOptionalConfig: true });
    expect(readDraft(cwd, 1)).toEqual({
      ...before,
      customPropertyDescriptors: before.customPropertyDescriptors!.map(item => ({ ...item, defaultValue: 'light' })),
    });
  });

  it('下拉配置修改候选时默认始终重置为第一项，不能写任意默认值', async () => {
    await optionAdd(cwd, {
      line: '名称=语言 键=lang 方式=下拉 选项=中文|English',
      yes: true,
      supportOptionalConfig: true,
    });
    await expect(optionSet(cwd, { line: '键=options_lang 默认=English', yes: true, supportOptionalConfig: true }))
      .rejects.toMatchObject({ code: 'OPTION_SELECT_DEFAULT' });
    await optionSet(cwd, { line: '键=options_lang 方式=下拉 选项=English|中文 说明=语言', yes: true, supportOptionalConfig: true });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]).toMatchObject({
      type: 'select', candidateItems: ['English', '中文'], defaultValue: 'English', remark: '语言',
    });
  });

  it('明确编辑旧配置时转换键，预览原/新键，其它旧项及属性保持不变', async () => {
    const author = { key: 'author', name: '作者', type: 'readonlyText', defaultValue: 'A' };
    const other = { key: 'other', name: '其它', type: 'editableText', defaultValue: 'B' };
    writeDraft(cwd, 1, { customPropertyDescriptors: [author, other,
      { key: 'my_options_theme', name: '主题', type: 'editableText', defaultValue: 'dark' },
    ], baseUpcastResources: [], authExcludedItems: [] });
    const preview = await optionSet(cwd, { line: '键=my_options_theme 默认=light', yes: true, supportOptionalConfig: true });
    expect(preview).toContain('my_options_theme → options_my_theme');
    expect(readDraft(cwd, 1)?.customPropertyDescriptors).toEqual([author, other,
      { key: 'options_my_theme', name: '主题', type: 'editableText', defaultValue: 'light' },
    ]);
  });

  it('修改必须给现有完整键，名称或错误短键不替代定位', async () => {
    await optionAdd(cwd, { line: '名称=主题 键=theme 方式=文本 默认=dark', yes: true, supportOptionalConfig: true });
    const before = readFileSync(path.join(cwd, '.freelog/1.version.json'), 'utf8');
    await expect(optionSet(cwd, { line: '名称=主题 默认=light', yes: true, supportOptionalConfig: true }))
      .rejects.toMatchObject({ code: 'OPTION_KEY_REQUIRED' });
    await expect(optionSet(cwd, { line: '名称=主题 键=theme 默认=light', yes: true, supportOptionalConfig: true }))
      .rejects.toMatchObject({ code: 'OPTION_NOT_FOUND' });
    expect(readFileSync(path.join(cwd, '.freelog/1.version.json'), 'utf8')).toBe(before);
  });

  it('完整键冲突、系统冲突或取消均保留工作稿原字节', async () => {
    writeDraft(cwd, 1, { customPropertyDescriptors: [
      { key: 'theme', name: '旧配置', type: 'editableText', defaultValue: 'dark' },
      { key: 'options_theme', name: '属性', type: 'readonlyText', defaultValue: 'keep' },
    ], baseUpcastResources: [], authExcludedItems: [] });
    const bytes = () => readFileSync(path.join(cwd, '.freelog/1.version.json'), 'utf8');
    const before = bytes();
    await expect(optionAdd(cwd, { line: '名称=新配置 键=theme 方式=文本 默认=x', yes: true, supportOptionalConfig: true }))
      .rejects.toMatchObject({ code: 'OPTION_DUPLICATE' });
    await expect(optionSet(cwd, { line: '键=theme 默认=x', yes: true, supportOptionalConfig: true }))
      .rejects.toMatchObject({ code: 'OPTION_DUPLICATE' });
    await expect(optionAdd(cwd, { line: '名称=系统冲突 键=system 方式=文本 默认=x', yes: true, supportOptionalConfig: true,
      apis: { getByCode: async () => ({ data: { attrs: [{ key: 'options_system', name: '系统项', insertMode: 1 }] } }) },
    })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_CONFLICT' });
    expect(bytes()).toBe(before);
    vi.spyOn(tty, 'confirmWrite').mockRejectedValue(new CliError('已取消', 'CONFIRM_CANCELLED'));
    await expect(optionAdd(cwd, { line: '名称=取消 键=cancel 方式=文本 默认=x', supportOptionalConfig: true }))
      .rejects.toMatchObject({ code: 'CONFIRM_CANCELLED' });
    expect(bytes()).toBe(before);
  });

  it('待复核附加属性可查看并经确认逐项丢弃', async () => {
    writeDraft(cwd, 1, {
      orphanedInputAttrs: [{ key: 'removed-by-analysis', value: 'old-value' }],
      baseUpcastResources: [], authExcludedItems: [],
    });
    expect(attrReview(cwd)).toContain('removed-by-analysis=old-value');
    await expect(attrReviewDiscard(cwd, { key: 'unknown', yes: true })).rejects.toMatchObject({
      code: 'ATTR_REVIEW_NOT_FOUND',
    });
    await expect(attrReviewDiscard(cwd, { key: 'removed-by-analysis' })).rejects.toMatchObject({
      code: 'DRAFT_DESTRUCTIVE_NEED_YES',
    });
    await attrReviewDiscard(cwd, { key: 'removed-by-analysis', yes: true });
    expect(attrReview(cwd)).toBe('没有待复核的附加属性');
  });
});
