import { describe, expect, it, vi } from 'vitest';
import {
  assertCollectionSystemForm,
  initialCollectionInputs,
  loadCollectionSystemRules,
  type CollectionSystemApis,
} from '../../src/domain/collection/systemAttributes';

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const type = { code: 'COLLECTION_LEAF', attrs: [
  { key: 'raw key', name: '原始字段' }, { key: 'intro', name: '简介' },
] };
const metadata = [
  { key: 'raw key', name: '原始字段', insertMode: 1, remark: '', valueDisplay: 'read only' },
  { key: 'intro', name: '简介', insertMode: 2, remark: '', valueDisplay: 'server value' },
];
const definition = { key: 'intro', name: '简介', format: 6, contentRule: { maxLength: 500 } };
function apis(overrides: CollectionSystemApis = {}): CollectionSystemApis {
  return {
    filesInfo: async () => ok({ metaInfoArray: structuredClone(metadata) }),
    getAttrsInfoByKey: async () => ok(structuredClone(definition)),
    ...overrides,
  };
}
const form = (value = '') => ({ inputs: [{ key: 'intro', value }], properties: [], options: [] });
const responseError = { code: 'COLLECTION_SYSTEM_RESPONSE_INVALID' };

describe('合集实时系统属性边界', () => {
  it('总是从当前合集叶子类型读取元数据，仅为 insertMode 2 读取定义，完整保留命名空间', async () => {
    const filesInfo = vi.fn(async () => ok({ metaInfoArray: metadata }));
    const getAttrsInfoByKey = vi.fn(async () => ok(definition));
    const rules = await loadCollectionSystemRules(type, { filesInfo, getAttrsInfoByKey });
    expect(filesInfo.mock.calls).toEqual([[{ resourceTypeCode: type.code }]]);
    expect(getAttrsInfoByKey.mock.calls).toEqual([[{ key: 'intro' }]]);
    expect(rules.namespace).toEqual(type.attrs);
    expect(rules.attrs).toMatchObject(metadata.map(({ remark: _remark, ...row }) => row));
    expect(rules.attrs[1]?.definition).toEqual(definition);
  });

  it('attrs 空列表仍读取 filesInfo；合法空元数据不读取任何定义', async () => {
    const filesInfo = vi.fn(async () => ok({ metaInfoArray: [] }));
    const getAttrsInfoByKey = vi.fn();
    const rules = await loadCollectionSystemRules({ code: type.code, attrs: [] }, { filesInfo, getAttrsInfoByKey });
    expect(filesInfo.mock.calls).toEqual([[{ resourceTypeCode: type.code }]]);
    expect(getAttrsInfoByKey).not.toHaveBeenCalled();
    expect(rules).toEqual({ namespace: [], attrs: [] });
  });

  it('类型保留字段与 metadata 完整取并集，不套用自定义 key 正则、不修改原始标识', async () => {
    const rules = await loadCollectionSystemRules({ ...type, attrs: [
      { key: 'frequency channel', name: '频道' }, ...type.attrs,
    ] }, apis({ filesInfo: async () => ok({ metaInfoArray: [
      ...metadata, { key: 'extra', name: '元数据独有', insertMode: 1 },
    ] }) }));
    expect(rules.namespace).toEqual([
      { key: 'frequency channel', name: '频道' }, ...type.attrs, { key: 'extra', name: '元数据独有' },
    ]);
    for (const field of [{ key: 'frequency channel', name: '用户名' }, { key: 'custom', name: '频道' }]) {
      expect(() => assertCollectionSystemForm({ ...form(), properties: [field] }, rules))
        .toThrowError(expect.objectContaining({ code: 'COLLECTION_SYSTEM_CONFLICT' }));
    }
  });

  it('首次输入按元数据可写顺序显式为空，不继承分析展示值，并且不修改规则', async () => {
    const rules = await loadCollectionSystemRules(type, apis({ filesInfo: async () => ok({ metaInfoArray: [
      ...metadata, { key: 'second', name: '第二项', insertMode: 2, valueDisplay: 'ignored' },
    ] }), getAttrsInfoByKey: async ({ key }) => ok({ ...definition, key, name: key === 'intro' ? '简介' : '第二项' }) }));
    const before = structuredClone(rules);
    const inputs = initialCollectionInputs(rules);
    expect(inputs).toEqual([{ key: 'intro', value: '' }, { key: 'second', value: '' }]);
    inputs[0]!.value = 'changed';
    expect(rules).toEqual(before);
  });

  it.each([141, 500])('系统字段使用 maxLength 500，接受 %i 个字符，没有通用 140 上限', async (length) => {
    const rules = await loadCollectionSystemRules(type, apis());
    expect(() => assertCollectionSystemForm(form('a'.repeat(length)), rules)).not.toThrow();
  });

  it('501 字符拒绝，显式较小上限和单行规则同样生效', async () => {
    const rules = await loadCollectionSystemRules(type, apis());
    expect(() => assertCollectionSystemForm(form('a'.repeat(501)), rules))
      .toThrowError(expect.objectContaining({ code: 'COLLECTION_SYSTEM_VALUE_INVALID' }));
    for (const [contentRule, value] of [[{ maxLength: 2 }, 'abc'], [{ minLength: 2 }, 'a'], [{}, 'a\nb']] as const) {
      const small = await loadCollectionSystemRules(type, apis({ getAttrsInfoByKey: async () => ok({ ...definition, contentRule }) }));
      expect(() => assertCollectionSystemForm(form(value), small))
        .toThrowError(expect.objectContaining({ code: 'COLLECTION_SYSTEM_VALUE_INVALID' }));
      expect(() => assertCollectionSystemForm(form(''), small)).not.toThrow();
    }
  });

  it.each([
    null, {}, { ret: 0, data: { metaInfoArray: [] } }, { errCode: 0, data: { metaInfoArray: [] } },
    { ret: '0', errCode: 0, data: { metaInfoArray: [] } }, { ret: 0, errCode: '0', data: { metaInfoArray: [] } },
    { ret: 1, errCode: 0, data: { metaInfoArray: [] } }, { ret: 0, errCode: 1, data: { metaInfoArray: [] } },
    ok(null), ok([]), ok({}), ok({ metaInfoArray: null }), ok({ metaInfoArray: {} }),
  ])('元数据缺失、失败或非数值成功信封受控失败 %#', async (response) => {
    await expect(loadCollectionSystemRules(type, apis({ filesInfo: async () => response }))).rejects.toMatchObject(responseError);
  });

  it.each([
    undefined, null, {}, [{ key: 'intro' }], [{ key: '', name: '简介' }],
    [{ key: 'intro', name: '' }], [{ key: 'intro\u200b', name: '简介' }],
    [{ key: 'intro', name: '简\n介' }], [{ key: 'intro', name: '简介' }, { key: 'intro', name: '重复' }],
    [{ key: 'intro', name: '简介' }, { key: 'other', name: '简介' }],
  ].map((attrs) => ({ attrs })))('类型命名空间不是有效完整列表时拒绝 %#', async ({ attrs }) => {
    await expect(loadCollectionSystemRules({ code: type.code, attrs }, apis())).rejects.toMatchObject(responseError);
  });

  it.each([
    null, {}, { key: 'intro', name: '简介' }, { key: 'intro', name: '简介', insertMode: '2' },
    { key: 'intro', name: '简介', insertMode: 0 }, { key: 'intro', name: '简介', insertMode: 3 },
    { key: ' ', name: '简介', insertMode: 2 }, { key: 'intro', name: '\u200b', insertMode: 2 },
    { key: 'intro', name: '简介', insertMode: 2, valueDisplay: null },
    { key: 'intro', name: '简介', insertMode: 2, remark: 1 },
  ])('元数据字段结构无效时不能静默遗漏 %#', async (row) => {
    await expect(loadCollectionSystemRules(type, apis({ filesInfo: async () => ok({ metaInfoArray: [row] }) })))
      .rejects.toMatchObject(responseError);
  });

  it.each([
    [...metadata, metadata[1]],
    [...metadata, { key: 'other', name: '简介', insertMode: 1 }],
    [{ key: 'intro', name: '改名', insertMode: 2 }],
    [{ key: 'other', name: '简介', insertMode: 2 }],
  ].map((rows) => ({ rows })))('元数据重复或与类型 key/name 身份不一致时拒绝 %#', async ({ rows }) => {
    await expect(loadCollectionSystemRules(type, apis({ filesInfo: async () => ok({ metaInfoArray: rows }) })))
      .rejects.toMatchObject(responseError);
  });

  it.each([
    null, {}, { ret: 0, data: definition }, { ret: '0', errCode: 0, data: definition },
    { ret: 0, errCode: 1, data: definition }, ok(null), ok({ ...definition, key: 'other' }),
    ok({ ...definition, format: '6' }), ok({ ...definition, format: 6.5 }),
    ok({ ...definition, contentRule: { maxLength: '500' } }),
    ok({ ...definition, contentRule: { minLength: 501, maxLength: 500 } }),
  ])('定义必须精确成功、对应原 key，规则必须有效 %#', async (response) => {
    await expect(loadCollectionSystemRules(type, apis({ getAttrsInfoByKey: async () => response })))
      .rejects.toMatchObject(responseError);
  });

  it.each([0, 3, 11, 99])('未知格式 %i 返回受控不支持错误', async (format) => {
    await expect(loadCollectionSystemRules(type, apis({ getAttrsInfoByKey: async () => ok({ ...definition, format }) })))
      .rejects.toMatchObject({ code: 'COLLECTION_SYSTEM_FORMAT_UNSUPPORTED' });
  });

  it.each([
    [], [{ key: 'other', value: '' }], [{ key: 'raw key', value: '' }],
    [{ key: 'intro', value: '' }, { key: 'intro', value: '' }],
    [{ key: 'intro', value: '' }, { key: 'other', value: '' }], [{ key: 'intro', value: null }],
  ].map((inputs) => ({ inputs })))('表单 inputs 必须精确包含所有当前可写 key，缺项/多项/raw/重复均拒绝 %#', async ({ inputs }) => {
    const rules = await loadCollectionSystemRules(type, apis());
    expect(() => assertCollectionSystemForm({ ...form(), inputs } as ReturnType<typeof form>, rules))
      .toThrowError(expect.objectContaining({ code: 'COLLECTION_SYSTEM_INPUT_INVALID' }));
  });

  it.each(['properties', 'options'] as const)('%s 的 key 或 name 不得冲突原始或附加系统字段', async (field) => {
    const rules = await loadCollectionSystemRules(type, apis());
    for (const item of [
      { key: 'raw key', name: '自定义' }, { key: 'custom', name: '原始字段' },
      { key: 'intro', name: '自定义' }, { key: 'custom', name: '简介' },
    ]) {
      expect(() => assertCollectionSystemForm({ ...form(), [field]: [item] }, rules))
        .toThrowError(expect.objectContaining({ code: 'COLLECTION_SYSTEM_CONFLICT' }));
    }
  });

  it('全部可写字段缺任何一个都拒绝；完整字段可改变顺序且值保留原样', async () => {
    const rules = await loadCollectionSystemRules(type, apis({ filesInfo: async () => ok({ metaInfoArray: [
      ...metadata, { key: 'second', name: '第二项', insertMode: 2 },
    ] }), getAttrsInfoByKey: async ({ key }) => ok({ ...definition, key }) }));
    expect(() => assertCollectionSystemForm(form(), rules))
      .toThrowError(expect.objectContaining({ code: 'COLLECTION_SYSTEM_INPUT_INVALID' }));
    const complete = { ...form(), inputs: [{ key: 'second', value: '' }, { key: 'intro', value: '  原样  ' }] };
    const before = structuredClone(complete);
    expect(() => assertCollectionSystemForm(complete, rules)).not.toThrow();
    expect(complete).toEqual(before);
  });

  it.each([
    { format: 4, contentRule: { startDate: '2024-02-28', limitDate: '2024-03-01' }, valid: '2024-02-29', invalid: '2024-02-30' },
    { format: 5, contentRule: {}, valid: '2024-02-29 12:30:00', invalid: '2024-02-29 24:00:00' },
    { format: 7, contentRule: { maxLength: 500 }, valid: 'a\nb', invalid: 'a'.repeat(501) },
    { format: 8, contentRule: { min: 0, max: 10 }, valid: '0', invalid: '1suffix' },
    { format: 9, contentRule: { minDecimal: 0, maxDecimal: 2, precision: 2 }, valid: '0.01', invalid: '0.001' },
    { format: 10, contentRule: { allowedElements: ['one', 'two'] }, valid: 'one', invalid: 'other' },
  ])('format $format 复用严格值规则，并支持显式清空', async ({ format, contentRule, valid, invalid }) => {
    const rules = await loadCollectionSystemRules(type, apis({ getAttrsInfoByKey: async () => ok({ ...definition, format, contentRule }) }));
    expect(() => assertCollectionSystemForm(form(valid), rules)).not.toThrow();
    expect(() => assertCollectionSystemForm(form(''), rules)).not.toThrow();
    expect(() => assertCollectionSystemForm(form(invalid), rules))
      .toThrowError(expect.objectContaining({ code: 'COLLECTION_SYSTEM_VALUE_INVALID' }));
  });

  it('值校验的未知异常转为固定错误，不暴露异常内容', async () => {
    const rules = await loadCollectionSystemRules(type, apis());
    Object.defineProperty(rules.attrs[1]!.definition!, 'contentRule', { get() { throw new Error('SYNTHETIC_PRIVATE_VALUE_DIAGNOSTIC'); } });
    let error: unknown;
    try { assertCollectionSystemForm(form('a'), rules); } catch (caught) { error = caught; }
    expect(error).toMatchObject({ code: 'COLLECTION_SYSTEM_VALUE_INVALID' });
    expect(String(error)).not.toContain('SYNTHETIC_PRIVATE_VALUE_DIAGNOSTIC');
    expect(error).not.toHaveProperty('cause');
  });

  it('元数据及定义网络异常不泄漏原始信息或 cause', async () => {
    for (const key of ['filesInfo', 'getAttrsInfoByKey'] as const) {
      const error = await loadCollectionSystemRules(type, apis({ [key]: async () => { throw new Error('SYNTHETIC_PRIVATE_DIAGNOSTIC'); } }))
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject(responseError);
      expect(String(error)).not.toContain('SYNTHETIC_PRIVATE_DIAGNOSTIC');
      expect(error).not.toHaveProperty('cause');
    }
  });
});
