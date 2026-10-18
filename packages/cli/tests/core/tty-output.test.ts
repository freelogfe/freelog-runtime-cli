import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askInput, confirmWrite, selectQuestion } from '../../src/core/tty';

let fakeInput: PassThrough;
// 只注入输入流，不替换提示实现：必须让真实Inquirer完成渲染和解析，才能检验输出通道。
vi.mock('@inquirer/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inquirer/prompts')>();
  return { ...actual,
    confirm: (config: Parameters<typeof actual.confirm>[0], context: Parameters<typeof actual.confirm>[1]) => actual.confirm(config, { ...context, input: fakeInput }),
    input: (config: Parameters<typeof actual.input>[0], context: Parameters<typeof actual.input>[1]) => actual.input(config, { ...context, input: fakeInput }),
    select: (config: Parameters<typeof actual.select>[0], context: Parameters<typeof actual.select>[1]) => actual.select(config, { ...context, input: fakeInput }),
  };
});

describe('真实Inquirer输出流（受控输入，不冒充真实PTY）', () => {
  const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
  let stdout: string[], stderr: string[];
  beforeEach(() => {
    fakeInput = new PassThrough(); stdout = []; stderr = [];
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: unknown) => { stdout.push(String(chunk)); return true; }) as typeof process.stdout.write);
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => { stderr.push(String(chunk)); return true; }) as typeof process.stderr.write);
  });
  afterEach(() => {
    fakeInput.destroy(); vi.restoreAllMocks();
    for (const [stream, descriptor] of [[process.stdin, stdinTTY], [process.stdout, stdoutTTY]] as const) {
      if (descriptor) Object.defineProperty(stream, 'isTTY', descriptor); else Reflect.deleteProperty(stream, 'isTTY');
    }
  });
  it.each(['y', 'n'])('显式stderr确认（%s）真实提示/答案/ANSI均不进入stdout', async (answer) => {
    const completed = confirmWrite('JSON_WRITE_PREVIEW', false, process.stderr).then((value) => ({ value }), (error: unknown) => ({ error }));
    await vi.waitFor(() => { expect(stdout.join('') + stderr.join('')).toContain('JSON_WRITE_PREVIEW'); });
    fakeInput.write(`${answer}\n`);
    const result = await completed;
    expect(stdout).toEqual([]); expect(stderr.join('')).toContain('JSON_WRITE_PREVIEW');
    if (answer === 'n') expect(result).toMatchObject({ error: { code: 'FORM_CANCELLED' } });
    else expect(result).toEqual({ value: 'JSON_WRITE_PREVIEW' });
  });
  it('显式stderr输入仍使用真实库，但stdout保持空', async () => {
    const completed = askInput('JSON_INPUT_CURRENT_VALUE', process.stderr);
    await vi.waitFor(() => { expect(stdout.join('') + stderr.join('')).toContain('JSON_INPUT_CURRENT_VALUE'); });
    fakeInput.write('new-value\n');
    expect(await completed).toBe('new-value'); expect(stdout).toEqual([]); expect(stderr.join('')).toContain('new-value');
  });
  it('未指定通道保留其它命令现有stdout提示行为', async () => {
    const completed = confirmWrite('DEFAULT_CHANNEL_PREVIEW', false);
    await vi.waitFor(() => { expect(stdout.join('')).toContain('DEFAULT_CHANNEL_PREVIEW'); });
    fakeInput.write('y\n');
    await completed; expect(stdout.join('')).toContain('DEFAULT_CHANNEL_PREVIEW'); expect(stderr).toEqual([]);
  });
  it('显式stderr资源选择运行真实控件，菜单/选择/ANSI不污染stdout', async () => {
    const completed = selectQuestion('JSON_RESOURCE_SELECTOR', [{ name: 'first resource', value: 'first' }, { name: 'second resource', value: 'second' }], process.stderr);
    await vi.waitFor(() => { expect(stdout.join('') + stderr.join('')).toContain('JSON_RESOURCE_SELECTOR'); });
    fakeInput.write('\u001b[B\r');
    expect(await completed).toBe('second'); expect(stdout).toEqual([]); expect(stderr.join('')).toContain('second resource');
  });
});
