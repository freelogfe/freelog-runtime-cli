import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram, runCli } from '../../src/bin/program';
import { CliError, serializeCliError } from '../../src/core/errors';
import { notImplemented } from '../../src/core/notImplemented';
import * as templates from '../../src/domain/init/templates';
import * as metadata from '../../src/core/packageVersion';

const { AxiosError } = createRequire(new URL('../../../tools-lib/package.json', import.meta.url))('axios');
const safeFailure = {
  code: 'CLI_UNEXPECTED_ERROR',
  message: '命令执行失败；如涉及写入，请先核对实际结果，勿重复执行。',
};

function overrideExit() {
  const program = createProgram();
  program.exitOverride();
  return program;
}

describe('CliError', () => {
  it('抛出的 message 就是中文字符串', () => {
    expect(() => notImplemented()).toThrow(CliError);
    try {
      notImplemented();
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).message).toBe('未实现');
      expect((error as CliError).code).toBe('NOT_IMPLEMENTED');
    }
  });

  it('能序列化成 { code, message }', () => {
    const error = new CliError('未实现', 'NOT_IMPLEMENTED');
    expect(serializeCliError(error)).toEqual({
      code: 'NOT_IMPLEMENTED',
      message: '未实现',
    });
    expect(error.toJSON()).toEqual({
      code: 'NOT_IMPLEMENTED',
      message: '未实现',
    });
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: 'NOT_IMPLEMENTED',
      message: '未实现',
    });
  });

  it('没有 code 时 JSON 用 CLI_ERROR，message 仍是中文', () => {
    const error = new CliError('某句中文');
    expect(error.code).toBeUndefined();
    expect(serializeCliError(error)).toEqual({
      code: 'CLI_ERROR',
      message: '某句中文',
    });
  });
});

describe('未实现命令', () => {
  it('未实现占位仍是中文 CliError', () => {
    expect(() => notImplemented()).toThrow(CliError);
    try {
      notImplemented();
    } catch (error) {
      expect((error as CliError).message).toBe('未实现');
      expect((error as CliError).code).toBe('NOT_IMPLEMENTED');
    }
  });

  it('--json 时 code 稳定、message 仍是中文', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const exitCode = await runCli(['login', '--json'], {
      writeOut: (text) => {
        out.push(text);
      },
      writeErr: (text) => {
        err.push(text);
      },
    });

    expect(exitCode).toBe(1);
    expect(err.join('')).toBe('');
    expect(JSON.parse(out.join(''))).toEqual({
      code: 'PRODUCTION_ENV_DISABLED',
      message: 'prod 暂未开放，请用 --env test 或 --env dev',
    });
  });

  it('login 省略 --env 打平台失败，--json 仍是中文', async () => {
    const program = overrideExit();
    await expect(
      program.parseAsync(['login', '--login-name', 'a', '--yes'], { from: 'user' }),
    ).rejects.toSatisfy((error: unknown) => {
      return (
        error instanceof CliError &&
        error.message === 'prod 暂未开放，请用 --env test 或 --env dev'
      );
    });
  });
});

describe('统一 CLI 错误出口', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['AxiosError', new AxiosError('FAKE_HTTP_MESSAGE', 'ERR_BAD_RESPONSE', {
      headers: { Authorization: 'Bearer FAKE_AUTHORIZATION', Cookie: 'FAKE_COOKIE' },
    }, { privateRequest: 'FAKE_REQUEST' }, { privateResponse: 'FAKE_RESPONSE' })],
    ['Error', new Error('FAKE_PRIVATE_MESSAGE', { cause: new Error('FAKE_PRIVATE_CAUSE') })],
    ['字符串', 'FAKE_PRIVATE_STRING'],
    ['对象', { message: 'FAKE_PRIVATE_MESSAGE', config: { headers: { Authorization: 'FAKE_AUTHORIZATION' } } }],
    ['null', null],
  ])('%s 在真实命令 action 失败时只输出固定安全 JSON，且不重试', async (_label, failure) => {
    const action = vi.spyOn(templates, 'listTemplates').mockImplementation(() => { throw failure; });
    const out: string[] = [];
    const err: string[] = [];
    await expect(runCli(['template', 'list', '--env', 'dev', '--json'], {
      writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); },
    })).resolves.toBe(1);
    expect(out).toEqual([`${JSON.stringify(safeFailure)}\n`]);
    expect(err).toEqual([]);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('普通出口也不复制未知 message/stack/cause', async () => {
    vi.spyOn(templates, 'listTemplates').mockImplementation(() => { throw new Error('FAKE_PRIVATE_MESSAGE'); });
    const out: string[] = [];
    const err: string[] = [];
    expect(await runCli(['template', 'list', '--env', 'dev'], {
      writeOut: (text) => { out.push(text); }, writeErr: (text) => { err.push(text); },
    })).toBe(1);
    expect(out).toEqual([]);
    expect(err).toEqual([`${safeFailure.message}\n`]);
  });

  it('受控 CliError 保留码/恢复文案，但不序列化附加私有字段', async () => {
    const failure = Object.assign(new CliError('提交结果未知，请先核对实际结果', 'SUBMIT_RESULT_UNKNOWN'), {
      config: { headers: { Authorization: 'FAKE_AUTHORIZATION', Cookie: 'FAKE_COOKIE' } },
      cause: new Error('FAKE_PRIVATE_CAUSE'),
    });
    vi.spyOn(templates, 'listTemplates').mockImplementation(() => { throw failure; });
    const out: string[] = [];
    expect(await runCli(['template', 'list', '--env', 'dev', '--json'], {
      writeOut: (text) => { out.push(text); }, writeErr: () => { throw new Error('不应写 stderr'); },
    })).toBe(1);
    expect(out).toEqual([`${JSON.stringify({ code: failure.code, message: failure.message })}\n`]);
  });

  it('程序装配异常也进入安全出口', async () => {
    vi.spyOn(metadata, 'packageVersion').mockImplementation(() => { throw new Error('FAKE_BOOTSTRAP_CONFIG'); });
    const out: string[] = [];
    await expect(runCli(['--json'], { writeOut: (text) => { out.push(text); } })).resolves.toBe(1);
    expect(out).toEqual([`${JSON.stringify(safeFailure)}\n`]);
  });

  it('Commander help 和参数错误继续走其既有出口，不伪装成 JSON 业务错误', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const writers = { writeOut: (text: string) => { out.push(text); }, writeErr: (text: string) => { err.push(text); } };
    expect(await runCli(['--help'], writers)).toBe(0);
    expect(out.join('')).toContain('Usage: freelog-cli');
    expect(err).toEqual([]);
    out.length = 0;
    expect(await runCli(['--unknown-cli-flag', '--json'], writers)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join('')).toContain("error: unknown option '--unknown-cli-flag'");
  });
});
