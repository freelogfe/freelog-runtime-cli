import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as tty from '../../src/core/tty';
import * as atomicWrite from '../../src/core/atomicWrite';
import { loginAccount } from '../../src/domain/account/login';
import { collectionFormDraftPath, mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft, type AuthExcludedItem, type CollectionForm } from '../../src/domain/collection/form';
import { publishCollection, type CollectionPublishApis } from '../../src/domain/collection/publish';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { FUtil } from '../../src/platform/api';

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const item = (itemId: string, itemTitle: string, sortId: number) => ({ itemId, itemTitle, sortId, mountResourceInfo: { resourceId: `source_${itemId}` } });
type Row = ReturnType<typeof item>;
type Mode = 'auto' | 'yes' | 'no';

/** Compare all ordinary local bytes, not merely the draft's parsed semantic value. */
function files(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else result[path.relative(root, file).replaceAll('\\', '/')] = readFileSync(file).toString('base64');
    }
  };
  walk(root);
  return result;
}

const baseline = (): CollectionForm => ({
  $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'artist', value: '原作者' }],
  properties: [{ key: 'author', name: '作者', value: 'Alice', description: '作者说明' }],
  options: [{ key: 'caption', name: '文字', kind: 'input', value: '原文', description: '文字说明' },
    { key: 'colour', name: '颜色', kind: 'select', values: ['red', 'blue'], description: '颜色说明' }],
  description: '原简介', display: { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' },
  dependencies: [{ resourceId: 'dependency_one', versionRange: '^1.0.0' }],
});
const displayDto = () => ({ collection_sort_list: 'collection_sort_ascending', collection_item_title: 'collection_item_title_rtitle',
  collection_item_no_display: 'collection_item_no_display_show', collection_item_image_display: 'collection_item_image_display_show',
  collection_item_descr_display: 'collection_item_descr_display_show', collection_view: 'collection_view_list' });

// Independent read DTO: never derive it with the production write-payload converter.
function versionDto(form: CollectionForm, auth: AuthExcludedItem[], version: string) {
  return { resourceId: 'collection_1', version,
    systemPropertyDescriptors: form.inputs.map(({ key, value }) => ({ key, insertMode: 2, valueDisplay: value })),
    customPropertyDescriptors: [
      ...form.properties.map((p) => ({ key: p.key, name: p.name, type: 'readonlyText', defaultValue: p.value, remark: p.description })),
      ...form.options.map((p) => p.kind === 'input'
        ? { key: p.key, name: p.name, type: 'editableText', defaultValue: p.value, remark: p.description }
        : { key: p.key, name: p.name, type: 'select', defaultValue: p.values![0], candidateItems: structuredClone(p.values), remark: p.description }),
    ], description: form.description, catalogueProperty: displayDto(), dependencies: structuredClone(form.dependencies), authExcludedItems: structuredClone(auth) };
}

// Explicit twelve-row oracle, independent of the implementation's conditional expressions.
const modes: { mode: Mode; automatic: 0 | 1; diff: boolean; merge?: 0 | 1; code?: string }[] = [
  { mode: 'auto', automatic: 0, diff: false, merge: 0 },
  { mode: 'yes', automatic: 0, diff: false, code: 'COLLECTION_MERGE_NOT_NEEDED' },
  { mode: 'no', automatic: 0, diff: false, merge: 0 },
  { mode: 'auto', automatic: 0, diff: true, merge: 1 },
  { mode: 'yes', automatic: 0, diff: true, merge: 1 },
  { mode: 'no', automatic: 0, diff: true, merge: 0 },
  { mode: 'auto', automatic: 1, diff: false, merge: 0 },
  { mode: 'yes', automatic: 1, diff: false, code: 'COLLECTION_AUTO_MERGE_FORBIDDEN' },
  { mode: 'no', automatic: 1, diff: false, merge: 0 },
  { mode: 'auto', automatic: 1, diff: true, code: 'COLLECTION_AUTO_MERGE_FORBIDDEN' },
  { mode: 'yes', automatic: 1, diff: true, code: 'COLLECTION_AUTO_MERGE_FORBIDDEN' },
  { mode: 'no', automatic: 1, diff: true, merge: 0 },
];

describe('C08 合集发布模式与确认前并发门禁', () => {
  let cwd: string; let homeDir: string; let remote: CollectionForm; let auth: AuthExcludedItem[];
  let published: Row[]; let draftItems: Row[]; let info: Record<string, unknown>;
  let automatic: 0 | 1; let supportsOptions: number | string; let payloads: Record<string, unknown>[];
  let systemMode: 1 | 2; let systemMax: number;
  let api: CollectionPublishApis; let confirm: MockInstance<typeof tty.confirmWrite>;
  let savedAdapter: typeof FUtil.Axios.defaults.adapter;
  let intentWrites: string[];
  const networkGuard = vi.fn(async () => { throw new Error('C08_UNINJECTED_NETWORK_FORBIDDEN'); });
  const args = () => ({ cwd, homeDir, selector: 'id:collection_1', apis: api });
  const marker = () => path.join(cwd, '.freelog/collection-forms/intents/collection_1.json');
  const draftFile = () => collectionFormDraftPath(cwd, 'collection_1');
  const page = (rows: Row[], params: Record<string, unknown>) => ok({ skip: params.skip, limit: params.limit, totalItem: rows.length,
    dataList: structuredClone(rows.slice(Number(params.skip), Number(params.skip) + Number(params.limit))) });

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-preflight-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-preflight-home-'));
    savedAdapter = FUtil.Axios.defaults.adapter;
    networkGuard.mockClear(); FUtil.Axios.defaults.adapter = networkGuard;
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'synthetic', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'synthetic' } }) });
    mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    writeFileSync(path.join(cwd, '.freelog/1.json'), JSON.stringify({ schemaVersion: 1, subject: 'collection', resourceId: 'collection_1', resourceName: 'alice/collection', name: 'collection', title: '可变展示标题', typeCode: 'CT001', env: 'test' }));
    writeFileSync(path.join(cwd, 'keep.bin'), Buffer.from([0, 255, 13, 10, 128]));
    remote = baseline(); auth = [{ resourceId: 'dependency_one', excludedType: 'contractId', excludedValue: 'contract_one' }];
    published = [item('one', '原单品', 1)]; draftItems = structuredClone(published);
    automatic = 0; supportsOptions = 2; systemMode = 2; systemMax = 500; payloads = []; intentWrites = [];
    info = { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 4, serializeStatus: 0, latestVersion: 'snapshot_old' };
    api = {
      info: async () => ok(structuredClone(info)),
      resourceTypes: async () => ok([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
      getByCode: async () => ok({ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], attrs: [{ key: 'artist', name: '系统作者' }], resourceConfig: { supportOptionalConfig: supportsOptions } }),
      filesInfo: async () => ok({ metaInfoArray: [{ key: 'artist', name: '系统作者', remark: '', insertMode: systemMode, valueDisplay: '' }] }),
      getAttrsInfoByKey: async () => ok({ key: 'artist', format: 6, contentRule: { maxLength: systemMax } }),
      versionInfo: async () => ok(versionDto(remote, auth, String(info.latestVersion))),
      getRules: async () => ok({ status: automatic, conditionType: 1, filterConditions: [] }),
      getPublishedItems: async (params) => page(published, params), getDraftItems: async (params) => page(draftItems, params),
      updateCollection: async (value) => {
        payloads.push(structuredClone(value));
        const local = existsSync(draftFile()) ? JSON.parse(readFileSync(draftFile(), 'utf8')).form as CollectionForm : remote;
        remote = structuredClone(local); info.latestVersion = 'snapshot_new';
        if (value.isMergeCatalogueDraft === 1) published = structuredClone(draftItems);
        return ok({});
      },
    };
    confirm = vi.spyOn(tty, 'confirmWrite').mockImplementation(async (preview) => preview);
    // Observe actual persistence attempts, including records later deleted; preserve the real write.
    const originalWrite = atomicWrite.atomicWriteFile;
    vi.spyOn(atomicWrite, 'atomicWriteFile').mockImplementation((file, content) => {
      if (file === marker()) intentWrites.push(content);
      originalWrite(file, content);
    });
  });
  afterEach(() => {
    try { expect(networkGuard).not.toHaveBeenCalled(); }
    finally { FUtil.Axios.defaults.adapter = savedAdapter; vi.restoreAllMocks(); resetEnvForTests(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); }
  });

  async function localDraft() {
    await pullCollectionForm(args());
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '本次简介',
      options: [{ ...form.options[0]!, value: '' }, form.options[1]!], dependencies: [{ resourceId: 'dependency_one', versionRange: '^2.0.0' }] }));
  }
  function expectedPayload(hasDraft: boolean, merge: 0 | 1) {
    return { resourceId: 'collection_1', inputAttrs: [{ key: 'artist', value: '原作者' }],
      customPropertyDescriptors: [
        { key: 'author', name: '作者', defaultValue: 'Alice', type: 'readonlyText', remark: '作者说明' },
        { key: 'caption', name: '文字', defaultValue: hasDraft ? '' : '原文', type: 'editableText', remark: '文字说明' },
        { key: 'colour', name: '颜色', defaultValue: 'red', type: 'select', candidateItems: ['red', 'blue'], remark: '颜色说明' },
      ], description: hasDraft ? '本次简介' : '原简介', catalogueProperty: displayDto(),
      dependencies: [{ resourceId: 'dependency_one', versionRange: hasDraft ? '^2.0.0' : '^1.0.0' }],
      authExcludedItems: [{ resourceId: 'dependency_one', excludedType: 'contractId', excludedValue: 'contract_one' }], isMergeCatalogueDraft: merge };
  }

  async function checkMode(row: typeof modes[number], hasDraft: boolean, omitted = false) {
    automatic = row.automatic;
    if (row.diff) draftItems = [item('two', '新单品', 2), item('one', '重命名单品', 3)];
    if (hasDraft) await localDraft();
    const before = files(cwd), beforeHome = files(homeDir), initialDraft = structuredClone(draftItems), initialPublished = structuredClone(published);
    const code = row.code ?? (!hasDraft && row.merge === 0 ? 'COLLECTION_PUBLISH_NOTHING_TO_DO' : undefined);
    const action = publishCollection({ ...args(), ...(omitted ? {} : { includeItems: row.mode }), yes: true });
    if (code) {
      await expect(action).rejects.toMatchObject({ code });
      expect(payloads).toEqual([]); expect(confirm).not.toHaveBeenCalled();
      expect(intentWrites).toEqual([]);
      expect(files(cwd)).toEqual(before); expect(published).toEqual(initialPublished);
    } else {
      await expect(action).resolves.toEqual(expectedPayload(hasDraft, row.merge!));
      expect(payloads).toEqual([expectedPayload(hasDraft, row.merge!)]);
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(intentWrites.map((content) => JSON.parse(content).state)).toEqual(['prepared', 'sending']);
      const after = { ...before }; if (hasDraft) delete after[path.relative(cwd, draftFile()).replaceAll('\\', '/')];
      expect(files(cwd)).toEqual(after);
      expect(published).toEqual(row.merge === 1 ? initialDraft : initialPublished);
    }
    expect(existsSync(marker())).toBe(false); expect(draftItems).toEqual(initialDraft); expect(files(homeDir)).toEqual(beforeHome);
  }

  for (const field of ['resourceId', 'excludedValue'] as const) {
    it.each(['', ' ', 'id ', 'id\n', 'id\tX', 'id\u200e', 7, null])(`C06授权映射${field}=%s的非法原始标识不会成为发布事实`, async (value) => {
      api.versionInfo = async () => ok({ ...versionDto(remote, auth, String(info.latestVersion)),
        authExcludedItems: [{ ...auth[0], [field]: value }],
      });
      // Pull the same malformed mapping first: a later drift mismatch must not mask a weak parser.
      await pullCollectionForm(args());
      mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '本次简介' }));
      const before = files(cwd), beforeHome = files(homeDir), oldRemote = structuredClone(remote);
      await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_AUTH_STATE_UNREADABLE' });
      expect(readCollectionFormDraft(cwd, 'collection_1')!.authState).toBe('unknown');
      expect(confirm).not.toHaveBeenCalled(); expect(payloads).toEqual([]); expect(intentWrites).toEqual([]);
      expect(files(cwd)).toEqual(before); expect(files(homeDir)).toEqual(beforeHome); expect(remote).toEqual(oldRemote);
    });
  }

  it('C06多个contractId/policyId映射经pull、编辑和完整发布保持顺序和值，不清空或重建', async () => {
    auth = [
      { resourceId: 'upstream_b', excludedType: 'policyId', excludedValue: 'policy_b' },
      { resourceId: 'upstream_a', excludedType: 'contractId', excludedValue: 'contract_a' },
      { resourceId: 'upstream_a', excludedType: 'contractId', excludedValue: 'contract_b' },
    ];
    const expectedAuth = structuredClone(auth);
    await localDraft();
    const expected = { ...expectedPayload(true, 0), authExcludedItems: expectedAuth };
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).resolves.toEqual(expected);
    expect(payloads).toEqual([expected]); expect(auth).toEqual(expectedAuth);
    expect(intentWrites.map((content) => JSON.parse(content).expectedAuthExcludedItems)).toEqual([expectedAuth, expectedAuth]);
    expect(existsSync(marker())).toBe(false); expect(existsSync(draftFile())).toBe(false);
  });

  it.each(['readonly', 'tightened'] as const)('当前系统配置在确认期间%s，零intent/PUT并保留当前稿', async (change) => {
    await localDraft();
    const before = files(cwd), beforeHome = files(homeDir);
    confirm.mockImplementation(async (preview) => { if (change === 'readonly') systemMode = 1; else systemMax = 1; return preview; });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: change === 'readonly' ? 'COLLECTION_SYSTEM_INPUT_INVALID' : 'COLLECTION_SYSTEM_VALUE_INVALID' });
    expect(confirm).toHaveBeenCalledOnce(); expect(payloads).toEqual([]); expect(intentWrites).toEqual([]);
    expect(files(cwd)).toEqual(before); expect(files(homeDir)).toEqual(beforeHome);
  });

  it.each([false, true])('首次发行有本地稿=%s时基线仍为空，提交完整当前系统空值及目录', async (hasDraft) => {
    info.latestVersion = ''; auth = [];
    remote = { $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], description: '',
      display: { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' }, dependencies: [] };
    published = []; draftItems = [item('one', '首发单品', 1)];
    if (hasDraft) {
      await pullCollectionForm(args());
      expect(readCollectionFormDraft(cwd, 'collection_1')!.baseline.inputs).toEqual([]);
    }
    const expectedForm = { ...remote, inputs: [{ key: 'artist', value: '' }] };
    const expected = { resourceId: 'collection_1', inputAttrs: [{ key: 'artist', value: '' }], customPropertyDescriptors: [],
      description: '', catalogueProperty: displayDto(), dependencies: [], authExcludedItems: [], isMergeCatalogueDraft: 1 };
    api.updateCollection = async (value) => {
      payloads.push(structuredClone(value)); remote = structuredClone(expectedForm); info.latestVersion = 'snapshot_new';
      published = structuredClone(draftItems); return ok({});
    };
    await expect(publishCollection({ ...args(), includeItems: 'yes', yes: true })).resolves.toEqual(expected);
    expect(payloads).toEqual([expected]); expect(remote.inputs).toEqual(expectedForm.inputs);
    expect(intentWrites.map((content) => JSON.parse(content).baselineFingerprint)).toEqual([
      // The persisted baseline is the empty remote form, not its enriched outbound working form.
      createHash('sha256').update(JSON.stringify({ ...expectedForm, inputs: [] })).digest('hex'),
      createHash('sha256').update(JSON.stringify({ ...expectedForm, inputs: [] })).digest('hex'),
    ]);
    expect(existsSync(marker())).toBe(false); expect(existsSync(draftFile())).toBe(false);
  });

  it.each(['metadata', 'definition'] as const)('当前%s读取失败时零确认/intent/PUT并完整保留现场', async (failure) => {
    await localDraft();
    const before = files(cwd), beforeHome = files(homeDir);
    if (failure === 'metadata') api.filesInfo = async () => ok({});
    else api.getAttrsInfoByKey = async () => ({ ret: 1, errCode: 1, data: {} });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_SYSTEM_RESPONSE_INVALID' });
    expect(confirm).not.toHaveBeenCalled(); expect(payloads).toEqual([]); expect(intentWrites).toEqual([]);
    expect(files(cwd)).toEqual(before); expect(files(homeDir)).toEqual(beforeHome);
  });

  it('系统字段当前允许500字符时完整发出并精确读回，不被通用140截断', async () => {
    await localDraft();
    const value = '值'.repeat(500);
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, inputs: [{ key: 'artist', value }] }));
    const expected = { ...expectedPayload(true, 0), inputAttrs: [{ key: 'artist', value }] };
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).resolves.toEqual(expected);
    expect(payloads).toEqual([expected]); expect(remote.inputs).toEqual([{ key: 'artist', value }]);
    expect(existsSync(marker())).toBe(false); expect(existsSync(draftFile())).toBe(false);
  });

  it.each([
    ['系统附加值', (f: CollectionForm) => { f.inputs[0]!.value = '另一个作者'; }],
    ['属性', (f: CollectionForm) => { f.properties[0]!.value = '另一个值'; }],
    ['文本配置', (f: CollectionForm) => { f.options[0]!.value = '另一个默认值'; }],
    ['下拉配置', (f: CollectionForm) => { f.options[1]!.values = ['blue', 'red']; }],
    ['目录展示', (f: CollectionForm) => { f.display.title = 'hidden'; }],
    ['说明', (f: CollectionForm) => { f.description = '另一个说明'; }],
    ['依赖', (f: CollectionForm) => { f.dependencies[0]!.versionRange = '^3.0.0'; }],
  ] as const)('C06预检时已发布%s基线已变，保留当前稿且零确认/intent/PUT', async (_label, change) => {
    await localDraft(); change(remote);
    // The model's independently specified read DTO must reflect the externally changed display.
    if (_label === '目录展示') api.versionInfo = async () => ok({ ...versionDto(remote, auth, String(info.latestVersion)),
      catalogueProperty: { ...displayDto(), collection_item_title: 'collection_item_title_empty' } });
    const before = files(cwd), beforeHome = files(homeDir), changedRemote = structuredClone(remote);
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_FORM_BASELINE_CHANGED' });
    expect(confirm).not.toHaveBeenCalled(); expect(payloads).toEqual([]); expect(intentWrites).toEqual([]);
    expect(files(cwd)).toEqual(before); expect(files(homeDir)).toEqual(beforeHome); expect(remote).toEqual(changedRemote);
  });

  it.each(['radio', 'checkbox', 'future'])('C06发布入口不认识远端%s描述符时保稿零intent/PUT', async (type) => {
    await localDraft();
    const before = files(cwd), beforeHome = files(homeDir);
    api.versionInfo = async () => ok({ ...versionDto(remote, auth, String(info.latestVersion)),
      customPropertyDescriptors: [{ key: 'unknown', name: '未知配置', type, defaultValue: '不能丢弃' }],
    });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_FORM_UNKNOWN_DESCRIPTOR' });
    expect(confirm).not.toHaveBeenCalled(); expect(payloads).toEqual([]); expect(intentWrites).toEqual([]);
    expect(files(cwd)).toEqual(before); expect(files(homeDir)).toEqual(beforeHome);
  });

  it.each(['2', '02', ' 2 '].flatMap((value) => ['preflight', 'after-confirm'].map((stage) => ({ value, stage }))))('C06 能力$value在$stage不能强转为开放', async ({ value, stage }) => {
    await localDraft();
    const before = files(cwd), beforeHome = files(homeDir);
    if (stage === 'preflight') supportsOptions = value;
    else confirm.mockImplementation(async (preview) => { supportsOptions = value; return preview; });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true }))
      .rejects.toMatchObject({ code: 'COLLECTION_FORM_OPTIONS_UNSUPPORTED' });
    expect(confirm).toHaveBeenCalledTimes(stage === 'preflight' ? 0 : 1);
    expect(payloads).toEqual([]);
    expect(intentWrites).toEqual([]);
    expect(files(cwd)).toEqual(before);
    expect(files(homeDir)).toEqual(beforeHome);
  });

  modes.forEach((row, index) => {
    for (const hasDraft of [true, false]) {
      const id = String(index * 2 + (hasDraft ? 1 : 2)).padStart(2, '0');
      it(`C08.M${id} ${row.mode} automatic=${row.automatic} directoryDiff=${row.diff} localDraft=${hasDraft}`, async () => checkMode(row, hasDraft));
    }
  });
  modes.filter((row) => row.mode === 'auto').forEach((row) => {
    for (const hasDraft of [true, false]) it(`省略include-items等价auto automatic=${row.automatic} directoryDiff=${row.diff} localDraft=${hasDraft}`, async () => checkMode(row, hasDraft, true));
  });

  const conflicts = [
    ['C08.C01', '自动规则', 'COLLECTION_FORM_BASELINE_CHANGED', () => { automatic = 1; }],
    ['C08.C02', '类型可选配置能力', 'COLLECTION_FORM_OPTIONS_UNSUPPORTED', () => { supportsOptions = 1; }],
    ['C08.C03', '仅已发布简介', 'COLLECTION_FORM_BASELINE_CHANGED', () => { remote.description = '其它客户端'; }],
    ['C08.C03', '仅已发布依赖范围', 'COLLECTION_FORM_BASELINE_CHANGED', () => { remote.dependencies[0]!.versionRange = '^3.0.0'; }],
    ['C08.C04', '授权排除', 'COLLECTION_FORM_BASELINE_CHANGED', () => { auth[0]!.excludedValue = 'contract_other'; }],
    ['C08.C05', '已发布目录', 'COLLECTION_FORM_BASELINE_CHANGED', () => { published[0]!.itemTitle = '其它客户端改名'; }],
    ['C08.C06', '纳入合并的目录草稿', 'COLLECTION_FORM_BASELINE_CHANGED', () => { draftItems[0]!.itemTitle = '确认期间目录改名'; }],
    ['C08.C07', '本地稿', 'COLLECTION_FORM_CHANGED', () => { const value = JSON.parse(readFileSync(draftFile(), 'utf8')); value.form.description = '外部编辑器'; writeFileSync(draftFile(), `${JSON.stringify(value, null, 4)}\n`); }],
    ['C08.C08', '远端归属', 'COLLECTION_NOT_OWNER', () => { info.userId = 8; }],
    ['C08.C09', '远端完整标识', 'COLLECTION_IDENTITY_MISMATCH', () => { info.resourceName = 'alice/renamed'; }],
    ['C08.C10', '远端类型', 'COLLECTION_IDENTITY_MISMATCH', () => { info.resourceTypeCode = 'CT002'; }],
    ['C08.C11', '冻结', 'COLLECTION_FROZEN', () => { info.status = 2; }],
    ['C08.C12', 'RSS', 'COLLECTION_RSS_READONLY', () => { info.rssSource = 'yes'; }],
  ] as const;
  for (const [id, name, code, mutate] of conflicts) it(`${id} 确认期间${name}改变，在intent/PUT前拒绝且保留外部修改`, async () => {
    await localDraft(); draftItems = [item('two', '待合并目录', 1)];
    let expectedFiles: Record<string, string> | undefined;
    let expectedRemote: unknown;
    confirm.mockImplementation(async (preview) => {
      mutate(); expectedFiles = files(cwd);
      // The command owns this temporary lock and removes it in finally; external bytes are all retained.
      delete expectedFiles['.freelog/.lock'];
      expectedRemote = structuredClone({ info, remote, auth, published, draftItems, automatic, supportsOptions });
      return preview;
    });
    const beforeHome = files(homeDir);
    await expect(publishCollection({ ...args(), includeItems: 'auto' })).rejects.toMatchObject({ code });
    expect(confirm).toHaveBeenCalledTimes(1); expect(payloads).toEqual([]); expect(existsSync(marker())).toBe(false);
    expect(intentWrites).toEqual([]);
    expect(files(cwd)).toEqual(expectedFiles); expect(files(homeDir)).toEqual(beforeHome);
    expect({ info, remote, auth, published, draftItems, automatic, supportsOptions }).toEqual(expectedRemote);
  });

  it('C08.C06 no允许未合并目录草稿在确认期间变化，完整保留且只发布表单', async () => {
    await localDraft();
    confirm.mockImplementation(async (preview) => { draftItems = [item('later', '确认期间新增', 1)]; return preview; });
    await expect(publishCollection({ ...args(), includeItems: 'no' })).resolves.toEqual(expectedPayload(true, 0));
    expect(payloads).toEqual([expectedPayload(true, 0)]); expect(draftItems).toEqual([item('later', '确认期间新增', 1)]);
    expect(intentWrites.map((content) => JSON.parse(content).state)).toEqual(['prepared', 'sending']);
    expect(published).toEqual([item('one', '原单品', 1)]); expect(existsSync(marker())).toBe(false);
  });
  it('C08.C05 no仍拒绝确认期间已发布目录变化', async () => {
    await localDraft(); let expected: Record<string, string> | undefined;
    confirm.mockImplementation(async (preview) => { published[0]!.itemTitle = '其它客户端改名'; expected = files(cwd); delete expected['.freelog/.lock']; return preview; });
    await expect(publishCollection({ ...args(), includeItems: 'no' })).rejects.toMatchObject({ code: 'COLLECTION_FORM_BASELINE_CHANGED' });
    expect(payloads).toEqual([]); expect(files(cwd)).toEqual(expected); expect(existsSync(marker())).toBe(false);
    expect(intentWrites).toEqual([]);
    expect(published[0]!.itemTitle).toBe('其它客户端改名');
  });
  it('C08.W01 成功完整请求严格限定八个字段，不夹带listing/策略/上架或其它写入', async () => {
    await localDraft(); draftItems = [item('two', '新增单品', 1)];
    const before = files(cwd);
    await expect(publishCollection({ ...args(), includeItems: 'yes', yes: true })).resolves.toEqual(expectedPayload(true, 1));
    expect(payloads).toEqual([expectedPayload(true, 1)]);
    expect(Object.keys(payloads[0]!).sort()).toEqual(['resourceId', 'inputAttrs', 'customPropertyDescriptors', 'description', 'catalogueProperty', 'dependencies', 'authExcludedItems', 'isMergeCatalogueDraft'].sort());
    expect(intentWrites.map((content) => JSON.parse(content).state)).toEqual(['prepared', 'sending']);
    const after = { ...before }; delete after[path.relative(cwd, draftFile()).replaceAll('\\', '/')];
    expect(files(cwd)).toEqual(after); expect(existsSync(marker())).toBe(false);
    // Any unprovided SDK call, including createVersion/listing/policy/contract writes, is blocked by the adapter guard.
    expect(networkGuard).not.toHaveBeenCalled();
  });

  it('装置正控：曾创建后删除的intent仍被观察，最终不存在不能冒充零持久化', async () => {
    await localDraft();
    confirm.mockImplementation(async (preview) => {
      atomicWrite.atomicWriteFile(marker(), '{"syntheticTransient":true}\n');
      unlinkSync(marker());
      return preview;
    });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).resolves.toEqual(expectedPayload(true, 0));
    expect(existsSync(marker())).toBe(false);
    expect(intentWrites.map((content) => JSON.parse(content))).toHaveLength(3);
    expect(JSON.parse(intentWrites[0]!)).toEqual({ syntheticTransient: true });
    expect(intentWrites.slice(1).map((content) => JSON.parse(content).state)).toEqual(['prepared', 'sending']);
    expect(payloads).toEqual([expectedPayload(true, 0)]);
  });
});
