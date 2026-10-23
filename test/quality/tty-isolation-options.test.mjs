/** Driver controls only; not actual PTY or installed candidate evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTty } from '../tty-driver.mjs';
test('an explicit isolated env reaches PTY unchanged, and actual child pid is observed', async () => {
  const isolated = { SAFE_ONLY: 'synthetic' }; let seen, pid;
  const result = await runTty({ cwd: process.cwd(), program: 'not-executed', args: [], steps: [], env: isolated, onSpawn: (p) => { pid = p; },
    spawn: (_program, _args, options) => { seen = options.env; return { pid: 1234,
      onData() { return { dispose() {} }; }, onExit(cb) { queueMicrotask(() => cb({ exitCode: 0, signal: 0 })); return { dispose() {} }; }, destroy() {}, kill() {} }; } });
  assert.equal(result.status, 0); assert.equal(result.completed, true);
  assert.ok(seen === isolated, 'PTY ignored the explicit isolated environment; values intentionally not printed.'); assert.equal(pid, 1234);
});
test('output beyond the fixed limit cannot be reported as a complete successful transcript', async () => {
  const result = await runTty({ cwd: process.cwd(), program: 'not-executed', args: [], steps: [], maxOutputBytes: 100, timeoutSeconds: 0.1,
    spawn: () => ({ pid: 1234, onData(cb) { queueMicrotask(() => cb('X'.repeat(101))); return { dispose() {} }; },
      onExit() { return { dispose() {} }; }, destroy() {}, kill() {} }) });
  assert.equal(result.completed, false); assert.notEqual(result.status, 0); assert.match(result.stderr, /output limit/u);
});
for (const mode of ['timeout', 'output']) test(`${mode} cannot race a synchronous kill/exit0 into PASS`, async () => {
  let onExit;
  const result = await runTty({ cwd: process.cwd(), program: 'not-executed', args: [], steps: [], timeoutSeconds: 0.01, maxOutputBytes: 100,
    spawn: () => ({ pid: 1234,
      onData(cb) { if (mode === 'output') queueMicrotask(() => cb('X'.repeat(101))); return { dispose() {} }; },
      onExit(cb) { onExit = cb; return { dispose() {} }; }, destroy() {}, kill() { onExit({ exitCode: 0, signal: 0 }); } }) });
  assert.equal(result.completed, false); assert.notEqual(result.status, 0);
});
for (const exitCode of [0, 1]) test(`normal exit ${exitCode} only releases subscriptions, never terminates an exited native session`, async () => {
  let kills = 0, destroys = 0, disposals = 0;
  const result = await runTty({ cwd: process.cwd(), program: 'not-executed', args: [], steps: [],
    spawn: () => ({ pid: 1234,
      onData() { return { dispose() { disposals++; } }; },
      onExit(callback) { queueMicrotask(() => callback({ exitCode, signal: 0 })); return { dispose() { disposals++; } }; },
      destroy() { destroys++; kills++; }, kill() { kills++; },
    }) });
  assert.equal(result.status, exitCode); assert.equal(result.completed, true);
  assert.equal(kills, 0); assert.equal(destroys, 0); assert.equal(disposals, 2);
});
for (const mode of ['timeout', 'output']) test(`aborted PTY ${mode} terminates once, not destroy plus kill`, async () => {
  let kills = 0, destroys = 0, onExit;
  const result = await runTty({ cwd: process.cwd(), program: 'not-executed', args: [], steps: [], timeoutSeconds: 0.01, maxOutputBytes: 100,
    spawn: () => ({ pid: 1234,
      onData(callback) { if (mode === 'output') queueMicrotask(() => callback('X'.repeat(101))); return { dispose() {} }; },
      onExit(callback) { onExit = callback; return { dispose() {} }; },
      destroy() { destroys++; this.kill(); }, kill() { kills++; onExit({ exitCode: 0, signal: 0 }); },
    }) });
  assert.equal(result.completed, false); assert.notEqual(result.status, 0);
  assert.equal(kills, 1); assert.equal(destroys, 0);
});
