import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCliEnv } from '../src/core/env.js';

vi.mock('../src/core/auth.js', () => ({
  requireAuth: () => ({ userId: 1, username: 'tester' }),
  resolveCurrentAuth: () => null,
  setAuthResolveCwd: () => undefined,
}));

vi.mock('../src/core/command.js', () => ({
  applyCommandFlags: () => undefined,
  applyWriteCommandFlags: () => undefined,
  handleCommandError: (error: unknown) => {
    throw error;
  },
  writeJsonSuccess: (_command: string, data: Record<string, unknown>) => {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 1, ok: true, data })}\n`);
  },
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

import { loadManifest } from '../src/config/project.js';

describe('version set --clear-file', () => {
  let cwd: string;

  beforeEach(() => {
    setCliEnv('dev');
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'version-clear-'));
    fs.writeFileSync(
      path.join(cwd, 'freelog.manifest.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          subject: 'resource',
          identity: { name: 'u/clear-test' },
          resource: { typeCode: 'RT005001', title: 'Clear Test' },
          version: {
            version: '1.0.0',
            filePath: 'book.txt',
            description: '',
            dependencies: [],
            baseUpcastResources: [],
            authExcludedItems: [],
            inputAttrs: [],
            customPropertyDescriptors: [],
          },
          policies: [],
          collection: null,
        },
        null,
        2,
      ),
      'utf8',
    );
    fs.mkdirSync(path.join(cwd, '.freelog'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.freelog', 'state.json'),
      JSON.stringify({
        schemaVersion: 1,
        env: 'dev',
        resource: { resourceId: 'rid', resourceName: 'u/clear-test', resourceTypeCode: 'RT005001' },
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(cwd, 'book.txt'), 'chapter one', 'utf8');
  });

  it('clears filePath when --clear-file --yes', async () => {
    const { versionCommand } = await import('../src/commands/version.js');
    const setCmd = versionCommand.subCommands!.set!;
    await setCmd.run?.({
      args: { 'clear-file': true, yes: true, json: true, cwd, env: 'dev' },
    } as Parameters<NonNullable<typeof setCmd.run>>[0]);
    const manifest = loadManifest(cwd).data;
    expect(manifest.version?.filePath).toBe('');
    expect(manifest.version?.version).toBe('1.0.0');
  });
});
