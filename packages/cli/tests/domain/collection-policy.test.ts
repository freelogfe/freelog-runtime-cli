import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';
import {
  applyCollectionPolicy,
  getCollectionPolicyTemplateCatalog,
  prepareCollectionPolicyTemplate,
  setCollectionPolicy,
} from '../../src/domain/collection/policy';

const originalEnv = process.env.FREELOG_ENV;

describe('合集参数化策略复用', () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-policy-'));
    homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-policy-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({
      cwd, homeDir, loginName: 'alice', password: 'x',
      loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }),
    });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.FREELOG_ENV; else process.env.FREELOG_ENV = originalEnv;
    resetEnvForTests();
  });

  it('合集使用同一模板描述/编译/读回链路，且模板请求当前仍为 {}', async () => {
    const policies: Array<{ policyId: string; policyName: string; policyText: string; status: number }> = [];
    const requests: Record<string, unknown>[] = [];
    const update = vi.fn(async (payload: Record<string, unknown>) => {
      const adding = payload.addPolicies as Array<{ policyName: string; policyText: string; status: number }> | undefined;
      if (adding) policies.push({
        policyId: 'collection-policy-1',
        ...adding[0]!,
        policyText: 'server-canonical-policy-text',
      });
      const changing = payload.updatePolicies as Array<{ policyId: string; status: number }> | undefined;
      if (changing) {
        const target = policies.find((item) => item.policyId === changing[0]?.policyId);
        if (target) target.status = changing[0]!.status;
      }
      return { data: {} };
    });
    const apis = {
      info: async () => ({ data: {
        resourceId: 'collection-1', resourceName: 'alice/collection-1', resourceTypeCode: 'COLLECTION_TYPE',
        subjectType: 4, userId: 7, status: 4, policies,
      } }),
      policyTemplates: async (params: Record<string, unknown> = {}) => {
        requests.push(params);
        return { data: [
          {
            _id: 'collection-template', title: '合集策略', compileType: 'collection',
            policyReport: '可使用 ${days} 天', policyReportUiTemplate: [{ id: 'days', uiSectionType: 'number', uiSectionDefaultValue: 30 }],
          },
          { _id: 'resource-template', title: '单资源策略', compileType: 'normal', policyReport: '永久授权', policyReportUiTemplate: [] },
        ] };
      },
      policyReCompile: async () => ({ data: { policyTextNew: 'FOR PUBLIC\nInitial[active]:\n  terminate' } }),
      policyTranslation: async () => ({ data: '可使用三十天' }),
      update,
    };
    const catalog = await getCollectionPolicyTemplateCatalog({ cwd, homeDir, selector: 'id:collection-1', apis });
    expect(catalog.subject).toMatchObject({ kind: 'collection', resourceId: 'collection-1' });
    expect(requests).toEqual([{}]);
    expect(catalog.templates.map((template) => template.id)).toEqual(['collection-template']);
    const prepared = await prepareCollectionPolicyTemplate({
      cwd, homeDir, selector: 'id:collection-1', templateId: 'collection-template',
      expectedFingerprint: catalog.templates[0]!.fingerprint, params: [{ slot: 1, value: '30' }], requireEveryParam: true, apis,
    });
    expect(prepared.translation).toBe('可使用三十天');
    await applyCollectionPolicy({ cwd, homeDir, selector: 'id:collection-1', policyName: '合集策略一', policyText: prepared.policyText, apis });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: 'collection-1', addPolicies: [expect.objectContaining({ policyName: '合集策略一' })],
    }));
    await setCollectionPolicy({ cwd, homeDir, selector: 'id:collection-1', policyId: 'collection-policy-1', on: false, apis });
    expect(update).toHaveBeenLastCalledWith({ resourceId: 'collection-1', updatePolicies: [{ policyId: 'collection-policy-1', status: 0 }] });
  });
});
