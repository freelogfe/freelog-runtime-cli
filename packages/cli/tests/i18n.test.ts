import { describe, expect, it } from 'vitest';
import { bootstrapCliI18nSync, setCliLocale, t, I18N_KEYS } from '../src/i18n/index.js';
import { coverConstraintHint } from '../src/i18n/index.js';
import { plainTextFromRichI18n } from '../src/i18n/plainText.js';
import { loadPersistedLocale, persistCliLocale } from '../src/i18n/localeConfig.js';
import { assertResourceTitle } from '../src/services/validation.js';
import { assertLocalCoverFile } from '../src/services/coverUpload.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

bootstrapCliI18nSync(['node', 'vitest', '--lang', 'zh_CN']);

describe('plainTextFromRichI18n', () => {
  it('strips i18n HTML div and keeps link text', () => {
    const html =
      '<div class="i18n">请先<a href="/help">添加策略</a>，再上架。</div>';
    expect(plainTextFromRichI18n(html)).toBe('请先添加策略，再上架。');
  });

  it('converts br to newline', () => {
    expect(plainTextFromRichI18n('第一行<br/>第二行')).toBe('第一行\n第二行');
  });
});

describe('cli i18n', () => {
  it('zh_CN matches Console OSS for title required', () => {
    expect(t(I18N_KEYS.naming_convention_resource_title_required)).toBe('请输入资源标题');
  });

  it('zh_CN title max matches Console hardcoded', () => {
    expect(t(I18N_KEYS.cli_title_exceeds_100_chars)).toBe('不超过100个字符');
  });

  it('cover hint matches upload_image_info_resource_image', () => {
    const hint = coverConstraintHint();
    expect(hint).toContain('800px');
    expect(hint).toContain('GIF');
  });

  it('en_US fallback from bundled', () => {
    setCliLocale('en_US');
    expect(t(I18N_KEYS.naming_convention_resource_title_required)).toBe('Please enter a title');
    expect(t(I18N_KEYS.brr_resourcelisting_complete_confirm_msg, { qty: '3' })).toContain('3');
    setCliLocale('zh_CN');
  });

  it('en_US core error keys are readable (spot 10)', () => {
    setCliLocale('en_US');
    const spots: Array<[keyof typeof I18N_KEYS, RegExp]> = [
      ['naming_convention_resource_title_required', /title/i],
      ['freelog_versioning', /version/i],
      ['brr_submitresource_alert_limitation', /20|upload/i],
      ['submitresource_err_resourceexist_sameuser', /released/i],
      ['create_new_version_error_unknowsubject', /subject|operation/i],
      ['intro_max_1000', /1000|intro/i],
      ['tag_empty', /tag/i],
      ['cli_auth_id_empty', /auth|identifier/i],
      ['additem_alert_qtylimit', /100|limit/i],
      ['confirm_msg_remove_resource_from_auth', /remove|offline|shelf/i],
    ];
    for (const [key, pattern] of spots) {
      expect(t(I18N_KEYS[key]), key).toMatch(pattern);
    }
    setCliLocale('zh_CN');
  });
});

describe('validation with i18n', () => {
  it('throws Console-aligned title message', () => {
    setCliLocale('zh_CN');
    expect(() => assertResourceTitle('', true)).toThrow(/请输入资源标题/);
    expect(() => assertResourceTitle('x'.repeat(101), true)).toThrow(/不超过100个字符/);
  });
});

describe('cover with i18n', () => {
  it('uses limit_resource_image_size text', () => {
    setCliLocale('zh_CN');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-i18n-'));
    const big = path.join(dir, 'big.jpg');
    fs.writeFileSync(big, Buffer.alloc(5 * 1024 * 1024 + 1));
    expect(() => assertLocalCoverFile(big)).toThrow(/图片不能超过5M/);
  });
});
