import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPolicyApplyCommand } from '../../src/commands/policy/apply';
import { createPolicyListCommand } from '../../src/commands/policy/list';
import { createPolicySetCommand } from '../../src/commands/policy/set';
import * as tty from '../../src/core/tty';
import * as policyDomain from '../../src/domain/policy/list';

describe('策略命令的资源选择器', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('policy apply 将 --resource 原样传给领域层', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-policy-command-'));
    const source = path.join(cwd, 'policy.txt');
    writeFileSync(source, 'policy text');
    const applyPolicy = vi.spyOn(policyDomain, 'applyPolicy').mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await createPolicyApplyCommand().parseAsync([
      '--cwd', cwd, '--resource', 'file:2.json', '--from-file', source, '--name', '测试策略', '--yes',
    ], { from: 'user' });

    expect(applyPolicy).toHaveBeenCalledWith(expect.objectContaining({
      cwd,
      file: 'file:2.json',
      policyName: '测试策略',
      policyText: 'policy text',
    }));
  });

  it('policy set 将 --resource 原样传给领域层', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-policy-command-'));
    const setPolicy = vi.spyOn(policyDomain, 'setPolicy').mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await createPolicySetCommand().parseAsync([
      '--cwd', cwd, '--resource', 'id:resource_2', '--id', 'policy_2', '--on', '--yes',
    ], { from: 'user' });

    expect(setPolicy).toHaveBeenCalledWith({
      cwd,
      file: 'id:resource_2',
      policyId: 'policy_2',
      on: true,
    });
  });

  it('policy list 在非交互环境只输出固定 50 条首页及继续提示', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-policy-command-'));
    const getPolicyList = vi.spyOn(policyDomain, 'getPolicyList').mockResolvedValue({
      typeHierarchy: ['祖父节点', '父节点', '叶子节点'],
      policies: Array.from({ length: 51 }, (_, index) => ({
        policyId: `policy-${index + 1}`,
        policyName: `策略${index + 1}`,
        status: 1,
      })),
    });
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createPolicyListCommand().parseAsync([
      '--cwd', cwd, '--resource', 'file:2.json', '--yes',
    ], { from: 'user' });

    expect(getPolicyList).toHaveBeenCalledWith({ cwd, file: 'file:2.json' });
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('资源类型：祖父节点 / 父节点 / 叶子节点');
    expect(logs[0]).toContain('第 1/2 页，共 51 条');
    expect(logs[0]).toContain('policy-50');
    expect(logs[0]).not.toContain('policy-51');
    expect(logs[1]).toContain('还有 1 条策略');
  });

  it('policy list 的交互列表能切换下一页并退出，不重新读取平台', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'freelog-policy-command-'));
    const getPolicyList = vi.spyOn(policyDomain, 'getPolicyList').mockResolvedValue({
      typeHierarchy: ['祖父节点', '父节点', '叶子节点'],
      policies: Array.from({ length: 51 }, (_, index) => ({
        policyId: `policy-${index + 1}`,
        policyName: `策略${index + 1}`,
        status: 1,
      })),
    });
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    vi.spyOn(tty, 'selectQuestion')
      .mockResolvedValueOnce('__next__')
      .mockResolvedValueOnce('__exit__');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createPolicyListCommand().parseAsync(['--cwd', cwd], { from: 'user' });

    expect(getPolicyList).toHaveBeenCalledTimes(1);
    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('第 1/2 页，共 51 条');
    expect(logs[1]).toContain('第 2/2 页，共 51 条');
    expect(logs[1]).toContain('policy-51');
    expect(tty.selectQuestion).toHaveBeenCalledTimes(2);
  });
});
