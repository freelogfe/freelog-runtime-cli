import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVersionPropertiesFromHandleData,
  handleFilePropertiesBySha1,
  inheritDataFromVersionConfig,
  pollFilesSha1Info,
} from '../src/services/filePropertyService.js';

const storageMocks = vi.hoisted(() => ({
  filesListInfo: vi.fn(),
  filesInfo: vi.fn(),
}));

const resourceMocks = vi.hoisted(() => ({
  getAttrsInfoByKey: vi.fn(),
}));

vi.mock('../src/platform/index.js', () => ({
  FServiceAPI: {
    Storage: {
      filesListInfo: storageMocks.filesListInfo,
      filesInfo: storageMocks.filesInfo,
    },
    Resource: {
      getAttrsInfoByKey: resourceMocks.getAttrsInfoByKey,
    },
  },
  FUtil: {
    Tool: {
      promiseSleep: vi.fn(async () => undefined),
    },
  },
}));

describe('inheritDataFromVersionConfig', () => {
  it('maps manifest fields to Console inheritData', () => {
    expect(
      inheritDataFromVersionConfig({
        inputAttrs: [
          { key: 'runtimeVersion', value: '0.5' },
          { key: 'author', value: 'cli' },
        ],
        customPropertyDescriptors: [
          {
            type: 'readonlyText',
            key: 'copyright',
            name: 'Copyright',
            defaultValue: '2026',
          },
          {
            type: 'select',
            key: 'quality',
            candidateItems: ['low', 'high'],
            defaultValue: 'high',
          },
        ],
      }),
    ).toEqual({
      additionalProperties: [{ key: 'author', value: 'cli' }],
      customProperties: [
        {
          key: 'copyright',
          name: 'Copyright',
          value: '2026',
          description: '',
        },
      ],
      customConfigurations: [
        {
          key: 'quality',
          name: 'quality',
          description: '',
          type: 'select',
          input: '',
          select: ['low', 'high'],
        },
      ],
    });
  });
});

describe('createVersionPropertiesFromHandleData', () => {
  it('matches Console step2 submit mapping', () => {
    const mapped = createVersionPropertiesFromHandleData({
      sha1: 'abc',
      resourceTypeCode: 'RT001',
      state: 'success',
      failedMsg: '',
      systemProperties: [
        {
          key: 'duration',
          name: 'Duration',
          value: '120',
          description: '',
          type: 'raw',
        },
        {
          key: 'author',
          name: 'Author',
          value: 'cli-user',
          description: '作者',
          type: 'additional',
        },
      ],
      customProperties: [
        {
          key: 'copyright',
          name: 'Copyright',
          value: '2026',
          description: '版权',
        },
      ],
      customConfigurations: [
        {
          key: 'quality',
          name: 'Quality',
          description: '清晰度',
          type: 'select',
          input: '',
          select: ['low', 'high'],
        },
      ],
    });

    expect(mapped.inputAttrs).toEqual([{ key: 'author', value: 'cli-user' }]);
    expect(mapped.customPropertyDescriptors).toEqual([
      {
        type: 'readonlyText',
        key: 'copyright',
        name: 'Copyright',
        remark: '版权',
        defaultValue: '2026',
      },
      {
        type: 'select',
        key: 'quality',
        name: 'Quality',
        remark: '清晰度',
        defaultValue: 'low',
        candidateItems: ['low', 'high'],
      },
    ]);
  });
});

describe('pollFilesSha1Info', () => {
  beforeEach(() => {
    storageMocks.filesListInfo.mockReset();
  });

  it('polls until metaAnalyzeStatus is terminal', async () => {
    storageMocks.filesListInfo
      .mockResolvedValueOnce({
        ret: 0,
        errCode: 0,
        data: [{ sha1: 'abc', fileSize: 1, metaAnalyzeStatus: 1, metaInfoArray: [] }],
      })
      .mockResolvedValueOnce({
        ret: 0,
        errCode: 0,
        data: [
          {
            sha1: 'abc',
            fileSize: 1,
            metaAnalyzeStatus: 2,
            metaInfoArray: [{ insertMode: 1, key: 'duration', name: 'Duration', remark: '', value: 1, valueDisplay: '1', valueUnit: 's' }],
          },
        ],
      });

    const { error, result } = await pollFilesSha1Info({
      sha1: ['abc'],
      resourceTypeCode: 'RT001',
      delayMs: 0,
    });

    expect(error).toBe('');
    expect(result).toHaveLength(1);
    expect(result[0]?.metaAnalyzeStatus).toBe(2);
    expect(storageMocks.filesListInfo).toHaveBeenCalledTimes(2);
  });
});

describe('handleFilePropertiesBySha1', () => {
  beforeEach(() => {
    storageMocks.filesListInfo.mockReset();
    resourceMocks.getAttrsInfoByKey.mockReset();
  });

  it('builds systemProperties from parsed meta and inheritData', async () => {
    storageMocks.filesListInfo.mockResolvedValue({
      ret: 0,
      errCode: 0,
      data: [
        {
          sha1: 'abc',
          fileSize: 100,
          metaAnalyzeStatus: 2,
          metaInfoArray: [
            {
              insertMode: 1,
              key: 'duration',
              name: 'Duration',
              remark: '',
              value: 120,
              valueDisplay: '120',
              valueUnit: 's',
            },
            {
              insertMode: 2,
              key: 'author',
              name: 'Author',
              remark: '作者',
              value: null,
              valueDisplay: '',
              valueUnit: '',
            },
          ],
        },
      ],
    });
    resourceMocks.getAttrsInfoByKey.mockResolvedValue({
      ret: 0,
      errCode: 0,
      data: {
        key: 'author',
        format: 6,
        contentRule: { minLength: 1, maxLength: 20 },
      },
    });

    const result = await handleFilePropertiesBySha1({
      sha1: 'abc',
      resourceTypeCode: 'RT001',
      inheritData: {
        additionalProperties: [{ key: 'author', value: 'cli-user' }],
        customProperties: [],
        customConfigurations: [],
      },
    });

    expect(result.state).toBe('success');
    expect(result.systemProperties).toEqual([
      {
        key: 'duration',
        name: 'Duration',
        value: '120',
        description: '',
        type: 'raw',
        valueConfig: {},
      },
      {
        key: 'author',
        name: 'Author',
        value: 'cli-user',
        description: '作者',
        type: 'additional',
        valueConfig: {
          text: { nullable: true, minLength: 1, maxLength: 20 },
        },
      },
    ]);
  });
});
