import { describe, expect, it } from 'vitest';
import {
  normalizePolicyTemplate,
  parseTemplateParam,
  renderTemplateReport,
  resolveTemplateValues,
  templateJson,
  compilePolicyTemplate,
} from '../../src/domain/policy/template';

function rawTemplate() {
  return {
    _id: 'template-paid',
    title: '按时长授权',
    compileType: 'normal',
    policyReport: '支付 ${price} 元，可使用 ${duration} ${unit}。',
    policyReportText: '按金额与时长授权',
    policyReportUiTemplate: [
      { id: 'price', uiSectionType: 'number', uiSectionDefaultValue: 9.9 },
      { id: 'duration', uiSectionType: 'number', uiSectionDefaultValue: 30 },
      {
        id: 'unit', uiSectionType: 'select', uiSectionDefaultValue: 'day',
        selectOptions: [{ value: 'day', label: '天' }, { value: 'month', label: '月' }],
      },
    ],
  };
}

describe('参数化策略模板描述符', () => {
  it('保留字段顺序作为槽位，渲染可读说明且 JSON 不泄露内部 field id 或 DSL', () => {
    const template = normalizePolicyTemplate(rawTemplate());
    expect(template.fields.map((field) => field.slot)).toEqual([1, 2, 3]);
    expect(renderTemplateReport(template, new Map<number, string | number>([[1, 10], [2, 7], [3, 'month']]))).toBe('支付 [1: 10] 元，可使用 [2: 7] [3: 月]。');
    const json = JSON.stringify(templateJson(template));
    expect(json).toContain('"slot":1');
    expect(json).not.toContain('fieldId');
    expect(json).not.toContain('policyText');
  });

  it('脚本参数必须完整且 select 只能使用 value', () => {
    const template = normalizePolicyTemplate(rawTemplate());
    expect(() => resolveTemplateValues(template, [{ slot: 1, value: '10' }], true)).toThrow(/每个参数/);
    expect(() => resolveTemplateValues(template, [
      { slot: 1, value: '10' }, { slot: 2, value: '7' }, { slot: 3, value: '月' },
    ], true)).toThrow(/option|value/);
    expect(resolveTemplateValues(template, [
      { slot: 1, value: '10' }, { slot: 2, value: '7' }, { slot: 3, value: 'month' },
    ], true).get(3)).toBe('month');
  });

  it('复用 Console 的金额与相对时长数字约束', () => {
    const template = normalizePolicyTemplate({
      ...rawTemplate(),
      policyReport: '授权 ${time.Relative} 天',
      policyReportUiTemplate: [{ id: 'time.Relative', uiSectionType: 'number', uiSectionDefaultValue: 1 }],
    });
    expect(() => resolveTemplateValues(template, [{ slot: 1, value: '0.5' }], true)).toThrow(/不能小于/);
    expect(() => resolveTemplateValues(template, [{ slot: 1, value: '1.1' }], true)).toThrow(/最多保留 0 位/);
    expect(resolveTemplateValues(template, [{ slot: 1, value: '2' }], true).get(1)).toBe(2);
  });

  it('保留平台内置说明变量，但拒绝看不见的 UI 字段和未知 UI 类型', () => {
    const reserved = normalizePolicyTemplate({
      ...rawTemplate(),
      policyReport: '支付 ${price}，${internal} 由平台处理。',
      policyReportUiTemplate: [{ id: 'price', uiSectionType: 'number', uiSectionDefaultValue: 9.9 }],
    });
    expect(renderTemplateReport(reserved, new Map([[1, 10]]))).toContain('[平台内置参数]');
    expect(() => normalizePolicyTemplate({ ...rawTemplate(), policyReport: '没有可编辑参数' })).toThrow(/未出现在说明/);
    expect(() => normalizePolicyTemplate({
      ...rawTemplate(), policyReportUiTemplate: [{ id: 'price', uiSectionType: 'text', uiSectionDefaultValue: 'x' }],
    })).toThrow(/不受支持/);
  });

  it('兼容 Console 的带引号默认值，并严格拒绝不存在的日期', () => {
    const selected = normalizePolicyTemplate({
      ...rawTemplate(),
      policyReport: '使用 ${unit}',
      policyReportUiTemplate: [{
        id: 'unit', uiSectionType: 'select', uiSectionDefaultValue: '"day"',
        selectOptions: [{ value: 'day', label: '天' }],
      }],
    });
    expect(selected.fields[0]?.defaultValue).toBe('day');
    const datetime = normalizePolicyTemplate({
      ...rawTemplate(), policyReport: '截至 ${deadline}',
      policyReportUiTemplate: [{ id: 'deadline', uiSectionType: 'datetime', uiSectionDefaultValue: '2026-01-01 00:00' }],
    });
    expect(() => resolveTemplateValues(datetime, [{ slot: 1, value: '2026-02-30 00:00' }], true)).toThrow(/有效日期/);
  });

  it('保留 Console 也会要求编辑的无效默认值模板，而不是让整个目录不可用', () => {
    const template = normalizePolicyTemplate({
      ...rawTemplate(),
      policyReport: '支付 ${price} 元',
      policyReportUiTemplate: [{ id: 'price', uiSectionType: 'number', uiSectionDefaultValue: 0 }],
    });
    expect(template.fields[0]?.defaultValue).toBeUndefined();
    expect(templateJson(template).parameters).toEqual([{
      slot: 1, type: 'number', required: true, numberRule: { min: 0.01, precision: 2 }, options: [],
    }]);
    expect(renderTemplateReport(template, new Map())).toContain('[1: 未填写]');
    expect(() => resolveTemplateValues(template, [], false)).toThrow(/没有可用默认值/);
    expect(resolveTemplateValues(template, [{ slot: 1, value: '1' }], false).get(1)).toBe(1);
  });

  it('重复 --param 在命令行解析后仍由领域层拒绝，值可保留等号', () => {
    expect(parseTemplateParam('2=a=b')).toEqual({ slot: 2, value: 'a=b' });
    expect(() => parseTemplateParam('2=')).toThrow(/格式/);
  });

  it('将平台编译失败转为稳定的 CLI 错误，而不泄露未捕获异常栈', async () => {
    const template = normalizePolicyTemplate({
      ...rawTemplate(), policyReport: '永久授权', policyReportUiTemplate: [],
    });
    await expect(compilePolicyTemplate({
      template, params: [], requireEveryParam: true,
      reCompile: async () => { throw new Error('编译结果存在错误'); },
      translate: async () => ({ data: '不会调用' }),
    })).rejects.toMatchObject({ code: 'POLICY_TEMPLATE_COMPILE_FAILED', message: '策略模板编译失败：编译结果存在错误' });
  });

  it('按 Console 协议将编译正文规整并 Base64 编码后才请求翻译', async () => {
    const template = normalizePolicyTemplate({
      ...rawTemplate(), policyReport: '永久授权', policyReportUiTemplate: [],
    });
    let translationRequest: { policyText: string; compileType: string } | undefined;
    await compilePolicyTemplate({
      template, params: [], requireEveryParam: true,
      reCompile: async () => ({ data: { policyTextNew: 'FOR PUBLIC\r\n\tInitial:\n terminate' } }),
      translate: async (input) => {
        translationRequest = input;
        return { data: '永久授权' };
      },
    });
    expect(translationRequest).toEqual({
      policyText: Buffer.from('FOR PUBLIC \n Initial:\n terminate', 'utf8').toString('base64'),
      compileType: 'normal',
    });
  });
});
