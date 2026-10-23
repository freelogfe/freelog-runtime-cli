/** 跨平台真实 TTY 验收驱动（仅测试代码）。 */
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import * as pty from 'node-pty';
import { resolveCliBin } from './acceptance/cli-bin.mjs';

/**
 * 在伪终端运行子进程，按顺序等待文本并发送按键；完整 transcript 仅留给调用者断言。
 * 每个 step 的 expect 都是普通文本，不依赖某个平台的终端转义序列。
 */
export function runTty({ cwd, program, args, steps, timeoutSeconds = 120, spawn = pty.spawn, env = process.env, onSpawn,
  maxOutputBytes = 1_000_000 }) {
  return new Promise((resolve) => {
    let terminal;
    let transcript = '';
    let stepIndex = 0;
    let searchFrom = 0;
    let finished = false;
    let timeout;
    let dataSubscription;
    let exitSubscription;
    let exited = false;
    let terminated = false;

    const terminate = () => {
      if (!terminal || exited || terminated) return;
      terminated = true;
      try { terminal.kill(); } catch { /* the owned process may have exited before its callback */ }
    };

    const finish = (status, error = '', signal = null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      dataSubscription?.dispose();
      exitSubscription?.dispose();
      const signalled = signal !== null && signal !== undefined && signal !== 0;
      resolve({ status: signalled ? status || 1 : status, signal: signalled ? signal : null,
        completed: Number.isInteger(status) && !signalled && !error,
        stdout: transcript, stderr: error, completedSteps: stepIndex,
        matchedPrompts: steps.slice(0, stepIndex).map((step) => step.expect) });
    };

    const applySteps = () => {
      while (stepIndex < steps.length) {
        const foundAt = transcript.indexOf(steps[stepIndex].expect, searchFrom);
        if (foundAt < 0) break;
        searchFrom = foundAt + steps[stepIndex].expect.length;
        const send = steps[stepIndex].send;
        stepIndex += 1;
        if (send) terminal.write(send);
      }
    };

    try {
      terminal = spawn(program, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd,
        env,
        // node-pty 的 Windows 内置 ConPTY 运行时避免退出时附加到已结束控制台的代理。
        ...(process.platform === 'win32' ? { useConptyDll: true } : {}),
      });
      onSpawn?.(terminal.pid);
      dataSubscription = terminal.onData((data) => {
        if (finished) return;
        if (Buffer.byteLength(transcript, 'utf8') + Buffer.byteLength(data, 'utf8') > maxOutputBytes) {
          // 先锁定失败，kill的同步exit0回调也不能把截断伪装成成功。
          finish(2, 'PTY output limit exceeded; retained transcript is incomplete.');
          terminate();
          return;
        }
        transcript += data;
        applySteps();
      });
      exitSubscription = terminal.onExit(({ exitCode, signal }) => {
        exited = true;
        if (stepIndex < steps.length) {
          const expected = steps[stepIndex].expect;
          finish(exitCode || 2, `未在退出前看到：${expected}`, signal);
          return;
        }
        finish(exitCode, '', signal);
      });
      timeout = setTimeout(() => {
        const expected = stepIndex < steps.length ? `；尚未看到：${steps[stepIndex].expect}` : '';
        finish(2, `TTY 超时${expected}`);
        terminate();
      }, timeoutSeconds * 1_000);
      if (finished) clearTimeout(timeout);
    } catch (error) {
      finish(2, error instanceof Error ? error.message : String(error));
      terminate();
    }
  });
}

/**
 * 本地只读探针：既验证 Node 的 TTY 标志，也验证 CLI 实际使用的 Inquirer 选择控件。
 * 不能只信任 isTTY；按键传递、终端宽度或清屏序列错误仍可能使真实选择失效。
 */
export async function probeTty(cwd = process.cwd()) {
  const flags = await runTty({
    cwd,
    program: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({stdin:process.stdin.isTTY,stdout:process.stdout.isTTY})); process.exit(0)'],
    steps: [{ expect: '"stdin":true' }, { expect: '"stdout":true' }],
    timeoutSeconds: 20,
  });
  const flagTranscript = `${flags.stdout}${flags.stderr}`;
  if (!flags.completed || flags.signal !== null || flags.status !== 0 || !flagTranscript.includes('"stdin":true') || !flagTranscript.includes('"stdout":true')) {
    return { available: false, reason: flagTranscript.trim().slice(-600) || `node-pty TTY 标志探针退出 ${flags.status}` };
  }

  let inquirerEntry;
  try {
    // Resolve from the exact installed candidate, never from workspace dependencies in candidate mode.
    inquirerEntry = createRequire(pathToFileURL(resolveCliBin(cwd))).resolve('@inquirer/prompts');
  } catch (error) {
    return { available: false, reason: `无法从被测 CLI 解析 Inquirer：${error instanceof Error ? error.message : String(error)}` };
  }
  const prompt = await runTty({
    cwd,
    program: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      `const prompts = await import(${JSON.stringify(pathToFileURL(inquirerEntry).href)}); const select = prompts.select ?? prompts.default?.select; const value = await select({ message: 'node-pty interaction probe', choices: [{ name: 'first', value: 'first' }, { name: 'second', value: 'second' }] }); console.log('__NODE_PTY_SELECTED__=' + value); process.exit(0);`,
    ],
    steps: [
      { expect: 'node-pty interaction probe', send: '\u001b[B\r' },
      { expect: '__NODE_PTY_SELECTED__=second' },
    ],
    timeoutSeconds: 20,
  });
  const promptTranscript = `${prompt.stdout}${prompt.stderr}`;
  if (prompt.completed && prompt.signal === null && prompt.status === 0 && promptTranscript.includes('__NODE_PTY_SELECTED__=second')) {
    return { available: true, kind: 'node-pty' };
  }
  return { available: false, reason: promptTranscript.trim().slice(-600) || `node-pty Inquirer 探针退出 ${prompt.status}` };
}
