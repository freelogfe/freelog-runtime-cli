import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureSynced: vi.fn(),
    fetchResourceInfo: vi.fn(),
  };
});

vi.mock('../src/platform/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/index.js')>();
  return {
    ...actual,
    FServiceAPI: {
      ...actual.FServiceAPI,
      Policy: {
        ...actual.FServiceAPI.Policy,
        policyTemplates: vi.fn(),
        policyReCompile: vi.fn(),
        policyTranslation: vi.fn(),
      },
      Resource: {
        ...actual.FServiceAPI.Resource,
        update: vi.fn(),
      },
    },
  };
});

import { FServiceAPI } from '../src/platform/index.js';
import { ensureSynced, fetchResourceInfo } from '../src/services/sync/index.js';
import {
  encodePolicyForTranslation,
  listPolicyTemplates,
  parseTemplateParams,
  policyTemplateApply,
  policyTemplatePreview,
} from '../src/services/policyTemplate/index.js';
import type { ProjectStore } from '../src/services/store/types.js';

function mockStore(): ProjectStore {
  return {
    mode: () => 'project',
    rootDir: () => '/tmp/policy-template',
    subject: () => 'resource',
    loadResource: vi.fn() as never,
    loadVersion: vi.fn() as never,
    tryLoadVersion: vi.fn() as never,
    loadState: vi.fn() as never,
    resolveResourceId: () => 'resource-1',
    saveResource: vi.fn(),
    saveVersion: vi.fn(),
    savePublishedVersion: vi.fn(),
    savePlatformFacts: vi.fn(),
    saveVersionFacts: vi.fn(),
    persist: vi.fn(),
    exportProject: vi.fn(),
    supportsListingSync: () => true,
  };
}

describe('policy template service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureSynced).mockResolvedValue({
      auth: { token: 'token', userId: 1, username: 'tester', environment: 'dev' },
      resource: { resourceId: 'resource-1' },
      info: { resourceId: 'resource-1', resourceTypeCode: 'RT001', policies: [] },
    } as never);
    vi.mocked(FServiceAPI.Policy.policyTemplates).mockResolvedValue({
      data: [
        {
          _id: 'tpl-free',
          title: '永久免费',
          template: 'for public',
          reportTranslate: '任何人可免费获得授权',
          report: '免费',
          reportUiTemplate: [],
        },
      ],
    } as never);
    vi.mocked(fetchResourceInfo).mockResolvedValue({
      resourceId: 'resource-1',
      resourceTypeCode: 'RT001',
      policies: [{ policyId: 'policy-1', policyName: '免费', status: 1 }],
    } as never);
  });

  it('loads Console policy templates for resource type codes', async () => {
    vi.mocked(FServiceAPI.Policy.policyTemplates).mockResolvedValue({
      data: [
        {
          _id: 'tpl-free',
          title: '永久免费',
          template: 'for public',
          reportTranslate: '任何人可免费获得授权',
          report: '免费 ${freelog.RelativeTimeEvent.period}',
          reportUiTemplate: [
            {
              id: 'freelog.RelativeTimeEvent.period',
              uiSectionType: 'number',
              uiSectionDefaultValue: 1,
              selectOptions: [],
            },
          ],
        },
      ],
    } as never);

    const templates = await listPolicyTemplates({ resourceTypeCodes: ['RT001'] });

    expect(FServiceAPI.Policy.policyTemplates).toHaveBeenCalledWith({
      resourceTypeCodes4Resource: ['RT001'],
      resourceTypeCodes4Presentable: undefined,
    });
    expect(templates[0]).toMatchObject({
      id: 'tpl-free',
      title: '永久免费',
      code: 'for public',
      translation: '任何人可免费获得授权',
    });
    expect(templates[0].inputs).toContainEqual({
      name: 'freelog.RelativeTimeEvent.period',
      type: 'number',
      defaultValue: 1,
      min: 1,
      precision: 0,
      options: [],
    });
  });

  it('parses template params from CLI key=value syntax', () => {
    expect(parseTemplateParams(['price=1.9', 'unit=month,trial=7'])).toEqual([
      { name: 'price', value: '1.9' },
      { name: 'unit', value: 'month' },
      { name: 'trial', value: '7' },
    ]);
  });

  it('applies a policy through the Console template compile and translation chain', async () => {
    vi.mocked(FServiceAPI.Policy.policyTemplates).mockResolvedValue({
      data: [
        {
          _id: 'tpl-free',
          title: '永久免费',
          template: 'for public',
          reportTranslate: '任何人可免费获得授权',
          report: '免费 ${price}',
          reportUiTemplate: [
            {
              id: 'price',
              uiSectionType: 'number',
              uiSectionDefaultValue: 1,
              selectOptions: [],
            },
          ],
        },
      ],
    } as never);
    vi.mocked(FServiceAPI.Policy.policyReCompile).mockResolvedValue({
      data: { contractNew: 'for public\r\n\tterminate' },
    } as never);
    vi.mocked(FServiceAPI.Policy.policyTranslation).mockResolvedValue({
      data: '任何人可免费获得授权',
    } as never);

    const result = await policyTemplateApply({
      store: mockStore(),
      templateId: 'tpl-free',
      policyName: '永久免费',
      params: [{ name: 'price', value: '1.9' }],
    });

    expect(FServiceAPI.Policy.policyReCompile).toHaveBeenCalledWith({
      _id: 'tpl-free',
      fillArgs: [{ name: 'price', value: 1.9 }],
    });
    expect(FServiceAPI.Policy.policyTranslation).toHaveBeenCalledWith({
      contract: encodePolicyForTranslation('for public\r\n\tterminate'),
    });
    expect(FServiceAPI.Resource.update).toHaveBeenCalledWith({
      resourceId: 'resource-1',
      addPolicies: [
        {
          policyName: '永久免费',
          policyText: encodeURIComponent('for public\r\n\tterminate'),
          status: 1,
        },
      ],
    });
    expect(result).toMatchObject({
      policyName: '永久免费',
      policyText: 'for public\r\n\tterminate',
      translation: '任何人可免费获得授权',
    });
  });

  it('renders a policy template preview without writing the platform', async () => {
    vi.mocked(FServiceAPI.Policy.policyReCompile).mockResolvedValue({
      data: { contractNew: 'for public' },
    } as never);
    vi.mocked(FServiceAPI.Policy.policyTranslation).mockResolvedValue({
      data: '任何人可免费获得授权',
    } as never);

    const preview = await policyTemplatePreview({
      store: mockStore(),
      templateId: 'tpl-free',
      policyName: '永久免费',
      params: [],
    });

    expect(preview).toMatchObject({
      templateId: 'tpl-free',
      templateTitle: '永久免费',
      policyName: '永久免费',
      policyText: 'for public',
      translation: '任何人可免费获得授权',
    });
    expect(preview.codeDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(FServiceAPI.Resource.update).not.toHaveBeenCalled();
  });

  it('rejects unsupported template params before compiling', async () => {
    await expect(
      policyTemplatePreview({
        store: mockStore(),
        templateId: 'tpl-free',
        params: [{ name: 'unknown', value: '1' }],
      }),
    ).rejects.toThrow(/没有可填写参数|不支持参数/);
    expect(FServiceAPI.Policy.policyReCompile).not.toHaveBeenCalled();
    expect(FServiceAPI.Resource.update).not.toHaveBeenCalled();
  });

  it('rejects duplicate compiled policy text before writing', async () => {
    vi.mocked(ensureSynced).mockResolvedValue({
      auth: { token: 'token', userId: 1, username: 'tester', environment: 'dev' },
      resource: { resourceId: 'resource-1' },
      info: {
        resourceId: 'resource-1',
        resourceTypeCode: 'RT001',
        policies: [{ policyName: '其它', policyText: encodeURIComponent('same policy') }],
      },
    } as never);
    vi.mocked(FServiceAPI.Policy.policyReCompile).mockResolvedValue({
      data: { contractNew: 'same policy' },
    } as never);

    await expect(
      policyTemplateApply({
        store: mockStore(),
        templateId: 'tpl-free',
        policyName: '新策略',
        params: [],
      }),
    ).rejects.toThrow(/策略代码|duplicate/i);
    expect(FServiceAPI.Resource.update).not.toHaveBeenCalled();
  });
});
