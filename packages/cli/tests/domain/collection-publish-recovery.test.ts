import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { inspectCollectionPublishIntent, publishCollection } from '../../src/domain/collection/publish';
import { mutateCollectionFormDraft, pullCollectionForm, readCollectionFormDraft, toCollectionUpdatePayload, type CollectionForm } from '../../src/domain/collection/form';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import * as tty from '../../src/core/tty';
import * as filesystem from 'node:fs';
import { createHash } from 'node:crypto';
import { FUtil } from '../../src/platform/api';

vi.mock('node:fs', async (original) => {
  const actual = await original<typeof filesystem>();
  return { ...actual, unlinkSync: vi.fn(actual.unlinkSync) };
});

const ok = (data: unknown) => ({ ret: 0, errCode: 0, data });
const empty = (): CollectionForm => ({ $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], description: '', display: { sort: 'ascending', title: 'resource-title', number: true, image: true, description: true, view: 'list' }, dependencies: [] });

describe('合集未决发布与显式恢复', () => {
  let cwd: string; let homeDir: string; let latest: string; let remote: CollectionForm; let writes: number;
  let published: Record<string, unknown>[]; let draftItems: Record<string, unknown>[];
  let afterWrite: () => void | Promise<void>; let versionPatch: Record<string, unknown>; let writeResult: unknown;
  const marker = () => path.join(cwd, '.freelog/collection-forms/intents/collection_1.json');
  const formFile = () => path.join(cwd, '.freelog/collection-forms/test/collection_1.json');
  const page = (rows: Record<string, unknown>[], params: Record<string, unknown>) => ok({ skip: params.skip, limit: params.limit, totalItem: rows.length, dataList: rows.slice(Number(params.skip), Number(params.skip) + Number(params.limit)) });
  const apis = () => ({
    info: async () => ok({ resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: 4, userId: 7, status: 0, latestVersion: latest }),
    resourceTypes: async () => ok([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
    getByCode: async () => ok({ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], attrs: [], resourceConfig: { supportOptionalConfig: 2 } }),
    filesInfo: async () => ok({ metaInfoArray: [] }),
    versionInfo: async () => ok({ ...toCollectionUpdatePayload(remote, 'collection_1', [], 0), systemPropertyDescriptors: remote.inputs.map(({ key, value }) => ({ key, valueDisplay: value, insertMode: 2 })), version: latest, ...versionPatch }),
    getRules: async () => ok({ serializeStatus: 0, status: 0, conditionType: 1, filterConditions: [] }),
    getPublishedItems: async (params: Record<string, unknown>) => page(published, params),
    getDraftItems: async (params: Record<string, unknown>) => page(draftItems, params),
    updateCollection: async (payload: Record<string, unknown>) => {
      writes += 1;
      remote = structuredClone(readCollectionFormDraft(cwd, 'collection_1')?.form ?? remote);
      latest = 'snapshot_1';
      if (payload.isMergeCatalogueDraft === 1) published = structuredClone(draftItems);
      await afterWrite();
      return writeResult;
    },
  });
  const args = () => ({ cwd, homeDir, selector: 'id:collection_1', apis: apis() });
  beforeEach(async () => {
    vi.mocked(filesystem.unlinkSync).mockImplementation((await vi.importActual<typeof filesystem>('node:fs')).unlinkSync);
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-recovery-home-'));
    latest = ''; remote = empty(); writes = 0; published = []; draftItems = []; versionPatch = {}; afterWrite = () => {}; writeResult = ok({});
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
    await pullCollectionForm(args());
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '本次提交' }));
  });
  afterEach(() => { vi.restoreAllMocks(); rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  async function loseReply() {
    afterWrite = () => { throw new Error('synthetic connection lost'); };
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_RESULT_UNKNOWN' });
    expect(writes).toBe(1);
    expect(existsSync(marker())).toBe(true);
  }

  it('真实tools-lib将非零errCode抛成异常后，完整拒绝仍按旧基线核验且可单独收尾', async () => {
    const previousAdapter = FUtil.Axios.defaults.adapter;
    const requests: Array<{ method: unknown; url: unknown }> = [];
    const originalUnlink = (await vi.importActual<typeof filesystem>('node:fs')).unlinkSync;
    vi.mocked(filesystem.unlinkSync).mockImplementation((file) => {
      if (file === marker()) throw new Error('synthetic cleanup failure');
      return originalUnlink(file);
    });
    FUtil.Axios.defaults.adapter = async (config) => {
      requests.push({ method: config.method, url: config.url });
      return { status: 200, statusText: 'OK', headers: {}, config, data: { ret: 1, errCode: 77, msg: 'UNTRUSTED_BACKEND_MESSAGE', data: null } };
    };
    try {
      const api = apis();
      await expect(publishCollection({ ...args(), apis: { ...api, updateCollection: undefined }, includeItems: 'no', yes: true }))
        .rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED' });
      expect(requests).toEqual([{ method: 'put', url: '/v2/resources/catalogue/collection_1' }]);
      expect(JSON.parse(readFileSync(marker(), 'utf8'))).toMatchObject({ state: 'rejected', rejection: { ret: 1, errCode: 77 } });
      expect(readCollectionFormDraft(cwd, 'collection_1')?.form.description).toBe('本次提交');
      vi.mocked(filesystem.unlinkSync).mockImplementation(originalUnlink);
      await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ verification: 'rejected', applied: true });
      expect(existsSync(marker())).toBe(false); expect(existsSync(formFile())).toBe(true);
      expect(requests).toHaveLength(1);
    } finally { FUtil.Axios.defaults.adapter = previousAdapter; }
  });

  it.each(['missing-ret', 'success-result', 'result-getter', 'ret-getter', 'inherited-result'])('SDK异常%s不能冒充明确拒绝或执行getter', async (kind) => {
    const getter = vi.fn(() => { throw new Error('MUST_NOT_READ_GETTER'); });
    const error = new Error('UNTRUSTED_ERROR_MESSAGE');
    if (kind === 'result-getter') Object.defineProperty(error, 'result', { get: getter });
    else if (kind === 'inherited-result') Object.setPrototypeOf(error, Object.assign(Object.create(Error.prototype), { result: { ret: 1, errCode: 77 } }));
    else Object.assign(error, { result: kind === 'missing-ret' ? { errCode: 77 }
      : kind === 'ret-getter' ? Object.defineProperty({ errCode: 77 }, 'ret', { get: getter }) : { ret: 0, errCode: 0 } });
    const update = vi.fn(async () => { throw error; });
    await expect(publishCollection({ ...args(), apis: { ...apis(), updateCollection: update }, includeItems: 'no', yes: true }))
      .rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_RESULT_UNKNOWN', message: '合集发布结果未知；请 collection publish resume 核验，不要重发' });
    expect(update).toHaveBeenCalledTimes(1); expect(getter).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(marker(), 'utf8')).state).toBe('unknown'); expect(existsSync(formFile())).toBe(true);
  });

  it('SDK有完整拒绝但旧快照改变时仍保留unknown，不清稿或记录', async () => {
    const update = vi.fn(async () => {
      latest = 'snapshot_1'; remote = { ...empty(), description: '其它已发布快照' };
      throw Object.assign(new Error('unsafe backend message'), { result: { ret: 1, errCode: 77 } });
    });
    await expect(publishCollection({ ...args(), apis: { ...apis(), updateCollection: update }, includeItems: 'no', yes: true }))
      .rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_VERIFY_FAILED' });
    expect(update).toHaveBeenCalledTimes(1); expect(JSON.parse(readFileSync(marker(), 'utf8')).state).toBe('unknown');
    expect(existsSync(formFile())).toBe(true);
  });

  it('已有未决记录时publish不能覆盖重发，也不能依赖pull绕过', async () => {
    await loseReply();
    const before = readFileSync(marker(), 'utf8');
    await pullCollectionForm({ ...args(), yes: true });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_PENDING' });
    expect(writes).toBe(1);
    expect(readFileSync(marker(), 'utf8')).toBe(before);
  });

  for (const state of ['unknown', 'rejected'] as const) it.each(['unavailable', 'new-key'] as const)(`首次未落地${state}恢复不读取后来%s的系统配置，也不重发或误删稿`, async (current) => {
    const getByCode = vi.fn(async () => ok({ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4],
      attrs: [{ key: 'artist', name: '作者' }], resourceConfig: { supportOptionalConfig: 2 } }));
    const filesInfo = vi.fn(async () => ok({ metaInfoArray: [{ key: 'artist', name: '作者', insertMode: 2, valueDisplay: '' }] }));
    const getAttrsInfoByKey = vi.fn(async () => ok({ key: 'artist', format: 6, contentRule: { maxLength: 500 } }));
    const api = { ...apis(), getByCode, filesInfo, getAttrsInfoByKey,
      updateCollection: async () => { writes += 1; if (state === 'unknown') throw new Error('synthetic reply lost'); return { ret: 1, errCode: 77 }; },
    };
    await pullCollectionForm({ ...args(), apis: api, yes: true });
    mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '首发未决稿' }));
    const originalUnlink = (await vi.importActual<typeof filesystem>('node:fs')).unlinkSync;
    if (state === 'rejected') vi.mocked(filesystem.unlinkSync).mockImplementation((file) => {
      if (file === marker()) throw new Error('synthetic cleanup failure'); return originalUnlink(file);
    });
    await expect(publishCollection({ ...args(), apis: api, includeItems: 'no', yes: true })).rejects.toMatchObject({
      code: state === 'unknown' ? 'COLLECTION_PUBLISH_RESULT_UNKNOWN' : 'COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED',
    });
    vi.mocked(filesystem.unlinkSync).mockImplementation(originalUnlink);
    const intentBefore = readFileSync(marker()), formBefore = readFileSync(formFile());
    getByCode.mockClear(); filesInfo.mockClear(); getAttrsInfoByKey.mockClear();
    filesInfo.mockImplementation(async () => {
      if (current === 'unavailable') throw new Error('current configuration unavailable');
      return ok({ metaInfoArray: [{ key: 'new_field', name: '新增字段', insertMode: 2, valueDisplay: '' }] });
    });
    await expect(inspectCollectionPublishIntent({ ...args(), apis: api })).resolves.toMatchObject({
      verification: state === 'unknown' ? 'unconfirmed' : 'rejected', applied: false,
    });
    expect(readFileSync(marker())).toEqual(intentBefore); expect(readFileSync(formFile())).toEqual(formBefore);
    if (state === 'rejected') {
      await expect(inspectCollectionPublishIntent({ ...args(), apis: api, apply: true, yes: true })).resolves.toMatchObject({ verification: 'rejected', applied: true });
      expect(existsSync(marker())).toBe(false);
    } else {
      await expect(inspectCollectionPublishIntent({ ...args(), apis: api, apply: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_RECOVER_UNCONFIRMED' });
      expect(readFileSync(marker())).toEqual(intentBefore);
    }
    expect(readFileSync(formFile())).toEqual(formBefore); expect(writes).toBe(1);
    expect(getByCode).not.toHaveBeenCalled(); expect(filesInfo).not.toHaveBeenCalled(); expect(getAttrsInfoByKey).not.toHaveBeenCalled();
  });

  it('默认resume仅诊断，完整匹配后apply才清未变稿与本次记录', async () => {
    await loseReply();
    const before = readFileSync(marker(), 'utf8');
    const draftBefore = readFileSync(formFile(), 'utf8');
    await expect(inspectCollectionPublishIntent(args())).resolves.toMatchObject({ schemaVersion: 1, resourceId: 'collection_1', env: 'test', verification: 'confirmed', localDraft: 'unchanged', applied: false });
    expect(readFileSync(marker(), 'utf8')).toBe(before);
    expect(readFileSync(formFile(), 'utf8')).toBe(draftBefore);
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ verification: 'confirmed', applied: true });
    expect(existsSync(marker())).toBe(false);
    expect(existsSync(formFile())).toBe(false);
    expect(writes).toBe(1);
  });

  it('默认resume不前滚无关本地事务', async () => {
    await loseReply();
    const after = '7\n';
    const txn = JSON.stringify({ schemaVersion: 1, entries: [{ path: '.sequence', before: null, beforeSha256: null, after, afterSha256: createHash('sha256').update(after).digest('hex') }] });
    const txnFile = path.join(cwd, '.freelog/.txn.json');
    writeFileSync(txnFile, txn);
    await expect(inspectCollectionPublishIntent(args())).resolves.toMatchObject({ applied: false });
    expect(readFileSync(txnFile, 'utf8')).toBe(txn);
    expect(existsSync(path.join(cwd, '.freelog/.sequence'))).toBe(false);
    expect(existsSync(marker())).toBe(true);
  });

  it('显式apply yes仍由领域写锁前滚本地事务并仅收尾，不重发', async () => {
    await loseReply();
    const hash = (value: string) => createHash('sha256').update(value).digest('hex');
    writeFileSync(path.join(cwd, '.freelog/.sequence'), '1\n');
    writeFileSync(path.join(cwd, '.freelog/.txn.json'), JSON.stringify({ schemaVersion: 1, entries: [{
      path: '.sequence', before: '1\n', beforeSha256: hash('1\n'), after: '2\n', afterSha256: hash('2\n'),
    }] }));
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ verification: 'confirmed', applied: true });
    expect(readFileSync(path.join(cwd, '.freelog/.sequence'), 'utf8')).toBe('2\n');
    expect(existsSync(path.join(cwd, '.freelog/.txn.json'))).toBe(false);
    expect(existsSync(marker())).toBe(false); expect(existsSync(formFile())).toBe(false); expect(writes).toBe(1);
  });

  it.each(['modified', 'invalid-json'])('远端成功后本地%s当前稿必须保留', async (mode) => {
    await loseReply();
    if (mode === 'modified') mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '后来编辑' }));
    else writeFileSync(formFile(), '{unfinished');
    const current = readFileSync(formFile(), 'utf8');
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ verification: 'confirmed', localDraft: 'changed', applied: true });
    expect(readFileSync(formFile(), 'utf8')).toBe(current);
    expect(existsSync(marker())).toBe(false);
    expect(writes).toBe(1);
  });

  it.each([{ authExcludedItems: undefined }, { authExcludedItems: [{ resourceId: 'different', excludedType: 'contractId', excludedValue: 'contract' }] }])('授权排除映射缺失或不同不能成功 %#', async (patch) => {
    await loseReply(); versionPatch = patch;
    const before = readFileSync(marker(), 'utf8');
    const current = readFileSync(formFile(), 'utf8');
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_RECOVER_UNCONFIRMED' });
    expect(readFileSync(marker(), 'utf8')).toBe(before);
    expect(readFileSync(formFile(), 'utf8')).toBe(current);
  });

  it('成功响应后auth映射读回不同也保留稿与intent', async () => {
    versionPatch = { authExcludedItems: [{ resourceId: 'different', excludedType: 'contractId', excludedValue: 'contract' }] };
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_VERIFY_FAILED' });
    expect(existsSync(marker())).toBe(true);
    expect(readCollectionFormDraft(cwd, 'collection_1')?.form.description).toBe('本次提交');
    expect(writes).toBe(1);
  });

  it.each([{ resourceId: 'another' }, { version: 'another' }, { customPropertyDescriptors: undefined }, { dependencies: undefined }, { systemPropertyDescriptors: undefined }, { catalogueProperty: { collection_view: 'unknown' } }])('读回版本身份或完整字段错误 %# 不能confirmed', async (patch) => {
    versionPatch = patch;
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_VERIFY_FAILED' });
    expect(existsSync(marker())).toBe(true);
    expect(existsSync(formFile())).toBe(true);
    expect(writes).toBe(1);
  });

  it('发送后编辑当前稿，正常成功收尾也不误删', async () => {
    afterWrite = () => { mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '发送后新修改' })); };
    await publishCollection({ ...args(), includeItems: 'no', yes: true });
    expect(readCollectionFormDraft(cwd, 'collection_1')?.form.description).toBe('发送后新修改');
    expect(existsSync(marker())).toBe(false);
    expect(writes).toBe(1);
  });

  it('读目录期间改稿时预检失败且零PUT/intent', async () => {
    const api = apis();
    api.getDraftItems = async (params) => { mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '预检时改稿' })); return page(draftItems, params); };
    await expect(publishCollection({ ...args(), apis: api, includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_FORM_CHANGED' });
    expect(writes).toBe(0);
    expect(existsSync(marker())).toBe(false);
    expect(readCollectionFormDraft(cwd, 'collection_1')?.form.description).toBe('预检时改稿');
  });

  it('旧v1不能补造成功或自动apply', async () => {
    await loseReply();
    writeFileSync(marker(), JSON.stringify({ schemaVersion: 1, resourceId: 'collection_1', state: 'unknown', baselineFingerprint: 'a'.repeat(64), directoryFingerprint: 'b'.repeat(64), payloadSha256: 'c'.repeat(64), sentAt: new Date().toISOString() }));
    const before = readFileSync(marker(), 'utf8');
    await expect(inspectCollectionPublishIntent(args())).resolves.toMatchObject({ verification: 'legacy-unverifiable', applied: false });
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_INTENT_LEGACY' });
    expect(readFileSync(marker(), 'utf8')).toBe(before);
  });

  it('用户确认期间线上基线改变，零PUT且保留当前稿', async () => {
    vi.spyOn(tty, 'confirmWrite').mockImplementation(async (preview) => { remote = { ...empty(), description: '另一个客户端发布' }; latest = 'external_snapshot'; return preview; });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_FORM_BASELINE_CHANGED' });
    expect(writes).toBe(0);
    expect(existsSync(marker())).toBe(false);
    expect(readCollectionFormDraft(cwd, 'collection_1')?.form.description).toBe('本次提交');
  });

  it('apply缺少yes在任何读取/清理前失败', async () => {
    await loseReply(); const before = readFileSync(marker(), 'utf8');
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true })).rejects.toMatchObject({ code: 'COLLECTION_RECOVER_NEED_YES' });
    expect(readFileSync(marker(), 'utf8')).toBe(before);
    expect(existsSync(formFile())).toBe(true);
  });

  it.each(['env', 'userId', 'resourceTypeCode', 'payloadSha256', 'json'])('intent%s变更不能认领/清理', async (field) => {
    await loseReply();
    const intent = JSON.parse(readFileSync(marker(), 'utf8'));
    if (field === 'env') intent.env = 'dev';
    else if (field === 'userId') intent.userId = 8;
    else if (field === 'resourceTypeCode') intent.resourceTypeCode = 'OTHER';
    else if (field === 'payloadSha256') intent.payloadSha256 = 'f'.repeat(64);
    writeFileSync(marker(), field === 'json' ? '{broken' : JSON.stringify(intent));
    const before = readFileSync(marker(), 'utf8');
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_INTENT_INVALID' });
    expect(readFileSync(marker(), 'utf8')).toBe(before);
    expect(existsSync(formFile())).toBe(true);
    expect(writes).toBe(1);
  });

  it('最后一次恢复GET期间marker被替换不能清理', async () => {
    await loseReply();
    const api = apis();
    let replaced = '';
    api.getDraftItems = async (params) => {
      replaced = `${readFileSync(marker(), 'utf8')} `;
      writeFileSync(marker(), replaced);
      return page(draftItems, params);
    };
    await expect(inspectCollectionPublishIntent({ ...args(), apis: api, apply: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_INTENT_CHANGED' });
    expect(readFileSync(marker(), 'utf8')).toBe(replaced);
    expect(existsSync(formFile())).toBe(true);
  });

  it('明确失败且旧基线完整未变时仅解除本次占用，当前稿可继续编辑', async () => {
    const api = apis();
    api.updateCollection = async () => { writes += 1; return { ret: 1, errCode: 42 }; };
    await expect(publishCollection({ ...args(), apis: api, includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_REJECTED' });
    expect(existsSync(marker())).toBe(false);
    expect(readCollectionFormDraft(cwd, 'collection_1')?.form.description).toBe('本次提交');
    expect(writes).toBe(1);
  });

  it('merge成功后目录草稿有新编辑，不影响本次已发布目录确认', async () => {
    draftItems = [{ itemId: 'item_1', itemTitle: '单品', sortId: 1, mountResourceInfo: { resourceId: 'resource_1' } }];
    afterWrite = () => { draftItems = [{ ...draftItems[0], itemTitle: '之后的草稿修改' }]; throw new Error('lost reply'); };
    await expect(publishCollection({ ...args(), includeItems: 'yes', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_RESULT_UNKNOWN' });
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ verification: 'confirmed', applied: true });
    expect(writes).toBe(1);
    expect(draftItems[0]?.itemTitle).toBe('之后的草稿修改');
  });

  it('目录-only提交后新建的本地稿，apply不得删除', async () => {
    rmSync(formFile());
    draftItems = [{ itemId: 'item_1', itemTitle: '单品', sortId: 1, mountResourceInfo: { resourceId: 'resource_1' } }];
    afterWrite = async () => {
      await pullCollectionForm(args());
      mutateCollectionFormDraft(cwd, 'collection_1', (form) => ({ ...form, description: '后来新建的稿' }));
      throw new Error('lost reply');
    };
    await expect(publishCollection({ ...args(), includeItems: 'yes', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_RESULT_UNKNOWN' });
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ verification: 'confirmed', localDraft: 'changed', applied: true });
    expect(readCollectionFormDraft(cwd, 'collection_1')?.form.description).toBe('后来新建的稿');
    expect(writes).toBe(1);
  });

  it('SDK返回前marker被替换，不能用unknown更新覆盖新记录', async () => {
    let replacement = '';
    afterWrite = () => { replacement = `${readFileSync(marker(), 'utf8')} `; writeFileSync(marker(), replacement); throw new Error('lost reply'); };
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_INTENT_CHANGED' });
    expect(readFileSync(marker(), 'utf8')).toBe(replacement);
    expect(existsSync(formFile())).toBe(true);
    expect(writes).toBe(1);
  });

  it('清稿后marker清理中断，保留记录供下一次apply完成且不重发', async () => {
    await loseReply();
    const unlink = (await vi.importActual<typeof filesystem>('node:fs')).unlinkSync;
    let fail = true;
    vi.mocked(filesystem.unlinkSync).mockImplementation((file) => {
      if (String(file) === marker() && fail) { fail = false; throw new Error('synthetic cleanup interruption'); }
      return unlink(file);
    });
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_RECOVER_CLEANUP_FAILED' });
    expect(existsSync(marker())).toBe(true);
    expect(existsSync(formFile())).toBe(false);
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ applied: true, localDraft: 'absent' });
    expect(existsSync(marker())).toBe(false);
    expect(writes).toBe(1);
  });

  it('正常发布已确认但本地收尾失败，返回安全恢复提示且不能再发', async () => {
    const unlink = (await vi.importActual<typeof filesystem>('node:fs')).unlinkSync;
    let fail = true;
    vi.mocked(filesystem.unlinkSync).mockImplementation((file) => {
      if (String(file) === marker() && fail) { fail = false; throw new Error('private transport diagnostic must not be emitted'); }
      return unlink(file);
    });
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_CLEANUP_FAILED', message: expect.stringContaining('resume') });
    expect(existsSync(marker())).toBe(true);
    await expect(publishCollection({ ...args(), includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_PENDING' });
    await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ applied: true });
    expect(writes).toBe(1);
  });

  it.each([false, true])('已拒绝记录清理中断，旧基线后续改变=%s时仅按证据收尾', async (changed) => {
    const unlink = (await vi.importActual<typeof filesystem>('node:fs')).unlinkSync;
    let fail = true;
    vi.mocked(filesystem.unlinkSync).mockImplementation((file) => {
      if (String(file) === marker() && fail) { fail = false; throw new Error('synthetic cleanup interruption'); }
      return unlink(file);
    });
    const api = apis();
    api.updateCollection = async () => { writes += 1; return { ret: 1, errCode: 42 }; };
    await expect(publishCollection({ ...args(), apis: api, includeItems: 'no', yes: true })).rejects.toMatchObject({ code: 'COLLECTION_PUBLISH_REJECTED_CLEANUP_FAILED' });
    const current = readFileSync(formFile(), 'utf8');
    const before = readFileSync(marker(), 'utf8');
    if (changed) { remote = { ...empty(), description: '另一次已发布修改' }; latest = 'external'; }
    await expect(inspectCollectionPublishIntent(args())).resolves.toMatchObject({ verification: changed ? 'unconfirmed' : 'rejected', applied: false });
    if (changed) {
      await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).rejects.toMatchObject({ code: 'COLLECTION_RECOVER_UNCONFIRMED' });
      expect(readFileSync(marker(), 'utf8')).toBe(before);
    } else {
      await expect(inspectCollectionPublishIntent({ ...args(), apply: true, yes: true })).resolves.toMatchObject({ verification: 'rejected', applied: true });
      expect(existsSync(marker())).toBe(false);
    }
    expect(readFileSync(formFile(), 'utf8')).toBe(current);
    expect(writes).toBe(1);
  });
});
