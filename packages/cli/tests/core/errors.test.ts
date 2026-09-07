import { describe, expect, it } from 'vitest';
import { createProgram, runCli } from '../../src/bin/program';
import { CliError, serializeCliError } from '../../src/core/errors';
import { notImplemented } from '../../src/core/notImplemented';

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
