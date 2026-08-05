import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertLocalFileAllowedByType,
  assertOptionalConfigAllowed,
  isCreateBatchSupported,
  shouldCompressFromTypeInfo,
} from '../src/services/resourceTypeCapabilities.js';

describe('resource type capabilities', () => {
  it('detects compression config when platform provides it', () => {
    expect(shouldCompressFromTypeInfo({ resourceConfig: { needCompress: true } })).toBe(true);
    expect(shouldCompressFromTypeInfo({ resourceConfig: { needCompress: false } })).toBe(false);
    expect(shouldCompressFromTypeInfo({ resourceConfig: {} })).toBeNull();
  });

  it('validates local upload format and max size', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-type-cap-'));
    const file = path.join(cwd, 'photo.png');
    fs.writeFileSync(file, Buffer.alloc(8));

    expect(() =>
      assertLocalFileAllowedByType({
        typeInfo: { resourceConfig: { fileCommitMode: 3, formats: ['.png'], fileMaxSize: 8, fileMaxSizeUnit: 0 } },
        filePath: file,
        filename: 'photo.png',
      }),
    ).not.toThrow();

    expect(() =>
      assertLocalFileAllowedByType({
        typeInfo: { resourceConfig: { formats: ['.jpg'] } },
        filePath: file,
        filename: 'photo.png',
      }),
    ).toThrow(CliError);

    expect(() =>
      assertLocalFileAllowedByType({
        typeInfo: { resourceConfig: { fileMaxSize: 7, fileMaxSizeUnit: 0 } },
        filePath: file,
        filename: 'photo.png',
      }),
    ).toThrow(CliError);
  });

  it('rejects optional config when platform type disables it', () => {
    expect(() =>
      assertOptionalConfigAllowed({
        typeInfo: { resourceConfig: { supportOptionalConfig: 1 } },
        customPropertyDescriptors: [{ key: 'k', type: 'editableText' }],
      }),
    ).toThrow(CliError);
  });

  it('reads supportCreateBatch enum from official type info', () => {
    expect(isCreateBatchSupported({ supportCreateBatch: 2 })).toBe(true);
    expect(isCreateBatchSupported({ supportCreateBatch: 1 })).toBe(false);
    expect(isCreateBatchSupported({ resourceConfig: { supportCreateBatch: 1 } })).toBe(false);
    expect(isCreateBatchSupported({})).toBe(true);
  });

  it('uses top-level formats with nested resourceConfig like Console typeInfo', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-type-format-'));
    const file = path.join(cwd, 'photo.png');
    fs.writeFileSync(file, Buffer.alloc(8));

    expect(() =>
      assertLocalFileAllowedByType({
        typeInfo: {
          formats: ['.png'],
          resourceConfig: { fileCommitMode: [1], fileMaxSize: 1, fileMaxSizeUnit: 1 },
        },
        filePath: file,
        filename: 'photo.png',
      }),
    ).not.toThrow();
  });
});
