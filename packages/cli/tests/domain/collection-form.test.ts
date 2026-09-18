import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loginAccount } from '../../src/domain/account/login';
import { editCollectionForm, pullCollectionForm, readCollectionFormDraft, toCollectionUpdatePayload } from '../../src/domain/collection/form';
import { applyCliEnv, resetEnvForTests } from '../../src/domain/env';

describe('合集本地表单', () => {
  let cwd: string;
  let homeDir: string;
  const info = async () => ({ data: { resourceId: 'collection_1', resourceName: 'alice/collection', resourceTypeCode: 'CT001', subjectType: [4], userId: 7, status: 0 } });
  const typeApis = {
    resourceTypes: async () => ([{ code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4] }]),
    getByCode: async () => ({ data: { code: 'CT001', name: '合集', isTerminate: true, status: 1, subjectType: [4], resourceConfig: { supportOptionalConfig: 2 } } }),
  };
  beforeEach(async () => {
    cwd = mkdtempSync(path.join(tmpdir(), 'freelog-collection-form-')); homeDir = mkdtempSync(path.join(tmpdir(), 'freelog-collection-form-home-'));
    applyCliEnv({ flag: 'test' });
    await loginAccount({ cwd, homeDir, loginName: 'alice', password: 'x', loginApi: async () => ({ data: { userId: 7, username: 'alice', token: 'token' } }) });
  });
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(homeDir, { recursive: true, force: true }); resetEnvForTests(); });

  it('新合集创建可恢复的本地空基线，不访问任何 Console 服务端草稿', async () => {
    const form = await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    expect(form).toMatchObject({ $schema: 'freelog-cli.collection-form.v1', inputs: [], properties: [], options: [], dependencies: [] });
    expect(readCollectionFormDraft(cwd, 'collection_1')).toMatchObject({ authState: 'known-empty', resourceTypeCode: 'CT001' });
  });

  it('完整 JSON 编辑只修改本地草稿，并可完整构造 updateCollection payload', async () => {
    await pullCollectionForm({ cwd, homeDir, selector: 'id:collection_1', apis: { info, ...typeApis } });
    const formPath = path.join(cwd, 'collection.form.json');
    writeFileSync(formPath, JSON.stringify({
      $schema: 'freelog-cli.collection-form.v1', inputs: [{ key: 'author', value: 'alice' }],
      properties: [{ key: 'copyright', name: '版权', value: 'CC', description: '' }],
      options: [{ key: 'theme', name: '主题', kind: 'select', values: ['light', 'dark'], description: '' }],
      description: '说明', display: { sort: 'descending', title: 'serial-number', number: false, image: true, description: false, view: 'card' },
      dependencies: [{ resourceId: 'r1', versionRange: '^1.0.0' }],
    }));
    await expect(editCollectionForm({ cwd, homeDir, selector: 'id:collection_1', from: 'collection.form.json', apis: { info, ...typeApis } })).resolves.toMatchObject({ description: '说明' });
    const draft = readCollectionFormDraft(cwd, 'collection_1')!;
    expect(toCollectionUpdatePayload(draft.form, 'collection_1', [], 0)).toMatchObject({
      inputAttrs: [{ key: 'author', value: 'alice' }], description: '说明', isMergeCatalogueDraft: 0,
      catalogueProperty: { collection_sort_list: 'collection_sort_descending', collection_item_title: 'collection_item_title_sn', collection_view: 'collection_view_card' },
    });
  });
});
