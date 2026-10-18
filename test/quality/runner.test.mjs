import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { testArguments } from '../../scripts/quality/test.mjs';

test('跨平台显式传入测试文件，不依赖 shell glob', () => {
  const file = path.resolve('test/quality/a.test.mjs');
  assert.deepEqual(testArguments([file]), ['--test', '--test-concurrency=1', file]);
});

test('空、重复、非测试或非绝对路径清单均拒绝', () => {
  for (const files of [[], undefined, ['*.test.mjs'], [path.resolve('a.txt')], [path.resolve('a.test.mjs'), path.resolve('a.test.mjs')]]) {
    assert.throws(() => testArguments(files));
  }
});
