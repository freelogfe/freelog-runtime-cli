import { describe, expect, it, vi } from 'vitest';
import { appendPolicy, togglePolicy } from '../../src/domain/policy/mutation';

describe('单资源与合集共用的策略写入边界', () => {
  it.each(['资源', '合集'] as const)('%s：写入抛错时即使读回同名也不能宣称成功', async (subject) => {
    const read = vi.fn(async () => [{ policyId: 'other', policyName: '新策略', status: 1 }]);
    await expect(appendPolicy({
      subject, resourceId: 'resource-1', policyName: '新策略', policyText: 'FOR PUBLIC',
      update: async () => { throw new Error('timeout'); }, read,
    })).rejects.toMatchObject({ code: 'POLICY_CREATE_RESULT_UNKNOWN', message: expect.stringContaining('timeout') });
    expect(read).not.toHaveBeenCalled();
  });

  it('HTTP 成功但读回不一致，仍须报告结果未知', async () => {
    await expect(appendPolicy({
      subject: '资源', resourceId: 'resource-1', policyName: '新策略', policyText: 'FOR PUBLIC',
      update: async () => ({ data: {} }), read: async () => [],
    })).rejects.toMatchObject({ code: 'POLICY_CREATE_RESULT_UNKNOWN' });
  });

  it('启停按稳定 policyId 读回；上架主体不能关闭最后一条', async () => {
    const policies = [{ policyId: 'p1', policyName: '原策略', status: 1 }];
    const update = vi.fn(async () => ({ data: {} }));
    const input = {
      subject: '合集' as const, resourceId: 'collection-1', policyId: 'p1', on: false,
      resourceStatus: 1, policies, update, read: async () => policies,
      verifyCode: 'COLLECTION_POLICY_SET_VERIFY_FAILED',
    };
    await expect(togglePolicy(input)).rejects.toMatchObject({ code: 'POLICY_LAST_ENABLED' });
    expect(update).not.toHaveBeenCalled();
    await togglePolicy({ ...input, resourceStatus: 4, update: async () => {
      policies[0]!.status = 0;
      return { data: {} };
    } });
    expect(policies[0]?.status).toBe(0);
    await togglePolicy({ ...input, resourceStatus: 4, policies, update });
    expect(update).not.toHaveBeenCalled();
  });
});
