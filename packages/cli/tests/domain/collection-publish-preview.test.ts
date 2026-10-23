import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CliError } from '../../src/core/errors';
import * as tty from '../../src/core/tty';
import { loginAccount } from '../../src/domain/account/login';
import { collectionFormDraftPath, mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft, toCollectionUpdatePayload, type AuthExcludedItem, type CollectionForm } from '../../src/domain/collection/form';
import { publishCollection, type CollectionPublishApis } from '../../src/domain/collection/publish';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

const unintendedRequest = vi.hoisted(() => vi.fn(() => { throw new Error('TEST_API_NOT_INJECTED'); }));
vi.mock('../../src/platform/api', async (original) => {
  const actual = await original<typeof import('../../src/platform/api')>();
  return { ...actual, FServiceAPI: new Proxy(actual.FServiceAPI, { get: () => new Proxy({}, { get: () => unintendedRequest }) }) };
});

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const empty = (): CollectionForm => ({ $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], description: '',
  display: { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' }, dependencies: [] });
const item = (itemId: string, resourceId: string, itemTitle: string, sortId: number) => ({ itemId, itemTitle, sortId, mountResourceInfo: { resourceId } });
type Row = ReturnType<typeof item>;

describe('C07 合集发布的完整差异预览', () => {
  let cwd: string; let homeDir: string; let remote: CollectionForm; let auth: AuthExcludedItem[];
  let published: Row[]; let catalogueDraft: Row[]; let preview: MockInstance<typeof tty.confirmWrite>;
  let systemKeys: string[];
  let api: CollectionPublishApis;
  const args = () => ({ cwd, homeDir, selector: 'id:collection_1', apis: api });
  const marker = () => path.join(cwd, '.freelog/collection-forms/intents/collection_1.json');
  const formBytes = () => readFileSync(collectionFormDraftPath(cwd, 'collection_1'), 'utf8');
  const page = (rows: Row[], params: Record<string, unknown>) => ok({ skip: params.skip, limit: params.limit, totalItem: rows.length,
    dataList: rows.slice(Number(params.skip), Number(params.skip) + Number(params.limit)) });
  beforeEach(async () => {
    unintendedRequest.mockClear();
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-preview-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-preview-home-'));
    remote = empty(); auth = []; published = []; catalogueDraft = []; systemKeys = [];
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    api = {
      info: async () => ok({ resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT', subjectType: [4], userId: 7, status: 4, serializeStatus: 0, latestVersion: 'snapshot_old' }),
      resourceTypes: async () => ok([{ code: 'CT', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
      getByCode: async () => ok({ code: 'CT', isTerminate: true, status: 1, subjectType: [4],
        attrs: systemKeys.map((key) => ({ key, name: key })), resourceConfig: { supportOptionalConfig: 2 } }),
      filesInfo: async () => ok({ metaInfoArray: systemKeys.map((key) => ({ key, name: key, remark: '', insertMode: 2, valueDisplay: '' })) }),
      getAttrsInfoByKey: async ({ key }) => ok({ key, format: 6, contentRule: { maxLength: 140 } }),
      versionInfo: async () => ok({ ...toCollectionUpdatePayload(remote, 'collection_1', auth, 0), version: 'snapshot_old',
        systemPropertyDescriptors: remote.inputs.map(({ key, value }) => ({ key, valueDisplay: value, insertMode: 2 })) }),
      getRules: async () => ok({ status: 0, conditionType: 1, filterConditions: [] }),
      getPublishedItems: vi.fn(async (params) => page(published, params)),
      getDraftItems: vi.fn(async (params) => page(catalogueDraft, params)),
      updateCollection: vi.fn(async () => ok({})),
    };
    preview = vi.spyOn(tty, 'confirmWrite').mockRejectedValue(new CliError('已取消', 'FORM_CANCELLED'));
  });
  afterEach(() => {
    try { expect(unintendedRequest).not.toHaveBeenCalled(); }
    finally { vi.restoreAllMocks(); resetEnvForTests(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); }
  });
  async function cancelAndRead(includeItems: 'auto' | 'yes' | 'no' = 'auto'): Promise<string> {
    const file = collectionFormDraftPath(cwd, 'collection_1');
    const before = existsSync(file) ? formBytes() : undefined;
    await expect(publishCollection({ ...args(), includeItems })).rejects.toMatchObject({ code: 'FORM_CANCELLED' });
    expect(api.updateCollection).not.toHaveBeenCalled();
    expect(existsSync(marker())).toBe(false);
    if (before === undefined) expect(existsSync(file)).toBe(false);
    else expect(formBytes()).toBe(before);
    expect(preview).toHaveBeenCalledTimes(1);
    return preview.mock.calls[0]![0] as string;
  }

  it('C07.P01 完整差异送入真正的publish确认入口；取消不写入且保留稿', async () => {
    systemKeys = ['artist'];
    remote = { ...empty(), inputs: [{ key: 'artist', value: '旧作者' }],
      properties: [{ key: 'oldKey', name: '旧字段', value: '值', description: '旧说明' }],
      options: [{ key: 'choice', name: '选择', kind: 'select', values: ['red', 'blue'], description: '颜色' }],
      description: '旧简介', dependencies: [{ resourceId: 'dep_keep', versionRange: '^1.0.0' }, { resourceId: 'dep_remove', versionRange: '*' }] };
    auth = [{ resourceId: 'source_a', excludedType: 'contractId', excludedValue: 'contract_a' }];
    published = [item('a', 'source_a', '旧标题', 1), item('b', 'source_b', '待移除', 2)];
    catalogueDraft = [item('c', 'source_c', '新单品', 1), item('a', 'source_a', '新标题', 3)];
    await pullCollectionForm(args());
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, inputs: [{ key: 'artist', value: '' }],
      properties: [{ ...form.properties[0]!, key: 'newKey' }],
      options: [{ ...form.options[0]!, values: ['blue', 'red'], description: '' }, { key: 'text', name: '文字', kind: 'input', value: '', description: '' }],
      description: '', display: { sort: 'descending', title: 'hidden', number: false, image: false, description: false, view: 'card' },
      dependencies: [{ resourceId: 'dep_keep', versionRange: '^2.0.0' }, { resourceId: 'dep_add', versionRange: '~1.1.0' }] }));
    const text = await cancelAndRead();
    for (const expected of [
      '删除 "oldKey"：{"key":"oldKey","name":"旧字段","value":"值","description":"旧说明"}',
      '环境："test"', '目标："alice/collection"', 'resourceId："collection_1"',
      '修改 "artist"：{"key":"artist","value":"旧作者"} → {"key":"artist","value":""}',
      '新增 "newKey"：{"key":"newKey","name":"旧字段","value":"值","description":"旧说明"}',
      '修改 "choice"：{"key":"choice","name":"选择","kind":"select","values":["red","blue"],"description":"颜色"} → {"key":"choice","name":"选择","kind":"select","values":["blue","red"],"description":""}',
      '新增 "text"：{"key":"text","name":"文字","kind":"input","value":"","description":""}',
      '简介："旧简介" → ""', 'sort："ascending" → "descending"', 'title："resource-title" → "hidden"',
      'number：true → false', 'image：true → false', 'description：true → false', 'view："list" → "card"',
      '修改 "dep_keep"：{"resourceId":"dep_keep","versionRange":"^1.0.0"} → {"resourceId":"dep_keep","versionRange":"^2.0.0"}',
      '删除 "dep_remove"：{"resourceId":"dep_remove","versionRange":"*"}', '新增 "dep_add"：{"resourceId":"dep_add","versionRange":"~1.1.0"}',
      '移除单品 "b"：{"itemId":"b","resourceId":"source_b","itemTitle":"待移除","sortId":2}',
      '新增单品 "c"：{"itemId":"c","resourceId":"source_c","itemTitle":"新单品","sortId":1}',
      '修改单品 "a" itemTitle："旧标题" → "新标题"', '修改单品 "a" sortId：1 → 3',
      '目录顺序：["a","b"] → ["c","a"]', '目录：合并服务端目录草稿',
      '授权排除映射：原样保留 [{"resourceId":"source_a","excludedType":"contractId","excludedValue":"contract_a"}]', '未查询实时消费授权',
    ]) expect(text).toContain(expected);
  });

  it('C07.P02 include-items no展示差异但明确本次不发布目录', async () => {
    published = [item('a', 'source', '旧', 1)]; catalogueDraft = [item('a', 'source', '新', 1)];
    await pullCollectionForm(args());
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '表单变更' }));
    const text = await cancelAndRead('no');
    expect(text).toContain('目录：不合并目录');
    expect(text).toContain('目录草稿差异（本次不发布）');
    expect(text).toContain('修改单品 "a" itemTitle："旧" → "新"');
    expect(text).toContain('授权排除映射：原样保留 []');
  });

  it('C07.P03 无本地表单稿的纯目录发布仍展示真实基线和新增来源', async () => {
    catalogueDraft = [item('first', 'source_first', '首个单品', 1)];
    const text = await cancelAndRead();
    expect(text).toContain('【系统附加值】\n无变化');
    expect(text).toContain('【自定义属性】\n无变化');
    expect(text).toContain('简介：无变化');
    expect(text).toContain('【展示设置】\n无变化');
    expect(text).toContain('【直接依赖】\n无变化');
    expect(text).toContain('新增单品 "first"：{"itemId":"first","resourceId":"source_first","itemTitle":"首个单品","sortId":1}');
    expect(text).toContain('目录顺序：[] → ["first"]');
  });

  it('C07.P04 只改顺序、相同标题和sortId仍按itemId显示完整目录序列', async () => {
    published = [item('a', 'one', '同名', 1), item('b', 'two', '同名', 1)]; catalogueDraft = [...published].reverse();
    const text = await cancelAndRead();
    expect(text).toContain('目录顺序：["a","b"] → ["b","a"]');
    expect(text).not.toContain('修改单品');
    expect(text).not.toContain('新增单品');
    expect(text).not.toContain('移除单品');
  });

  it('C07.P04 表单和依赖仅顺序变化也不能展示为无变化', async () => {
    systemKeys = ['alpha', 'beta'];
    remote = { ...empty(), inputs: [{ key: 'alpha', value: 'a' }, { key: 'beta', value: 'b' }],
      properties: [{ key: 'propOne', name: '一', value: '', description: '' }, { key: 'propTwo', name: '二', value: '', description: '' }],
      options: [{ key: 'optOne', name: '三', kind: 'input', value: '', description: '' }, { key: 'optTwo', name: '四', kind: 'input', value: '', description: '' }],
      dependencies: [{ resourceId: 'depOne', versionRange: '*' }, { resourceId: 'depTwo', versionRange: '*' }] };
    await pullCollectionForm(args());
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, inputs: [...form.inputs].reverse(), properties: [...form.properties].reverse(),
      options: [...form.options].reverse(), dependencies: [...form.dependencies].reverse() }));
    const text = await cancelAndRead('no');
    for (const expected of ['【系统附加值】\n顺序：["alpha","beta"] → ["beta","alpha"]',
      '【自定义属性】\n顺序：["propOne","propTwo"] → ["propTwo","propOne"]',
      '顺序：["optOne","optTwo"] → ["optTwo","optOne"]', '【直接依赖】\n顺序：["depOne","depTwo"] → ["depTwo","depOne"]']) expect(text).toContain(expected);
    expect(text).toContain('【目录草稿差异（本次不发布）】\n无变化');
  });

  it('C07.P06 全量分页的最后一个单品也在确认内容中，不截断序列', async () => {
    published = Array.from({ length: 101 }, (_, index) => item(`item_${index}`, `source_${index}`, `标题${index}`, index));
    catalogueDraft = [...published, item('last', 'last_source', '最后一项', 101)];
    const text = await cancelAndRead();
    expect(text).toContain('新增单品 "last"：{"itemId":"last","resourceId":"last_source","itemTitle":"最后一项","sortId":101}');
    expect(text).toContain(`目录顺序：${JSON.stringify(published.map((entry) => entry.itemId))} → ${JSON.stringify(catalogueDraft.map((entry) => entry.itemId))}`);
    for (const request of [api.getPublishedItems, api.getDraftItems]) {
      expect(request).toHaveBeenCalledTimes(2);
      expect(request).toHaveBeenNthCalledWith(2, { resourceId: 'collection_1', skip: 100, limit: 100, sortField: 'sortId', sortType: 1 });
    }
  });

  it('C07.P06 动态字符串转义换行、ESC、C1和方向控制符，不伪造预览结构', async () => {
    catalogueDraft = [item('new', 'source', '恶意\n目录：不合并目录\u001b[2J\u009b\u202e', 1)];
    const text = await cancelAndRead();
    expect(text).toContain('"itemTitle":"恶意\\n目录：不合并目录\\u001b[2J\\u009b\\u202e"');
    expect(text.split('\n').filter((line) => line.startsWith('目录：'))).toEqual(['目录：合并服务端目录草稿']);
    expect(text).not.toMatch(/[\u001b\u009b\u202e]/);
  });

  it.each([true, false])('C07.P05 --yes真实确认函数不提问；交互=%s时预览输出边界正确', async (interactive) => {
    await pullCollectionForm(args());
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '已确认的新简介' }));
    preview.mockRestore();
    vi.spyOn(tty, 'isInteractive').mockReturnValue(interactive);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    api.updateCollection = vi.fn(async () => { remote = structuredClone(readCollectionFormDraft(cwd, 'collection_1')!.form); return ok({}); });
    const payload = await publishCollection({ ...args(), yes: true, includeItems: 'no' });
    expect(payload).toEqual({ resourceId: 'collection_1', inputAttrs: [], customPropertyDescriptors: [], description: '已确认的新简介',
      catalogueProperty: { collection_sort_list: 'collection_sort_ascending', collection_item_title: 'collection_item_title_rtitle', collection_item_no_display: 'collection_item_no_display_show',
        collection_item_image_display: 'collection_item_image_display_show', collection_item_descr_display: 'collection_item_descr_display_show', collection_view: 'collection_view_list' },
      dependencies: [], authExcludedItems: [], isMergeCatalogueDraft: 0 });
    expect(api.updateCollection).toHaveBeenCalledTimes(1);
    expect(stdout).not.toHaveBeenCalled();
    if (interactive) {
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(stderr.mock.calls[0]![0]).toContain('简介："" → "已确认的新简介"');
    } else expect(stderr).not.toHaveBeenCalled();
    expect(existsSync(marker())).toBe(false);
    expect(existsSync(collectionFormDraftPath(cwd, 'collection_1'))).toBe(false);
    // 两轮预检＋一次发布后读回；预览未追加请求。
    expect(api.getPublishedItems).toHaveBeenCalledTimes(3);
    expect(api.getDraftItems).toHaveBeenCalledTimes(3);
  });

  it('C07.P01 非TTY未给yes仍拒绝，不产生额外stdout或写入', async () => {
    catalogueDraft = [item('a', 'source', '单品', 1)];
    preview.mockRestore();
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(publishCollection(args())).rejects.toMatchObject({ code: 'FORM_NEED_YES' });
    expect(api.updateCollection).not.toHaveBeenCalled(); expect(existsSync(marker())).toBe(false);
    expect(stdout).not.toHaveBeenCalled(); expect(stderr).not.toHaveBeenCalled();
  });
});
