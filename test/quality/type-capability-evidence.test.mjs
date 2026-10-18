import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTypeCapability } from '../acceptance/type-capability-evidence.mjs';

const complete = (output) => ({ completed: true, status: 0, ok: true, output });
test('only the exact expected code and successful supported capability row can continue', () => {
  assert.deepEqual(classifyTypeCapability(complete('RT005001\t多媒体 / 图片 / 照片\t可选配置：支持\n'), 'RT005001'), { status: 'PASS' });
  const unavailable = classifyTypeCapability(complete('RT005001\t多媒体 / 图片 / 照片\t可选配置：不支持'), 'RT005001');
  assert.equal(unavailable.status, 'BLOCKED');
  assert.match(unavailable.reason, /正常读回/u);
});
test('spawn/network/command failures remain FAIL rather than claiming unsupported capability', () => {
  for (const override of [{ completed: false }, { status: null }, { status: 1 }, { status: 3 }, { ok: false }]) {
    const result = classifyTypeCapability({ ...complete('RT005001\t照片\t可选配置：不支持'), ...override }, 'RT005001');
    assert.equal(result.status, 'FAIL');
  }
});
test('foreign code, missing path, bare support text, contradictory lines and unknown format fail closed', () => {
  for (const output of ['RT001\t主题\t可选配置：支持', 'RT005001\t\t可选配置：支持', '可选配置：支持',
    'RT005001\t照片\t可选配置：支持\nRT005001\t照片\t可选配置：不支持',
    'RT005001 照片 可选配置：支持', 'RT005001\t照片\t可选配置：未知']) {
    assert.equal(classifyTypeCapability(complete(output), 'RT005001').status, 'FAIL', output);
  }
});
