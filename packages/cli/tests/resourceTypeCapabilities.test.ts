import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/core/errors.js';
import {
  assertLocalFileAllowedByType,
  assertOptionalConfigAllowed,
  assertTaskFileSizeLimit,
  isCreateBatchSupported,
  shouldCompressFromTypeInfo,
  TASK_DEFAULT_MAX_BYTES,
  TASK_VIDEO_MAX_BYTES,
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

  it('enforces Console Task hard caps: video 1GB / default 200MB', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-task-cap-'));
    const video = path.join(cwd, 'clip.mp4');
    const doc = path.join(cwd, 'doc.zip');
    fs.writeFileSync(video, Buffer.alloc(1));
    fs.writeFileSync(doc, Buffer.alloc(1));

    const statSpy = vi.spyOn(fs, 'statSync').mockImplementation((filePath) => {
      const size =
        String(filePath) === video
          ? TASK_VIDEO_MAX_BYTES + 1
          : String(filePath) === doc
            ? TASK_DEFAULT_MAX_BYTES + 1
            : 1;
      return { size } as fs.Stats;
    });

    expect(() =>
      assertTaskFileSizeLimit({
        typeInfo: { code: 'RT006' },
        filePath: video,
        filename: 'clip.mp4',
      }),
    ).toThrow(CliError);

    expect(() =>
      assertTaskFileSizeLimit({
        typeInfo: { resourceConfig: {} },
        filePath: doc,
        filename: 'doc.zip',
      }),
    ).toThrow(CliError);

    statSpy.mockImplementation((filePath) => ({ size: 1024 }) as fs.Stats);
    expect(() =>
      assertTaskFileSizeLimit({
        typeInfo: { code: 'RT006' },
        filePath: video,
        filename: 'clip.mp4',
      }),
    ).not.toThrow();
    expect(() =>
      assertTaskFileSizeLimit({
        typeInfo: {},
        filePath: doc,
        filename: 'doc.zip',
      }),
    ).not.toThrow();

    statSpy.mockRestore();
  });
});
