import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertAuthMapMatchesDependencies,
  buildBatchSignContractsParams,
  isPaymentPolicy,
  parsePolicyMapFile,
} from '../src/services/depAuthService.js';
import { CliError } from '../src/core/errors.js';
import {
  applyCollectionDraft,
  fingerprintCollectionDraft,
  toCollectionDraftData,
} from '../src/adapters/collectionVersionDraftAdapter.js';
import { buildCollectionPublishParams } from '../src/services/collection/params.js';
import { buildConsoleHandoff, buildConsoleResourceUrls } from '../src/core/consoleUrl.js';
import { getConsoleBaseURL } from '../src/core/env.js';

describe('parsePolicyMapFile', () => {
  it('accepts yaml and json', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authmap-'));
    const yml = path.join(dir, 'a.yaml');
    fs.writeFileSync(
      yml,
      `contracts:\n  - resourceId: r1\n    policyIds: [p1]\n`,
    );
    expect(parsePolicyMapFile(yml).contracts).toHaveLength(1);

    const json = path.join(dir, 'a.json');
    fs.writeFileSync(
      json,
      JSON.stringify({ contracts: [{ resourceId: 'r2', policyIds: ['p2'] }] }),
    );
    expect(parsePolicyMapFile(json).contracts[0].resourceId).toBe('r2');
  });

  it('rejects empty contracts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'authmap-'));
    const f = path.join(dir, 'bad.yaml');
    fs.writeFileSync(f, `contracts: []\n`);
    expect(() => parsePolicyMapFile(f)).toThrow(CliError);
  });
});

describe('collection draft fingerprint', () => {
  it('stable for same content', () => {
    const a = fingerprintCollectionDraft({
      versionInput: '1.0.0',
      descriptionEditorInput: 'x',
      additionalProperties: [
        { key: 'b', value: '2' },
        { key: 'a', value: '1' },
      ],
    });
    const b = fingerprintCollectionDraft({
      versionInput: '1.0.0',
      descriptionEditorInput: 'x',
      additionalProperties: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    });
    expect(a).toBe(b);
  });

  it('maps collectionItemsSetting to display and preserves publish fields', () => {
    const draft = toCollectionDraftData({
      resourceName: 'c',
      resourceType: ['collection'],
      display: { collection_view: 'collection_view_card' },
      description: 'desc',
      dependencies: [{ resourceId: 'dep', versionRange: '^1.0.0' }],
      baseUpcastResources: [{ resourceId: 'up' }],
      authExcludedItems: [
        { resourceId: 'dep', excludedType: 'contractId', excludedValue: 'c1' },
      ],
      inputAttrs: [{ key: 'author', value: 'cli' }],
      customPropertyDescriptors: [
        {
          type: 'readonlyText',
          key: 'copyright',
          name: 'Copyright',
          defaultValue: '2026',
        },
      ],
    });

    expect(draft.collectionItemsSetting).toEqual({ collection_view: 'collection_view_card' });
    expect(draft.directDependencies).toEqual([
      { id: 'dep', name: '', type: 'resource', versionRange: '^1.0.0' },
    ]);
    expect(draft.authExcludedItems).toEqual([
      { resourceId: 'dep', excludedType: 'contractId', excludedValue: 'c1' },
    ]);

    const back = applyCollectionDraft(
      { resourceName: 'c', resourceType: ['collection'], catalogueItems: [{ id: 'item' }] },
      {
        ...draft,
        collectionItemsSetting: { collection_view: 'collection_view_list' },
      },
    );

    expect(back.catalogueItems).toEqual([{ id: 'item' }]);
    expect(back.display).toEqual({ collection_view: 'collection_view_list' });
    expect(back.dependencies).toEqual([{ resourceId: 'dep', resourceName: '', versionRange: '^1.0.0' }]);
    expect(back.customPropertyDescriptors?.[0]).toMatchObject({
      type: 'readonlyText',
      key: 'copyright',
      name: 'Copyright',
    });
  });

  it('only accepts declared dependencies and rejects duplicate entries', () => {
    expect(() =>
      assertAuthMapMatchesDependencies(
        { contracts: [{ resourceId: 'other-resource', policyIds: ['p1'] }] },
        [{ resourceId: 'declared-resource' }],
      ),
    ).toThrow(CliError);

    expect(() =>
      assertAuthMapMatchesDependencies(
        {
          contracts: [
            { resourceId: 'declared-resource', policyIds: ['p1'] },
            { resourceId: 'declared-resource', policyIds: ['p2'] },
          ],
        },
        [{ resourceId: 'declared-resource' }],
      ),
    ).toThrow(CliError);
  });

  it('detects free and paid policy text without executing a payment', () => {
    expect(isPaymentPolicy('for public:\n  auth')).toBe(false);
    expect(
      isPaymentPolicy(
        encodeURIComponent('for public\n~freelog.TransactionEvent("29.9", "self.account") => auth'),
      ),
    ).toBe(true);
  });

  it('signs on behalf of the publishing resource, not the logged-in user', () => {
    expect(
      buildBatchSignContractsParams({
        licenseeResourceId: 'publisher-resource',
        subjectId: 'dependency-resource',
        policyId: 'free-policy',
      }),
    ).toEqual({
      licenseeId: 'publisher-resource',
      licenseeIdentityType: 1,
      subjectType: 1,
      subjects: [{ subjectId: 'dependency-resource', policyId: 'free-policy' }],
    });
  });
});

describe('collection publish params', () => {
  it('builds Console-aligned updateCollection params', () => {
    const params = buildCollectionPublishParams({
      resourceId: 'collection1',
      mergeCatalogueDraft: 1,
      collection: {
        resourceName: 'collection',
        resourceType: ['collection'],
        description: 'desc',
        display: { collection_view: 'collection_view_card' },
        dependencies: [{ resourceId: 'dep', versionRange: '*' }],
        baseUpcastResources: [{ resourceId: 'up' }],
        authExcludedItems: [
          { resourceId: 'dep', excludedType: 'policyId', excludedValue: 'p1' },
        ],
        inputAttrs: [{ key: 'theme', value: 'dark' }],
        customPropertyDescriptors: [
          {
            type: 'select',
            key: 'quality',
            name: 'Quality',
            defaultValue: 'high',
            candidateItems: ['low', 'high'],
          },
        ],
      },
    });

    expect(params).toMatchObject({
      resourceId: 'collection1',
      description: 'desc',
      catalogueProperty: { collection_view: 'collection_view_card' },
      isMergeCatalogueDraft: 1,
      inputAttrs: [{ key: 'theme', value: 'dark' }],
      dependencies: [{ resourceId: 'dep', versionRange: '*' }],
      baseUpcastResources: [{ resourceId: 'up' }],
      authExcludedItems: [
        { resourceId: 'dep', excludedType: 'policyId', excludedValue: 'p1' },
      ],
      customPropertyDescriptors: [
        {
          type: 'select',
          key: 'quality',
          name: 'Quality',
          defaultValue: 'high',
          candidateItems: ['low', 'high'],
          remark: undefined,
        },
      ],
    });
  });
});

describe('Console payment and contract handoff', () => {
  it('maps every CLI environment to the matching Console host', () => {
    expect(getConsoleBaseURL('production')).toBe('https://console.freelog.cn');
    expect(getConsoleBaseURL('test')).toBe('https://console.testfreelog.com');
    expect(getConsoleBaseURL('dev')).toBe('https://console.devfreelog.com');
  });

  it('builds exact resource dependency and contract routes', () => {
    const resourceId = '64f07595e4b08a4f3288d721';
    expect(buildConsoleResourceUrls({ id: resourceId, env: 'dev' })).toEqual({
      actionUrl:
        'https://console.devfreelog.com/resource/sidebar/dependency/64f07595e4b08a4f3288d721',
      contractsUrl:
        'https://console.devfreelog.com/resource/sidebar/contract/64f07595e4b08a4f3288d721',
    });
  });

  it('builds exact collection routes and a stable handoff envelope', () => {
    expect(
      buildConsoleHandoff({
        id: 'collection-1',
        kind: 'collection',
        env: 'test',
        reason: 'DEPENDENCY_PAYMENT_REQUIRED',
        nextCommand: 'freelog-cli dep auth --policy-map auth-map.yaml --env test',
      }),
    ).toEqual({
      reason: 'DEPENDENCY_PAYMENT_REQUIRED',
      actionUrl:
        'https://console.testfreelog.com/resource/collectionSidebar/dependency/collection-1',
      contractsUrl:
        'https://console.testfreelog.com/resource/collectionSidebar/contract/collection-1',
      nextCommand: 'freelog-cli dep auth --policy-map auth-map.yaml --env test',
    });
  });
});
