import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { draftPull } from '../../src/domain/version/draftPull';
import { uploadAndAnalyze } from '../../src/domain/version/file';
import { attrAdd, attrList, attrSet } from '../../src/domain/version/form/attr';
import { optionAdd, optionList, optionSet } from '../../src/domain/version/form/option';
import { buildVersionPayload, submitVersion } from '../../src/domain/version/submit';
import { draftFilePath, readDraft, writeDraft } from '../../src/local/draft';
import { createIdentity } from '../../src/local/identity';
import type { IdentityRecord } from '../../src/local/types';
import { FServiceAPI } from '../../src/platform/api';
import { sseResult } from '../helpers/sse';

vi.mock('../../src/platform/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/platform/api')>();
  return { ...original, FServiceAPI: { ...original.FServiceAPI,
    Resource: { ...original.FServiceAPI.Resource }, Storage: { ...original.FServiceAPI.Storage },
  } };
});

// Console 当前 utils/service.ts 的真实接口形态：类型 attrs 只保留 key/name，
// SSE/已发版本 descriptor 提供 insertMode，规则从 getAttrsInfoByKey 独立读取。
const meta = [
  { key: 'fileSize', name: '文件大小', insertMode: 1, valueDisplay: '12KB' },
  { key: 'bundleTool', name: '打包工具', insertMode: 2, valueDisplay: 'vite' },
  { key: 'noderuntime_target_version', name: '运行时目标版本', insertMode: 2, valueDisplay: '0.5' },
  { key: 'subtitle', name: '副标题', insertMode: 2, valueDisplay: '' },
  { key: 'width', name: '宽度', insertMode: 2, valueDisplay: '100' },
  { key: 'futureField', name: '未来字段', insertMode: 2, valueDisplay: '' },
];

function platformApis(items: Record<string, unknown>[] = meta) {
  return {
    getByCode: vi.fn(async () => ({ data: {
      code: 'RT001', isTerminate: true, status: 1, subjectType: 1, supportOptionalConfig: 2,
      attrs: items.map(({ key, name }) => ({ key, name })),
    } })),
    filesListInfoSse: sseResult({ metaAnalyzeStatus: 2, metaInfoArray: items }),
    getAttrsInfoByKey: vi.fn(async ({ key }: Record<string, unknown>) => ({
      data: {
        key,
        insertMode: 2,
        format: key === 'bundleTool' ? 10 : key === 'width' ? 8 : key === 'futureField' ? 99 : 6,
        contentRule: key === 'bundleTool' ? { allowedElements: ['vite', 'webpack'] }
          : key === 'width' ? { min: 0, max: 100 } : { maxLength: 140 },
      },
    })),
  };
}

describe('系统属性与自定义表单的跨流程回归', () => {
  let cwd: string;
  let identity: IdentityRecord;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-system-attrs-'));
    applyCliEnv({ flag: 'test' });
    // 本组所有平台事实均显式注入；漏注入应立即失败，不能意外请求真实环境。
    vi.spyOn(FServiceAPI.Resource, 'getResourceTypeInfoByCode').mockImplementation(async () => {
      throw new Error('测试缺少资源类型 API 注入');
    });
    vi.spyOn(FServiceAPI.Resource, 'getAttrsInfoByKey').mockImplementation(async () => {
      throw new Error('测试缺少系统属性规则 API 注入');
    });
    for (const method of ['lookDraft', 'saveVersionsDraft', 'deleteResourceDraft'] as const) {
      vi.spyOn(FServiceAPI.Resource, method).mockImplementation(async () => {
        throw new Error('CLI 版本流程不能读写网页草稿');
      });
    }
    await loginAccount({
      cwd, homeDir: cwd, loginName: 'alice', password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 't' } }),
    });
    identity = createIdentity(cwd, {
      subject: 'resource', resourceId: 'resource-1', name: 'theme',
      typeCode: 'RT001', filePath: 'artifact.bin', env: 'test',
    });
    writeDraft(cwd, identity.n, {
      fileSha1: 'sha-current', analyzedSha1: 'sha-current', filename: 'artifact.bin',
      baseUpcastResources: [], authExcludedItems: [],
    });
  });

  afterEach(() => {
    expect(FServiceAPI.Resource.lookDraft).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.saveVersionsDraft).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.deleteResourceDraft).not.toHaveBeenCalled();
    vi.restoreAllMocks();
    resetEnvForTests();
    rmSync(cwd, { recursive: true, force: true });
  });

  const bytes = () => readFileSync(draftFilePath(cwd, identity.n), 'utf8');

  async function pullPublishedVersion() {
    const apis = {
      info: vi.fn(async () => ({ data: {
        resourceId: identity.resourceId, userId: 7, latestVersion: '1.0.0', status: 4,
      } })),
      resourceVersionInfo1: vi.fn(async () => ({ data: {
        version: '1.0.0', fileSha1: 'sha-published', filename: 'theme.zip',
        systemPropertyDescriptors: meta.slice(0, 4),
        // 真实版本以 systemPropertyDescriptors 为准；即便异常带了这个字段也不能猜测继承。
        inputAttrs: [{ key: 'poison', value: 'not-a-published-descriptor' }],
        customPropertyDescriptors: [
          { key: 'author', name: '作者', type: 'readonlyText', defaultValue: '张三', remark: '' },
          { key: 'theme', name: '主题', type: 'editableText', defaultValue: '', remark: '' },
        ],
        dependencies: [{ resourceId: 'dep-1', versionRange: '^1.0.0' }],
      } })),
    };
    await draftPull({ cwd, homeDir: cwd, yes: true, apis });
    expect(apis.info).toHaveBeenCalledOnce();
    expect(apis.resourceVersionInfo1).toHaveBeenCalledWith({ resourceId: identity.resourceId, version: '1.0.0' });
    return readDraft(cwd, identity.n)!;
  }

  it('旧版本真实 descriptor 恢复附加值含空值，原始属性不进入 inputAttrs，也不请求网页草稿', async () => {
    const draft = await pullPublishedVersion();
    expect(draft.analyzedSha1).toBeNull();
    expect(draft.inputAttrs).toEqual([
      { key: 'bundleTool', value: 'vite' },
      { key: 'noderuntime_target_version', value: '0.5' },
      { key: 'subtitle', value: '' },
    ]);
    expect(buildVersionPayload({ resourceId: identity.resourceId!, version: '1.0.1', draft })).toEqual({
      resourceId: identity.resourceId, version: '1.0.1', fileSha1: 'sha-published', filename: 'theme.zip', description: '',
      customPropertyDescriptors: [
        { key: 'author', name: '作者', type: 'readonlyText', defaultValue: '张三', remark: '' },
        { key: 'theme', name: '主题', type: 'editableText', defaultValue: '', remark: '' },
      ],
      dependencies: [{ resourceId: 'dep-1', versionRange: '^1.0.0' }],
      inputAttrs: draft.inputAttrs, baseUpcastResources: [], authExcludedItems: [],
    });
    expect(optionList(cwd)).toContain('theme= 主题');
  });

  it('已发版本 pull 后可按 SHA 重新解析，再填写附加值，不被缺失分析标记永久卡住', async () => {
    await pullPublishedVersion();
    const apis = platformApis(meta.filter((item) => item.key !== 'futureField'));
    const analyze = vi.fn(apis.filesListInfoSse);
    await attrSet(cwd, { line: '键=bundleTool 值=webpack', yes: true, apis: { ...apis, filesListInfoSse: analyze } });
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ resourceTypeCode: 'RT001' }));
    expect(readDraft(cwd, identity.n)).toMatchObject({
      analyzedSha1: 'sha-published', inputAttrs: expect.arrayContaining([{ key: 'bundleTool', value: 'webpack' }]),
    });
  });

  it.each([
    ['不存在的键', '键=notRegistered 值=1'],
    ['原始属性', '键=fileSize 值=100'],
    ['未知格式', '键=futureField 值=1'],
    ['下拉非法值', '键=bundleTool 值=rollup'],
    ['整数越界', '键=width 值=101'],
    ['整数非整数', '键=width 值=1.5'],
    ['缺少显式值', '键=bundleTool'],
    ['系统名称不可改', '键=bundleTool 名称=自定义 值=vite'],
    ['系统说明不可改', '键=bundleTool 说明=自定义 值=vite'],
  ])('%s被拒绝，原稿字节不变', async (_label, line) => {
    const before = bytes();
    await expect(attrSet(cwd, { line, yes: true, apis: platformApis() })).rejects.toMatchObject({ code: expect.stringMatching(/^ATTR_SYSTEM_/) });
    expect(bytes()).toBe(before);
  });

  it('附加值允许明确清空，不能把缺少值当成清空', async () => {
    writeDraft(cwd, identity.n, { ...readDraft(cwd, identity.n)!, inputAttrs: [{ key: 'bundleTool', value: 'vite' }] });
    await attrSet(cwd, { line: '键=bundleTool 值=', yes: true, apis: platformApis() });
    expect(readDraft(cwd, identity.n)?.inputAttrs).toContainEqual({ key: 'bundleTool', value: '' });
  });

  it('编辑一项时同步复核其他继承值，规则收紧的另一项转入待复核而非冒充有效', async () => {
    writeDraft(cwd, identity.n, {
      ...readDraft(cwd, identity.n)!, analyzedSha1: null,
      inputAttrs: [{ key: 'bundleTool', value: 'vite' }, { key: 'width', value: '101' }],
    });
    await attrSet(cwd, { line: '键=bundleTool 值=webpack', yes: true, apis: platformApis() });
    const draft = readDraft(cwd, identity.n)!;
    expect(draft.analyzedSha1).toBe(draft.fileSha1);
    expect(draft.inputAttrs).toEqual([{ key: 'bundleTool', value: 'webpack' }]);
    expect(draft.orphanedInputAttrs).toEqual([{ key: 'width', value: '101' }]);
  });

  it.each([
    ['attr key', 'attr', '名称=自定义 键=bundleTool 值=vite'],
    ['attr name', 'attr', '名称=打包工具 键=custom 值=vite'],
    ['option key', 'option', '名称=自定义 键=bundleTool 方式=文本'],
    ['option name', 'option', '名称=打包工具 键=custom 方式=文本'],
  ])('%s 不得占用系统字段，支持可选配置的注入不绕过冲突检查', async (_label, mode, line) => {
    const before = bytes();
    const input = { line, yes: true, supportOptionalConfig: true, apis: platformApis() };
    await expect(mode === 'attr' ? attrAdd(cwd, input) : optionAdd(cwd, input)).rejects.toMatchObject({ code: 'ATTR_SYSTEM_CONFLICT' });
    expect(bytes()).toBe(before);
  });

  it.each(['attr', 'option'])('%s 改名不得与系统名称冲突', async (mode) => {
    writeDraft(cwd, identity.n, {
      ...readDraft(cwd, identity.n)!, customPropertyDescriptors: [{
        key: 'custom', name: '自己的名称', type: mode === 'attr' ? 'readonlyText' : 'editableText', defaultValue: '',
      }],
    });
    const before = bytes();
    const input = { line: '键=custom 名称=打包工具', yes: true, supportOptionalConfig: true, apis: platformApis() };
    await expect(mode === 'attr' ? attrSet(cwd, input) : optionSet(cwd, input)).rejects.toMatchObject({ code: 'ATTR_SYSTEM_CONFLICT' });
    expect(bytes()).toBe(before);
  });

  it('网络分块不能破坏中文系统名称而绕过重名检查', async () => {
    const frame = Buffer.from(`data: ${JSON.stringify({ sha1: 'sha-current', metaAnalyzeStatus: 2, metaInfoArray: meta })}\n\n`);
    const split = frame.indexOf(Buffer.from('具')) + 1;
    const apis = { ...platformApis(), filesListInfoSse: async () => Readable.from([frame.subarray(0, split), frame.subarray(split)]) };
    const before = bytes();
    await expect(attrAdd(cwd, { line: '名称=打包工具 键=custom 值=vite', yes: true, apis }))
      .rejects.toMatchObject({ code: 'ATTR_SYSTEM_CONFLICT' });
    expect(bytes()).toBe(before);
  });

  it.each(['attr', 'option'])('%s set 不得继续编辑已占用系统 key 的手改条目', async (mode) => {
    writeDraft(cwd, identity.n, {
      ...readDraft(cwd, identity.n)!, customPropertyDescriptors: [{
        key: 'bundleTool', name: '伪装自定义', type: mode === 'attr' ? 'readonlyText' : 'editableText', defaultValue: '',
      }],
    });
    const before = bytes();
    const input = { line: '键=bundleTool 值=vite', yes: true, supportOptionalConfig: true, apis: platformApis() };
    await expect(mode === 'attr' ? attrSet(cwd, input) : optionSet(cwd, input)).rejects.toMatchObject({ code: 'ATTR_SYSTEM_CONFLICT' });
    expect(bytes()).toBe(before);
  });

  it('attr list 展示尚未填写的附加字段与平台规则，查询不得写稿', async () => {
    const before = bytes();
    const output = await attrList(cwd, undefined, platformApis());
    expect(output).toContain('bundleTool');
    expect(output).toContain('打包工具');
    expect(output).toContain('vite');
    expect(output).toContain('webpack');
    expect(output).toContain('noderuntime_target_version');
    expect(output).toContain('subtitle');
    expect(bytes()).toBe(before);
  });

  it.each([
    ['自定义 key 冲突', [{ key: 'bundleTool', name: '伪装自定义', type: 'readonlyText', defaultValue: 'vite' }], []],
    ['自定义 name 冲突', [{ key: 'fake', name: '打包工具', type: 'editableText', defaultValue: '' }], []],
    ['不认识的附加 key', [], [{ key: 'notRegistered', value: '1' }]],
    ['原始属性伪装附加值', [], [{ key: 'fileSize', value: '1' }]],
    ['非法附加值', [], [{ key: 'bundleTool', value: 'rollup' }]],
    ['自定义超长值', [{ key: 'custom', name: '自己的属性', type: 'readonlyText', defaultValue: 'x'.repeat(141) }], []],
    ['自定义重复键', [
      { key: 'custom', name: '自己的属性1', type: 'readonlyText', defaultValue: '' },
      { key: 'custom', name: '自己的属性2', type: 'readonlyText', defaultValue: '' },
    ], []],
    ['自定义与配置重复名', [
      { key: 'custom', name: '重复名', type: 'readonlyText', defaultValue: '' },
      { key: 'config', name: '重复名', type: 'editableText', defaultValue: '' },
    ], []],
    ['重复附加键', [], [{ key: 'bundleTool', value: 'vite' }, { key: 'bundleTool', value: 'webpack' }]],
    ['附加值不是字符串', [], [{ key: 'width', value: 1 }]],
  ])('提交前重新检查人工 JSON 的%s，拒绝 POST 且保留原稿', async (_label, customPropertyDescriptors, inputAttrs) => {
    writeDraft(cwd, identity.n, { ...readDraft(cwd, identity.n)!, customPropertyDescriptors, inputAttrs });
    const before = bytes();
    const createVersion = vi.fn(async (_payload: Record<string, unknown>) => ({ data: {} }));
    await expect(submitVersion({
      cwd, homeDir: cwd, identity, version: '1.0.0',
      apis: { ...platformApis(), createVersion },
    })).rejects.toMatchObject({ code: expect.stringMatching(/^(ATTR_SYSTEM_|CUSTOM_PROPERTY_)/) });
    expect(createVersion).not.toHaveBeenCalled();
    expect(bytes()).toBe(before);
  });

  it('重新分析保留合法值，只恢复当前规则允许的 orphan；变化后的非法值留待复核', async () => {
    writeFileSync(path.join(cwd, 'artifact.bin'), 'current bytes');
    writeDraft(cwd, identity.n, {
      ...readDraft(cwd, identity.n)!,
      inputAttrs: [{ key: 'bundleTool', value: 'vite' }, { key: 'width', value: '101' }],
      orphanedInputAttrs: [
        { key: 'subtitle', value: '' }, { key: 'noderuntime_target_version', value: '0.5' },
        { key: 'futureField', value: 'unknown' }, { key: 'gone', value: 'keep-for-review' },
      ],
    });
    await uploadAndAnalyze({
      cwd, identity, yes: true,
      apis: { ...platformApis(), fileIsExist: async () => ({ data: { isExisting: true } }) },
    });
    const draft = readDraft(cwd, identity.n)!;
    expect(draft.inputAttrs).toEqual(expect.arrayContaining([
      { key: 'bundleTool', value: 'vite' }, { key: 'subtitle', value: '' },
      { key: 'noderuntime_target_version', value: '0.5' },
    ]));
    expect(draft.inputAttrs).not.toEqual(expect.arrayContaining([{ key: 'width', value: '101' }]));
    expect(draft.orphanedInputAttrs).toEqual(expect.arrayContaining([
      { key: 'width', value: '101' }, { key: 'futureField', value: 'unknown' }, { key: 'gone', value: 'keep-for-review' },
    ]));
  });

  it('普通自定义属性和空默认可选配置可回显、发行，payload 无系统 descriptor 泄漏', async () => {
    const apis = platformApis(meta.filter((item) => item.key !== 'futureField'));
    await attrAdd(cwd, { line: '名称=作者 键=author 值=张三', yes: true, apis });
    await optionAdd(cwd, { line: '名称=文案 键=copy 方式=文本 默认=', supportOptionalConfig: true, yes: true, apis });
    expect(await attrList(cwd, undefined, apis)).toContain('author=张三 作者');
    expect(optionList(cwd)).toBe('copy= 文案');
    const createVersion = vi.fn(async (_payload: Record<string, unknown>) => ({ data: {} }));
    await submitVersion({
      cwd, homeDir: cwd, identity, version: '1.0.0',
      apis: { ...apis, createVersion },
    });
    expect(createVersion).toHaveBeenCalledWith(expect.objectContaining({
      customPropertyDescriptors: [
        { key: 'author', name: '作者', remark: '', type: 'readonlyText', defaultValue: '张三' },
        { key: 'copy', name: '文案', remark: '', type: 'editableText', defaultValue: '' },
      ], inputAttrs: [],
    }));
    expect(createVersion.mock.calls[0]?.[0]).not.toHaveProperty('systemPropertyDescriptors');
    expect(existsSync(draftFilePath(cwd, identity.n))).toBe(false);
  });

  it('线上 DTO 的非下拉 candidateItems 空数组不阻断合法继承提交', async () => {
    const customPropertyDescriptors = [
      { key: 'author', name: '作者', type: 'readonlyText', defaultValue: '张三', candidateItems: [] },
      { key: 'copy', name: '文案', type: 'editableText', defaultValue: '', candidateItems: [] },
    ];
    writeDraft(cwd, identity.n, { ...readDraft(cwd, identity.n)!, customPropertyDescriptors });
    const createVersion = vi.fn(async (_payload: Record<string, unknown>) => ({ data: {} }));
    await submitVersion({ cwd, homeDir: cwd, identity, version: '1.0.0', apis: { ...platformApis(), createVersion } });
    expect(createVersion).toHaveBeenCalledWith(expect.objectContaining({ customPropertyDescriptors }));
  });
});
