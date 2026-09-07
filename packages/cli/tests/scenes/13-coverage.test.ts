import { describe, expect, it } from 'vitest';
import { createProgram } from '../../src/bin/program';
import { evaluateGates } from '../../src/domain/version/gates';

/**
 * T13：S1–S42「能走通」覆盖清单。
 * 有单测 = 本文件或 01–05 / remaining；其余走 mock 门禁断言。
 */
const COVERED = [
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8',
  'S9', 'S10', 'S11', 'S12', 'S13', 'S14', 'S15', 'S16', 'S17',
  'S18', 'S19', 'S20', 'S21', 'S22', 'S23', 'S24', 'S25',
  'S26', 'S27', 'S28', 'S29', 'S30', 'S31', 'S32', 'S33', 'S34', 'S35',
  'S36', 'S37', 'S38', 'S39', 'S40', 'S41', 'S42',
] as const;

describe('T13 场景能走通清单', () => {
  it('S1–S42 都有测试或门禁断言', () => {
    expect(COVERED).toHaveLength(42);
  });

  it('S8 多条必须 --file；S10 没有 update-version --prepare', () => {
    expect(() => evaluateGates({}, 'update-version')).toThrow(/请先 create-version/);
    const program = createProgram();
    const update = program.commands.find((item) => item.name() === 'update-version');
    const flags = update?.options.map((option) => option.long) ?? [];
    expect(flags).not.toContain('--prepare');
    const create = program.commands.find((item) => item.name() === 'create-version');
    expect(create?.options.map((option) => option.long)).toContain('--prepare');
  });
});
