import test from 'node:test';
import assert from 'node:assert/strict';
import { runTty } from '../tty-driver.mjs';

function exitWith(event) {
  return () => ({
    onData() { return { dispose() {} }; },
    onExit(callback) { queueMicrotask(() => callback(event)); return { dispose() {} }; },
    destroy() {}, write() {}, kill() {},
  });
}

test('injected PTY signal termination with zero exit code is never successful', async () => {
  const result = await runTty({ program: 'not-executed', args: [], cwd: process.cwd(), steps: [], spawn: exitWith({ exitCode: 0, signal: 15 }) });
  assert.equal(result.signal, 15);
  assert.equal(result.completed, false);
  assert.notEqual(result.status, 0);
});

test('normally completed injected PTY remains distinguishable from signal or missing status', async () => {
  const completed = await runTty({ program: 'not-executed', args: [], cwd: process.cwd(), steps: [], spawn: exitWith({ exitCode: 0, signal: 0 }) });
  assert.equal(completed.completed, true); assert.equal(completed.status, 0); assert.equal(completed.signal, null);
  const missing = await runTty({ program: 'not-executed', args: [], cwd: process.cwd(), steps: [], spawn: exitWith({ exitCode: undefined }) });
  assert.equal(missing.completed, false);
});
