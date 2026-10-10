import { describe, expect, it } from 'vitest';
import { mergeVersionPropertiesForSync } from '../src/services/versionPropertyService.js';

describe('mergeVersionPropertiesForSync', () => {
  it('keeps platform attrs and applies manifest overrides by key', () => {
    const merged = mergeVersionPropertiesForSync({
      platform: {
        inputAttrs: [
          { key: 'author', value: 'platform' },
          { key: 'license', value: 'MIT' },
        ],
        customPropertyDescriptors: [
          {
            type: 'readonlyText',
            key: 'copyright',
            name: 'Copyright',
            defaultValue: '2025',
          },
        ],
      },
      manifest: {
        version: '1.0.0',
        filePath: 'file.png',
        inputAttrs: [{ key: 'author', value: 'cli-user' }],
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

    expect(merged.inputAttrs).toEqual([
      { key: 'author', value: 'cli-user' },
      { key: 'license', value: 'MIT' },
    ]);
    expect(merged.customPropertyDescriptors).toEqual([
      expect.objectContaining({ key: 'copyright', defaultValue: '2025' }),
      expect.objectContaining({ key: 'quality', defaultValue: 'high' }),
    ]);
  });

  it('adds runtimeVersion from manifest', () => {
    const merged = mergeVersionPropertiesForSync({
      platform: { inputAttrs: [], customPropertyDescriptors: [] },
      manifest: {
        version: '1.0.0',
        filePath: 'dist',
        runtimeVersion: '0.5',
      },
    });
    expect(merged.inputAttrs).toEqual([{ key: 'runtimeVersion', value: '0.5' }]);
  });
});
