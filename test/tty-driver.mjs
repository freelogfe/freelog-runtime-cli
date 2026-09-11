/** 跨平台真实 TTY 验收驱动（仅测试代码）。 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as pty from 'node-pty';

/**
 * 在伪终端运行子进程，按顺序等待文本并发送按键；完整 transcript 仅留给调用者断言。
 * 每个 step 的 expect 都是普通文本，不依赖某个平台的终端转义序列。
 */
export function runTty({ cwd, program, args, steps, timeoutSeconds = 120 }) {
  return new Promise((resolve) => {
    let terminal;
    let transcript = '';
    let stepIndex = 0;
    let finished = false;
    let timeout;
    let dataSubscription;
    let exitSubscription;

    const finish = (status, error = '') => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      dataSubscription?.dispose();
      exitSubscription?.dispose();
      terminal?.destroy?.();
      resolve({ status, stdout: transcript, stderr: error });
    };

    const applySteps = () => {
      while (stepIndex < steps.length && transcript.includes(steps[stepIndex].expect)) {
        const send = steps[stepIndex].send;
        stepIndex += 1;
        if (send) terminal.write(send);
      }
    };

    try {
      terminal = pty.spawn(program, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40,
        cwd,
        env: process.env,
        // node-pty 的 Windows 内置 ConPTY 运行时避免退出时附加到已结束控制台的代理。
        ...(process.platform === 'win32' ? { useConptyDll: true } : {}),
      });
      dataSubscription = terminal.onData((data) => {
        transcript += data;
        applySteps();
      });
      exitSubscription = terminal.onExit(({ exitCode }) => {
        if (stepIndex < steps.length) {
          const expected = steps[stepIndex].expect;
          finish(exitCode || 2, `未在退出前看到：${expected}`);
          return;
        }
        finish(exitCode);
      });
      timeout = setTimeout(() => {
        const expected = stepIndex < steps.length ? `；尚未看到：${steps[stepIndex].expect}` : '';
        try { terminal.kill(); } catch { /* 已退出时无需处理。 */ }
        finish(2, `TTY 超时${expected}`);
      }, timeoutSeconds * 1_000);
      if (finished) clearTimeout(timeout);
    } catch (error) {
      finish(2, error instanceof Error ? error.message : String(error));
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
  if (flags.status !== 0 || !flagTranscript.includes('"stdin":true') || !flagTranscript.includes('"stdout":true')) {
    return { available: false, reason: flagTranscript.trim().slice(-600) || `node-pty TTY 标志探针退出 ${flags.status}` };
  }

  const inquirerEntry = path.join(cwd, 'packages', 'cli', 'node_modules', '@inquirer', 'prompts', 'dist', 'esm', 'index.js');
  if (!existsSync(inquirerEntry)) {
    return { available: false, reason: `找不到 CLI 的 Inquirer 测试入口：${inquirerEntry}` };
  }
  const prompt = await runTty({
    cwd,
    program: process.execPath,
    args: [
      '--input-type=module',
      '-e',
      `import { select } from ${JSON.stringify(pathToFileURL(inquirerEntry).href)}; const value = await select({ message: 'node-pty interaction probe', choices: [{ name: 'first', value: 'first' }, { name: 'second', value: 'second' }] }); console.log('__NODE_PTY_SELECTED__=' + value); process.exit(0);`,
    ],
    steps: [
      { expect: 'node-pty interaction probe', send: '\u001b[B\r' },
      { expect: '__NODE_PTY_SELECTED__=second' },
    ],
    timeoutSeconds: 20,
  });
  const promptTranscript = `${prompt.stdout}${prompt.stderr}`;
  if (prompt.status === 0 && promptTranscript.includes('__NODE_PTY_SELECTED__=second')) {
    return { available: true, kind: 'node-pty' };
  }
  return { available: false, reason: promptTranscript.trim().slice(-600) || `node-pty Inquirer 探针退出 ${prompt.status}` };
}
