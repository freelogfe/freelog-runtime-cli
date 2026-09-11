import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { getTypeHierarchy } from '../../src/domain/create/typePick';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import {
  formatPolicyListPage,
  getPolicyList,
  POLICY_LIST_PAGE_SIZE,
  policyListPage,
} from '../../src/domain/policy/list';
import { createIdentity } from '../../src/local/identity';

const originalEnv = process.env.FREELOG_ENV;

async function login(cwd: string, homeDir: string): Promise<void> {
  await loginAccount({
    cwd,
    homeDir,
    loginName: 'alice',
    password: 'x',
    loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }),
  });
}

describe('policy list 类型链和固定分页', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-policy-list-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-policy-list-home-'));
    applyCliEnv({ flag: 'test' });
    await login(cwd, homeDir);
    createIdentity(cwd, {
      subject: 'resource',
      name: 'policy-list',
      typeCode: 'LEAF',
      filePath: 'asset.bin',
      resourceId: 'res_policy_list',
      env: 'test',
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.FREELOG_ENV;
    else process.env.FREELOG_ENV = originalEnv;
    resetEnvForTests();
  });

  it('从同一类型树返回根到叶子的完整祖先链，不把 nameChain 当作祖先事实', async () => {
    await expect(getTypeHierarchy('LEAF', {
      resourceTypes: async () => ({
        data: [{
          code: 'GRAND', name: '祖父节点', children: [{
            code: 'PARENT', name: '父节点', children: [{
              code: 'LEAF', name: '叶子节点', nameChain: '伪造/链', children: [],
            }],
          }],
        }],
      }),
    })).resolves.toEqual(['祖父节点', '父节点', '叶子节点']);

    await expect(getTypeHierarchy('LEAF', {
      resourceTypes: async () => ({ data: [{ code: 'OTHER', name: '其它', children: [] }] }),
    })).rejects.toMatchObject({ code: 'TYPE_HIERARCHY_NOT_FOUND' });
  });

  it('策略固定每页 50 条、启用优先，页头始终展示完整类型链', async () => {
    const policies = Array.from({ length: POLICY_LIST_PAGE_SIZE + 1 }, (_, index) => ({
      policyId: `policy-${String(index + 1).padStart(2, '0')}`,
      policyName: `策略${String(index + 1).padStart(2, '0')}`,
      status: index === POLICY_LIST_PAGE_SIZE ? 0 : 1,
    }));
    const list = await getPolicyList({
      cwd,
      homeDir,
      apis: {
        info: async () => ({ data: { resourceId: 'res_policy_list', userId: 7, policies } }),
        resourceTypes: async () => ({
          data: [{ code: 'GRAND', name: '祖父节点', children: [{
            code: 'PARENT', name: '父节点', children: [{ code: 'LEAF', name: '叶子节点', children: [] }],
          }] }],
        }),
      },
    });
    const first = policyListPage(list, 1);
    const second = policyListPage(list, 2);

    expect(first).toMatchObject({ total: 51, pageCount: 2, hasPrevious: false, hasNext: true });
    expect(first.items).toHaveLength(50);
    expect(second).toMatchObject({ hasPrevious: true, hasNext: false });
    expect(second.items).toEqual([{ policyId: 'policy-51', policyName: '策略51', status: 0 }]);
    expect(formatPolicyListPage(first)).toContain('资源类型：祖父节点 / 父节点 / 叶子节点');
    expect(formatPolicyListPage(second)).toContain('第 2/2 页，共 51 条');
  });
});
