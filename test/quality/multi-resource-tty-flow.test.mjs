import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { runTty } from '../tty-driver.mjs';

// Exercise the actual producer function without importing its account-reading main.
const source = readFileSync(new URL('../verify-multi-resource-tty.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function selectSecondAndUpdateTitle(');
const end = source.indexOf('\nasync function main()', start);
assert.ok(start >= 0 && end > start);
function titleSelector(run) {
  return vm.runInNewContext(`(${source.slice(start, end).trim()})`, {
    runTty: run, process: { execPath: process.execPath }, cliBin: 'synthetic-cli.mjs', env: 'dev',
  });
}

function promptSequence({ omitConfirmation = false, omitSuccess = false } = {}) {
  const writes = [];
  let data, exit;
  return { writes, spawn: () => ({
    onData(callback) { data = callback; queueMicrotask(() => data('请选择资源')); return { dispose() {} }; },
    onExit(callback) { exit = callback; return { dispose() {} }; },
    write(key) {
      writes.push(key);
      if (writes.length === 1) queueMicrotask(() => {
        if (omitConfirmation) { data('资源信息已更新并核验'); exit({ exitCode: 0 }); }
        else data('修改资源展示信息\n标识：synthetic/source\n确认写入？');
      });
      else queueMicrotask(() => { if (!omitSuccess) data('资源信息已更新并核验'); exit({ exitCode: 0 }); });
    },
    kill() {}, destroy() {},
  }) };
}

test('actual multi-resource producer selects, previews, confirms and observes success in order', async () => {
  const tty = promptSequence();
  const select = titleSelector((options) => {
    assert.deepEqual(JSON.parse(JSON.stringify(options.args)), ['synthetic-cli.mjs', 'update', '--title', 'edited', '--env', 'dev']);
    return runTty({ ...options, spawn: tty.spawn, timeoutSeconds: 0.1 });
  });
  const result = await select('synthetic-owned-workspace', 'edited');
  assert.equal(result.completed, true, result.stderr);
  assert.equal(result.status, 0);
  assert.deepEqual(Array.from(result.matchedPrompts), ['请选择资源', '修改资源展示信息', '确认写入？', '资源信息已更新并核验']);
  assert.deepEqual(tty.writes, ['\u001b[B\r', '\r']);
});

test('actual producer cannot count an exit0 without confirmation or successful readback as PASS', async () => {
  for (const mode of [{ omitConfirmation: true }, { omitSuccess: true }]) {
    const tty = promptSequence(mode);
    const result = await titleSelector((options) => runTty({ ...options, spawn: tty.spawn, timeoutSeconds: 0.1 }))('synthetic', 'edited');
    assert.equal(result.completed, false);
    assert.notEqual(result.status, 0);
  }
});
