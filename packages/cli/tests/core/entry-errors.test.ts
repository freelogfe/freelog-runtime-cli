import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const entry = vi.hoisted(() => ({ bootstrapPlatform: vi.fn(), runCli: vi.fn() }));
vi.mock('../../src/platform/bootstrap', () => ({ bootstrapPlatform: entry.bootstrapPlatform }));
vi.mock('../../src/bin/program', () => ({ runCli: entry.runCli }));

const safeFailure = {
  code: 'CLI_UNEXPECTED_ERROR',
  message: '命令执行失败；如涉及写入，请先核对实际结果，勿重复执行。',
};

describe('CLI 进程启动安全出口', () => {
  let originalArgv: string[];
  let originalExitCode: typeof process.exitCode;
  const out: string[] = [];
  const err: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    entry.bootstrapPlatform.mockReset();
    entry.runCli.mockReset().mockResolvedValue(0);
    originalArgv = process.argv;
    originalExitCode = process.exitCode;
    process.argv = ['node', 'freelog-cli', '--json'];
    out.length = 0;
    err.length = 0;
    vi.spyOn(process.stdout, 'write').mockImplementation((text) => { out.push(String(text)); return true; });
    vi.spyOn(process.stderr, 'write').mockImplementation((text) => { err.push(String(text)); return true; });
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it.each([
    new Error('FAKE_BOOTSTRAP_PRIVATE', { cause: new Error('FAKE_COOKIE') }),
    { config: { headers: { Authorization: 'FAKE_AUTHORIZATION', Cookie: 'FAKE_COOKIE' } } },
  ])('bootstrap 失败不交给 Node 打印原对象 %#', async (failure) => {
    entry.bootstrapPlatform.mockImplementation(() => { throw failure; });
    await expect(import('../../src/bin/index')).resolves.toBeDefined();
    expect(process.exitCode).toBe(1);
    expect(out).toEqual([`${JSON.stringify(safeFailure)}\n`]);
    expect(err).toEqual([]);
    expect(entry.runCli).not.toHaveBeenCalled();
    expect(entry.bootstrapPlatform).toHaveBeenCalledTimes(1);
  });

  it('bootstrap 的受控 CliError 也保留原码和恢复说明', async () => {
    const { CliError } = await import('../../src/core/errors');
    entry.bootstrapPlatform.mockImplementation(() => { throw new CliError('先核对旧请求结果', 'RESULT_UNKNOWN'); });
    await expect(import('../../src/bin/index')).resolves.toBeDefined();
    expect(process.exitCode).toBe(1);
    expect(out).toEqual([`${JSON.stringify({ code: 'RESULT_UNKNOWN', message: '先核对旧请求结果' })}\n`]);
    expect(err).toEqual([]);
    expect(entry.runCli).not.toHaveBeenCalled();
  });

  it('启动后未转换的 promise 拒绝也只报告安全说明', async () => {
    entry.runCli.mockRejectedValue(new Error('FAKE_HTTP_CONFIG'));
    await expect(import('../../src/bin/index')).resolves.toBeDefined();
    expect(process.exitCode).toBe(1);
    expect(out).toEqual([`${JSON.stringify(safeFailure)}\n`]);
    expect(err).toEqual([]);
    expect(entry.runCli).toHaveBeenCalledTimes(1);
  });

  it('正常入口不更改 runCli 退出码或额外输出', async () => {
    entry.runCli.mockResolvedValue(7);
    await import('../../src/bin/index');
    expect(process.exitCode).toBe(7);
    expect(out).toEqual([]);
    expect(err).toEqual([]);
    expect(entry.runCli).toHaveBeenCalledWith(process.argv, { from: 'node' });
  });
});
