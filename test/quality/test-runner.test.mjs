import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { runTests } from '../../scripts/quality/test.mjs';

test('quality suites retain a bounded ten-minute execution budget and explicit test arguments', () => {
  const file = path.resolve('test/quality/static.test.mjs');
  let observed;
  runTests([file], (...args) => { observed = args; return { status: 0 }; });
  assert.deepEqual(observed, [process.execPath, ['--test', '--test-concurrency=1', file], { stdio: 'inherit', timeout: 600_000 }]);
});

test('timeout, signal, spawn error, missing status and nonzero test exit remain failures with diagnostics', () => {
  const file = path.resolve('test/quality/static.test.mjs');
  for (const [result, error] of [
    [{ status: null, error: { code: 'ETIMEDOUT' } }, /QUALITY_TEST_TIMEOUT/u],
    [{ status: 0, signal: 'SIGTERM' }, /QUALITY_TEST_INCOMPLETE/u],
    [{ status: 0, error: { code: 'ENOENT' } }, /QUALITY_TEST_INCOMPLETE/u],
    [{}, /QUALITY_TEST_INCOMPLETE/u],
    [{ status: 1 }, /QUALITY_TEST_FAILED: exit 1/u],
  ]) assert.throws(() => runTests([file], () => result), error);
});
