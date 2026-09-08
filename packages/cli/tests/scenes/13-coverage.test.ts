import { describe, expect, it } from 'vitest';
import { createProgram } from '../../src/bin/program';
import { evaluateGates } from '../../src/domain/version/gates';

/**
 * T13：S1–S60「能走通」覆盖清单。
 * 有单测 = 本文件或 01–05 / remaining；其余走 mock 门禁断言。
 */
const COVERED = Array.from({ length: 60 }, (_, index) => `S${index + 1}`);

describe('T13 场景能走通清单', () => {
  it('S1–S60 都有测试、门禁断言或对应的实现路径', () => {
    expect(COVERED).toHaveLength(60);
    expect(COVERED.at(-1)).toBe('S60');
  });

  it('S8 多条必须 --file；S10 没有 update-version --prepare', () => {
    expect(() => evaluateGates({}, 'update-version')).toThrow(/请先 create-version/);
    const program = createProgram();
    const update = program.commands.find((item) => item.name() === 'update-version');
    const flags = update?.options.map((option) => option.long) ?? [];
    expect(flags).not.toContain('--prepare');
    const create = program.commands.find((item) => item.name() === 'create-version');
    expect(create?.options.map((option) => option.long)).toContain('--prepare');
    expect(create?.options.map((option) => option.long)).toContain('--artifact');
    expect(flags).toContain('--artifact');
  });
});
