import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveExistingImportBySha1 } from '../src/services/batch/prepare.js';
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
});
