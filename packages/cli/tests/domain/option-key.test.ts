import { describe, expect, it } from 'vitest';
import { normalizeEditedOptionKey, normalizeOptionKey } from '../../src/domain/version/form/optionKey';

describe('Console可选配置持久化键', () => {
  it.each([
    ['theme', 'options_theme'], ['options_theme', 'options_theme'],
    ['my_options_theme', 'options_my_options_theme'],
    ['1', 'options_1'], ['_', 'options__'],
    ['a'.repeat(22), `options_${'a'.repeat(22)}`],
  ])('新建 %s → %s', (input, expected) => {
    expect(normalizeOptionKey(input)).toBe(expected);
    expect(normalizeOptionKey(expected)).toBe(expected);
  });
  it.each(['', 'options_', 'a'.repeat(23), `options_${'a'.repeat(23)}`, 'a-b', 'a b', '中文'])('拒绝空后缀、超长或非法键 %s', (key) => {
    expect(() => normalizeOptionKey(key)).toThrow();
  });
  it.each([
    ['theme', 'options_theme'], ['options_theme', 'options_theme'],
    ['my_options_theme', 'options_my_theme'], ['options_options_theme', 'options_options_theme'],
  ])('显式编辑遵循Console已有键转换 %s → %s', (key, expected) => {
    expect(normalizeEditedOptionKey(key)).toBe(expected);
  });
});
