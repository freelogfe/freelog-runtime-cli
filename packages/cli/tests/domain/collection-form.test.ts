import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { collectionFormDraftPath, collectionFormFingerprint, editCollectionForm, mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft, readPublishedCollectionForm, toCollectionUpdatePayload, validateForm, type CollectionForm } from '../../src/domain/collection/form';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { FServiceAPI } from '../../src/platform/api';

const boundaryForm = (): CollectionForm => ({
  $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'artist', value: '作者' }],
  properties: [{ key: 'copyright', name: '版权', value: '', description: '' }],
  options: [{ key: 'caption', name: '文字', kind: 'input', value: '', description: '' },
    { key: 'language', name: '语言', kind: 'select', values: ['zh', 'en'], description: '' }],
  description: '', display: { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' },
  dependencies: [],
});
type EditCase = { label: string; change: (form: CollectionForm) => unknown; code: string };
const rejectedEdits: EditCase[] = [];
for (const [label, field] of [['属性', (f: CollectionForm) => f.properties[0]!], ['文本配置', (f: CollectionForm) => f.options[0]!], ['下拉配置', (f: CollectionForm) => f.options[1]!]] as const) {
  for (const length of [0, 51]) rejectedEdits.push({ label: `${label}名称${length}`, code: 'COLLECTION_FORM_FIELD_INVALID', change(f) { field(f).name = '名'.repeat(length); return f; } });
  rejectedEdits.push({ label: `${label}说明51`, code: 'COLLECTION_FORM_FIELD_INVALID', change(f) { field(f).description = '说'.repeat(51); return f; } });
}
rejectedEdits.push(
  { label: '属性值141', code: 'COLLECTION_FORM_VALUE_LONG', change(f) { f.properties[0]!.value = '值'.repeat(141); return f; } },
  { label: '文本值141', code: 'COLLECTION_FORM_VALUE_LONG', change(f) { f.options[0]!.value = '值'.repeat(141); return f; } },
  { label: '表单描述201', code: 'COLLECTION_FORM_DESCRIPTION_LONG', change(f) { f.description = '说'.repeat(201); return f; } },
  { label: '属性31条', code: 'COLLECTION_FORM_TOO_MANY', change(f) { f.properties = Array.from({ length: 31 }, (_, i) => ({ key: `property_${i}`, name: `属性${i}`, value: '', description: '' })); return f; } },
  { label: '配置31条', code: 'COLLECTION_FORM_TOO_MANY', change(f) { f.options = Array.from({ length: 31 }, (_, i) => ({ key: `option_${i}`, name: `配置${i}`, kind: 'input', value: '', description: '' })); return f; } },
  ...['', '_ab', 'ab-c', 'a'.repeat(31)].map((key) => ({ label: `非法key:${key}`, code: 'COLLECTION_FORM_KEY_INVALID', change(f: CollectionForm) { f.properties[0]!.key = key; return f; } })),
  { label: '系统附加值重复key', code: 'COLLECTION_FORM_KEY_DUPLICATE', change(f) { f.inputs.push({ key: 'artist', value: '' }); return f; } },
  { label: '属性占用系统附加key', code: 'COLLECTION_FORM_FIELD_INVALID', change(f) { f.properties[0]!.key = 'artist'; return f; } },
  { label: '配置重复属性key', code: 'COLLECTION_FORM_FIELD_INVALID', change(f) { f.options[0]!.key = 'copyright'; return f; } },
  { label: '属性配置重复名称', code: 'COLLECTION_FORM_FIELD_INVALID', change(f) { f.options[0]!.name = '版权'; return f; } },
  ...[[], Array.from({ length: 31 }, (_, i) => `选项${i}`), ['相同', '相同'], [''], ['值'.repeat(141)]].map((values, i) => ({ label: `非法下拉候选${i}`, code: 'COLLECTION_FORM_OPTION_INVALID', change(f: CollectionForm) { f.options[1]!.values = values; return f; } })),
  { label: 'input混入values', code: 'COLLECTION_FORM_OPTION_INVALID', change(f) { f.options[0]!.values = ['被静默忽略']; return f; } },
  { label: 'select混入value即使等于首项', code: 'COLLECTION_FORM_OPTION_INVALID', change(f) { f.options[1]!.value = 'zh'; return f; } },
  { label: '未知顶层字段', code: 'COLLECTION_FORM_INVALID', change(f) { return { ...f, resourceTitle: '不属于表单' }; } },
  { label: '未知属性字段', code: 'COLLECTION_FORM_INVALID', change(f) { return { ...f, properties: [{ ...f.properties[0], extra: '不允许' }] }; } },
);

vi.mock('../../src/platform/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: { ...actual.FServiceAPI, Resource: {
    ...actual.FServiceAPI.Resource,
    lookDraft: vi.fn(), saveVersionsDraft: vi.fn(), deleteResourceDraft: vi.fn(), updateCollection: vi.fn(),
  } } };
});

describe('合集本地表单', () => {
  let cwd: string;
  let homeDir: string;
  const info = async () => ({ ret: 0, errCode: 0, data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0, latestVersion: '' } });
  const typeApis = {
    resourceTypes: async () => ({ ret: 0, errCode: 0, data: [{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }] }),
    getByCode: async () => ({ ret: 0, errCode: 0, data: { code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], attrs: [{ key: 'author', name: '系统作者' }], resourceConfig: { supportOptionalConfig: 2 } } }),
    filesInfo: async () => ({ ret: 0, errCode: 0, data: { metaInfoArray: [{ key: 'author', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '' }] } }),
    getAttrsInfoByKey: async () => ({ ret: 0, errCode: 0, data: { key: 'author', format: 6, contentRule: { maxLength: 500 } } }),
  };
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-form-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-form-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { vi.clearAllMocks(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  const published = (extra: Record<string, unknown> = {}) => ({
    resourceId: 'collection_1', version: 'published_1', systemPropertyDescriptors: [],
    customPropertyDescriptors: [], dependencies: [], description: '已发布说明', catalogueProperty: {},
    authExcludedItems: [{ resourceId: 'upstream_1', excludedType: 'contractId', excludedValue: 'contract_1' }],
    ...extra,
  });
  const publishedApis = (versionInfo: (params: Record<string, unknown>) => Promise<unknown>) => ({
    info: async () => ({ ...(await info()), data: { ...(await info()).data, latestVersion: 'published_1' } }),
    ...typeApis, versionInfo,
  });

  it('新合集创建可恢复的本地空基线，不访问任何 Console 服务端草稿', async () => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    expect(form).toMatchObject({ $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'author', value: '' }], properties: [], options: [], dependencies: [] });
    expect(readCollectionFormDraft(cwd, 'collection_1')).toMatchObject({ authState: 'known-empty', resourceTypeCode: 'CT001' });
  });

  it('完整 JSON 编辑只修改本地草稿，并可完整构造 updateCollection payload', async () => {
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const formPath = path.join(cwd, 'collection.form.json');
    writeFileSync(formPath, JSON.stringify({
      $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'author', value: 'alice' }],
      properties: [{ key: 'copyright', name: '版权', value: 'CC', description: '' }],
      options: [{ key: 'theme', name: '主题', kind: 'select', values: ['light', 'dark'], description: '' }],
      description: '说明', display: { sort: 'descending', title: 'serial-number', number: false, image: true, description: false, view: 'card' },
      dependencies: [{ resourceId: 'r1', versionRange: '^1.0.0' }],
    }));
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'collection.form.json', apis: { info, ...typeApis } })).resolves.toMatchObject({ description: '说明' });
    const draft = readCollectionFormDraft(cwd, 'collection_1')!;
    expect(toCollectionUpdatePayload(draft.form, 'collection_1', [], 0)).toMatchObject({
      inputAttrs: [{ key: 'author', value: 'alice' }], description: '说明', isMergeCatalogueDraft: 0,
      catalogueProperty: { collection_sort_list: 'collection_sort_descending', collection_item_title: 'collection_item_title_sn', collection_view: 'collection_view_card' },
    });
  });

  // 正式表单§3与字段表§3：只有数值2启用；字符串不能被强制转换为能力批准。
  it.each([0, 1, 3, '2', undefined])('能力值 %s 不允许非空可选配置且失败保留原稿', async (supportOptionalConfig) => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    writeFileSync(path.join(cwd, 'collection.form.json'), JSON.stringify({ ...form,
      options: [{ key: 'theme', name: '主题', kind: 'input', value: 'light', description: '' }],
    }));
    const getByCode = vi.fn(async () => ({ ...(await typeApis.getByCode()), data: {
      ...(await typeApis.getByCode()).data, resourceConfig: { supportOptionalConfig },
    } }));
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'collection.form.json',
      apis: { info, ...typeApis, getByCode },
    })).rejects.toMatchObject({ code: 'COLLECTION_FORM_OPTIONS_UNSUPPORTED' });
    expect(getByCode).toHaveBeenCalledOnce();
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1'))).toEqual(before);
    expect(FServiceAPI.Resource.updateCollection).not.toHaveBeenCalled();
  });

  it('完整已发布字段和非空授权排除映射经过pull、本地修改和payload保持无损', async () => {
    const snapshot = published({
      systemPropertyDescriptors: [{ key: 'author', insertMode: 2, valueDisplay: 'alice' }],
      customPropertyDescriptors: [
        { key: 'copyright', name: '版权', type: 'readonlyText', defaultValue: 'CC', remark: '来源' },
        { key: 'theme', name: '主题', type: 'editableText', defaultValue: 'light', remark: '' },
        { key: 'language', name: '语言', type: 'select', defaultValue: 'zh', candidateItems: ['zh', 'en'], remark: '' },
      ],
      dependencies: [{ resourceId: 'resource_1', versionRange: '~1.2.0' }],
      catalogueProperty: { collection_sort_list: 'collection_sort_descending', collection_item_title: 'collection_item_title_custom',
        collection_item_no_display: 'collection_item_no_display_hide', collection_item_image_display: 'collection_item_image_display_show',
        collection_item_descr_display: 'collection_item_descr_display_hide', collection_view: 'collection_view_card' },
    });
    const versionInfo = vi.fn(async () => ({ ret: 0, errCode: 0, data: snapshot }));
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: publishedApis(versionInfo) });
    expect(form).toEqual({ $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'author', value: 'alice' }],
      properties: [{ key: 'copyright', name: '版权', value: 'CC', description: '来源' }],
      options: [{ key: 'theme', name: '主题', kind: 'input', value: 'light', description: '' },
        { key: 'language', name: '语言', kind: 'select', values: ['zh', 'en'], description: '' }],
      description: '已发布说明', dependencies: snapshot.dependencies,
      display: { sort: 'descending', title: 'custom', number: false, image: true, description: false, view: 'card' },
    });
    mutateCollectionFormDraft(cwd, 'collection_1', (current) => ({ ...current, description: '本地待发布说明' }));
    const draft = readCollectionFormDraft(cwd, 'collection_1')!;
    expect(draft.baseline).toEqual(form);
    expect(draft.publishedBaselineFingerprint).toBe(collectionFormFingerprint(form));
    expect(draft.authExcludedItems).toEqual(snapshot.authExcludedItems);
    expect(toCollectionUpdatePayload(draft.form, 'collection_1', draft.authExcludedItems, 0)).toEqual({
      resourceId: 'collection_1', inputAttrs: [{ key: 'author', value: 'alice' }], customPropertyDescriptors: snapshot.customPropertyDescriptors,
      dependencies: snapshot.dependencies, description: '本地待发布说明', catalogueProperty: snapshot.catalogueProperty,
      authExcludedItems: snapshot.authExcludedItems, isMergeCatalogueDraft: 0,
    });
    expect(versionInfo).toHaveBeenCalledExactlyOnceWith({ resourceId: 'collection_1', version: 'published_1' });
    for (const method of ['lookDraft', 'saveVersionsDraft', 'deleteResourceDraft', 'updateCollection'] as const) expect(FServiceAPI.Resource[method]).not.toHaveBeenCalled();
  });

  it.each([
    ['radio', { type: 'radio', defaultValue: 'a' }],
    ['checkbox', { type: 'checkbox', defaultValue: 'a' }],
    ['future', { type: 'future', defaultValue: 'a' }],
    ['缺少默认值', { type: 'readonlyText' }],
    ['下拉默认不是首项', { type: 'select', defaultValue: 'en', candidateItems: ['zh', 'en'] }],
    ['下拉非文本候选', { type: 'select', defaultValue: 'zh', candidateItems: ['zh', 7] }],
  ])('已发布描述符%s拒绝补默认值或覆盖已有本地稿', async (_label, descriptor) => {
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const versionInfo = vi.fn(async () => ({ ret: 0, errCode: 0, data: published({
      customPropertyDescriptors: [{ key: 'setting', name: '配置', remark: '', ...descriptor }],
    }) }));
    await expect(pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', yes: true, apis: publishedApis(versionInfo) }))
      .rejects.toMatchObject({ code: 'COLLECTION_FORM_UNKNOWN_DESCRIPTOR' });
    expect(versionInfo).toHaveBeenCalledOnce();
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1'))).toEqual(before);
    expect(FServiceAPI.Resource.updateCollection).not.toHaveBeenCalled();
  });

  it('已发布基线变化可被识别，本地修改与Console草稿不参与远端基线读取', async () => {
    let snapshot = published();
    const versionInfo = vi.fn(async () => ({ ret: 0, errCode: 0, data: snapshot }));
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: publishedApis(versionInfo) });
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '本地修改' }));
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    const unchanged = await readPublishedCollectionForm({ resourceId: 'collection_1', latestVersion: 'published_1', apis: { versionInfo } });
    expect(collectionFormFingerprint(unchanged.form)).toBe(readCollectionFormDraft(cwd, 'collection_1')!.publishedBaselineFingerprint);
    snapshot = published({ description: '另一个客户端修改已发布内容' });
    const changed = await readPublishedCollectionForm({ resourceId: 'collection_1', latestVersion: 'published_1', apis: { versionInfo } });
    expect(collectionFormFingerprint(changed.form)).not.toBe(readCollectionFormDraft(cwd, 'collection_1')!.publishedBaselineFingerprint);
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1'))).toEqual(before);
    expect(versionInfo).toHaveBeenCalledTimes(3);
    for (const method of ['lookDraft', 'saveVersionsDraft', 'deleteResourceDraft', 'updateCollection'] as const) expect(FServiceAPI.Resource[method]).not.toHaveBeenCalled();
  });

  it('既有发布快照读取不依赖当前系统配置，历史值和授权映射保持原样', async () => {
    const versionInfo = vi.fn(async () => ({ ret: 0, errCode: 0, data: published({
      systemPropertyDescriptors: [{ key: 'retired_field', insertMode: 2, valueDisplay: '历史值'.repeat(60) }],
    }) }));
    const filesInfo = vi.fn(async () => { throw new Error('current configuration unavailable'); });
    const getAttrsInfoByKey = vi.fn(async () => { throw new Error('current definition unavailable'); });
    const observed = await readPublishedCollectionForm({ resourceId: 'collection_1', latestVersion: 'published_1', apis: { versionInfo, filesInfo, getAttrsInfoByKey } });
    expect(observed.form.inputs).toEqual([{ key: 'retired_field', value: '历史值'.repeat(60) }]);
    expect(observed.authExcludedItems).toEqual(published().authExcludedItems);
    expect(filesInfo).not.toHaveBeenCalled(); expect(getAttrsInfoByKey).not.toHaveBeenCalled();
  });

  it('pull只给工作稿补当前新增字段，既有基线和退役字段不被静默重写', async () => {
    const versionInfo = async () => ({ ret: 0, errCode: 0, data: published({
      systemPropertyDescriptors: [{ key: 'retired_field', insertMode: 2, valueDisplay: '历史值' }],
    }) });
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: publishedApis(versionInfo) });
    const draft = readCollectionFormDraft(cwd, 'collection_1')!;
    expect(draft.baseline.inputs).toEqual([{ key: 'retired_field', value: '历史值' }]);
    expect(draft.form.inputs).toEqual([{ key: 'retired_field', value: '历史值' }, { key: 'author', value: '' }]);
    expect(draft.publishedBaselineFingerprint).toBe(collectionFormFingerprint(draft.baseline));
    expect(draft.publishedBaselineFingerprint).not.toBe(collectionFormFingerprint(draft.form));
  });

  it.each(['metadata', 'definition'] as const)('当前%s读取失败时完整导入不覆盖本地稿或发送发布', async (failure) => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    writeFileSync(path.join(cwd, 'system.json'), JSON.stringify(form));
    const apis = { info, ...typeApis,
      ...(failure === 'metadata' ? { filesInfo: async () => ({ ret: 1, errCode: 1, data: {} }) }
        : { getAttrsInfoByKey: async () => ({ ret: 0, errCode: 0, data: {} }) }),
    };
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'system.json', apis })).rejects.toMatchObject({ code: 'COLLECTION_SYSTEM_RESPONSE_INVALID' });
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1'))).toEqual(before);
    expect(FServiceAPI.Resource.updateCollection).not.toHaveBeenCalled();
  });

  it.each(rejectedEdits)('C06外部JSON拒绝$label并保留完整操作稿', async ({ change, code }) => {
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const draftFile = collectionFormDraftPath(cwd, 'collection_1'), before = readFileSync(draftFile);
    const external = JSON.stringify(change(boundaryForm()));
    writeFileSync(path.join(cwd, 'collection.form.json'), external);
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'collection.form.json', apis: { info, ...typeApis } })).rejects.toMatchObject({ code });
    expect(readFileSync(draftFile)).toEqual(before);
    expect(readFileSync(path.join(cwd, 'collection.form.json'), 'utf8')).toBe(external);
    for (const method of ['lookDraft', 'saveVersionsDraft', 'deleteResourceDraft', 'updateCollection'] as const) expect(FServiceAPI.Resource[method]).not.toHaveBeenCalled();
  });

  it('首次线上基线固定为空，当前系统空值只补进工作稿且不使用metadata展示默认值', async () => {
    const filesInfo = vi.fn(async () => ({ ret: 0, errCode: 0, data: { metaInfoArray: [{ key: 'author', name: '系统作者', remark: '', insertMode: 2, valueDisplay: '不能作为初始值' }] } }));
    const apis = { info, ...typeApis, filesInfo };
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis });
    const draft = readCollectionFormDraft(cwd, 'collection_1')!;
    const observed = await readPublishedCollectionForm({ resourceId: 'collection_1', latestVersion: '', apis });
    expect(draft.baseline.inputs).toEqual([]);
    expect(draft.form.inputs).toEqual([{ key: 'author', value: '' }]); expect(observed.form).toEqual(draft.baseline);
    expect(collectionFormFingerprint(observed.form)).toBe(draft.publishedBaselineFingerprint);
    expect(filesInfo.mock.calls).toEqual([[{ resourceTypeCode: 'CT001' }]]);
  });

  it.each([141, 500])('系统文本当前规则max500允许%s字符，外部完整导入不受自定义值140限制', async (length) => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const value = '值'.repeat(length); form.inputs = [{ key: 'author', value }];
    writeFileSync(path.join(cwd, 'system.json'), JSON.stringify(form));
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'system.json', apis: { info, ...typeApis } })).resolves.toEqual(form);
    expect(readCollectionFormDraft(cwd, 'collection_1')!.form.inputs).toEqual([{ key: 'author', value }]);
  });

  it.each([
    { label: '缺少可写字段', inputs: [], code: 'COLLECTION_SYSTEM_INPUT_INVALID' },
    { label: '未知字段', inputs: [{ key: 'anotherType', value: '' }], code: 'COLLECTION_SYSTEM_INPUT_INVALID' },
    { label: '超过当前格式值501', inputs: [{ key: 'author', value: '值'.repeat(501) }], code: 'COLLECTION_SYSTEM_VALUE_INVALID' },
  ])('系统字段$label拒绝导入且保留当前稿', async ({ inputs, code }) => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    writeFileSync(path.join(cwd, 'system.json'), JSON.stringify({ ...form, inputs }));
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'system.json', apis: { info, ...typeApis } })).rejects.toMatchObject({ code });
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1'))).toEqual(before);
  });

  it('当前系统字段的空串是明确清空，不因为最小长度规则而拒绝', async () => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    form.inputs = [{ key: 'author', value: '' }]; writeFileSync(path.join(cwd, 'system.json'), JSON.stringify(form));
    const getAttrsInfoByKey = async () => ({ ret: 0, errCode: 0, data: { key: 'author', format: 6, contentRule: { minLength: 10, maxLength: 500 } } });
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'system.json', apis: { info, ...typeApis, getAttrsInfoByKey } })).resolves.toEqual(form);
  });

  it('自定义名称不能占用未出现在inputs中的系统保留字段名称', async () => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const before = readFileSync(collectionFormDraftPath(cwd, 'collection_1'));
    writeFileSync(path.join(cwd, 'system.json'), JSON.stringify({ ...form, properties: [{ key: 'customName', name: '保留原始字段', value: '', description: '' }] }));
    const getByCode = async () => { const result = await typeApis.getByCode(); result.data.attrs.push({ key: 'rawField', name: '保留原始字段' }); return result; };
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'system.json', apis: { info, ...typeApis, getByCode } })).rejects.toMatchObject({ code: 'COLLECTION_SYSTEM_CONFLICT' });
    expect(readFileSync(collectionFormDraftPath(cwd, 'collection_1'))).toEqual(before);
  });
});

describe('C06字段合法边界：不截断、不替换默认值', () => {
  it.each([29, 30])('属性与配置各%s项可同时保存，互不占用数量', (count) => {
    const f = boundaryForm();
    f.properties = Array.from({ length: count }, (_, i) => ({ key: `property_${i}`, name: `属性${i}`, value: '', description: '' }));
    f.options = Array.from({ length: count }, (_, i) => ({ key: `option_${i}`, name: `配置${i}`, kind: 'input', value: '', description: '' }));
    expect(validateForm(f)).toEqual(f);
  });
  it.each([49, 50])('属性和两种配置名称/说明%s字符原样接受', (length) => {
    const f = boundaryForm();
    [f.properties[0]!, ...f.options].forEach((row, i) => { row.name = `${i}${'名'.repeat(length - 1)}`; row.description = '说'.repeat(length); });
    expect(validateForm(f)).toEqual(f);
  });
  it.each([0, 139, 140])('属性/文本值合法长度及系统值结构%s字符原样接受；系统范围另按实时规则', (length) => {
    const f = boundaryForm(); f.inputs[0]!.value = f.properties[0]!.value = f.options[0]!.value = '值'.repeat(length);
    expect(validateForm(f)).toEqual(f);
  });
  it.each([1, 29, 30])('下拉%s项、每项140字符，第一项固定映射为默认', (count) => {
    const f = boundaryForm(); const values = Array.from({ length: count }, (_, i) => `${String(i).padStart(2, '0')}${'项'.repeat(138)}`); f.options[1]!.values = values;
    expect(validateForm(f)).toEqual(f);
    const payload = toCollectionUpdatePayload(f, 'collection_1', [], 0);
    expect((payload.customPropertyDescriptors as unknown[])[2]).toEqual({ key: 'language', name: '语言', type: 'select', defaultValue: values[0], candidateItems: values, remark: '' });
  });
  it.each([0, 199, 200])('表单描述%s字符原样接受', (length) => {
    const f = boundaryForm(); f.description = '说'.repeat(length); expect(validateForm(f)).toEqual(f);
  });
  it.each(['a', 'ab', 'a'.repeat(29), 'a'.repeat(30)])('key符合正式正则的合法长度%s', (key) => {
    const f = boundaryForm(); f.properties[0]!.key = key; expect(validateForm(f)).toEqual(f);
  });
});
