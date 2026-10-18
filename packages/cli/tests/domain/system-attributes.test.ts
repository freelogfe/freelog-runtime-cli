import { describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/core/errors';
import {
  assertNoSystemAttributeConflict,
  assertSystemAttributeValue,
  loadAttributeNamespace,
  loadSystemAttributes,
  reconcileInputAttrs,
  restoreVersionInputAttrs,
  type SystemAttribute,
} from '../../src/domain/version/systemAttributes';

function attribute(format: number, contentRule: Record<string, unknown> = {}): SystemAttribute {
  return { key: 'field', name: '附加字段', insertMode: 2, definition: { key: 'field', format, contentRule } };
}

describe('系统属性规则：与 Console 实际字段格式对齐，但不复制宽松解析和零值丢失', () => {
  it.each([4, 5, 6, 7, 8, 9, 10])('format %s 允许显式空串清空', (format) => {
    expect(() => assertSystemAttributeValue(attribute(format), '')).not.toThrow();
  });

  it('日期严格检查真实日历、闰年与包含式边界', () => {
    const attr = attribute(4, { startDate: '2024-02-28', limitDate: '2024-03-01' });
    for (const value of ['2024-02-28', '2024-02-29', '2024-03-01']) {
      expect(() => assertSystemAttributeValue(attr, value)).not.toThrow();
    }
    for (const value of ['2024-02-27', '2024-03-02', '2023-02-29', '2024-02-30', '2024-2-29', 'not-date']) {
      expect(() => assertSystemAttributeValue(attr, value)).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_VALUE' }));
    }
    expect(() => assertSystemAttributeValue(attribute(4), '0999-12-31')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(4), '1900-02-29')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(4), '2000-02-29')).not.toThrow();
  });

  it('日期时间验证真实日期、完整时分秒、时间边界', () => {
    const attr = attribute(5, { startDateTime: '2026-10-15 01:02:03', limitDateTime: '2026-10-15 23:59:59' });
    for (const value of ['2026-10-15 01:02:03', '2026-10-15 23:59:59']) {
      expect(() => assertSystemAttributeValue(attr, value)).not.toThrow();
    }
    for (const value of ['2026-10-15 01:02:02', '2026-10-16 00:00:00', '2026-10-15 24:00:00', '2026-02-30 12:00:00', '2026-10-15 12:60:00', '2026-10-15 12:00:60', '2026-10-15']) {
      expect(() => assertSystemAttributeValue(attr, value)).toThrow();
    }
  });

  it.each([6, 7])('format %s 校验字符长度，保留 maxLength=0，默认上限 140', (format) => {
    expect(() => assertSystemAttributeValue(attribute(format, { minLength: 2, maxLength: 3 }), '你好')).not.toThrow();
    expect(() => assertSystemAttributeValue(attribute(format, { minLength: 2 }), 'a')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(format), 'a'.repeat(141))).toThrow();
    expect(() => assertSystemAttributeValue(attribute(format, { maxLength: 0 }), 'a')).toThrow();
  });

  it('单行文本拒绝换行，多行文本允许换行', () => {
    expect(() => assertSystemAttributeValue(attribute(6), 'a\nb')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(7), 'a\nb')).not.toThrow();
  });

  it('整数完整匹配、安全整数、Console 界限和零边界', () => {
    for (const value of ['0', '-1', '99999999999', '-99999999999']) {
      expect(() => assertSystemAttributeValue(attribute(8), value)).not.toThrow();
    }
    for (const value of ['1suffix', '1.0', '1e2', '0x10', ' 1', '1 ', 'Infinity', '100000000000', '9007199254740993']) {
      expect(() => assertSystemAttributeValue(attribute(8), value)).toThrow();
    }
    expect(() => assertSystemAttributeValue(attribute(8, { min: 0, max: 0 }), '0')).not.toThrow();
    expect(() => assertSystemAttributeValue(attribute(8, { min: 0 }), '-1')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(8, { max: 0 }), '1')).toThrow();
  });

  it('小数完整匹配、有限数字、区间与精度，不截断输入', () => {
    const attr = attribute(9, { minDecimal: -1, maxDecimal: 1, precision: 2 });
    for (const value of ['-1', '0', '0.01', '1.00']) expect(() => assertSystemAttributeValue(attr, value)).not.toThrow();
    for (const value of ['-1.01', '1.01', '0.001', '1.2abc', '1e2', 'NaN', 'Infinity', '.1', '1.']) {
      expect(() => assertSystemAttributeValue(attr, value)).toThrow();
    }
    expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: 0, maxDecimal: 0, precision: 0 }), '0')).not.toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { precision: 0 }), '0.1')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { maxDecimal: 0 }), '0.1')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: 0 }), '-0.1')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9), '9'.repeat(400))).toThrow();
  });

  it('小数边界使用精确十进制比较，不能被浮点舍入绕过', () => {
    expect(() => assertSystemAttributeValue(attribute(9, { maxDecimal: 1, precision: 20 }), '1.000000000000000001')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: 1, precision: 20 }), '0.999999999999999999')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: -1, precision: 20 }), '-1.000000000000000001')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { maxDecimal: -1, precision: 20 }), '-0.999999999999999999')).toThrow();
    for (const value of ['1', '1.000000000000000000', '0001.0000']) {
      expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: 1, maxDecimal: 1, precision: 20 }), value)).not.toThrow();
    }
  });

  it('平台边界科学记数法和极小值均可精确比较，不做超大幂运算', () => {
    const small = attribute(9, { minDecimal: 1e-7, maxDecimal: 1e-7, precision: 30 });
    expect(() => assertSystemAttributeValue(small, '0.0000001')).not.toThrow();
    expect(() => assertSystemAttributeValue(small, '0.00000010000000000000000001')).toThrow();
    expect(() => assertSystemAttributeValue(small, '0.00000009999999999999999999')).toThrow();
    const large = attribute(9, { minDecimal: 1e21, maxDecimal: 1e21, precision: 2 });
    expect(() => assertSystemAttributeValue(large, '1000000000000000000000.00')).not.toThrow();
    expect(() => assertSystemAttributeValue(large, '1000000000000000000000.01')).toThrow();
    expect(() => assertSystemAttributeValue(large, '999999999999999999999.99')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: 0, maxDecimal: 0 }), `0.${'0'.repeat(400)}1`)).toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: 0, maxDecimal: 0 }), '-0.0000')).not.toThrow();
    expect(() => assertSystemAttributeValue(attribute(9, { minDecimal: Number.MIN_VALUE, maxDecimal: Number.MIN_VALUE }), `0.${'0'.repeat(323)}5`)).not.toThrow();
  });

  it('下拉只能选平台候选，不进行宽松类型转换', () => {
    expect(() => assertSystemAttributeValue(attribute(10, { allowedElements: ['vite', 'webpack'] }), 'vite')).not.toThrow();
    expect(() => assertSystemAttributeValue(attribute(10, { allowedElements: ['vite'] }), 'Vite')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(10), 'vite')).toThrow();
    expect(() => assertSystemAttributeValue(attribute(8), 0 as unknown as string)).toThrow();
  });

  it.each([0, 1, 3, 999])('insertMode %s 不能写入', (insertMode) => {
    expect(() => assertSystemAttributeValue({ ...attribute(6), insertMode }, '')).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_READONLY' }));
  });

  it.each([1, 2, 3, 11, 99])('未知/旧 format %s 仅只读', (format) => {
    expect(() => assertSystemAttributeValue(attribute(format), '')).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_READONLY' }));
  });

  it('系统键和名称都禁止重复，空 raw 同样保留冲突保护', () => {
    const attrs = [{ key: 'bundleTool', name: '打包工具', insertMode: 1, valueDisplay: '' }];
    expect(() => assertNoSystemAttributeConflict(attrs, { key: 'bundleTool' })).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_CONFLICT' }));
    expect(() => assertNoSystemAttributeConflict(attrs, { name: '打包工具' })).toThrow(/attr set/);
    expect(() => assertNoSystemAttributeConflict(attrs, { key: 'mine', name: '自定义' })).not.toThrow();
  });

  it('线上恢复仅使用真实 systemPropertyDescriptors，保留 0/false/空串', () => {
    expect(restoreVersionInputAttrs({ inputAttrs: [{ key: 'wrong', value: 'wrong' }] })).toEqual([]);
    expect(restoreVersionInputAttrs({ systemPropertyDescriptors: [
      { key: 'zero', insertMode: 2, valueDisplay: 0 },
      { key: 'bool', insertMode: 2, valueDisplay: false },
      { key: 'empty', insertMode: 2, valueDisplay: '' },
      { key: 'null', insertMode: 2, valueDisplay: null },
      { key: 'raw', insertMode: 1, valueDisplay: 'raw' },
    ] })).toEqual([
      { key: 'zero', value: '0' }, { key: 'bool', value: 'false' }, { key: 'empty', value: '' }, { key: 'null', value: '' },
    ]);
  });

  it('按当前完整规则保留、孤儿化与恢复，不仅按 key', () => {
    const invalid = { key: 'field', value: '9' };
    const tightened = attribute(8, { max: 5 });
    expect(reconcileInputAttrs({ inputAttrs: [invalid], attributes: [tightened] })).toEqual({ inputAttrs: [], orphanedInputAttrs: [invalid] });
    expect(reconcileInputAttrs({ orphanedInputAttrs: [invalid], attributes: [tightened] })).toEqual({ inputAttrs: [], orphanedInputAttrs: [invalid] });
    expect(reconcileInputAttrs({ orphanedInputAttrs: [invalid], attributes: [attribute(8, { max: 9 })] })).toEqual({ inputAttrs: [invalid], orphanedInputAttrs: [] });
    for (const attributes of [[], [{ ...attribute(8), insertMode: 1 }], [attribute(99)]]) {
      expect(reconcileInputAttrs({ inputAttrs: [invalid], attributes })).toEqual({ inputAttrs: [], orphanedInputAttrs: [invalid] });
    }
    expect(reconcileInputAttrs({ inputAttrs: [{ key: 'field', value: '' }], attributes: [tightened] }).inputAttrs).toEqual([{ key: 'field', value: '' }]);
  });

  it('当前输入优先于历史孤儿，同名旧值不能回滚当前用户选择', () => {
    expect(reconcileInputAttrs({ inputAttrs: [{ key: 'field', value: '2' }], orphanedInputAttrs: [{ key: 'field', value: '1' }], attributes: [attribute(8)] })).toEqual({ inputAttrs: [{ key: 'field', value: '2' }], orphanedInputAttrs: [] });
  });

  it('孤儿协调不能吞掉畸形平台规则，只捕获值和只读校验错误', () => {
    expect(() => reconcileInputAttrs({ inputAttrs: [{ key: 'field', value: '2' }], attributes: [attribute(8, { max: 'bad' })] })).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_LOAD' }));
  });
});

describe('系统属性读取只复用 tools-lib 协议，并拒绝平台错误和无效格式', () => {
  it.each([
    new Error('FAKE_AUTHORIZATION FAKE_COOKIE request URL'),
    { toString: () => { throw new Error('不应转换未知对象'); } },
  ])('类型请求未知异常不转抄原 message %#', async (failure) => {
    const getByCode = vi.fn(async () => { throw failure; });
    await expect(loadSystemAttributes({ typeCode: 'RT001', apis: { getByCode } })).rejects.toMatchObject({
      code: 'ATTR_SYSTEM_LOAD', message: '读取系统属性失败：请求失败',
    });
    expect(getByCode).toHaveBeenCalledTimes(1);
  });

  it('分析请求未知异常不转抄原 message，不重试', async () => {
    const filesListInfoSse = vi.fn(async () => { throw new Error('FAKE_AUTHORIZATION FAKE_COOKIE'); });
    await expect(loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', apis: { filesListInfoSse } })).rejects.toMatchObject({
      code: 'ATTR_SYSTEM_LOAD', message: '读取系统属性失败：文件分析请求失败',
    });
    expect(filesListInfoSse).toHaveBeenCalledTimes(1);
  });

  it('格式请求未知异常也只保留固定安全说明', async () => {
    const getAttrsInfoByKey = vi.fn(async () => { throw new Error('FAKE_PRIVATE_HTTP_MESSAGE'); });
    await expect(loadSystemAttributes({ typeCode: 'RT001', analysis: {
      metaInfoArray: [{ key: 'field', name: '字段', insertMode: 2 }],
    }, apis: { getAttrsInfoByKey } })).rejects.toMatchObject({
      code: 'ATTR_SYSTEM_LOAD', message: '读取系统属性失败：请求失败',
    });
    expect(getAttrsInfoByKey).toHaveBeenCalledTimes(1);
  });

  it('受控读取/分析错误保留错误码和恢复文案', async () => {
    const failure = new CliError('先核对原请求结果，不要重复执行', 'RESULT_UNKNOWN');
    await expect(loadSystemAttributes({ typeCode: 'RT001', apis: {
      getByCode: async () => { throw failure; },
    } })).rejects.toBe(failure);
    await expect(loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', apis: {
      filesListInfoSse: async () => { throw failure; },
    } })).rejects.toBe(failure);
  });

  it('无 SHA 从类型 attrs 读取保留键，不能编辑也不取附加格式', async () => {
    const getByCode = vi.fn(async () => ({ ret: 0, errCode: 0, data: { code: 'RT001', attrs: [{ key: 'bundleTool', name: '打包工具' }] } }));
    const getAttrsInfoByKey = vi.fn();
    expect(await loadSystemAttributes({ typeCode: 'RT001', apis: { getByCode, getAttrsInfoByKey } })).toEqual([{ key: 'bundleTool', name: '打包工具', insertMode: 0 }]);
    expect(getByCode).toHaveBeenCalledWith({ code: 'RT001' });
    expect(getAttrsInfoByKey).not.toHaveBeenCalled();
  });

  it('使用已提供的分析不重复 SSE，空 raw 保留；每个附加项取得定义', async () => {
    const filesListInfoSse = vi.fn();
    const getAttrsInfoByKey = vi.fn(async ({ key }: { key: string }) => ({ ret: 0, errCode: 0, data: { key, format: key === 'future' ? 99 : 10, contentRule: { allowedElements: ['vite'] } } }));
    const result = await loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', analysis: { metaInfoArray: [
      { key: 'raw', name: '原始', insertMode: 1, valueDisplay: '' },
      { key: 'bundleTool', name: '打包工具', insertMode: 2, valueDisplay: 'vite' },
      { key: 'future', name: '未知格式', insertMode: 2 },
    ] }, apis: { filesListInfoSse, getAttrsInfoByKey } });
    expect(filesListInfoSse).not.toHaveBeenCalled();
    expect(getAttrsInfoByKey).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ key: 'raw', valueDisplay: '' });
    expect(result[1]?.definition).toMatchObject({ key: 'bundleTool', format: 10 });
    expect(result[2]?.definition).toMatchObject({ key: 'future', format: 99 });
  });

  it('analysis 优先于 SHA，调用方已持有终态时不额外读取类型或重连', async () => {
    const getByCode = vi.fn();
    expect(await loadSystemAttributes({ typeCode: 'RT001', analysis: { metaInfoArray: [{ key: 'raw', name: '原始', insertMode: 1 }] }, apis: { getByCode } })).toEqual([{ key: 'raw', name: '原始', insertMode: 1 }]);
    expect(getByCode).not.toHaveBeenCalled();
  });

  it('冲突命名空间合并类型保留项与分析项，分析字段优先，隐藏空 raw 不丢失', async () => {
    const filesListInfoSse = vi.fn(async () => (async function* () {
      yield `data: ${JSON.stringify({ sha1: 'sha', metaAnalyzeStatus: 2, metaInfoArray: [{ key: 'same', name: '分析名称', insertMode: 1, valueDisplay: '' }] })}\n\n`;
    })());
    const result = await loadAttributeNamespace({ typeCode: 'RT001', sha1: 'sha', apis: {
      getByCode: async () => ({ attrs: [{ key: 'hidden', name: '隐藏系统项' }, { key: 'same', name: '类型名称' }] }),
      filesListInfoSse,
    } });
    expect(result).toEqual([{ key: 'hidden', name: '隐藏系统项', insertMode: 0 }, { key: 'same', name: '分析名称', insertMode: 1, valueDisplay: '' }]);
    expect(() => assertNoSystemAttributeConflict(result, { key: 'hidden' })).toThrow();
  });

  it('纯冲突命名空间不取无关格式，但保留所有 raw/附加键与名称且不能用于写值', async () => {
    const getAttrsInfoByKey = vi.fn(async () => { throw new Error('不应调用格式接口'); });
    const filesListInfoSse = vi.fn(async () => (async function* () {
      yield `data: ${JSON.stringify({ sha1: 'sha', metaAnalyzeStatus: 2, metaInfoArray: [
        { key: 'raw', name: '原始项', insertMode: 1, valueDisplay: '' },
        { key: 'additional', name: '附加项', insertMode: 2, valueDisplay: '' },
      ] })}\n\n`;
    })());
    const result = await loadAttributeNamespace({ typeCode: 'RT001', sha1: 'sha', includeDefinitions: false, apis: {
      getByCode: async () => ({ attrs: [{ key: 'hidden', name: '类型保留项' }] }),
      getAttrsInfoByKey,
      filesListInfoSse,
    } });
    expect(getAttrsInfoByKey).not.toHaveBeenCalled();
    expect(result).toHaveLength(3);
    for (const key of ['hidden', 'raw', 'additional']) {
      expect(() => assertNoSystemAttributeConflict(result, { key })).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_CONFLICT' }));
    }
    for (const name of ['类型保留项', '原始项', '附加项']) {
      expect(() => assertNoSystemAttributeConflict(result, { name })).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_CONFLICT' }));
    }
    expect(() => assertSystemAttributeValue(result.find((item) => item.key === 'additional')!, 'anything')).toThrowError(expect.objectContaining({ code: 'ATTR_SYSTEM_READONLY' }));
  });

  it('跳过格式仅适用于名称读取，不能跳过分析响应错误', async () => {
    const getAttrsInfoByKey = vi.fn();
    await expect(loadAttributeNamespace({ typeCode: 'RT001', sha1: 'sha', includeDefinitions: false, apis: {
      getByCode: async () => ({ attrs: [] }),
      getAttrsInfoByKey,
      filesListInfoSse: async () => { throw new Error('分析不可用'); },
    } })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
    await expect(loadSystemAttributes({ typeCode: 'RT001', includeDefinitions: false, analysis: {}, apis: { getAttrsInfoByKey } })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
    expect(getAttrsInfoByKey).not.toHaveBeenCalled();
  });

  it('未提供分析时按 SHA 与资源类型请求 SSE', async () => {
    const filesListInfoSse = vi.fn(async () => (async function* () {
      yield `data: ${JSON.stringify({ sha1: 'sha', metaAnalyzeStatus: 2, metaInfoArray: [] })}\n\n`;
    })());
    expect(await loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', apis: { filesListInfoSse } })).toEqual([]);
    expect(filesListInfoSse).toHaveBeenCalledWith({ sha1: 'sha', resourceTypeCode: 'RT001' });
  });

  it.each([{}, { metaInfoArray: null }, { metaInfoArray: 'bad' }])('缺失或错误 metadata 不能冒充合法空列表 %#', async (analysis) => {
    await expect(loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', analysis })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
  });

  it.each([
    { ret: 1, errCode: 0, data: { attrs: [] } },
    { ret: 0, errCode: 7, data: { attrs: [] } },
    { ret: 0, errcode: 7, data: { attrs: [] } },
    { data: {} },
    { data: { attrs: null } },
    { data: { attrs: {} } },
  ])('拒绝类型接口错误或无效列表 %#', async (response) => {
    await expect(loadSystemAttributes({ typeCode: 'RT001', apis: { getByCode: async () => response } })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
  });

  it.each([
    { ret: 1, errCode: 0, data: { key: 'field', format: 6 } },
    { ret: 0, errCode: 3, data: { key: 'field', format: 6 } },
    { ret: 0, errcode: 3, data: { key: 'field', format: 6 } },
    { data: null }, { key: 'other', format: 6 }, { key: 'field' },
    { key: 'field', format: 6, contentRule: { maxLength: '3' } },
    { key: 'field', format: 8, contentRule: { min: 2, max: 1 } },
    { key: 'field', format: 9, contentRule: { precision: -1 } },
    { key: 'field', format: 10, contentRule: { allowedElements: [1] } },
  ])('附加格式读取失败/格式错误必须阻止写稿 %#', async (response) => {
    await expect(loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', analysis: { metaInfoArray: [{ key: 'field', name: '字段', insertMode: 2 }] }, apis: { getAttrsInfoByKey: async () => response } })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
  });

  it('网络错误明确报告，不退化为任意文本', async () => {
    await expect(loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', analysis: { metaInfoArray: [{ key: 'field', name: '字段', insertMode: 2 }] }, apis: { getAttrsInfoByKey: async () => { throw new Error('network unavailable'); } } })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
  });

  it('SSE 请求错误与终态信封错误明确拒绝', async () => {
    await expect(loadSystemAttributes({ typeCode: 'RT001', sha1: 'sha', apis: { filesListInfoSse: async () => { throw new Error('SSE unavailable'); } } })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
    await expect(loadSystemAttributes({ typeCode: 'RT001', analysis: { ret: 1, metaInfoArray: [] } })).rejects.toMatchObject({ code: 'ATTR_SYSTEM_LOAD' });
  });
});
