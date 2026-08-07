import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../src/core/errors.js';
import { setCliEnv } from '../src/core/env.js';

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 1, username: 'tester' }),
}));

vi.mock('../src/services/sync/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/sync/index.js')>();
  return {
    ...actual,
    ensureSynced: vi.fn(async () => ({
      resource: { resourceId: 'rid', resourceName: 'u/x', resourceTypeCode: 'RT005001' },
      info: { latestVersion: '1.0.0' },
    })),
  };
});

import { depAdd, depUpdate } from '../src/services/depService.js';

describe('depService versionRange validation', () => {
  let cwd: string;

  beforeEach(() => {
    setCliEnv('dev');
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-range-'));
    fs.writeFileSync(
      path.join(cwd, 'freelog.manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        subject: 'resource',
        identity: { name: 'u/dep-test' },
        resource: { typeCode: 'RT005001', title: 'Dep Test' },
        version: {
          version: '1.0.0',
          filePath: 'a.png',
          description: '',
          dependencies: [],
          baseUpcastResources: [],
          authExcludedItems: [],
          inputAttrs: [],
          customPropertyDescriptors: [],
        },
        policies: [],
        collection: null,
      }),
      'utf8',
    );
    fs.mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.freelog', 'state.json'),
      JSON.stringify({ schemaVersion: 1, env: 'dev', resource: {} }),
      'utf8',
    );
  });

  it('depAdd rejects invalid versionRange', async () => {
    await expect(
      depAdd({ cwd, resourceId: 'dep1', versionRange: 'not-valid' }),
    ).rejects.toThrow(CliError);
  });

  it('depAdd accepts * and semver ranges', async () => {
    const deps = await depAdd({ cwd, resourceId: 'dep1', versionRange: '*' });
    expect(deps[0]?.versionRange).toBe('*');
    const updated = await depUpdate({ cwd, resourceId: 'dep1', versionRange: '>=1.0.0' });
    expect(updated[0]?.versionRange).toBe('>=1.0.0');
  });
});
