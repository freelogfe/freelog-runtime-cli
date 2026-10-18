import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError, reportCliError } from '../../src/core/errors';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import { appendPolicy } from '../../src/domain/policy/mutation';
import { compilePolicyTemplate, normalizePolicyTemplate } from '../../src/domain/policy/template';
import { submitVersion } from '../../src/domain/version/submit';
import { draftFilePath, writeDraft } from '../../src/local/draft';
import { createIdentity, readIdentity } from '../../src/local/identity';
import { readPendingOperation } from '../../src/local/pendingOperation';

// 纯假秘密必须经过实际错误出口，不以替身 formatter 代替边界验证。
const privateMessage = 'Authorization: Bearer FAKE_BRIDGE_AUTH; Cookie: FAKE_BRIDGE_COOKIE; password=FAKE_BRIDGE_PASSWORD';
function unknownRequestError() {
  return Object.assign(new Error(privateMessage, { cause: new Error(privateMessage) }), {
    config: { headers: { Authorization: 'FAKE_BRIDGE_AUTH', Cookie: 'FAKE_BRIDGE_COOKIE' } },
  });
}

async function expectReportedFailure(action: () => Promise<unknown>, expected: { code: string; message: string }, json = true) {
  let failure: unknown;
  try { await action(); } catch (error) { failure = error; }
  expect(failure).toBeDefined();
  const out: string[] = [];
  const err: string[] = [];
  expect(reportCliError(failure, json ? ['--json'] : [], {
    writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); },
  })).toBe(1);
  expect(out).toEqual(json ? [`${JSON.stringify(expected)}\n`] : []);
  expect(err).toEqual(json ? [] : [`${expected.message}\n`]);
}

function emptyTemplate(compileType: 'normal' | 'collection') {
  return normalizePolicyTemplate({
    _id: 'template-boundary', title: '永久授权', compileType,
    policyReport: '永久授权', policyReportUiTemplate: [],
  });
}

describe('模板编译和翻译的领域错误边界', () => {
  describe.each(['normal', 'collection'] as const)('%s', (compileType) => {
    it.each([
      { stage: '编译', json: true }, { stage: '编译', json: false },
      { stage: '翻译', json: true }, { stage: '翻译', json: false },
    ] as const)('未知异常不经 $stage 泄露（json=$json）', async ({ stage, json }) => {
      const reCompile = vi.fn(async () => {
        if (stage === '编译') throw unknownRequestError();
        return { data: { policyTextNew: 'FOR PUBLIC\nInitial[active]:\n terminate' } };
      });
      const translate = vi.fn(async () => { throw unknownRequestError(); });
      await expectReportedFailure(() => compilePolicyTemplate({
        template: emptyTemplate(compileType), params: [], requireEveryParam: true, reCompile, translate,
      }), {
        code: stage === '编译' ? 'POLICY_TEMPLATE_COMPILE_FAILED' : 'POLICY_TEMPLATE_TRANSLATION_FAILED',
        message: `策略模板${stage}失败：平台请求失败`,
      }, json);
      expect(reCompile).toHaveBeenCalledExactlyOnceWith({ _id: 'template-boundary', compileType, fillArgs: [] });
      expect(translate).toHaveBeenCalledTimes(stage === '编译' ? 0 : 1);
    });
  });

  it.each([
    {}, { errCode: 1 }, { result: { errCode: 1, msg: privateMessage } },
    { errCode: '1', result: { errCode: '1', msg: privateMessage } },
    { errCode: 0, result: { errCode: 0, msg: privateMessage } },
    { errCode: 1, result: { errCode: 2, msg: privateMessage } },
    { errCode: 1, result: { errCode: 1, msg: { message: privateMessage } } },
    { errCode: 1, result: { errCode: 1, msg: '   ' } },
    { errCode: NaN, result: { errCode: NaN, msg: privateMessage } },
    null, undefined,
  ])('不把不完整或畸形 SDK 信封当安全业务诊断 %#', async (failure) => {
    const reCompile = vi.fn(async () => { throw failure == null ? failure : Object.assign(unknownRequestError(), failure); });
    const translate = vi.fn(async () => ({ data: '永久授权' }));
    await expectReportedFailure(() => compilePolicyTemplate({
      template: emptyTemplate('normal'), params: [], requireEveryParam: true, reCompile, translate,
    }), { code: 'POLICY_TEMPLATE_COMPILE_FAILED', message: '策略模板编译失败：平台请求失败' });
    expect(reCompile).toHaveBeenCalledTimes(1);
    expect(translate).not.toHaveBeenCalled();
  });

  it.each(['编译', '翻译'] as const)('%s：保留 SDK 非零一致业务码信封的可读 msg', async (stage) => {
    const businessFailure = Object.assign(unknownRequestError(), {
      errCode: 4101, result: { errCode: 4101, msg: '编译结果存在错误' },
    });
    const reCompile = vi.fn(async () => {
      if (stage === '编译') throw businessFailure;
      return { data: { policyTextNew: 'FOR PUBLIC' } };
    });
    const translate = vi.fn(async () => { throw businessFailure; });
    await expectReportedFailure(() => compilePolicyTemplate({
      template: emptyTemplate('normal'), params: [], requireEveryParam: true, reCompile, translate,
    }), {
      code: stage === '编译' ? 'POLICY_TEMPLATE_COMPILE_FAILED' : 'POLICY_TEMPLATE_TRANSLATION_FAILED',
      message: `策略模板${stage}失败：编译结果存在错误`,
    });
    expect(reCompile).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledTimes(stage === '编译' ? 0 : 1);
  });

  it('已受控 CliError 的业务码和说明保持原样', async () => {
    const reCompile = vi.fn(async () => { throw new CliError('模板暂不可用', 'TEMPLATE_UNAVAILABLE'); });
    const translate = vi.fn(async () => ({ data: '永久授权' }));
    await expectReportedFailure(() => compilePolicyTemplate({
      template: emptyTemplate('normal'), params: [], requireEveryParam: true, reCompile, translate,
    }), { code: 'TEMPLATE_UNAVAILABLE', message: '模板暂不可用' });
    expect(reCompile).toHaveBeenCalledTimes(1);
    expect(translate).not.toHaveBeenCalled();
  });
});

describe('策略创建结果未知的领域错误边界', () => {
  describe.each(['资源', '合集'] as const)('%s', (subject) => {
    it.each([
      { phase: 'write', json: true }, { phase: 'write', json: false },
      { phase: 'read', json: true }, { phase: 'read', json: false },
    ] as const)('$phase 失败无原始原因、无重试（json=$json）', async ({ phase, json }) => {
      const update = vi.fn(async () => {
        if (phase === 'write') throw unknownRequestError();
        return { data: {} };
      });
      const read = vi.fn(async () => { throw unknownRequestError(); });
      await expectReportedFailure(() => appendPolicy({
        subject, resourceId: 'resource-boundary', policyName: '新策略', policyText: 'FOR PUBLIC', update, read,
      }), {
        code: 'POLICY_CREATE_RESULT_UNKNOWN',
        message: `${subject}策略创建结果未知。请先用 ${subject === '合集' ? 'collection policy list' : 'policy list'} 核对线上策略，确认后再决定是否重试`,
      }, json);
      expect(update).toHaveBeenCalledExactlyOnceWith({
        resourceId: 'resource-boundary', addPolicies: [{ policyName: '新策略', policyText: 'FOR%20PUBLIC', status: 1 }],
      });
      expect(read).toHaveBeenCalledTimes(phase === 'write' ? 0 : 1);
    });
  });
});

describe('版本提交错误说明与恢复状态分离', () => {
  let cwd: string;
  let draftBefore: Buffer;
  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-submit-error-boundary-'));
    applyCliEnv({ flag: 'test' });
    createIdentity(cwd, {
      subject: 'resource', resourceId: 'res_boundary', resourceName: 'alice/boundary', name: 'boundary',
      typeCode: 'VIDEO', filePath: 'video.mp4', env: 'test',
    });
    writeDraft(cwd, 1, {
      fileSha1: 'sha-boundary', filename: 'video.mp4', analyzedSha1: 'sha-boundary',
      baseUpcastResources: [], authExcludedItems: [],
    });
    draftBefore = readFileSync(draftFilePath(cwd, 1));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    resetEnvForTests();
  });

  async function expectSubmitFailure(failure: unknown, expected: { code: string; message: string }, pending: boolean, json = true) {
    const createVersion = vi.fn(async () => { throw failure; });
    await expectReportedFailure(() => submitVersion({ cwd, identity: readIdentity(cwd, 1), version: '1.0.0', apis: { createVersion } }), expected, json);
    expect(createVersion).toHaveBeenCalledExactlyOnceWith({
      resourceId: 'res_boundary', version: '1.0.0', fileSha1: 'sha-boundary', filename: 'video.mp4', description: '',
      customPropertyDescriptors: [], dependencies: [], inputAttrs: [], baseUpcastResources: [], authExcludedItems: [],
    });
    expect(readFileSync(draftFilePath(cwd, 1))).toEqual(draftBefore);
    if (pending) {
      expect(readPendingOperation(cwd)).toMatchObject({
        kind: 'version-submit', resourceId: 'res_boundary', resourceN: 1, version: '1.0.0',
        fileSha1: 'sha-boundary', env: 'test', state: 'sending',
      });
    } else expect(readPendingOperation(cwd)).toBeUndefined();
  }

  it.each([true, false])('HTTP 4xx 无结构化说明时固定失败文案，清 marker 留稿（json=%s）', async (json) => {
    await expectSubmitFailure(Object.assign(unknownRequestError(), { response: { status: 400 } }),
      { code: 'SUBMIT_FAILED', message: '提交失败' }, false, json);
  });

  it('HTTP 4xx 畸形 msg 不调用隐式 toString 或回退原始 message', async () => {
    await expectSubmitFailure(Object.assign(unknownRequestError(), {
      status: 422, msg: { toString: () => privateMessage }, result: { msg: { toString: () => privateMessage } },
    }), { code: 'SUBMIT_FAILED', message: '提交失败' }, false);
  });

  it.each([true, false])('网络 5xx 结果仍未知，留 marker 留稿（json=%s）', async (json) => {
    await expectSubmitFailure(Object.assign(unknownRequestError(), { response: { status: 500 } }), {
      code: 'SUBMIT_RESULT_UNKNOWN', message: '版本提交请求结果未知；请运行 resource recover 核验，切勿重复提交或重新 bump',
    }, true, json);
  });

  it.each([
    {
      label: 'response.status 500 与 result.msg',
      failure: () => Object.assign(unknownRequestError(), { response: { status: 500 }, result: { msg: '服务暂不可用' } }),
    },
    {
      label: 'status 502 与 field/msg',
      failure: () => Object.assign(unknownRequestError(), { status: 502, field: 'filename', msg: '服务暂不可用' }),
    },
    {
      label: 'statusCode 503 与受控错误',
      failure: () => Object.assign(new CliError('服务暂不可用', 'SERVICE_UNAVAILABLE'), { statusCode: 503 }),
    },
    {
      label: 'response.status 599 与 msg',
      failure: () => Object.assign(unknownRequestError(), { response: { status: 599 }, msg: '服务暂不可用' }),
    },
  ])('HTTP5xx 混合信号优先保留未知提交：$label', async ({ failure }) => {
    await expectSubmitFailure(failure(), {
      code: 'SUBMIT_RESULT_UNKNOWN', message: '版本提交请求结果未知；请运行 resource recover 核验，切勿重复提交或重新 bump',
    }, true);
  });

  it.each([null, undefined])('无可识别响应也保留未知提交记录 %#', async (failure) => {
    await expectSubmitFailure(failure, {
      code: 'SUBMIT_RESULT_UNKNOWN', message: '版本提交请求结果未知；请运行 resource recover 核验，切勿重复提交或重新 bump',
    }, true);
  });

  it.each([
    { failure: { field: 'filename', msg: '文件格式不支持' }, message: '提交失败：filename：文件格式不支持' },
    { failure: { result: { msg: '版本已存在' } }, message: '提交失败：版本已存在' },
    { failure: new CliError('版本号必须递增', 'VERSION_ORDER'), message: '提交失败：版本号必须递增' },
  ])('结构化字段/业务说明及受控错误保留可读详情 %#', async ({ failure, message }) => {
    await expectSubmitFailure(failure, { code: 'SUBMIT_FAILED', message }, false);
  });
});
