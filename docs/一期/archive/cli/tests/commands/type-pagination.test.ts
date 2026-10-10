import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/domain/account/login', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/domain/account/login')>();
  return {
    ...actual,
    requireAuth: vi.fn(),
    resolveCwd: (cwd?: string) => cwd ?? process.cwd(),
  };
});

import { createTypeCommand } from '../../src/commands/project/type';
import * as typeDomain from '../../src/domain/create/typePick';
import * as tty from '../../src/core/tty';

function types(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    code: `TYPE_${index + 1}`,
    name: `叶子${index + 1}`,
    nameChain: `祖父节点 / 父节点 / 叶子${index + 1}`,
  }));
}

describe('type list 分页', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('非交互环境仅输出 50 个完整路径，并提示在 TTY 查看下一页', async () => {
    vi.spyOn(typeDomain, 'listLeafTypes').mockResolvedValue(types(51));
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createTypeCommand().parseAsync(['list', '--cwd', process.cwd()], { from: 'user' });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('第 1/2 页，共 51 个可用最终叶子类型');
    expect(logs[0]).toContain('TYPE_50\t祖父节点 / 父节点 / 叶子50');
    expect(logs[0]).not.toContain('TYPE_51');
    expect(logs[1]).toContain('还有 1 个资源类型；请在交互终端运行 type list 查看后续页');
  });

  it('交互环境可切换下一页，且只读取一次类型列表', async () => {
    const list = vi.spyOn(typeDomain, 'listLeafTypes').mockResolvedValue(types(51));
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    vi.spyOn(tty, 'selectQuestion')
      .mockResolvedValueOnce('__next__')
      .mockResolvedValueOnce('__exit__');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createTypeCommand().parseAsync(['list', '--cwd', process.cwd()], { from: 'user' });

    expect(list).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('第 1/2 页，共 51 个可用最终叶子类型');
    expect(logs[1]).toContain('第 2/2 页，共 51 个可用最终叶子类型');
    expect(logs[1]).toContain('TYPE_51\t祖父节点 / 父节点 / 叶子51');
    expect(tty.selectQuestion).toHaveBeenCalledTimes(2);
  });
});
