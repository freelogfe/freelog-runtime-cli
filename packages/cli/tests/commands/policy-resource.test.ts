import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPolicyApplyCommand } from '../../src/commands/policy/apply';
import { createPolicySetCommand } from '../../src/commands/policy/set';
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
});
