import { describe, expect, it } from 'vitest';
import { createProgram } from '../../src/bin/program';
import { evaluateGates } from '../../src/domain/version/gates';

/**
 * 场景端到端覆盖由 01–05 与领域测试承担；这里仅锁住命令树不可变约束。
 * 不能用「生成 S1–S60 字符串」伪造场景覆盖。
 */
describe('T13 命令树约束', () => {

  it('S8 多条必须 --resource；S10 没有 update-version --prepare', () => {
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
