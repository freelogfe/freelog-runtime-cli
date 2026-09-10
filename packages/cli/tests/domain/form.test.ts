import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attrAdd, attrReview, attrReviewDiscard, attrRm, attrSet } from '../../src/domain/version/form/attr';
import { optionAdd, optionRm, optionSet } from '../../src/domain/version/form/option';
import { assertKeyUnchanged, parseLine } from '../../src/domain/version/form/parseLine';
import { previewLine } from '../../src/domain/version/form/preview';
import { createIdentity } from '../../src/local/identity';
import { readDraft, writeDraft } from '../../src/local/draft';

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
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-t72-'));
    createIdentity(cwd, { subject: 'resource', resourceId: 'res_a', name: 'a', typeCode: 'VIDEO', filePath: 'a.mp4' });
  });

  afterEach(() => {
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
    await attrSet(cwd, { line: '键=width 值=1', yes: true });
    expect(readDraft(cwd, 1)?.inputAttrs?.[0]).toMatchObject({ key: 'width', value: '1' });
    expect(attrRm(cwd, 'author')).toBe('author');
    expect(readDraft(cwd, 1)?.customPropertyDescriptors ?? []).toHaveLength(0);
  });

  it('option 类型不支持失败；支持时可 set / rm', async () => {
    await expect(
      optionAdd(cwd, { line: '名称=主题 键=theme 方式=文本 默认=dark', yes: true, supportOptionalConfig: false }),
    ).rejects.toMatchObject({ message: '当前类型不支持可选配置' });

    await optionAdd(cwd, {
      line: '名称=主题 键=theme 方式=文本 默认=dark',
      yes: true,
      supportOptionalConfig: true,
    });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]).toMatchObject({
      key: 'theme',
      type: 'editableText',
      defaultValue: 'dark',
    });
    await optionSet(cwd, { line: '键=theme 默认=light', yes: true });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]?.defaultValue).toBe('light');
    expect(optionRm(cwd, 'theme')).toBe('theme');
  });

  it('下拉配置修改候选时默认始终重置为第一项，不能写任意默认值', async () => {
    await optionAdd(cwd, {
      line: '名称=语言 键=lang 方式=下拉 选项=中文|English',
      yes: true,
      supportOptionalConfig: true,
    });
    await expect(optionSet(cwd, { line: '键=lang 默认=English', yes: true }))
      .rejects.toMatchObject({ code: 'OPTION_SELECT_DEFAULT' });
    await optionSet(cwd, { line: '键=lang 方式=下拉 选项=English|中文 说明=语言', yes: true });
    expect(readDraft(cwd, 1)?.customPropertyDescriptors?.[0]).toMatchObject({
      type: 'select', candidateItems: ['English', '中文'], defaultValue: 'English', remark: '语言',
    });
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
