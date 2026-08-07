import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveExistingImportBySha1,
  writeRetryBatchConfig,
} from '../src/services/batch/prepare.js';
import { writeItemConfigs } from '../src/services/batch/prepare.js';
import type { PreparedFile } from '../src/services/batch/types.js';

describe('batch import robustness', () => {
  it('resolveExistingImportBySha1 reuses subdir with same sha1', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-reuse-'));
    const item: PreparedFile = {
      absolutePath: path.join(parent, 'a.png'),
      filename: 'a.png',
      sha1: 'abc123',
      name: 'a',
      resourceTitle: 'A',
      resourceTypeCode: 'RT005001',
      safeDir: 'a',
      version: '1.0.0',
      description: '',
      dependencies: [],
      baseUpcastResources: [],
      authExcludedItems: [],
      batchSignContracts: [],
      inputAttrs: [],
      customPropertyDescriptors: [],
    };
    fs.writeFileSync(item.absolutePath, 'x');
    const subdir = path.join(parent, 'a');
    writeItemConfigs({
      subdir,
      sourceFile: item.absolutePath,
      resourceId: 'rid-1',
      resourceName: 'user/a',
      resourceTypeCode: 'RT005001',
      resourceTitle: 'A',
      fileSha1: 'abc123',
      filename: 'a.png',
      version: '1.0.0',
      description: '',
    });

    const found = resolveExistingImportBySha1(parent, item);
    expect(found?.resourceId).toBe('rid-1');
    expect(found?.subdir).toBe('a');
  });

  it('writeRetryBatchConfig writes only failed items', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-retry-'));
    const prepared: PreparedFile[] = [
      {
        absolutePath: path.join(parent, 'ok.png'),
        filename: 'ok.png',
        sha1: '1',
        name: 'ok',
        resourceTitle: 'OK',
        resourceTypeCode: 'RT005001',
        safeDir: 'ok',
        version: '1.0.0',
        description: '',
        dependencies: [],
        baseUpcastResources: [],
        authExcludedItems: [],
        batchSignContracts: [],
        inputAttrs: [],
        customPropertyDescriptors: [],
      },
      {
        absolutePath: path.join(parent, 'bad.png'),
        filename: 'bad.png',
        sha1: '2',
        name: 'bad',
        resourceTitle: 'BAD',
        resourceTypeCode: 'RT005001',
        safeDir: 'bad',
        version: '1.0.0',
        description: '',
        dependencies: [],
        baseUpcastResources: [],
        authExcludedItems: [],
        batchSignContracts: [],
        inputAttrs: [],
        customPropertyDescriptors: [],
      },
    ];
    fs.writeFileSync(prepared[0]!.absolutePath, '1');
    fs.writeFileSync(prepared[1]!.absolutePath, '2');

    const out = writeRetryBatchConfig(parent, [{ file: 'bad.png', error: 'fail' }], prepared);
    expect(out).toContain('retry.batch.json');
    const json = JSON.parse(fs.readFileSync(out, 'utf8'));
    expect(json.items).toHaveLength(1);
    expect(json.items[0].filePath).toBe('bad.png');
    expect(json.defaults.resourceTypeCode).toBe('RT005001');
  });
});
