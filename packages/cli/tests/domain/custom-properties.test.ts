import { describe, expect, it } from 'vitest';
import { assertCustomPropertyDescriptors } from '../../src/domain/version/form/customProperties';

const custom = { key: 'author', name: '作者', type: 'readonlyText', defaultValue: '', remark: '' };
const option = { key: 'layout', name: '布局', type: 'select', defaultValue: 'drawer', candidateItems: ['drawer', 'vertical'] };

describe('手改工作稿仍遵守自定义/可选配置约束', () => {
  it('保留空值、合法边界与两类列表，校验不修改输入', () => {
    const values = [{ ...custom, candidateItems: [] }, option, { key: 'text', name: '文案', type: 'editableText', defaultValue: '字'.repeat(140), candidateItems: [] }];
    const before = JSON.stringify(values);
    expect(() => assertCustomPropertyDescriptors(values)).not.toThrow();
    expect(JSON.stringify(values)).toBe(before);
  });
  it.each([
    [custom, { ...custom, name: '另一名称' }],
    [custom, { ...custom, key: 'other' }],
    [{ ...custom, key: 'bad-key' }],
    [{ ...custom, name: ' ' }],
    [{ ...custom, name: '名'.repeat(51) }],
    [{ ...custom, remark: '说'.repeat(51) }],
    [{ ...custom, defaultValue: '字'.repeat(141) }],
    [{ ...custom, defaultValue: 0 }],
    [{ ...custom, type: 'unknown' }],
    [{ ...custom, candidateItems: ['unexpected'] }],
    [{ ...option, defaultValue: 'vertical' }],
    [{ ...option, candidateItems: ['drawer', 'drawer'] }],
    [{ ...option, candidateItems: [] }],
    [{ ...option, candidateItems: ['drawer', ' '] }],
    [{ ...option, candidateItems: ['drawer', 0] }],
    [{ ...option, candidateItems: ['drawer', '字'.repeat(141)] }],
    Array.from({ length: 31 }, (_, i) => ({ ...custom, key: `field${i}`, name: `属性${i}` })),
    Array.from({ length: 31 }, (_, i) => ({ ...option, key: `field${i}`, name: `配置${i}` })),
  ])('拒绝错误列表 %#', (...items) => {
    expect(() => assertCustomPropertyDescriptors(items)).toThrow();
  });
});
