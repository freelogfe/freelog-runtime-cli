import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPolicyListCommand } from '../../src/commands/policy/list';
import { createPolicySetCommand } from '../../src/commands/policy/set';
import { createPolicyTemplateCommand, createPolicyTemplateCommandWithBackend } from '../../src/commands/policy/template';
import { addSharedOptions } from '../../src/core/cliArgs';
import { CliError } from '../../src/core/errors';
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
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, templates, policyNames: [],
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
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, templates, policyNames: [],
    });
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    vi.spyOn(tty, 'selectQuestion')
      .mockResolvedValueOnce('__next__')
      .mockResolvedValueOnce('__exit__');
    await createPolicyTemplateCommand().parseAsync(['list', '--cwd', process.cwd()], { from: 'user' });

    expect(getTemplates).toHaveBeenCalledTimes(1);
    expect(tty.selectQuestion).toHaveBeenCalledTimes(2);
  });

  it('第二页可选中模板再取消，过程不编译也不创建策略', async () => {
    const templates = templateList(21);
    const prepare = vi.fn();
    const apply = vi.fn();
    const backend = {
      commandPrefix: 'freelog-cli policy template',
      getCatalog: async () => ({ subject: { kind: 'resource' as const, resourceId: 'r', typeCode: 'RT' }, templates, policyNames: [] }),
      getInfo: async () => ({ subject: { kind: 'resource' as const, resourceId: 'r', typeCode: 'RT' }, template: templates[20]!, policyNames: [] }),
      prepare, apply,
    };
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    vi.spyOn(tty, 'selectQuestion').mockResolvedValueOnce('__next__').mockResolvedValueOnce('template-21').mockResolvedValueOnce('__cancel__');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await createPolicyTemplateCommandWithBackend({ addOptions: addSharedOptions, backend }).parseAsync([
      'list', '--cwd', process.cwd(),
    ], { from: 'user' });
    expect(prepare).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });

  it('policy template list --json 一次输出完整目录，不按 20 条截断', async () => {
    const templates = templateList(21);
    vi.spyOn(policyDomain, 'getPolicyTemplateCatalog').mockResolvedValue({
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, templates, policyNames: [],
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

  it('没有适用模板时正常说明为空，不进入交互选择', async () => {
    vi.spyOn(policyDomain, 'getPolicyTemplateCatalog').mockResolvedValue({
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, templates: [], policyNames: [],
    });
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    const select = vi.spyOn(tty, 'selectQuestion');
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });
    await createPolicyTemplateCommand().parseAsync(['list', '--cwd', process.cwd()], { from: 'user' });
    expect(logs[0]).toContain('没有可用授权策略模板');
    expect(select).not.toHaveBeenCalled();
  });

  it('policy template info 输出完整详情及可复制的精确 ID 脚本骨架', async () => {
    const template = templateList(1)[0]!;
    vi.spyOn(policyDomain, 'getPolicyTemplateInfo').mockResolvedValue({
      subject: { kind: 'resource', resourceId: 'r', typeCode: 'RT' }, template, policyNames: [],
    });
    const logs: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((value: unknown) => { logs.push(String(value)); });

    await createPolicyTemplateCommand().parseAsync(['info', '--cwd', process.cwd(), 'template-1'], { from: 'user' });

    expect(logs[0]).toContain('freelog-cli policy template apply template-1');
    expect(logs[0]).toContain(template.fingerprint);
  });

  it('同名默认策略先要求改名，不做编译；写入结果未知时 TTY 直接退出', async () => {
    const template = templateList(1)[0]!;
    const prepare = vi.fn(async () => ({ template, values: new Map(), policyText: 'FOR PUBLIC', translation: '永久授权' }));
    const apply = vi.fn(async () => { throw new CliError('创建结果未知', 'POLICY_CREATE_RESULT_UNKNOWN'); });
    const backend = {
      commandPrefix: 'freelog-cli policy template',
      getCatalog: async () => ({ subject: { kind: 'resource' as const, resourceId: 'r', typeCode: 'RT' }, templates: [template], policyNames: [template.name] }),
      getInfo: async () => ({ subject: { kind: 'resource' as const, resourceId: 'r', typeCode: 'RT' }, template, policyNames: [template.name] }),
      prepare, apply,
    };
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    vi.spyOn(tty, 'selectQuestion').mockResolvedValueOnce('__preview__').mockResolvedValueOnce('__name__').mockResolvedValueOnce('__preview__');
    vi.spyOn(tty, 'askInput').mockResolvedValueOnce('另一策略');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(createPolicyTemplateCommandWithBackend({ addOptions: addSharedOptions, backend }).parseAsync([
      'apply', 'template-1', '--cwd', process.cwd(), '--yes',
    ], { from: 'user' })).rejects.toMatchObject({ code: 'POLICY_CREATE_RESULT_UNKNOWN' });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(tty.selectQuestion).toHaveBeenCalledTimes(3);
  });

  it('脚本中的无效策略名在编译前被拒绝', async () => {
    const template = templateList(1)[0]!;
    const prepare = vi.fn();
    const backend = {
      commandPrefix: 'freelog-cli policy template',
      getCatalog: async () => ({ subject: { kind: 'resource' as const, resourceId: 'r', typeCode: 'RT' }, templates: [template], policyNames: [] }),
      getInfo: async () => ({ subject: { kind: 'resource' as const, resourceId: 'r', typeCode: 'RT' }, template, policyNames: [] }),
      prepare, apply: vi.fn(),
    };
    await expect(createPolicyTemplateCommandWithBackend({ addOptions: addSharedOptions, backend }).parseAsync([
      'apply', 'template-1', '--cwd', process.cwd(), '--template-fingerprint', template.fingerprint, '--name', 'x', '--yes',
    ], { from: 'user' })).rejects.toMatchObject({ code: 'POLICY_NAME_INVALID' });
    expect(prepare).not.toHaveBeenCalled();
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
