import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { addCollectionDependency } from '../../src/domain/collection/dependencies';
import { pullCollectionForm, readCollectionFormDraft } from '../../src/domain/collection/form';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

describe('合集直接依赖', () => {
  let cwd: string; let homeDir: string;
  const collectionInfo = async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0 } });
  const typeApis = { resourceTypes: async () => ([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]), getByCode: async () => ({ data: { code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], resourceConfig: { supportOptionalConfig: 2 } } }) };
  beforeEach(async () => { cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-dep-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-dep-home-')); applyCliEnv({ flag: 'test' }); await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) }); await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info: collectionInfo, ...typeApis } }); });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  it('以合集 ID 查询/签约并只写本地 dependencies，付费后续不阻断签约成功的记录', async () => {
    let signed: Record<string, unknown> | undefined;
    await expect(addCollectionDependency({
      cwd, homeDir, selector: 'id:collection_1', source: 'id:resource_1', policyId: 'policy_1', yes: true,
      apis: {
        info: collectionInfo,
        targetInfo: async () => ({ data: { resourceId: 'resource_1', subjectType: [1], latestVersion: '1.2.0', status: 1, policies: [{ policyId: 'policy_1', status: 1 }] } }),
        getVersions: async () => ({ data: { dataList: [{ version: '1.2.0' }, { version: '1.1.0' }] } }), cycleCheck: async () => ({ data: { result: true } }),
        getContracts: async () => ({ data: { dataList: [] } }), sign: async (payload) => { signed = payload; return { data: { authStatus: 128 } }; },
      },
    })).resolves.toEqual({ resourceId: 'resource_1', versionRange: '^1.2.0', signed: true });
    expect(signed).toEqual({ subjects: [{ subjectId: 'resource_1', policyId: 'policy_1', subjectType: 1 }], subjectType: 1, licenseeId: 'collection_1', licenseeIdentityType: 1 });
    expect(readCollectionFormDraft(cwd, 'collection_1')!.form.dependencies).toEqual([{ resourceId: 'resource_1', versionRange: '^1.2.0' }]);
  });
});
