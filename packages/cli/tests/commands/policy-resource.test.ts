import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPolicyListCommand } from '../../src/commands/policy/list';
import { createPolicySetCommand } from '../../src/commands/policy/set';
import { createPolicyTemplateCommand } from '../../src/commands/policy/template';
import * as tty from '../../src/core/tty';
import * as policyDomain from '../../src/domain/policy/list';

describe('策略命令的资源选择器', () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it('policy list 一次输出全部策略与完整类型链，不进入分页交互', async () => {
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
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('资源类型：祖父节点 / 父节点 / 叶子节点');
    expect(logs[0]).toContain('共 51 条授权策略');
    expect(logs[0]).toContain('policy-51');
  });

  it('policy template list 在非交互环境输出 20 个模板和继续提示', async () => {
    const templates = templateList(21);
    vi.spyOn(policyDomain, 'getPolicyTemplateCatalog').mockResolvedValue({
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, templates,
    });
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createPolicyTemplateCommand().parseAsync(['list', '--cwd', process.cwd()], { from: 'user' });

    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain('第 1/2 页，共 21 个授权策略模板');
    expect(logs[0]).toContain('template-20');
    expect(logs[0]).not.toContain('template-21');
    expect(logs[1]).toContain('还有 1 个授权策略模板');
  });

  it('policy template list 的交互列表能翻到下一页且只读取一次模板', async () => {
    const templates = templateList(21);
    const getTemplates = vi.spyOn(policyDomain, 'getPolicyTemplateCatalog').mockResolvedValue({
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, templates,
    });
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    vi.spyOn(tty, 'selectQuestion')
      .mockResolvedValueOnce('__next__')
      .mockResolvedValueOnce('__exit__');
    await createPolicyTemplateCommand().parseAsync(['list', '--cwd', process.cwd()], { from: 'user' });

    expect(getTemplates).toHaveBeenCalledTimes(1);
    expect(tty.selectQuestion).toHaveBeenCalledTimes(2);
  });

  it('policy template list --json 一次输出完整目录，不按 20 条截断', async () => {
    const templates = templateList(21);
    vi.spyOn(policyDomain, 'getPolicyTemplateCatalog').mockResolvedValue({
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, templates,
    });
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createPolicyTemplateCommand().parseAsync(['list', '--cwd', process.cwd(), '--json'], { from: 'user' });

    expect(logs).toHaveLength(1);
    const result = JSON.parse(logs[0]!) as { schemaVersion: number; templates: Array<{ id: string }> };
    expect(result.schemaVersion).toBe(1);
    expect(result.templates).toHaveLength(21);
    expect(result.templates[20]?.id).toBe('template-21');
  });

  it('policy template info 输出完整详情及可复制的精确 ID 脚本骨架', async () => {
    const template = templateList(1)[0]!;
    vi.spyOn(policyDomain, 'getPolicyTemplateInfo').mockResolvedValue({
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, template,
    });
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createPolicyTemplateCommand().parseAsync(['info', '--cwd', process.cwd(), 'template-1'], { from: 'user' });

    expect(logs[0]).toContain('freelog-cli policy template apply template-1');
    expect(logs[0]).toContain(template.fingerprint);
  });
});

function templateList(count: number): policyDomain.PolicyTemplate[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `template-${index + 1}`,
    name: `模板${index + 1}`,
    report: '永久授权',
    compileType: 'normal' as const,
    fields: [],
    fingerprint: `fingerprint-${index + 1}`,
  }));
}
