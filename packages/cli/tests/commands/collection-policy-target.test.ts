import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCollectionPolicyCommand } from '../../src/commands/collection/policy';
import * as target from '../../src/domain/collection/target';
import * as policy from '../../src/domain/collection/policy';
import * as tty from '../../src/core/tty';
import type { PolicyTemplate } from '../../src/domain/policy/template';

describe('合集策略模板的命令级固定目标', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['list', 'apply', 'script'])('%s后续编译/提交只使用首次ID', async (mode) => {
    const resolve = vi.spyOn(target, 'resolveCollectionTarget').mockResolvedValue({ resourceId: 'selected', resourceName: 'alice/selected', title: '合集', typeCode: 'CT', info: {} });
    const subject = { kind: 'collection' as const, resourceId: 'selected', typeCode: 'CT' };
    const template: PolicyTemplate = { id: 't', name: '公开策略', fingerprint: 'fp', compileType: 'collection', report: '公开', fields: [] };
    const getCatalog = vi.spyOn(policy, 'getCollectionPolicyTemplateCatalog').mockResolvedValue({ subject, templates: [template], policyNames: [] });
    const getInfo = vi.spyOn(policy, 'getCollectionPolicyTemplateInfo').mockResolvedValue({ subject, template, policyNames: [] });
    const prepare = vi.spyOn(policy, 'prepareCollectionPolicyTemplate').mockResolvedValue({ template, values: new Map(), policyText: 'FOR PUBLIC', translation: '公开' });
    const apply = vi.spyOn(policy, 'applyCollectionPolicy').mockResolvedValue();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(tty, 'isInteractive').mockReturnValue(true);
    const select = vi.spyOn(tty, 'selectQuestion');
    if (mode === 'list') select.mockResolvedValueOnce('t').mockResolvedValueOnce('__preview__');
    else select.mockResolvedValueOnce('__preview__');
    const args = ['template', mode === 'list' ? 'list' : 'apply', ...(mode === 'list' ? [] : ['t']), '--cwd', process.cwd(), '--yes'];
    if (mode === 'script') args.push('--name', '新策略', '--template-fingerprint', 'fp');
    await createCollectionPolicyCommand().parseAsync(args, { from: 'user' });
    expect(resolve).toHaveBeenCalledTimes(1);
    const calledReads = [...getCatalog.mock.calls, ...getInfo.mock.calls, ...prepare.mock.calls, ...apply.mock.calls];
    expect(calledReads.length).toBeGreaterThan(1);
    expect(calledReads.every(([input]) => input.selector === 'id:selected')).toBe(true);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
