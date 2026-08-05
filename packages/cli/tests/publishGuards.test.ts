import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertVersionGreaterThanLatest,
  buildCreateVersionInputAttrs,
  buildCreateVersionParams,
  isFrozenStatus,
} from '../src/services/publishService.js';

describe('publish guards', () => {
  it('detects frozen status', () => {
    expect(isFrozenStatus(2)).toBe(true);
    expect(isFrozenStatus(3)).toBe(true); // bit 1 set
    expect(isFrozenStatus(1)).toBe(false);
    expect(isFrozenStatus(4)).toBe(false);
    expect(isFrozenStatus(undefined)).toBe(false);
  });

  it('requires version > latest', () => {
    expect(() => assertVersionGreaterThanLatest('1.0.0', '1.0.0')).toThrow(CliError);
    expect(() => assertVersionGreaterThanLatest('0.9.0', '1.0.0')).toThrow(CliError);
    expect(() => assertVersionGreaterThanLatest('1.0.1', '1.0.0')).not.toThrow();
  });

  it('skips gt when no latest', () => {
    expect(() => assertVersionGreaterThanLatest('1.0.0')).not.toThrow();
  });

  it('builds Console-aligned createVersion params', () => {
    const params = buildCreateVersionParams({
      resourceId: 'r0',
      fileSha1: 'sha1',
      filename: 'bundle.zip',
      versionCfg: {
        version: '1.0.1',
        filePath: 'dist',
        description: 'desc',
        videoCover: 'https://static.example.com/video-cover.png',
        runtimeVersion: '0.5',
        dependencies: [{ resourceId: 'dep1', versionRange: '^1.0.0' }],
        baseUpcastResources: [{ resourceId: 'up1', resourceName: 'Up' }],
        authExcludedItems: [
          {
            resourceId: 'dep1',
            excludedType: 'contractId',
            excludedValue: 'contract1',
          },
        ],
        inputAttrs: [
          { key: 'runtimeVersion', value: '0.4' },
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
            defaultValue: 'high',
            candidateItems: ['low', 'high'],
          },
        ],
      },
    });

    expect(params).toMatchObject({
      resourceId: 'r0',
      version: '1.0.1',
      fileSha1: 'sha1',
      filename: 'bundle.zip',
      description: 'desc',
      videoCover: 'https://static.example.com/video-cover.png',
      dependencies: [{ resourceId: 'dep1', versionRange: '^1.0.0' }],
      baseUpcastResources: [{ resourceId: 'up1' }],
      authExcludedItems: [
        {
          resourceId: 'dep1',
          excludedType: 'contractId',
          excludedValue: 'contract1',
        },
      ],
      inputAttrs: [
        { key: 'author', value: 'cli' },
        { key: 'runtimeVersion', value: '0.5' },
      ],
    });
    expect(params.customPropertyDescriptors).toEqual([
      {
        type: 'readonlyText',
        key: 'copyright',
        name: 'Copyright',
        defaultValue: '2026',
        candidateItems: undefined,
        remark: undefined,
      },
      {
        type: 'select',
        key: 'quality',
        name: 'quality',
        defaultValue: 'high',
        candidateItems: ['low', 'high'],
        remark: undefined,
      },
    ]);
  });

  it('overrides duplicate runtimeVersion input attr', () => {
    expect(
      buildCreateVersionInputAttrs({
        version: '1.0.0',
        filePath: 'dist',
        runtimeVersion: '0.5',
        inputAttrs: [
          { key: 'runtimeVersion', value: '0.4' },
          { key: 'feature', value: true },
        ],
      }),
    ).toEqual([
      { key: 'feature', value: 'true' },
      { key: 'runtimeVersion', value: '0.5' },
    ]);
  });
});
